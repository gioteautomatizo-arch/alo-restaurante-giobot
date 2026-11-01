/**
 * PRE-FLIGHT AISLADO: adaptador HTTP para apertura/cierre transaccionales.
 * NO importar ni montar en server.ts hasta completar migración cliente/reglas,
 * compatibilidad histórica y revisión de autorización contable.
 *
 * auth debe ser Firebase Admin Auth: verifyIdToken(token, true) comprueba revocación.
 * db debe ser Firebase Admin Firestore; solo emulador en las pruebas.
 */
import { openShiftPreflight, ShiftOpenDenied } from './shiftOpenAuthorityPreflight.mjs';
import { closeShiftPreflight, ShiftCloseDenied } from './shiftCloseAuthorityPreflight.mjs';

const openKeys = new Set(['businessId', 'requestId', 'initialCashFund']);
const closeKeys = new Set(['businessId', 'shiftId', 'requestId', 'countedCash', 'notes']);

function hasExactShape(body, allowed, required) {
  return body !== null && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).every((key) => allowed.has(key)) &&
    required.every((key) => Object.hasOwn(body, key));
}

function actorName(claims) {
  for (const candidate of [claims?.name, claims?.email]) {
    if (typeof candidate === 'string' && candidate.trim() && candidate.trim().length <= 100) {
      return candidate.trim();
    }
  }
  return 'Usuario';
}

async function authenticate(auth, req) {
  const authorization = req?.headers?.authorization;
  if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) return null;
  try {
    // true: exigir verificación de revocación, no solo firma/expiración.
    const claims = await auth.verifyIdToken(authorization.slice(7), true);
    if (typeof claims?.uid !== 'string' || !claims.uid || claims.uid.includes('/') || claims.uid.length > 128) return null;
    return { uid: claims.uid, name: actorName(claims) };
  } catch {
    return null; // No revelar si el token caducó, fue revocado o no existe.
  }
}

function responseFor(error) {
  if (error instanceof ShiftOpenDenied || error instanceof ShiftCloseDenied) {
    if (error.code === 'INVALID_INPUT' || error.code === 'INVALID_MONEY') return [400, 'INVALID_INPUT'];
    if (error.code === 'FORBIDDEN') return [403, 'FORBIDDEN'];
    if (error.code === 'SHIFT_NOT_FOUND') return [404, 'SHIFT_NOT_FOUND'];
    if ([
      'OPEN_SHIFT_EXISTS_OR_LOCK_UNVERIFIED', 'SHIFT_ALREADY_CLOSED', 'SHIFT_STATE_INVALID',
      'LOCK_UNVERIFIED', 'CLOSE_RECEIPT_CONFLICT',
    ].includes(error.code)) return [409, 'SHIFT_CONFLICT'];
    // Datos incompletos o históricos no se interpretan como saldos cero.
    return [422, 'RECONCILIATION_REQUIRED'];
  }
  // Errores de red, Admin o Firestore no se devuelven como información sensible.
  return [503, 'SERVICE_UNAVAILABLE'];
}

function serverTimestamp(now) {
  const date = now();
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('INVALID_SERVER_CLOCK');
  return date.toISOString();
}

/**
 * Retorna funciones compatibles con Express, sin registrar ninguna ruta.
 * No confiar en UID, nombre, hora, totales calculados ni estado enviados por cliente.
 */
export function createShiftAuthorityHttpHandlers({ auth, db, now = () => new Date() }) {
  if (!auth || typeof auth.verifyIdToken !== 'function' ||
      !db || typeof db.runTransaction !== 'function' || typeof now !== 'function') {
    throw new TypeError('INVALID_SERVER_DEPENDENCIES');
  }
  const handle = (kind) => async (req, res) => {
    const actor = await authenticate(auth, req);
    if (!actor) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    const body = req?.body;
    const isOpen = kind === 'open';
    if (!hasExactShape(body, isOpen ? openKeys : closeKeys,
      isOpen ? ['businessId', 'requestId', 'initialCashFund'] :
        ['businessId', 'shiftId', 'requestId', 'countedCash'])) {
      return res.status(400).json({ error: 'INVALID_INPUT' });
    }
    try {
      const at = serverTimestamp(now);
      const result = isOpen
        ? await openShiftPreflight({
          db, businessId: body.businessId, actorUid: actor.uid, requestId: body.requestId,
          initialCashFund: body.initialCashFund, openedByName: actor.name, openedAt: at,
        })
        : await closeShiftPreflight({
          db, businessId: body.businessId, actorUid: actor.uid, shiftId: body.shiftId,
          requestId: body.requestId, countedCash: body.countedCash,
          notes: body.notes ?? '', closedByName: actor.name, closedAt: at,
        });
      return res.status(isOpen && result.status === 'opened' ? 201 : 200).json(result);
    } catch (error) {
      const [status, code] = responseFor(error);
      return res.status(status).json({ error: code });
    }
  };
  return Object.freeze({ open: handle('open'), close: handle('close') });
}

import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import type { GoogleGenAI } from '@google/genai';

/**
 * "Sube tu menú" · Giobot lee la foto del menú y propone la lista de productos.
 *
 * Seguridad (esta ruta cuesta dinero por llamada, así que no es pública):
 *  1. Exige la sesión de Firebase del dueño (Authorization: Bearer <idToken>) y la
 *     valida con Google (Identity Toolkit), sin necesitar firebase-admin.
 *  2. Confirma que ese usuario es miembro ACTIVO del negocio con rol que puede
 *     administrar el catálogo, leyendo su membresía con SU propio token (las reglas
 *     de Firestore siguen mandando).
 *  3. Solo acepta fotos ya subidas a nuestro Cloudinary (no es un proxy abierto).
 *  4. Límite de peso de imagen, de productos devueltos y de llamadas por negocio.
 * Nada se publica aquí: solo se devuelve un borrador que el dueño revisa.
 */

const PRIMARY_MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash';

const ALLOWED_IMAGE_HOSTS = ['res.cloudinary.com'];
const ALLOWED_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ITEMS = 200;
const RATE_LIMIT_MAX = 10; // análisis por negocio
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // por hora

export interface AnalyzedMenuItem {
  name: string;
  category: string;
  price: string;
  description: string;
}

/** Limpia lo que devuelve el modelo: nunca confiamos en su formato. */
export function sanitizeMenuItems(raw: unknown): AnalyzedMenuItem[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).items)
      ? (raw as any).items
      : [];

  const seen = new Set<string>();
  const result: AnalyzedMenuItem[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String((entry as any).name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name) continue;

    const key = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);

    const category = String((entry as any).category ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Sin categoría';
    const description = String((entry as any).description ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);

    // El precio viaja como texto para que el dueño lo pueda corregir; solo números válidos.
    const rawPrice = String((entry as any).price ?? '').replace(/[$\s]/g, '').replace(',', '.');
    const num = rawPrice === '' ? NaN : Number(rawPrice);
    const price = Number.isFinite(num) && num >= 0 && num < 1_000_000 ? String(Math.round(num * 100) / 100) : '';

    result.push({ name, category, price, description });
    if (result.length >= MAX_ITEMS) break;
  }

  return result;
}

const firebaseConfig = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8')) as {
      projectId: string;
      apiKey: string;
    };
  } catch {
    return null;
  }
})();

async function verifyIdToken(idToken: string): Promise<string | null> {
  if (!firebaseConfig) return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) return null;
  const data: any = await res.json();
  const uid = data?.users?.[0]?.localId;
  return typeof uid === 'string' && uid ? uid : null;
}

/** Lee la membresía con el token del propio usuario; las reglas de Firestore deciden. */
async function getActiveRole(businessId: string, uid: string, idToken: string): Promise<string | null> {
  if (!firebaseConfig) return null;
  const docId = encodeURIComponent(`${businessId}_${uid}`);
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/businessMemberships/${docId}`,
    { headers: { Authorization: `Bearer ${idToken}` } },
  );
  if (!res.ok) return null;
  const doc: any = await res.json();
  const fields = doc?.fields || {};
  if (fields.userId?.stringValue !== uid) return null;
  if (fields.active?.booleanValue !== true) return null;
  const role = fields.role?.stringValue;
  return typeof role === 'string' ? role : null;
}

async function downloadImage(url: string): Promise<{ data: string; mimeType: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.includes(parsed.hostname)) {
    throw new Error('IMAGE_HOST');
  }
  const res = await fetch(parsed.toString());
  if (!res.ok) throw new Error('IMAGE_FETCH');
  const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!mimeType.startsWith('image/')) throw new Error('IMAGE_TYPE');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error('IMAGE_SIZE');
  return { data: buffer.toString('base64'), mimeType };
}

const calls = new Map<string, number[]>();
function rateLimited(businessId: string): boolean {
  const now = Date.now();
  const recent = (calls.get(businessId) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    calls.set(businessId, recent);
    return true;
  }
  recent.push(now);
  calls.set(businessId, recent);
  return false;
}

const PROMPT = `Eres Giobot. Lee la foto de este menú de un negocio en México y extrae TODOS los productos que veas.

Reglas:
- Devuelve únicamente JSON con la forma {"items":[{"name":"","category":"","price":"","description":""}]}.
- "name": nombre del producto tal como aparece, sin el precio.
- "category": la sección del menú a la que pertenece (por ejemplo Tacos, Bebidas, Postres, Paquetes). Si la foto no muestra secciones, deduce una categoría sencilla.
- "price": solo el número (sin símbolo $). Si hay varios tamaños, crea un producto por tamaño agregando el tamaño al nombre (por ejemplo "Café americano chico"). Si no se ve precio, deja "".
- "description": ingredientes o detalles que aparezcan impresos. Si no hay, deja "". No inventes nada.
- No inventes productos, precios ni ingredientes. Si algo es ilegible, omítelo.
- Conserva el idioma original del menú.`;

async function runModel(ai: GoogleGenAI, image: { data: string; mimeType: string }): Promise<unknown> {
  const request = (model: string) =>
    ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ inlineData: image }, { text: PROMPT }] }],
      config: { responseMimeType: 'application/json', temperature: 0.1 },
    });

  let response;
  try {
    response = await request(PRIMARY_MODEL);
  } catch (err) {
    console.warn('[menu-import] modelo principal falló, usando respaldo:', err);
    response = await request(FALLBACK_MODEL);
  }

  const text = (response.text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  return JSON.parse(text);
}

export function registerMenuImportRoute(app: Express, getAi: () => GoogleGenAI | null) {
  app.post('/api/menu-import/analyze', async (req: Request, res: Response) => {
    try {
      if (process.env.MENU_IMPORT_AI_ENABLED !== 'true') {
        return res.status(503).json({ error: 'El análisis con Giobot está desactivado por ahora.' });
      }

      const ai = getAi();
      if (!ai) {
        return res.status(503).json({ error: 'Giobot no está disponible en este momento (falta configurar la clave de IA).' });
      }

      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!idToken) return res.status(401).json({ error: 'Inicia sesión para analizar tu menú.' });

      const businessId = typeof req.body?.businessId === 'string' ? req.body.businessId.trim() : '';
      const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim() : '';
      if (!businessId || !/^[a-z0-9][a-z0-9-_]{0,80}$/i.test(businessId) || !imageUrl) {
        return res.status(400).json({ error: 'Falta el negocio o la foto del menú.' });
      }

      const uid = await verifyIdToken(idToken);
      if (!uid) return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });

      const role = await getActiveRole(businessId, uid, idToken);
      if (!role || !ALLOWED_ROLES.includes(role)) {
        return res.status(403).json({ error: 'No tienes permiso para administrar el menú de este negocio.' });
      }

      if (rateLimited(businessId)) {
        return res.status(429).json({ error: 'Ya analizaste varias fotos en la última hora. Intenta de nuevo más tarde.' });
      }

      let image;
      try {
        image = await downloadImage(imageUrl);
      } catch (err: any) {
        const message =
          err?.message === 'IMAGE_SIZE'
            ? 'La foto es demasiado pesada (máximo 8 MB).'
            : 'No pudimos leer la foto. Súbela de nuevo e inténtalo otra vez.';
        return res.status(400).json({ error: message });
      }

      let parsed: unknown;
      try {
        parsed = await runModel(ai, image);
      } catch (err) {
        console.error('[menu-import] error de Giobot:', err);
        return res.status(502).json({ error: 'Giobot no pudo leer esta foto. Prueba con una foto más clara o completa.' });
      }

      const items = sanitizeMenuItems(parsed);
      return res.json({ items });
    } catch (err) {
      console.error('[menu-import] error inesperado:', err);
      return res.status(500).json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
    }
  });
}

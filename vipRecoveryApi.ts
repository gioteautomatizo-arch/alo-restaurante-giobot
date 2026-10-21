import type { Express } from 'express';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computePinHash, computeVipDocId } from './src/lib/vipCrypto';

const hash = (input: string) => createHash('sha256').update(input).digest('hex');
const validBusiness = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v);
const validPhone = (v: unknown): v is string => typeof v === 'string' && /^\d{10}$/.test(v);
const validPin = (v: unknown): v is string => typeof v === 'string' && /^\d{4,6}$/.test(v);
const NO_STORE = 'no-store';
const WINDOW = 15 * 60 * 1000;
const MAX_TRIES = 5;

// Compatibilidad SOLO de Calientito: algunos perfiles originales no
// registraban restaurantId. Nunca extender esta excepción a otro tenant.
function profileBelongsToBusiness(profile: Record<string, any>, businessId: string): boolean {
  return profile.restaurantId === businessId
    || (businessId === 'alo-restaurante' && profile.restaurantId === undefined);
}
function publicVipProfile(profile: Record<string, any>, businessId: string, id: string) {
  const { pinHash: _secret, ...safe } = profile;
  return { ...safe, restaurantId: businessId, id, syncedWithCloud: true };
}

function db() {
  if (!getApps().length) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credential = json ? cert(JSON.parse(json)) : applicationDefault();
    initializeApp({ credential, projectId: process.env.FIREBASE_PROJECT_ID || undefined });
  }
  return getFirestore();
}

async function allowAttempt(businessId: string, phone: string) {
  const ref = db().collection('vip_recovery_attempts').doc(hash(businessId + ':' + phone));
  return db().runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    const now = Date.now();
    const reset = old && Number(old.reset) > now ? Number(old.reset) : now + WINDOW;
    const attempts = old && Number(old.reset) > now ? Number(old.attempts || 0) : 0;
    if (attempts >= MAX_TRIES) return false;
    tx.set(ref, { attempts: attempts + 1, reset, updatedAt: now });
    return true;
  });
}

export function registerVipRecoveryApi(app: Express): void {
  // No se confía en los sellos, recompensas ni identificadores enviados por el cliente.
  app.post('/api/vip/register', async (req, res) => {
    res.setHeader('Cache-Control', NO_STORE);
    const { businessId, phone, pin, customerName, address, reference, preferredPayment, preferredOrderType } = req.body || {};
    const safeName = typeof customerName === 'string' ? customerName.trim() : '';
    if (!validBusiness(businessId) || !validPhone(phone) || !validPin(pin) ||
        safeName.length < 2 || safeName.length > 120 ||
        (address !== undefined && (typeof address !== 'string' || address.length > 200)) ||
        (reference !== undefined && (typeof reference !== 'string' || reference.length > 200))) {
      return res.status(400).json({ error: 'Revisa nombre, teléfono y PIN (4 a 6 dígitos).' });
    }
    try {
      if (!(await allowAttempt(businessId, phone))) {
        return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
      }
      // Los negocios nuevos deben haber publicado expresamente su programa VIP.
      if (businessId !== 'alo-restaurante') {
        const business = await db().collection('publicBusinessProfiles').doc(businessId).get();
        if (!business.exists || business.data()?.published !== true ||
            business.data()?.branding?.vipEnabled !== true) {
          return res.status(404).json({ error: 'Este programa de membresías no está disponible.' });
        }
      }
      const baseId = await computeVipDocId(phone, pin);
      const profileId = businessId === 'alo-restaurante' ? baseId : businessId + '_' + baseId;
      const ref = db().collection('vip_profiles').doc(profileId);
      const now = new Date().toISOString();
      const pinHash = await computePinHash(pin, phone);
      const profile = {
        restaurantId: businessId,
        memberId: 'VIP-' + randomBytes(5).toString('hex').toUpperCase(),
        customerName: safeName, phone, pinHash,
        address: typeof address === 'string' ? address.trim() : '',
        reference: typeof reference === 'string' ? reference.trim() : '',
        preferredPayment: ['efectivo', 'transferencia', 'tarjeta'].includes(preferredPayment) ? preferredPayment : 'efectivo',
        preferredOrderType: ['dine_in', 'pickup', 'delivery'].includes(preferredOrderType) ? preferredOrderType : 'pickup',
        stamps: 0, totalOrders: 0, rewardAvailable: false, pendingStampsToValidate: 0,
        createdAt: now, updatedAt: now,
      };
      try {
        // Registro y aviso son una sola escritura atomica: nunca se emite un
        // aviso si no se pudo crear la tarjeta. Se reutiliza la bitacora del
        // negocio; no se necesita una coleccion nueva ni reglas publicas.
        const batch = db().batch();
        batch.create(ref, profile);
        if (businessId === 'alo-restaurante') {
          const logRef = db().collection('activity_logs').doc('vip_register_' + profileId);
          batch.create(logRef, {
            id: logRef.id, restaurantId: businessId, timestamp: now, createdAt: now,
            userName: 'Registro en linea', userId: 'public-vip', userRole: 'CLIENTE',
            action: 'Nueva membresía VIP', category: 'sistema',
            details: safeName, eventType: 'vip.register', targetId: profileId,
          });
        } else {
          const logRef = db().collection('businesses').doc(businessId)
            .collection('auditLog').doc('vip_register_' + baseId);
          batch.create(logRef, {
            businessId, actorId: 'public-vip', actorName: 'Registro en línea',
            action: 'vip.register', module: 'vip', targetId: profileId,
            summary: 'Nueva membresía VIP: ' + safeName, at: now,
          });
        }
        await batch.commit();
      } catch (error: any) {
        if (error?.code === 6 || error?.code === 'already-exists') {
          return res.status(409).json({ error: 'Ya existe una tarjeta con esos datos. Usa Recuperar tarjeta.' });
        }
        throw error;
      }
      const token = randomBytes(32).toString('base64url');
      await db().collection('vip_sessions').doc(hash(token)).set({
        businessId, profileId, expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      const { pinHash: _secret, ...safe } = profile;
      return res.status(201).json({ profile: { ...safe, id: profileId, syncedWithCloud: true }, sessionToken: token });
    } catch (err) {
      console.error('VIP registration backend unavailable', err);
      return res.status(503).json({ error: 'No pudimos crear la membresía en este momento.' });
    }
  });
  app.post('/api/vip/recover', async (req, res) => {
    res.setHeader('Cache-Control', NO_STORE);
    const { businessId, phone, pin } = req.body || {};
    if (!validBusiness(businessId) || !validPhone(phone) || !validPin(pin)) {
      return res.status(400).json({ error: 'Teléfono o PIN inválido.' });
    }
    try {
      if (!(await allowAttempt(businessId, phone))) {
        return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
      }
      const baseId = await computeVipDocId(phone, pin);
      const profileId = businessId === 'alo-restaurante' ? baseId : businessId + '_' + baseId;
      const snap = await db().collection('vip_profiles').doc(profileId).get();
      const data = snap.data();
      const pinHash = await computePinHash(pin, phone);
      const storedHash = typeof data?.pinHash === 'string' ? data.pinHash : '';
      const left = Buffer.from(pinHash), right = Buffer.from(storedHash);
      if (!data || !profileBelongsToBusiness(data, businessId) || data.phone !== phone ||
          left.length !== right.length || !timingSafeEqual(left, right)) {
        return res.status(401).json({ error: 'No encontramos una tarjeta con esos datos.' });
      }
      const token = randomBytes(32).toString('base64url');
      await db().collection('vip_sessions').doc(hash(token)).set({
        businessId, profileId, expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      return res.json({ profile: publicVipProfile(data, businessId, profileId), sessionToken: token });
    } catch (err) {
      console.error('VIP recovery backend unavailable', err);
      return res.status(503).json({ error: 'La recuperación no está disponible en este momento.' });
    }
  });
  app.patch('/api/vip/profile', async (req, res) => {
    res.setHeader('Cache-Control', NO_STORE);
    const { businessId, updates } = req.body || {};
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.header('authorization') || '');
    if (!validBusiness(businessId) || !match) return res.status(401).json({ error: 'Recupera tu tarjeta para editarla.' });
    if (!updates || typeof updates !== 'object' || Array.isArray(updates) ||
        Object.keys(updates).sort().join(',') !==
        ['address','customerName','preferredOrderType','preferredPayment','reference'].sort().join(',')) {
      return res.status(400).json({ error: 'Solo puedes modificar tus datos personales.' });
    }
    if (typeof updates.customerName !== 'string' || updates.customerName.trim().length < 2 ||
        updates.customerName.trim().length > 120 ||
        typeof updates.address !== 'string' || updates.address.length > 200 ||
        typeof updates.reference !== 'string' || updates.reference.length > 200 ||
        !['efectivo', 'transferencia', 'tarjeta'].includes(updates.preferredPayment) ||
        !['dine_in', 'pickup', 'delivery'].includes(updates.preferredOrderType)) {
      return res.status(400).json({ error: 'Revisa tus datos personales.' });
    }
    try {
      const session = (await db().collection('vip_sessions').doc(hash(match[1])).get()).data();
      if (!session || session.businessId !== businessId || Number(session.expiresAt) <= Date.now()) {
        return res.status(401).json({ error: 'Tu sesión VIP caducó. Recupera tu tarjeta.' });
      }
      const ref = db().collection('vip_profiles').doc(String(session.profileId));
      const snap = await ref.get();
      const before = snap.data();
      if (!before || !profileBelongsToBusiness(before, businessId)) return res.status(404).json({ error: 'Tarjeta no encontrada.' });
      const changes = {
        customerName: updates.customerName.trim(), address: updates.address.trim(),
        reference: updates.reference.trim(), preferredPayment: updates.preferredPayment,
        preferredOrderType: updates.preferredOrderType, updatedAt: new Date().toISOString(),
      };
      await ref.update(changes);
      return res.json({ profile: publicVipProfile({ ...before, ...changes }, businessId, snap.id) });
    } catch (err) {
      console.error('VIP update backend unavailable', err);
      return res.status(503).json({ error: 'No pudimos guardar los cambios.' });
    }
  });

  app.get('/api/vip/profile', async (req, res) => {
    res.setHeader('Cache-Control', NO_STORE);
    const businessId = req.query.businessId;
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.header('authorization') || '');
    if (!validBusiness(businessId) || !match) {
      return res.status(401).json({ error: 'Debes recuperar tu tarjeta para continuar.' });
    }
    try {
      const session = await db().collection('vip_sessions').doc(hash(match[1])).get();
      const data = session.data();
      if (!data || data.businessId !== businessId || Number(data.expiresAt) <= Date.now()) {
        return res.status(401).json({ error: 'Tu sesión VIP caducó.' });
      }
      const snap = await db().collection('vip_profiles').doc(String(data.profileId)).get();
      const profile = snap.data();
      if (!profile || !profileBelongsToBusiness(profile, businessId)) {
        return res.status(404).json({ error: 'La tarjeta VIP no está disponible.' });
      }
      return res.json({ profile: publicVipProfile(profile, businessId, snap.id) });
    } catch (err) {
      console.error('VIP profile backend unavailable', err);
      return res.status(503).json({ error: 'No pudimos actualizar tu tarjeta.' });
    }
  });

}

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
      if (!data || data.restaurantId !== businessId || data.phone !== phone ||
          left.length !== right.length || !timingSafeEqual(left, right)) {
        return res.status(401).json({ error: 'No encontramos una tarjeta con esos datos.' });
      }
      const token = randomBytes(32).toString('base64url');
      await db().collection('vip_sessions').doc(hash(token)).set({
        businessId, profileId, expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      const { pinHash: _secret, ...profile } = data;
      return res.json({ profile: { ...profile, id: profileId, syncedWithCloud: true }, sessionToken: token });
    } catch (err) {
      console.error('VIP recovery backend unavailable', err);
      return res.status(503).json({ error: 'La recuperación no está disponible en este momento.' });
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
      if (!profile || profile.restaurantId !== businessId) {
        return res.status(404).json({ error: 'La tarjeta VIP no está disponible.' });
      }
      const { pinHash: _secret, ...safe } = profile;
      return res.json({ profile: { ...safe, id: snap.id, syncedWithCloud: true } });
    } catch (err) {
      console.error('VIP profile backend unavailable', err);
      return res.status(503).json({ error: 'No pudimos actualizar tu tarjeta.' });
    }
  });

}

import type { Express, Request, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

type InviteRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN' | 'EMPLOYEE';
type ActorRole = InviteRole | 'OWNER';
const ROLES: InviteRole[] = ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE'];
const OPERATIONAL_ROLES: InviteRole[] = ['CASHIER', 'WAITER', 'KITCHEN', 'EMPLOYEE'];
const EXPIRES_IN_MS = 72 * 60 * 60 * 1000;
const INVITES_PER_HOUR = 10;
const INVITES_PER_BUSINESS_DAY = 50;
const PREVIEWS_PER_MINUTE = 60;
// Best-effort per-instance backpressure; the invite token itself is 256-bit random.
const previewLimits = new Map<string, { count: number; resetAt: number }>();
function allowPreview(ip: string): boolean {
  const now = Date.now();
  const existing = previewLimits.get(ip);
  if (!existing || existing.resetAt <= now) {
    if (previewLimits.size >= 5000) previewLimits.clear();
    previewLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  existing.count++;
  return existing.count <= PREVIEWS_PER_MINUTE;
}
function canInvite(role: unknown, requestedRole: unknown): boolean {
  return ['OWNER', 'ADMIN'].includes(String(role))
    ? ROLES.includes(requestedRole as InviteRole)
    : role === 'MANAGER' && OPERATIONAL_ROLES.includes(requestedRole as InviteRole);
}
function exposedInvite(id: string, data: Record<string, unknown>) {
  return { id, name: data.name, email: data.email, role: data.role, status: data.status,
    createdAt: data.createdAt, expiresAt: data.expiresAt };
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const safeId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(v);
const safeEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validToken = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);

function adminServices() {
  if (getApps().length === 0) {
    const serviceJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const credential = serviceJson ? cert(JSON.parse(serviceJson)) : applicationDefault();
    initializeApp({ credential, projectId: process.env.FIREBASE_PROJECT_ID || undefined });
  }
  return { db: getFirestore(), adminAuth: getAuth() };
}
async function authenticated(req: Request) {
  const bearer = /^Bearer ([-A-Za-z0-9_.]+)$/.exec(req.header('authorization') || '');
  if (!bearer) return null;
  return adminServices().adminAuth.verifyIdToken(bearer[1], true);
}
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

/**
 * Staged, disabled by default on BOTH server and frontend.
 * Invitations are stored in a server-only collection; never expose it in rules.
 */
export function registerBusinessInviteApi(app: Express): void {
  app.post('/api/business-invites', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.ENABLE_BUSINESS_INVITES !== 'true') return fail(res, 404, 'Invitaciones no disponibles.');
    const { businessId, email, name, role } = req.body || {};
    if (!safeId(businessId) || !safeEmail(email) || typeof name !== 'string' ||
        name.trim().length < 2 || name.trim().length > 100 || !ROLES.includes(role as InviteRole)) {
      return fail(res, 400, 'Revisa los datos de la invitación.');
    }
    try {
      const actor = await authenticated(req);
      if (!actor) return fail(res, 401, 'Inicia sesión como responsable del negocio.');
      const { db } = adminServices();
      const [membership, business] = await Promise.all([
        db.collection('businessMemberships').doc(businessId + '_' + actor.uid).get(),
        db.collection('businesses').doc(businessId).get(),
      ]);
      const actorRole = membership.data()?.role as ActorRole | undefined;
      if (!business.exists || !membership.exists || membership.data()?.active !== true ||
          !actorRole || !['OWNER', 'ADMIN', 'MANAGER'].includes(actorRole)) {
        return fail(res, 403, 'No tienes permiso para invitar personal de este negocio.');
      }
      if (!canInvite(actorRole, role)) {
        return fail(res, 403, 'No puedes invitar personal con ese rol.');
      }
      const token = randomBytes(32).toString('base64url');
      const now = Date.now();
      const inviteRef = db.collection('business_invites').doc(hash(token));
      const actorLimit = db.collection('business_invite_limits').doc(hash('actor:' + businessId + ':' + actor.uid));
      const businessLimit = db.collection('business_invite_limits').doc(hash('business:' + businessId));
      const created = await db.runTransaction(async tx => {
        const [actorSnap, businessSnap] = await Promise.all([tx.get(actorLimit), tx.get(businessLimit)]);
        const currentCount = (snap: typeof actorSnap, interval: number) => {
          const value = snap.data();
          return value && Number(value.resetAt) > now
            ? { count: Number(value.count) || 0, resetAt: Number(value.resetAt) }
            : { count: 0, resetAt: now + interval };
        };
        const perActor = currentCount(actorSnap, 60 * 60 * 1000);
        const perBusiness = currentCount(businessSnap, 24 * 60 * 60 * 1000);
        if (perActor.count >= INVITES_PER_HOUR || perBusiness.count >= INVITES_PER_BUSINESS_DAY) return false;
        tx.set(actorLimit, { count: perActor.count + 1, resetAt: perActor.resetAt, updatedAt: now });
        tx.set(businessLimit, { count: perBusiness.count + 1, resetAt: perBusiness.resetAt, updatedAt: now });
        tx.create(inviteRef, {
          businessId, email: email.trim().toLowerCase(), name: name.trim(),
          role, status: 'PENDING', createdBy: actor.uid, createdAt: now,
          expiresAt: now + EXPIRES_IN_MS,
        });
        return true;
      });
      if (!created) return fail(res, 429, 'Se alcanzó el límite de invitaciones. Intenta más tarde.');
      return res.status(201).json({ token, expiresAt: now + EXPIRES_IN_MS });
    } catch (error) {
      console.error('[business-invites/create]', error);
      return fail(res, 503, 'No pudimos preparar la invitación.');
    }
  });

  app.get('/api/business-invites', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.ENABLE_BUSINESS_INVITES !== 'true') return fail(res, 404, 'Invitaciones no disponibles.');
    const businessId = req.query.businessId;
    if (!safeId(businessId)) return fail(res, 400, 'Negocio inválido.');
    try {
      const actor = await authenticated(req);
      if (!actor) return fail(res, 401, 'Inicia sesión.');
      const { db } = adminServices();
      const member = await db.collection('businessMemberships').doc(businessId + '_' + actor.uid).get();
      const role = member.data()?.role;
      if (!member.exists || member.data()?.active !== true || !['OWNER','ADMIN','MANAGER'].includes(String(role))) {
        return fail(res, 403, 'No tienes permiso para ver las invitaciones.');
      }
      const matches = await db.collection('business_invites').where('businessId', '==', businessId).limit(150).get();
      const pending = matches.docs
        .filter(snap => snap.data().status === 'PENDING')
        .filter(snap => role !== 'MANAGER' || (snap.data().createdBy === actor.uid &&
          OPERATIONAL_ROLES.includes(snap.data().role)))
        .map(snap => exposedInvite(snap.id, snap.data()))
        .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
      return res.json({ invites: pending });
    } catch (error) {
      console.error('[business-invites/list]', error);
      return fail(res, 503, 'No pudimos cargar las invitaciones.');
    }
  });

  app.post('/api/business-invites/revoke', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.ENABLE_BUSINESS_INVITES !== 'true') return fail(res, 404, 'Invitaciones no disponibles.');
    const { businessId, inviteId } = req.body || {};
    if (!safeId(businessId) || typeof inviteId !== 'string' || !/^[0-9a-f]{64}$/.test(inviteId)) {
      return fail(res, 400, 'Invitación inválida.');
    }
    try {
      const actor = await authenticated(req);
      if (!actor) return fail(res, 401, 'Inicia sesión.');
      const { db } = adminServices();
      const memberRef = db.collection('businessMemberships').doc(businessId + '_' + actor.uid);
      const inviteRef = db.collection('business_invites').doc(inviteId);
      const result = await db.runTransaction(async tx => {
        const [member, inviteSnap] = await Promise.all([tx.get(memberRef), tx.get(inviteRef)]);
        const role = member.data()?.role;
        if (!member.exists || member.data()?.active !== true || !['OWNER','ADMIN','MANAGER'].includes(String(role))) {
          return { status: 403, error: 'No tienes permisos para cancelar esta invitación.' };
        }
        const invite = inviteSnap.data();
        if (!invite || invite.businessId !== businessId) return { status: 404, error: 'Invitación no encontrada.' };
        if (role === 'MANAGER' && (invite.createdBy !== actor.uid ||
          !OPERATIONAL_ROLES.includes(invite.role as InviteRole))) {
          return { status: 403, error: 'Solo puedes cancelar tus invitaciones operativas.' };
        }
        if (invite.status !== 'PENDING') return { status: 409, error: 'Esta invitación ya fue utilizada o cancelada.' };
        tx.update(inviteRef, { status: 'REVOKED', revokedAt: Date.now(), revokedBy: actor.uid });
        return { status: 200 };
      });
      if ('error' in result) return fail(res, result.status, result.error!);
      return res.json({ revoked: true });
    } catch (error) {
      console.error('[business-invites/revoke]', error);
      return fail(res, 503, 'No pudimos cancelar la invitación.');
    }
  });

  app.post('/api/business-invites/preview', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.ENABLE_BUSINESS_INVITES !== 'true') return fail(res, 404, 'Invitaciones no disponibles.');
    if (!validToken(req.body?.token)) return fail(res, 404, 'Invitación no válida.');
    if (!allowPreview(req.ip || 'unknown')) return fail(res, 429, 'Demasiadas consultas. Espera un minuto.');
    try {
      const { db } = adminServices();
      const invite = (await db.collection('business_invites').doc(hash(req.body?.token)).get()).data();
      if (!invite || invite.status !== 'PENDING' || Number(invite.expiresAt) <= Date.now()) {
        return fail(res, 410, 'Esta invitación venció o ya fue utilizada.');
      }
      const business = await db.collection('businesses').doc(String(invite.businessId)).get();
      if (!business.exists) return fail(res, 404, 'El negocio ya no está disponible.');
      const businessName = String(business.data()?.branding?.restaurantName || 'Negocio');
      const email = String(invite.email || '');
      const [local, domain] = email.split('@');
      const emailHint = local.slice(0, 1) + '***@' + (domain || '');
      return res.json({ businessName, role: invite.role, emailHint, expiresAt: invite.expiresAt });
    } catch (error) {
      console.error('[business-invites/preview]', error);
      return fail(res, 503, 'No pudimos consultar la invitación.');
    }
  });

  app.post('/api/business-invites/accept', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.ENABLE_BUSINESS_INVITES !== 'true') return fail(res, 404, 'Invitaciones no disponibles.');
    if (!validToken(req.body?.token)) return fail(res, 400, 'Invitación no válida.');
    try {
      const actor = await authenticated(req);
      if (!actor) return fail(res, 401, 'Inicia sesión para aceptar la invitación.');
      if (actor.email_verified !== true || !safeEmail(actor.email)) {
        return fail(res, 403, 'Verifica el correo de tu cuenta antes de aceptar.');
      }
      const { db } = adminServices();
      const inviteRef = db.collection('business_invites').doc(hash(req.body.token));
      const outcome = await db.runTransaction(async (tx) => {
        const invite = (await tx.get(inviteRef)).data();
        if (!invite || invite.status !== 'PENDING' || Number(invite.expiresAt) <= Date.now()) {
          return { status: 410, error: 'La invitación venció o ya fue utilizada.' };
        }
        if (String(invite.email).toLowerCase() !== actor.email!.toLowerCase()) {
          return { status: 403, error: 'Esta invitación fue enviada a otro correo.' };
        }
        if (!safeId(invite.businessId) || !ROLES.includes(invite.role as InviteRole)) {
          return { status: 400, error: 'La invitación tiene datos inválidos.' };
        }
        const businessId: string = invite.businessId;
        const businessRef = db.collection('businesses').doc(businessId);
        const memberRef = db.collection('businessMemberships').doc(businessId + '_' + actor.uid);
        const inviterRef = db.collection('businessMemberships').doc(businessId + '_' + invite.createdBy);
        const [business, membership, inviter] = await Promise.all([
          tx.get(businessRef), tx.get(memberRef), tx.get(inviterRef),
        ]);
        if (!business.exists) return { status: 404, error: 'El negocio ya no existe.' };
        const inviterRole = inviter.data()?.role as ActorRole | undefined;
        if (!inviter.exists || inviter.data()?.active !== true ||
            !canInvite(inviterRole, invite.role)) {
          return { status: 403, error: 'La persona que invitó ya no tiene permisos suficientes.' };
        }
        if (membership.exists) return { status: 409, error: 'Esta cuenta ya tiene una membresía en el negocio.' };
        const time = new Date().toISOString();
        tx.create(memberRef, {
          restaurantId: businessId, userId: actor.uid,
          name: invite.name, email: actor.email!.toLowerCase(),
          role: invite.role, active: true, createdAt: time, updatedAt: time,
        });
        tx.update(businessRef, { employeeUserIds: FieldValue.arrayUnion(actor.uid) });
        tx.update(inviteRef, { status: 'ACCEPTED', acceptedBy: actor.uid, acceptedAt: Date.now() });
        return { status: 200, businessId };
      });
      if ('error' in outcome) return fail(res, outcome.status, outcome.error!);
      return res.json({ businessId: outcome.businessId });
    } catch (error) {
      console.error('[business-invites/accept]', error);
      return fail(res, 503, 'No pudimos vincular la cuenta al negocio.');
    }
  });
}

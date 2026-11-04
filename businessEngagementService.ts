/**
 * Estadísticas y estrellas multinegocio: solo servidor Firebase Admin.
 * No sustituye App Check real, revisión de privacidad ni protección WAF.
 * Visitas = sesiones por negocio/día UTC; no personas únicas.
 */
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

export const ENGAGEMENT_BUSINESS_ID = /^[A-Za-z0-9_-]{1,64}$/;
const hash = (salt: string, ...parts: string[]) =>
  createHash('sha256').update([salt, ...parts].join('\0')).digest('hex');
export function requireEngagementSalt(value: string | undefined): string {
  if (!value || value.length < 32) throw new Error('CONFIGURACION_SEGURA');
  return value;
}
export async function countBusinessVisit(db: Firestore, input: {
  businessId: string; sessionId: string; ip: string; appId: string;
  salt: string; now?: Date;
}): Promise<{ counted: boolean }> {
  const { businessId, sessionId, ip, appId } = input;
  if (!ENGAGEMENT_BUSINESS_ID.test(businessId) || !/^[a-f0-9]{32}$/.test(sessionId) ||
      typeof ip !== 'string' || ip.length > 1024 || !appId || appId.length > 256)
    throw new Error('VISITA_INVALIDA');
  const salt = requireEngagementSalt(input.salt);
  const now = input.now || new Date();
  const day = now.toISOString().slice(0, 10);
  const expiresAt = new Date(now.getTime() + 3 * 86400000);
  const sessionRef = db.doc('businessVisitSessions/' + hash(salt, businessId, day, sessionId));
  const ipRef = db.doc('businessVisitBudgets/' + hash(salt, businessId, day, appId, ip));
  const dayRef = db.doc('businessVisitDays/' + businessId + '_' + day);
  const totalRef = db.doc('businessVisitSummaries/' + businessId);
  const profileRef = db.doc('publicBusinessProfiles/' + businessId);
  return db.runTransaction(async tx => {
    const [profile, previous, budget, dayData, totalData] = await Promise.all([
      tx.get(profileRef), tx.get(sessionRef), tx.get(ipRef), tx.get(dayRef), tx.get(totalRef),
    ]);
    if (!profile.exists || profile.data()?.published !== true) throw new Error('NEGOCIO_NO_PUBLICADO');
    if (previous.exists) return { counted: false };
    const ipCount = budget.exists ? budget.data()?.count : 0;
    const dayCount = dayData.exists ? dayData.data()?.visits : 0;
    const totalCount = totalData.exists ? totalData.data()?.visitsTotal : 0;
    if (![ipCount, dayCount, totalCount].every(v => Number.isSafeInteger(v) && v >= 0))
      throw new Error('METRICAS_CORRUPTAS');
    if (ipCount >= 50 || dayCount >= 10000) throw new Error('LIMITE_VISITAS');
    tx.create(sessionRef, { businessId, day, expiresAt });
    tx.set(ipRef, { count: ipCount + 1, expiresAt });
    tx.set(dayRef, { businessId, day, visits: dayCount + 1 });
    tx.set(totalRef, { businessId, visitsTotal: totalCount + 1,
      lastVisitedAt: now.toISOString() }, { merge: true });
    return { counted: true };
  });
}
export async function rateBusiness(db: Firestore, input: {
  businessId: string; uid: string; stars: number; salt: string; now?: Date;
}): Promise<{ count: number; average: number; unchanged: boolean }> {
  const { businessId, uid, stars } = input;
  if (!ENGAGEMENT_BUSINESS_ID.test(businessId) || !uid || uid.length > 256 ||
      !Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error('CALIFICACION_INVALIDA');
  const salt = requireEngagementSalt(input.salt);
  const voteRef = db.doc('businessRatingVotes/' + hash(salt, businessId, uid));
  const summaryRef = db.doc('businessRatingSummaries/' + businessId);
  const businessRef = db.doc('publicBusinessProfiles/' + businessId);
  return db.runTransaction(async tx => {
    const [business, vote, summary] = await Promise.all([
      tx.get(businessRef), tx.get(voteRef), tx.get(summaryRef),
    ]);
    if (!business.exists || business.data()?.published !== true) throw new Error('NEGOCIO_NO_PUBLICADO');
    const old = vote.exists ? vote.data()?.stars : null;
    const count = summary.exists ? summary.data()?.count : 0;
    const sum = summary.exists ? summary.data()?.sum : 0;
    if ((old !== null && (!Number.isInteger(old) || old < 1 || old > 5)) ||
        !Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(sum) ||
        sum < count || sum > 5 * count || (old !== null && count < 1))
      throw new Error('METRICAS_CORRUPTAS');
    if (old === stars) return { count, average: Math.round(10 * sum / count) / 10, unchanged: true };
    const nextCount = count + (old === null ? 1 : 0);
    const nextSum = sum + stars - (old === null ? 0 : old);
    tx.set(voteRef, { businessId, stars, updatedAt: (input.now || new Date()).toISOString() });
    tx.set(summaryRef, { businessId, count: nextCount, sum: nextSum });
    return { count: nextCount, average: Math.round(10 * nextSum / nextCount) / 10, unchanged: false };
  });
}
export async function publicBusinessRating(db: Firestore, businessId: string) {
  if (!ENGAGEMENT_BUSINESS_ID.test(businessId)) throw new Error('CALIFICACION_INVALIDA');
  const [business, summary] = await Promise.all([
    db.doc('publicBusinessProfiles/' + businessId).get(),
    db.doc('businessRatingSummaries/' + businessId).get(),
  ]);
  if (!business.exists || business.data()?.published !== true) throw new Error('NEGOCIO_NO_PUBLICADO');
  if (!summary.exists) return { count: 0, average: null as number | null };
  const count = summary.data()?.count, sum = summary.data()?.sum;
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(sum) ||
      sum < count || sum > 5 * count) throw new Error('METRICAS_CORRUPTAS');
  return { count, average: count ? Math.round(10 * sum / count) / 10 : null };
}
export async function platformBusinessMetrics(db: Firestore, businessIds: string[]) {
  if (!Array.isArray(businessIds) || businessIds.length < 1 || businessIds.length > 50 ||
      new Set(businessIds).size !== businessIds.length ||
      !businessIds.every(id => typeof id === 'string' && ENGAGEMENT_BUSINESS_ID.test(id)))
    throw new Error('METRICAS_INVALIDAS');
  const pairs = await Promise.all(businessIds.map(async id => {
    // El propietario de la plataforma también necesita ver sus demos y
    // negocios aún no publicados. Esta lectura solo se llama tras Auth/Admin.
    const [business, visits, ratings] = await Promise.all([
      db.doc('businesses/' + id).get(),
      db.doc('businessVisitSummaries/' + id).get(),
      db.doc('businessRatingSummaries/' + id).get(),
    ]);
    if (!business.exists || business.data()?.restaurantId !== id)
      throw new Error('NEGOCIO_INCONSISTENTE');
    const visitsTotal = visits.exists ? visits.data()?.visitsTotal : null;
    const ratingCount = ratings.exists ? ratings.data()?.count : 0;
    const sum = ratings.exists ? ratings.data()?.sum : 0;
    if ((visitsTotal !== null && (!Number.isSafeInteger(visitsTotal) || visitsTotal < 0)) ||
        !Number.isSafeInteger(ratingCount) || ratingCount < 0 ||
        !Number.isSafeInteger(sum) || sum < ratingCount || sum > 5 * ratingCount)
      throw new Error('METRICAS_CORRUPTAS');
    const average = ratingCount ? Math.round(10 * sum / ratingCount) / 10 : null;
    return [id, { visitsTotal, ratingCount, average }] as const;
  }));
  return Object.fromEntries(pairs);
}

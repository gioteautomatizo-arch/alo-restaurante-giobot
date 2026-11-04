/**
 * Visitas y estrellas con Firebase Emulator. App Check y Auth simulados.
 * No ejecutar sin FIRESTORE_EMULATOR_HOST=127.0.0.1:8080.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { registerBusinessEngagementApi } from '../businessEngagementApi';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'Solo Firestore Emulator');
const initial = Object.fromEntries(['ENABLE_BUSINESS_ENGAGEMENT_API', 'ENGAGEMENT_ALLOWED_APP_IDS',
  'ENGAGEMENT_HASH_SALT', 'ENGAGEMENT_TRACKING_SINCE'].map(k => [k, process.env[k]]));
const admin = initializeApp({ projectId: 'gioteautomatizo-business-engagement-test' });
const db = getFirestore(admin);
const app = express();
app.use(express.json({ limit: '16kb' }));
let verifiedApps = 0, verifiedAuth = 0;
registerBusinessEngagementApi(app, {
  firestore: () => db,
  verifyAppCheck: async token => {
    verifiedApps++;
    if (token !== 'fake.valid.appcheck') throw new Error('unauthorized app');
    return { appId: 'test-app-web' };
  },
  verifyIdToken: async token => {
    verifiedAuth++;
    if (token === 'firebase.token.owner.aaaaaaaaaaaaaa') return { uid: 'owner-gio' };
    if (token === 'firebase.token.user1.aaaaaaaaaaaaaa') return { uid: 'customer-one' };
    if (token === 'firebase.token.user2.aaaaaaaaaaaaaa') return { uid: 'customer-two' };
    throw new Error('invalid ID token');
  },
});
const server = createServer(app);
try {
  for (const id of ['tenant-a', 'tenant-b', 'tenant-hidden']) {
    await db.doc('businesses/' + id).set({ restaurantId: id, active: true });
  }
  await db.doc('publicBusinessProfiles/tenant-a').set({ businessId: 'tenant-a', published: true });
  await db.doc('publicBusinessProfiles/tenant-b').set({ businessId: 'tenant-b', published: true });
  await db.doc('publicBusinessProfiles/tenant-hidden').set({ businessId: 'tenant-hidden', published: false });
  await db.doc('platformAdmins/owner-gio').set({ active: true });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  async function send(method: string, path: string, body?: unknown, options: { appToken?: string; idToken?: string } = {}) {
    const res = await fetch(url + path, { method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(options.appToken ? { 'X-Firebase-AppCheck': options.appToken } : {}),
        ...(options.idToken ? { Authorization: 'Bearer ' + options.idToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  }
  const appToken = 'fake.valid.appcheck';
  const user1 = 'firebase.token.user1.aaaaaaaaaaaaaa';
  const user2 = 'firebase.token.user2.aaaaaaaaaaaaaa';
  const owner = 'firebase.token.owner.aaaaaaaaaaaaaa';
  const sidA = 'a'.repeat(32), sidB = 'b'.repeat(32);

  delete process.env.ENABLE_BUSINESS_ENGAGEMENT_API;
  assert.equal((await send('POST', '/api/engagement/tenant-a/visit', { sessionId: sidA }, { appToken })).status, 404);
  assert.equal((await db.collection('businessVisitSummaries').get()).empty, true);
  assert.equal(verifiedApps, 0, 'No se debe verificar App Check cuando está apagado');
  process.env.ENABLE_BUSINESS_ENGAGEMENT_API = 'true';
  delete process.env.ENGAGEMENT_HASH_SALT;
  assert.equal((await send('GET', '/api/engagement/tenant-a/rating')).status, 503);
  process.env.ENGAGEMENT_HASH_SALT = 'emulator-only-secret-12345678901234567890';
  process.env.ENGAGEMENT_TRACKING_SINCE = '2026-11-04';
  process.env.ENGAGEMENT_ALLOWED_APP_IDS = 'test-app-web';

  assert.equal((await send('GET', '/api/engagement/tenant-a/rating')).body.average, null);
  assert.equal((await send('POST', '/api/engagement/tenant-a/visit', { sessionId: sidA })).status, 401);
  assert.equal((await send('POST', '/api/engagement/tenant-a/visit', { sessionId: sidA }, { appToken: 'bad.app.check' })).status, 401);
  assert.equal((await send('POST', '/api/engagement/tenant-a/visit', { sessionId: 'invalid' }, { appToken })).status, 400);
  const first = await send('POST', '/api/engagement/tenant-a/visit', { sessionId: sidA }, { appToken });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.counted, true);
  assert.equal(first.cache, 'no-store');
  const duplicate = await send('POST', '/api/engagement/tenant-a/visit', { sessionId: sidA }, { appToken });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.counted, false);
  assert.equal((await db.doc('businessVisitSummaries/tenant-a').get()).data()?.visitsTotal, 1);
  assert.equal((await db.doc('businessVisitSummaries/tenant-b').get()).exists, false);
  const second = await send('POST', '/api/engagement/tenant-b/visit', { sessionId: sidA }, { appToken });
  assert.equal(second.status, 201, 'Misma sesión en otro negocio registra otra visita');
  const third = await send('POST', '/api/engagement/tenant-a/visit', { sessionId: sidB }, { appToken });
  assert.equal(third.status, 201);
  assert.equal((await db.doc('businessVisitSummaries/tenant-a').get()).data()?.visitsTotal, 2);
  assert.equal((await send('POST', '/api/engagement/tenant-hidden/visit', { sessionId: sidA }, { appToken })).status, 404);

  assert.equal((await send('PUT', '/api/engagement/tenant-a/rating', { stars: 5 }, { appToken })).status, 401);
  assert.equal((await send('PUT', '/api/engagement/tenant-a/rating', { stars: 0 }, { appToken, idToken: user1 })).status, 400);
  assert.equal((await send('PUT', '/api/engagement/tenant-a/rating', { stars: 3, sum: 900 },
    { appToken, idToken: user1 })).status, 400, 'No aceptar promedios del navegador');
  const vote = await send('PUT', '/api/engagement/tenant-a/rating', { stars: 4 }, { appToken, idToken: user1 });
  assert.equal(vote.status, 200);
  assert.equal(vote.body.count, 1);
  assert.equal(vote.body.average, 4);
  const repeated = await send('PUT', '/api/engagement/tenant-a/rating', { stars: 4 }, { appToken, idToken: user1 });
  assert.equal(repeated.body.count, 1);
  assert.equal(repeated.body.unchanged, true);
  const updated = await send('PUT', '/api/engagement/tenant-a/rating', { stars: 5 }, { appToken, idToken: user1 });
  assert.equal(updated.body.count, 1, 'Editar una votación no agrega una nueva');
  const other = await send('PUT', '/api/engagement/tenant-a/rating', { stars: 1 }, { appToken, idToken: user2 });
  assert.equal(other.body.count, 2);
  assert.equal(other.body.average, 3);
  const b = await send('PUT', '/api/engagement/tenant-b/rating', { stars: 2 }, { appToken, idToken: user1 });
  assert.equal(b.body.average, 2);
  const publicRating = await send('GET', '/api/engagement/tenant-a/rating');
  assert.deepEqual(publicRating.body, { count: 2, average: 3 });
  assert.equal(JSON.stringify(publicRating.body).includes('customer-one'), false);
  const votes = await db.collection('businessRatingVotes').get();
  assert.equal(votes.size, 3);
  for (const voteSnap of votes.docs) {
    assert.equal(voteSnap.data().uid, undefined);
    assert.equal(voteSnap.data().ip, undefined);
  }

  assert.equal((await send('POST', '/api/engagement/platform/metrics', { businessIds: ['tenant-a'] })).status, 401);
  assert.equal((await send('POST', '/api/engagement/platform/metrics', { businessIds: ['tenant-a'] },
    { idToken: user1 })).status, 403);
  const metrics = await send('POST', '/api/engagement/platform/metrics',
    { businessIds: ['tenant-a', 'tenant-b'] }, { idToken: owner });
  assert.equal(metrics.status, 200, JSON.stringify(metrics.body));
  assert.equal(metrics.body.trackingSince, '2026-11-04');
  assert.deepEqual(metrics.body.metrics['tenant-a'], { visitsTotal: 2, ratingCount: 2, average: 3 });
  assert.deepEqual(metrics.body.metrics['tenant-b'], { visitsTotal: 1, ratingCount: 1, average: 2 });
  const hiddenMetrics = await send('POST', '/api/engagement/platform/metrics',
    { businessIds: ['tenant-hidden'] }, { idToken: owner });
  assert.equal(hiddenMetrics.status, 200, 'Panel privado debe admitir negocios sin publicar');
  assert.deepEqual(hiddenMetrics.body.metrics['tenant-hidden'],
    { visitsTotal: null, ratingCount: 0, average: null });
  assert.equal((await send('GET', '/api/engagement/tenant-hidden/rating')).status, 404,
    'El público no ve calificaciones de demos sin publicar');
  await db.doc('platformAdmins/owner-gio').update({ active: false });
  assert.equal((await send('POST', '/api/engagement/platform/metrics',
    { businessIds: ['tenant-a'] }, { idToken: owner })).status, 403);
  process.env.ENABLE_BUSINESS_ENGAGEMENT_API = 'false';
  assert.equal((await send('GET', '/api/engagement/tenant-a/rating')).status, 404);
  assert.ok(verifiedApps > 0 && verifiedAuth > 0);
  console.log('PASS: visitas deduplicadas por sesión y negocio, votos editables por UID, promedios confiables, panel Super Admin con token y 404 por defecto.');
  console.log('CANDIDATO: App Check/Auth simulados; staging y permisos finales pendientes.');
} finally {
  for (const [key, value] of Object.entries(initial)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
  await deleteApp(admin);
}

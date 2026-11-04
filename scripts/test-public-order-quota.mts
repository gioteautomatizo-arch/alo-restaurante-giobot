/**
 * Cuota global A/B contra Firestore Emulator. Solo proyecto ficticio.
 * Simula múltiples instancias del mismo API y verifica el fail closed.
 */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { consumePublicOrderQuota, publicOrderQuotaKeys,
  PUBLIC_ORDER_QUOTA_CLIENT_LIMIT, PUBLIC_ORDER_QUOTA_TENANT_LIMIT } from '../publicOrderQuota';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: solo Firestore Emulator local.');
const app = initializeApp({ projectId: 'gioteautomatizo-public-order-quota-test' });
const db = getFirestore(app);
const collection = db.collection('public_order_rate_limits');
const now = 1_800_000_000_000;
const input = (businessId: string, remoteAddress: string, at = now) =>
  ({ businessId, appId: 'web-verified-test', remoteAddress, now: at });
try {
  const key = publicOrderQuotaKeys('business-a', 'web-verified-test', '203.0.113.10');
  assert.match(key.client, /^client_[0-9a-f]{64}$/);
  assert.match(key.tenant, /^tenant_[0-9a-f]{64}$/);
  assert.ok(!key.client.includes('203.0.113.'), 'No guardar IP en ID');
  assert.equal((await consumePublicOrderQuota(db, input('business-a', '203.0.113.10'))).allowed, true);
  const first = (await collection.doc(key.client).get()).data()!;
  assert.equal(first.count, 1);
  assert.equal(first.resetAt, now + 60_000);
  assert.ok(first.expiresAt, 'TTL configurado en documento para futura limpieza');
  assert.equal(first.remoteAddress, undefined, 'IP original nunca se persiste');

  // Reinicio de ventana de un cliente; no se crea IP ni cuenta nueva por browser.
  await collection.doc(key.client).set({ count: PUBLIC_ORDER_QUOTA_CLIENT_LIMIT - 1, resetAt: now + 60_000 });
  assert.equal((await consumePublicOrderQuota(db, input('business-a', '203.0.113.10'))).allowed, true);
  const limited = await consumePublicOrderQuota(db, input('business-a', '203.0.113.10'));
  assert.equal(limited.allowed, false);
  assert.equal(limited.retryAfterSeconds, 60);
  const other = await consumePublicOrderQuota(db, input('business-a', '203.0.113.11'));
  assert.equal(other.allowed, true, 'Otra IP no consume la cuota individual anterior');

  // Al cambiar de instancia/no usar Map local se conserva el mismo límite tenant.
  const tenantKey = publicOrderQuotaKeys('business-a', 'web-verified-test', 'x').tenant;
  await collection.doc(tenantKey).set({
    count: PUBLIC_ORDER_QUOTA_TENANT_LIMIT - 1, resetAt: now + 60_000,
  });
  assert.equal((await consumePublicOrderQuota(db, input('business-a', '203.0.113.12'))).allowed, true);
  assert.equal((await consumePublicOrderQuota(db, input('business-a', '203.0.113.13'))).allowed, false,
    'Cambiar IP no evita el límite por negocio');
  assert.equal((await consumePublicOrderQuota(db, input('business-b', '203.0.113.10'))).allowed, true,
    'Negocio B mantiene su propio presupuesto');

  // La ventana vencida se reinicia sin purgar documentos en caliente.
  assert.equal((await consumePublicOrderQuota(db, input('business-a', '203.0.113.10', now + 61_000))).allowed, true);
  await collection.doc(key.client).set({ count: 'tampered', resetAt: now + 150_000 });
  await assert.rejects(
    consumePublicOrderQuota(db, input('business-a', '203.0.113.10', now + 61_000)),
    /CUOTA_INTEGRA/,
    'Contador corrupto debe fallar cerrado',
  );
  assert.equal((await collection.doc(key.tenant).get()).data()?.count, 1,
    'El fallo atómico no debe incrementar cuota tenant');

  // Bajo carrera: dos clientes ganan los últimos dos espacios, jamás se excede.
  const raceKey = publicOrderQuotaKeys('business-race', 'web-verified-test', '203.0.113.20');
  await collection.doc(raceKey.client).set({
    count: PUBLIC_ORDER_QUOTA_CLIENT_LIMIT - 2, resetAt: now + 60_000,
  });
  const race = await Promise.all(Array.from({ length: 4 }, () =>
    consumePublicOrderQuota(db, input('business-race', '203.0.113.20'))));
  assert.equal(race.filter(x => x.allowed).length, 2, 'Un contador común y transaccional bloquea duplicados concurrentes');
  assert.equal((await collection.doc(raceKey.client).get()).data()?.count, PUBLIC_ORDER_QUOTA_CLIENT_LIMIT);
  console.log('PASS: cuota compartida por tenant/IP, ventanas, corrupción, concurrencia y A/B solo con Firestore Emulator.');
  console.log('PENDIENTE: App Check real, firewall/WAF, límites a escala y política TTL; no desplegar.');
} finally {
  await deleteApp(app);
}

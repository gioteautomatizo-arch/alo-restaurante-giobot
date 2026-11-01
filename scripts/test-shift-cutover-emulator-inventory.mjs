/** Solo Admin SDK + Firestore Emulator local; datos ficticios A/B. */
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { captureShiftCutoverEmulatorInventory as capture } from '../src/lib/shiftCutoverEmulatorInventory.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080', 'ALTO: solo emulador local');
const app = initializeApp({ projectId: 'gioteautomatizo-shift-cutover-inventory-test' }, 'shift-cutover-inventory');
const db = getFirestore(app);
const at = '2026-10-31T13:00:00.000Z';
const end = '2026-10-31T14:00:00.000Z';
const sidA = 'srv-' + 'a'.repeat(32);
const sidB = 'srv-' + 'b'.repeat(32);
const root = (id) => db.collection('businesses').doc(id);
const shifts = (id) => root(id).collection('shifts');
const authority = (id) => root(id).collection('shiftAuthority');
const blocked = (r) => {
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.canActivate, false);
  assert.equal(r.canCloseCash, false);
  assert.equal(r.inventoryComplete, false);
};
const issue = (r, code) => assert.ok(r.issues.includes(code), `${code}: ${r.issues.join(',')}`);
try {
  const previousHost = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  await assert.rejects(capture({ db, businessId: 'tenant-a' }), /EMULATOR_ONLY/);
  process.env.FIRESTORE_EMULATOR_HOST = previousHost;
  await assert.rejects(capture({ db, businessId: 'tenant-a', pageSize: 0 }), /INVALID_CAPTURE_INPUT/);
  await assert.rejects(capture({ db, businessId: 'tenant-a', pageSize: 51 }), /INVALID_CAPTURE_INPUT/);

  for (const id of ['tenant-a', 'tenant-b']) {
    await root(id).set({ restaurantId: id, ownerUserId: 'owner-' + id.slice(-1) });
  }
  const aClosed = { businessId: 'tenant-a', status: 'cerrado', openedAt: at, closedAt: end,
    openedByUid: 'owner-a', openRequestId: 'open-request-a',
    closedByUid: 'owner-a', closeRequestId: 'close-request-a' };
  const bOpen = { businessId: 'tenant-b', status: 'abierto', openedAt: at,
    openedByUid: 'owner-b', openRequestId: 'open-request-b' };
  await shifts('tenant-a').doc(sidA).set(aClosed);
  await authority('tenant-a').doc('closed-' + sidA).set({
    businessId: 'tenant-a', shiftId: sidA, actorUid: 'owner-a',
    requestId: 'close-request-a', closedAt: end,
  });
  for (let i = 0; i < 5; i++) {
    await shifts('tenant-a').doc('legacy-' + i).set({
      businessId: 'tenant-a', status: 'cerrado', openedAt: at, closedAt: end,
    });
  }
  await shifts('tenant-b').doc(sidB).set(bOpen);
  await authority('tenant-b').doc('current').set({
    businessId: 'tenant-b', status: 'abierto', shiftId: sidB,
    actorUid: 'owner-b', requestId: 'open-request-b',
  });
  const a = await capture({ db, businessId: 'tenant-a', pageSize: 2 });
  blocked(a);
  assert.equal(a.capture.stable, true);
  assert.equal(a.capture.shifts, 6);
  assert.equal(a.capture.authority, 1);
  assert.equal(a.capture.receipts, 1);
  assert.ok(a.capture.pages.shifts >= 3, 'se recorrieron varias páginas');
  assert.equal(a.summary.serverClosed, 1);
  assert.equal(a.summary.legacyClosed, 5);
  assert.equal(a.summary.serverOpen, 0);
  issue(a, 'INVENTORY_NOT_PROVEN_COMPLETE');
  issue(a, 'LEGACY_HISTORY_REQUIRES_REVIEW');
  assert.equal(a.issues.includes('RECEIPT_TENANT_MISMATCH'), false);

  const b = await capture({ db, businessId: 'tenant-b', pageSize: 1 });
  blocked(b);
  assert.equal(b.capture.stable, true);
  assert.equal(b.summary.serverOpen, 1);
  assert.equal(b.summary.serverClosed, 0);
  assert.equal(b.capture.receipts, 0);
  assert.equal(b.issues.includes('SHIFT_TENANT_MISMATCH'), false);

  await authority('tenant-a').doc('closed-' + sidA).update({ businessId: 'tenant-b' });
  issue(await capture({ db, businessId: 'tenant-a', pageSize: 2 }), 'RECEIPT_TENANT_MISMATCH');
  await authority('tenant-a').doc('closed-' + sidA).update({ businessId: 'tenant-a' });
  await shifts('tenant-a').doc(sidA).update({ businessId: 'tenant-b' });
  issue(await capture({ db, businessId: 'tenant-a', pageSize: 2 }), 'SHIFT_TENANT_MISMATCH');
  await shifts('tenant-a').doc(sidA).update({ businessId: 'tenant-a' });
  await authority('tenant-a').doc('unexpected').set({ businessId: 'tenant-a' });
  issue(await capture({ db, businessId: 'tenant-a', pageSize: 2 }), 'UNKNOWN_AUTHORITY_DOCUMENT');
  await authority('tenant-a').doc('unexpected').delete();

  const changed = await capture({ db, businessId: 'tenant-a', pageSize: 2,
    afterFirstPass: async () => shifts('tenant-a').doc('legacy-0').update({ closedAt: '2026-10-31T14:01:00.000Z' }),
  });
  blocked(changed);
  assert.equal(changed.capture.stable, false);
  issue(changed, 'INVENTORY_CHANGED_DURING_READ');
  const missing = await capture({ db, businessId: 'tenant-missing' });
  blocked(missing);
  issue(missing, 'BUSINESS_NOT_FOUND_OR_MISMATCH');

  const broken = await capture({
    db: { collection: () => ({ doc: () => ({ get: async () => { throw new Error('denied'); } }) }) },
    businessId: 'tenant-a',
  });
  blocked(broken);
  issue(broken, 'READ_FAILED');
  const batch = db.batch();
  for (let i = 0; i < 201; i++) {
    batch.set(shifts('tenant-b').doc('legacy-extra-' + String(i).padStart(3, '0')), {
      businessId: 'tenant-b', status: 'cerrado', openedAt: at, closedAt: end,
    });
  }
  await batch.commit();
  const tooMany = await capture({ db, businessId: 'tenant-b', pageSize: 25 });
  blocked(tooMany);
  issue(tooMany, 'HISTORY_LIMIT_EXCEEDED');
  assert.equal((await shifts('tenant-a').doc(sidA).get()).data().businessId, 'tenant-a');
  console.log('PASS: lectura paginada doble de Caja en Emulator A/B, cambios, fallos, límites y aislamiento.');
  console.log('PENDIENTE: snapshot atómico, históricos/MIXTO, reglas desplegadas, migración y Android/iPad; NO activar Caja.');
} finally {
  await deleteApp(app);
}

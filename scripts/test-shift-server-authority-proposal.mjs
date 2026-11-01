/** Preflight de autoridad de turnos: SOLO Firestore Emulator y datos inventados.
 * Documenta el bypass actual y una propuesta incompatible con el cliente
 * actual, sin modificar reglas versionadas ni habilitar endpoint de cobro.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { buildShiftServerAuthorityProposalRules } from './shift-server-authority-proposal-rules.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: esta prueba requiere Firestore Emulator local; prohibido Firebase real.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposed = buildShiftServerAuthorityProposalRules(staged);
assert.notEqual(proposed, staged);
assert.match(staged, /allow update: if isTenantModule\(moduleCol\)/);
assert.match(proposed, /allow update: if isTenantModule\(moduleCol\)\s*&& moduleCol != 'auditLog'\s*&& moduleCol != 'shifts'/);
assert.match(proposed, /allow create: if isTenantModule\(moduleCol\)\s*&& moduleCol != 'shifts'/);
assert.equal(readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'), staged,
  'La propuesta nunca modifica reglas STAGED.');

const projectId = 'gioteautomatizo-shift-authority-proposal-test';
const shiftRef = (db, tenant = 'tenant-a', id = 'morning') =>
  doc(db, 'businesses', tenant, 'shifts', id);
const initial = (tenant) => ({
  businessId: tenant, status: 'abierto', shiftType: 'AM',
  openedAt: '2026-10-31T13:00:00.000Z', initialCashFund: 100,
});
const forgedClose = (tenant, amount) => ({
  ...initial(tenant), status: 'cerrado',
  closedAt: '2026-10-31T13:01:00.000Z',
  totalSales: 999999, salesCash: 999999, expectedCash: amount,
  countedCash: amount, cashDifference: 0,
});
const member = (tenant, uid, role = 'OWNER', active = true) =>
  ({ restaurantId: tenant, userId: uid, role, active });

async function seed(env) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [tenant, owner] of [['tenant-a', 'owner-a'], ['tenant-b', 'owner-b']]) {
      await setDoc(doc(db, 'businesses', tenant), { restaurantId: tenant, ownerUserId: owner });
      await setDoc(doc(db, 'businessMemberships', tenant + '_' + owner), member(tenant, owner));
      await setDoc(shiftRef(db, tenant), initial(tenant));
    }
    await setDoc(doc(db, 'businessMemberships/tenant-a_cashier-a'),
      member('tenant-a', 'cashier-a', 'CASHIER'));
    await setDoc(doc(db, 'businessMemberships/tenant-a_revoked-a'),
      member('tenant-a', 'revoked-a', 'OWNER', false));
  });
}

async function check(mode, rules) {
  const env = await initializeTestEnvironment({
    projectId, firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    await env.clearFirestore();
    await seed(env);
    const ownerA = env.authenticatedContext('owner-a').firestore();
    const cashierA = env.authenticatedContext('cashier-a').firestore();
    const ownerB = env.authenticatedContext('owner-b').firestore();
    const revoked = env.authenticatedContext('revoked-a').firestore();
    const stranger = env.authenticatedContext('stranger').firestore();
    const guest = env.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(shiftRef(ownerA)));
    await assertSucceeds(getDoc(shiftRef(cashierA)));
    await assertSucceeds(getDoc(shiftRef(ownerB, 'tenant-b')));
    for (const db of [ownerB, revoked, stranger, guest]) {
      await assertFails(getDoc(shiftRef(db)), 'Nunca leer Caja de otro tenant o sin rol');
      await assertFails(setDoc(shiftRef(db), forgedClose('tenant-a', 1)));
    }

    if (mode === 'staged') {
      // Brecha confirmada: el cliente puede cerrar con cifras inventadas,
      // y un segundo cajero puede reemplazar el mismo cierre sin control CAS.
      await assertSucceeds(setDoc(shiftRef(ownerA), forgedClose('tenant-a', 1)));
      await assertSucceeds(setDoc(shiftRef(cashierA), forgedClose('tenant-a', 2)));
      const after = (await assertSucceeds(getDoc(shiftRef(ownerA)))).data();
      assert.equal(after.status, 'cerrado');
      assert.equal(after.totalSales, 999999);
      assert.equal(after.countedCash, 2);
      await assertSucceeds(setDoc(shiftRef(ownerA), initial('tenant-a')));
      await assertSucceeds(setDoc(shiftRef(ownerA, 'tenant-a', 'forged-created'),
        forgedClose('tenant-a', 1)));
      console.log('PENDIENTE: STAGED permite cierre, reapertura y creación de turno cerrado desde SDK cliente, sin autoridad de servidor.');
    } else {
      // Candidato: ninguna apertura/cierre directa del SDK, tampoco dos
      // escrituras simultáneas, aunque el usuario sea OWNER o CASHIER.
      for (const db of [ownerA, cashierA]) {
        await assertFails(setDoc(shiftRef(db), forgedClose('tenant-a', 1)));
        await assertFails(setDoc(shiftRef(db), initial('tenant-a')));
        await assertFails(setDoc(shiftRef(db, 'tenant-a', 'new-shift'), initial('tenant-a')));
        await assertFails(setDoc(shiftRef(db, 'tenant-a', 'closed-created'),
          forgedClose('tenant-a', 1)));
      }
      const concurrent = await Promise.allSettled([
        setDoc(shiftRef(ownerA), forgedClose('tenant-a', 1)),
        setDoc(shiftRef(cashierA), forgedClose('tenant-a', 2)),
      ]);
      assert.equal(concurrent.filter(x => x.status === 'rejected').length, 2);
      const stillOpen = (await assertSucceeds(getDoc(shiftRef(ownerA)))).data();
      assert.equal(stillOpen.status, 'abierto');
      assert.equal(stillOpen.initialCashFund, 100);

      // Las operaciones de otros módulos y lecturas de Caja no se interrumpen.
      await assertSucceeds(setDoc(doc(ownerA, 'businesses/tenant-a/expenses/demo-expense'), {
        businessId: 'tenant-a', amount: 10, createdAt: '2026-10-31T13:02:00.000Z',
      }));
      await assertFails(setDoc(doc(ownerB, 'businesses/tenant-a/expenses/cross'), {
        businessId: 'tenant-a', amount: 10,
      }));
      // Solo demuestra que el contexto privilegiado del emulador puede
      // escribir: NO existe aún un endpoint autenticado/transaccional.
      await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(shiftRef(ctx.firestore()), forgedClose('tenant-a', 123));
      });
      assert.equal((await assertSucceeds(getDoc(shiftRef(ownerA)))).data().countedCash, 123);
      console.log('PASS: propuesta aislada niega escrituras de turnos desde clientes, conserva lectura y otros módulos, aísla A/B.');
      console.log('PENDIENTE: sin endpoint de servidor y conciliación transaccional, esta propuesta NO se puede desplegar; rompería apertura/cierre actual.');
    }
  } finally {
    await env.cleanup();
  }
}

await check('staged', staged);
await check('candidate', proposed);
console.log('PASS: preflight de autoridad de Caja ejecutado únicamente en Firestore Emulator, sin tocar reglas reales.');

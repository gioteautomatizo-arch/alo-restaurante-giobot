/**
 * Paso 2: auditoría de identidad interna de membresías históricas.
 * STAGED reproduce el riesgo; la propuesta se carga SOLO en Firestore Emulator.
 * El PASS de diagnóstico NO significa que STAGED esté corregido.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { buildMembershipIdentityProposalRules } from './membership-identity-proposal-rules.mjs';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: se requiere Firestore Emulator local; prohibido consultar Firebase real.');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const candidate = buildMembershipIdentityProposalRules(staged);
const a = 'membership-a';
const b = 'membership-b';
const membership = (id, uid, role = 'OWNER', active = true) =>
  ({ restaurantId: id, userId: uid, role, active });

async function scenario(rules, diagnostic) {
  const env = await initializeTestEnvironment({
    projectId: diagnostic
      ? 'gioteautomatizo-membership-identity-staged'
      : 'gioteautomatizo-membership-identity-candidate',
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });
  try {
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const visitor = env.unauthenticatedContext().firestore();
    const rootA = doc(alice, 'businesses', a);
    const rootB = doc(alice, 'businesses', b);
    const catalogB = id => doc(alice, 'businesses', b, 'catalog', id);
    const staffB = doc(alice, 'businessMemberships', b + '_staff');

    await env.withSecurityRulesDisabled(async ctx => {
      const admin = ctx.firestore();
      await setDoc(doc(admin, 'businesses', a), { restaurantId: a, ownerUserId: 'alice' });
      await setDoc(doc(admin, 'businesses', b), { restaurantId: b, ownerUserId: 'bob' });
      await setDoc(doc(admin, 'businessMemberships', a + '_alice'), membership(a, 'alice'));
      await setDoc(doc(admin, 'businessMemberships', b + '_bob'), membership(b, 'bob'));
      await setDoc(doc(admin, 'businessMemberships', b + '_staff'),
        membership(b, 'staff', 'CASHIER'));
      await setDoc(doc(admin, 'platformAdmins', 'platform-admin'), { active: true });
    });

    // Acceso legítimo y aislamiento sin registros corruptos.
    await assertSucceeds(getDoc(rootA));
    await assertSucceeds(getDoc(doc(bob, 'businesses', b)));
    await assertFails(getDoc(rootB));
    await assertFails(getDoc(doc(bob, 'businesses', a)));
    await assertFails(getDoc(doc(visitor, 'businesses', a)));
    await assertSucceeds(setDoc(doc(bob, 'businesses', b, 'catalog', 'owner-edit'),
      { businessId: b, items: [] }));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('platform-admin').firestore(),
      'businesses', b)));

    // Cada ficha anómala fue sembrada SOLO con privilegios del emulador.
    const anomalies = [
      ['tenant-ajeno', { ...membership(b, 'alice'), restaurantId: a }, true],
      ['uid-ajeno', { ...membership(b, 'alice'), userId: 'bob' }, true],
      ['tenant-ausente', { userId: 'alice', role: 'OWNER', active: true }, true],
      ['uid-ausente', { restaurantId: b, role: 'OWNER', active: true }, true],
      ['rol-desconocido', membership(b, 'alice', 'ROOT'), false],
      ['revocada', membership(b, 'alice', 'OWNER', false), false],
    ];
    for (const [name, data, stagedCanWrite] of anomalies) {
      await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'businessMemberships', b + '_alice'), data);
      });
      if (diagnostic && data.active === true) {
        await assertSucceeds(getDoc(rootB));
      } else {
        await assertFails(getDoc(rootB));
      }
      const menu = catalogB('malformed-' + name);
      if (diagnostic && stagedCanWrite) {
        await assertSucceeds(setDoc(menu, { businessId: b, items: [] }));
        await assertSucceeds(updateDoc(staffB, { role: 'KITCHEN' }));
      } else {
        await assertFails(setDoc(menu, { businessId: b, items: [] }));
        await assertFails(updateDoc(staffB, { role: 'KITCHEN' }));
      }
      // Rutas que consultaban directamente el documento de membresía, sin
      // pasar por los helpers: el candidato anterior NO las protegía.
      const newEmployee = 'candidate-' + name;
      const profile = doc(alice, 'publicBusinessProfiles', b);
      const employee = doc(alice, 'businesses', b, 'employees', newEmployee);
      const employeeMembership = doc(alice, 'businessMemberships', b + '_' + newEmployee);
      const directWrites = [
        () => setDoc(profile, { businessId: b, restaurantId: b, published: false }),
        () => setDoc(employee, { restaurantId: b, userId: newEmployee,
          role: 'CASHIER', active: true }),
        () => setDoc(employeeMembership, membership(b, newEmployee, 'CASHIER')),
      ];
      for (const write of directWrites) {
        if (diagnostic && stagedCanWrite) await assertSucceeds(write());
        else await assertFails(write());
      }
      // Ni siquiera una membresía corrupta debe afectar el tenant A legítimo.
      await assertSucceeds(getDoc(rootA));
    }

    // Un empleado con membresía auténtica en ambos negocios sigue trabajando.
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'businessMemberships', b + '_alice'),
        membership(b, 'alice', 'MANAGER'));
    });
    await assertSucceeds(getDoc(rootB));
    await assertSucceeds(setDoc(catalogB('valid-manager'), { businessId: b, items: [] }));
    await assertSucceeds(updateDoc(staffB, { role: 'WAITER' }));
    // Compatibilidad: los responsables auténticos conservan las tres rutas.
    await assertSucceeds(setDoc(doc(alice, 'businesses', b, 'employees', 'valid-new'),
      { restaurantId: b, userId: 'valid-new', role: 'CASHIER', active: true }));
    await assertSucceeds(setDoc(doc(alice, 'businessMemberships', b + '_valid-new'),
      membership(b, 'valid-new', 'CASHIER')));
    await assertSucceeds(setDoc(doc(bob, 'publicBusinessProfiles', b),
      { businessId: b, restaurantId: b, published: false }));
    await assertFails(getDoc(doc(visitor, 'businesses', b)));

    if (diagnostic) {
      console.warn('PENDIENTE SEGURIDAD STAGED: membresías con ruta correcta y tenant/UID interno falso permiten leer negocio ajeno, editar catálogo y gestionar empleados; solo datos sintéticos.');
    } else {
      console.log('PASS (candidato NO desplegado): membresías mal asociadas, incompletas, con rol inválido o revocadas no autorizan raíz, catálogo, empleados, perfil ni altas de membresía; A/B, roles legítimos y Super Admin conservados.');
    }
  } finally {
    await env.cleanup();
  }
}

await scenario(staged, true);
await scenario(candidate, false);
console.log('PENDIENTE: inventario de membresías históricas, revisión independiente y despliegue coordinado; STAGED permanece intacto.');

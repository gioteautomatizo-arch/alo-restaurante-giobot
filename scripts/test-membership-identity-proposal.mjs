/**
 * Paso 2: auditoría de identidad interna de membresías históricas.
 * STAGED reproduce el riesgo; la propuesta se carga SOLO en Firestore Emulator.
 * El PASS de diagnóstico NO significa que STAGED esté corregido.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

    // Contrato real de getBusinessesForUser: consulta por UID + active.
    // No bloquear todos los listados válidos con una condición sobre doc.id
    // que Firestore no puede demostrar para una consulta de colección.
    const ownList = query(collection(alice, 'businessMemberships'),
      where('userId', '==', 'alice'), where('active', '==', true));
    const ownDocs = await assertSucceeds(getDocs(ownList));
    assert(ownDocs.docs.some(snap => snap.id === a + '_alice'));

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

    // El objetivo de una operación también debe coincidir con su clave.
    // La identidad del actor puede ser legítima en A/B y aun así no debe
    // permitir modificar una ficha con ID de B y datos internos de A.
    const targetAsSelf = doc(env.authenticatedContext('target').firestore(),
      'businessMemberships', b + '_target');
    const targetAsAlice = doc(alice, 'businessMemberships', b + '_target');
    const malformedTargets = [
      {
        label: 'tenant-interno-A-en-clave-B',
        data: membership(a, 'target', 'CASHIER'),
        managerRef: targetAsAlice,
        selfRef: targetAsSelf,
      },
      {
        label: 'uid-interno-alice-en-clave-target',
        data: membership(b, 'alice', 'CASHIER'),
        managerRef: doc(bob, 'businessMemberships', b + '_target'),
        selfRef: targetAsAlice,
      },
    ];
    for (const anomaly of malformedTargets) {
      await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), 'businessMemberships', b + '_target'), anomaly.data);
      });
      // LIMITACIÓN de Firestore: la consulta por campos puede devolver
      // una ficha corrupta; el selector cliente debe detectarla y fallar
      // cerrado, y el inventario histórico debe depurarla antes del corte.
      const malformedList = query(collection(
        env.authenticatedContext(anomaly.data.userId).firestore(), 'businessMemberships'),
        where('userId', '==', anomaly.data.userId), where('active', '==', true));
      const listed = await assertSucceeds(getDocs(malformedList));
      assert(listed.docs.some(snap => snap.id === b + '_target'),
        'La consulta de colección expone el bloqueo histórico que exige preflight');
      const read = getDoc(anomaly.selfRef);
      if (diagnostic) await assertSucceeds(read);
      else await assertFails(read);
      const edit = updateDoc(anomaly.managerRef, { role: 'KITCHEN' });
      if (diagnostic) await assertSucceeds(edit);
      else await assertFails(edit);
      const remove = deleteDoc(anomaly.selfRef);
      if (diagnostic) await assertSucceeds(remove);
      else await assertFails(remove);
      if (!diagnostic) {
        await env.withSecurityRulesDisabled(async ctx => {
          const remaining = await getDoc(doc(ctx.firestore(), 'businessMemberships', b + '_target'));
          assert.equal(remaining.exists(), true,
            'El candidato no debe modificar una membresía objetivo discordante: ' + anomaly.label);
          assert.equal(remaining.data().role, 'CASHIER');
        });
      }
    }

    // Compatibilidad: un empleado legítimo puede consultar su ficha revocada
    // para saber por qué perdió acceso, y puede abandonarla. No exigir active
    // al documento objetivo; solo integridad de ruta e identidad.
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'businessMemberships', b + '_staff'),
        membership(b, 'staff', 'CASHIER', false));
    });
    const staffSelf = doc(env.authenticatedContext('staff').firestore(),
      'businessMemberships', b + '_staff');
    await assertSucceeds(getDoc(staffSelf));
    await assertSucceeds(updateDoc(doc(bob, 'businessMemberships', b + '_staff'),
      { active: false, role: 'KITCHEN' }));
    await assertSucceeds(deleteDoc(staffSelf));
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'businessMemberships', b + '_staff'),
        membership(b, 'staff', 'CASHIER'));
    });

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
      console.warn('PENDIENTE SEGURIDAD STAGED: membresías con ruta correcta y tenant/UID interno falso permiten leer negocio ajeno, editar catálogo, gestionar empleados y leer/editar/borrar fichas objetivo mal asociadas; solo datos sintéticos.');
    } else {
      console.log('PASS (candidato NO desplegado): get/update/delete de fichas objetivo discordantes rechazados; consulta legítima por UID, lectura propia revocada, A/B y Super Admin conservados.');
      console.warn('PENDIENTE: list de membresías aún puede devolver fichas históricas con ID interno discordante; requiere inventario, validación cliente y diseño de lectura seguro antes del corte.');
    }
  } finally {
    await env.cleanup();
  }
}

await scenario(staged, true);
await scenario(candidate, false);
console.log('PENDIENTE: inventario de membresías históricas, revisión independiente y despliegue coordinado; STAGED permanece intacto.');

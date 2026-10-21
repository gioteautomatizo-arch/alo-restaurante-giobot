/**
 * Ensayo con reglas STAGED: transición del panel VIP legado de Calientito.
 * Solo usa Firebase Emulator y datos ficticios. NO migra datos reales.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'El ensayo VIP requiere el emulador; no ejecutar contra producción.');
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-vip-admin-compat-test',
  firestore: {
    rules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
    host: '127.0.0.1', port: 8080,
  },
});
const signed = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const calientito = 'alo-restaurante';
const a = 'vip-admin-business-a';
const roleData = (id, uid, role, active = true) =>
  ({ restaurantId: id, userId: uid, role, active });
const vip = (id, name) => ({
  restaurantId: id, customerName: name, memberId: 'VIP-TEST',
  phone: '5512345678', pinHash: 'hash-ficticio',
  stamps: 4, totalOrders: 8, rewardAvailable: true,
  pendingStampsToValidate: 1, createdAt: '2026-10-20T00:00:00Z',
});
const getVip = (user, id) => getDoc(doc(signed(user), 'vip_profiles', id));
const list = (user, id) => getDocs(query(collection(signed(user), 'vip_profiles'), where('restaurantId', '==', id)));
try {
  await env.withSecurityRulesDisabled(async ctx => {
    const system = ctx.firestore();
    await setDoc(doc(system, 'businesses', a), { restaurantId: a, ownerUserId: 'owner-a' });
    await setDoc(doc(system, 'businessMemberships', a + '_owner-a'), roleData(a, 'owner-a', 'OWNER'));
    await setDoc(doc(system, 'vip_profiles', 'cal-card'), vip(calientito, 'Tarjeta Calientito'));
    await setDoc(doc(system, 'vip_profiles', 'business-a-card'), vip(a, 'Tarjeta Negocio A'));
    // Una tarjeta histórica no trae restaurantId. No se puede exponer mediante
    // reglas cliente ni será visible con el filtro del panel administrativo.
    const { restaurantId: _ignored, ...legacy } = vip(calientito, 'Tarjeta anterior');
    await setDoc(doc(system, 'vip_profiles', 'legacy-without-business-id'), legacy);
  });

  // El PIN del panel antiguo por sí solo NO es credencial Firebase ni membresía.
  await assertFails(getVip('old-cal-manager', 'cal-card'));
  await assertFails(list('old-cal-manager', calientito));
  await assertFails(getDoc(doc(anon(), 'vip_profiles', 'cal-card')));
  await assertFails(getDoc(doc(signed('owner-a'), 'vip_profiles', 'cal-card')));
  await assertFails(list('owner-a', calientito));

  // Solo un proceso administrativo fuera del SDK del cliente puede vincular
  // UIDs comprobados con roles autorizados después de respaldar datos.
  await env.withSecurityRulesDisabled(async ctx => {
    const system = ctx.firestore();
    for (const [uid, role, active] of [
      ['cal-owner', 'OWNER', true], ['cal-admin', 'ADMIN', true],
      ['old-cal-manager', 'MANAGER', true], ['cal-cashier', 'CASHIER', true],
      ['cal-kitchen', 'KITCHEN', true], ['cal-disabled', 'MANAGER', false],
    ]) {
      await setDoc(doc(system, 'businessMemberships', calientito + '_' + uid),
        roleData(calientito, uid, role, active));
    }
  });

  for (const uid of ['cal-owner', 'cal-admin', 'old-cal-manager']) {
    const card = await assertSucceeds(getVip(uid, 'cal-card'));
    assert.equal(card.data().stamps, 4);
    assert.equal(card.data().totalOrders, 8);
    assert.equal(card.data().rewardAvailable, true);
    const cards = await assertSucceeds(list(uid, calientito));
    assert.equal(cards.size, 1, 'panel consulta exclusivamente las tarjetas etiquetadas de Calientito');
    await assertFails(getVip(uid, 'business-a-card'));
    await assertFails(list(uid, a));
  }
  for (const uid of ['cal-cashier', 'cal-kitchen', 'cal-disabled', 'outsider']) {
    await assertFails(getVip(uid, 'cal-card'));
    await assertFails(list(uid, calientito));
    await assertFails(updateDoc(doc(signed(uid), 'vip_profiles', 'cal-card'), { stamps: 0 }));
  }
  await assertFails(updateDoc(doc(signed('old-cal-manager'), 'vip_profiles', 'legacy-without-business-id'),
    { restaurantId: calientito }));
  await assertFails(getVip('cal-owner', 'legacy-without-business-id'));
  await assertFails(getDocs(collection(anon(), 'vip_profiles')));

  // Simulación de backfill aprobado y respaldado: solo cambia restaurantId
  // en una tarjeta antigua revisada, sin reescribir identidad ni contadores.
  await env.withSecurityRulesDisabled(async ctx => {
    await updateDoc(doc(ctx.firestore(), 'vip_profiles', 'legacy-without-business-id'), { restaurantId: calientito });
  });
  const migrated = await assertSucceeds(getVip('cal-owner', 'legacy-without-business-id'));
  assert.equal(migrated.data().stamps, 4);
  assert.equal(migrated.data().totalOrders, 8);
  assert.equal(migrated.data().rewardAvailable, true);
  assert.equal(migrated.data().pendingStampsToValidate, 1);
  const visible = await assertSucceeds(list('cal-owner', calientito));
  assert.equal(visible.size, 2);
  await assertFails(getVip('owner-a', 'legacy-without-business-id'));
  await assertFails(updateDoc(doc(signed('cal-owner'), 'vip_profiles', 'legacy-without-business-id'),
    { restaurantId: a }));

  console.log('PASS: propietarios/administradores/encargados migrados pueden ver VIP de su negocio.');
  console.log('PASS: roles operativos, cuentas antiguas sin membresía y otros negocios quedan bloqueados.');
  console.log('PASS: backfill simulado conserva sellos/recompensas; solo Admin puede etiquetar tarjeta antigua.');
} finally {
  await env.cleanup();
}

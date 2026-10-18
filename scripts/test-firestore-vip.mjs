import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const projectId = 'gioteautomatizo-security-test';
const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules: readFileSync('docs/firestore.vip-secure.STAGED.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});
const dbFor = (uid) => testEnv.authenticatedContext(uid).firestore();
const anon = () => testEnv.unauthenticatedContext().firestore();
const profileA = 'vip_profiles/business-a_test';
const profileB = 'vip_profiles/business-b_test';
const makeProfile = id => ({
  restaurantId: id, memberId: 'VIP-001', phone: '5512345678',
  pinHash: 'dummy-hash', customerName: 'Socio prueba',
  stamps: 0, totalOrders: 0, rewardAvailable: false, createdAt: new Date().toISOString(),
});
try {
  await testEnv.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(doc(admin, 'businesses/business-a'), { restaurantId: 'business-a', ownerUserId: 'owner-a' });
    await setDoc(doc(admin, 'businesses/business-b'), { restaurantId: 'business-b', ownerUserId: 'owner-b' });
    await setDoc(doc(admin, 'businessMemberships/business-a_owner-a'), { restaurantId: 'business-a', userId: 'owner-a', role: 'OWNER', active: true });
    await setDoc(doc(admin, 'businessMemberships/business-b_owner-b'), { restaurantId: 'business-b', userId: 'owner-b', role: 'OWNER', active: true });
    await setDoc(doc(admin, profileA), makeProfile('business-a'));
    await setDoc(doc(admin, profileB), makeProfile('business-b'));
  });
  await assertFails(getDoc(doc(anon(), profileA)));
  await assertFails(getDocs(collection(anon(), 'vip_profiles')));
  await assertFails(setDoc(doc(anon(), 'vip_profiles/new'), makeProfile('business-a')));
  await assertFails(updateDoc(doc(anon(), profileA), { stamps: 100 }));
  await assertSucceeds(getDoc(doc(dbFor('owner-a'), profileA)));
  await assertFails(getDoc(doc(dbFor('owner-a'), profileB)));
  await assertFails(getDocs(query(collection(dbFor('owner-a'), 'vip_profiles'), where('restaurantId', '==', 'business-b'))));
  await assertFails(getDoc(doc(dbFor('unrelated'), profileA)));
  await assertSucceeds(updateDoc(doc(dbFor('owner-a'), profileA), { stamps: 1, totalOrders: 1 }));
  await assertFails(updateDoc(doc(dbFor('owner-a'), profileA), { phone: '5599999999' }));
  await assertFails(updateDoc(doc(dbFor('owner-a'), profileB), { stamps: 1 }));
  await assertFails(updateDoc(doc(dbFor('owner-b'), profileA), { stamps: 1 }));
  const allowedList = await assertSucceeds(getDocs(query(collection(dbFor('owner-a'), 'vip_profiles'), where('restaurantId', '==', 'business-a'))));
  assert.equal(allowedList.size, 1);
  console.log('PASS: perfiles VIP aislados; roles, escritura y lectura anónima protegidos.');
} finally {
  await testEnv.cleanup();
}

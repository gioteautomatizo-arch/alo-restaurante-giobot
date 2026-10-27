/**
 * Paso 2: contrato candidato de alta de TRES documentos desde onboarding React.
 * SOLO Auth/Firestore emulados y reglas derivadas en memoria.
 * NO sustituye registerBusiness de producción, que todavía escribe dos documentos.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator, doc, getDoc, writeBatch, deleteDoc, updateDoc, terminate,
} from 'firebase/firestore';
import { buildAtomicOwnerAndPermanentHandleProposalRules } from './owner-atomic-proposal-rules.mjs';
import { registerThroughOnboardingUI } from './business-onboarding-emulator-ui.mjs';
import { saveBrandingThroughUI, addCatalogProductThroughUI } from './business-management-emulator-ui.mjs';
import { publishBusinessThroughUI, publishAndHideBusinessThroughUI, assertForeignWorkspaceDeniedThroughUI } from './business-publication-emulator-ui.mjs';

const projectId = 'gioteautomatizo-three-doc-onboarding-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: buildAtomicOwnerAndPermanentHandleProposalRules(staged),
    host: '127.0.0.1', port: 8080,
  },
});
const app = initializeApp({
  apiKey: 'emulator-only-key', authDomain: 'localhost', projectId,
  appId: '1:123456789:web:three-doc-test',
});
const { auth, db } = await import('../src/lib/firebase.ts');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);
const { createRestaurantTenant, normalizeRestaurantSlug } = await import('../src/lib/restaurantCore.ts');
const { getBusinessCatalogTemplate } = await import('../src/data/businessCatalogTemplates.ts');
const { seedBusinessCatalogIfMissing, createCatalogItemId, saveBusinessCatalog, subscribeToBusinessCatalog } = await import('../src/lib/businessCatalogService.ts');
const { getBusinessForUser, getBusinessMembership } = await import('../src/lib/businessAuthService.ts');
const { setBusinessPublication, getBusinessPublicationStatus, syncPublicProfileIfNeeded } = await import('../src/lib/businessPublicProfileService.ts');

const password = 'EmulatorOnlyPass123!';
const idA = 'beta-three-doc-a';
const idB = 'beta-three-doc-b';
const emailA = 'three-doc-owner-a@beta.example.test';
const emailB = 'three-doc-owner-b@beta.example.test';
const businessPath = id => 'businesses/' + id;
const memberPath = (id, uid) => 'businessMemberships/' + id + '_' + uid;
const reservePath = id => 'businessHandleReservations/' + id;
const deny = async (promise, label) => {
  await assert.rejects(promise, error => (error as { code?: string })?.code === 'permission-denied', label);
};
const stripUndefined = value => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]));
  }
  return value;
};

/**
 * Adaptador EXCLUSIVO de esta prueba: conserva la forma de negocio, OWNER,
 * siembra y recuperación del cliente, pero añade la reserva al mismo batch.
 * La reserva no puede leerse desde el SDK cliente, ni siquiera por OWNER.
 * Su resultado NO demuestra que registerBusiness ya haya sido migrado.
 */
async function registerCandidate(input, options: { simulatedCommitFailure?: 'before' | 'after' } = {}) {
  const id = normalizeRestaurantSlug(input.handle || input.businessName);
  if (!id || id === 'alo-restaurante') throw new Error('Handle inválido o reservado');
  const email = input.email.trim().toLowerCase();
  let user = auth.currentUser;
  if (!user || user.email?.trim().toLowerCase() !== email) {
    user = (await createUserWithEmailAndPassword(auth, input.email, input.password)).user;
  }
  const uid = user.uid;
  const tenant = stripUndefined(createRestaurantTenant({
    restaurantId: id, ownerUserId: uid, restaurantName: input.businessName,
    businessType: input.businessType || 'restaurant', publicSlug: id,
    logoUrl: input.logoUrl, templateId: input.templateId,
    capabilities: input.capabilities,
    assistant: {
      name: input.assistantMode === 'CUSTOM_AVATAR'
        ? (input.assistantName?.trim() || 'Giobot') : 'Giobot',
      plan: input.assistantMode === 'CUSTOM_AVATAR' ? 'CUSTOM_AVATAR' : 'GIOBOT_BASE',
    },
  }));
  const membership = { restaurantId: id, userId: uid, role: 'OWNER', active: true };
  if (auth.currentUser?.uid !== uid) throw new Error('Sesión cambiada antes del alta');
  const batch = writeBatch(db);
  batch.set(doc(db, businessPath(id)), tenant);
  batch.set(doc(db, memberPath(id, uid)), membership);
  batch.set(doc(db, reservePath(id)), { businessId: id, ownerUserId: uid });
  let confirmedTenant = tenant;
  let confirmedMembership = membership;
  try {
    // Inyección exclusivamente de prueba: distinguir rechazo anterior al commit
    // de una confirmación guardada cuya respuesta se pierde en el cliente.
    if (options.simulatedCommitFailure === 'before') {
      throw new Error('SIMULATED_PRE_COMMIT_FAILURE');
    }
    await batch.commit();
    if (options.simulatedCommitFailure === 'after') {
      throw new Error('SIMULATED_LOST_COMMIT_RESPONSE');
    }
  } catch (commitError) {
    // Recuperar únicamente si ya existen negocio y OWNER del MISMO UID.
    // No leer reservas: las reglas candidatas las mantienen privadas.
    try {
      if (auth.currentUser?.uid !== uid) throw commitError;
      const member = await getDoc(doc(db, memberPath(id, uid)));
      if (auth.currentUser?.uid !== uid) throw commitError;
      if (!member.exists() || member.data().userId !== uid
        || member.data().restaurantId !== id || member.data().role !== 'OWNER'
        || member.data().active !== true) throw commitError;
      const business = await getDoc(doc(db, businessPath(id)));
      if (auth.currentUser?.uid !== uid) throw commitError;
      if (!business.exists() || business.data().ownerUserId !== uid
        || business.data().restaurantId !== id) throw commitError;
      confirmedTenant = business.data();
      confirmedMembership = member.data() as typeof membership;
    } catch {
      throw commitError;
    }
  }
  if (auth.currentUser?.uid === uid) {
    const template = getBusinessCatalogTemplate(
      confirmedTenant.templateId || confirmedTenant.businessType || 'restaurant'
    );
    if (template?.items.length) {
      await seedBusinessCatalogIfMissing(id, template.items.map((item, index) => ({
        ...item, id: createCatalogItemId(item.name) + '-' + (index + 1), available: true,
      })), confirmedTenant.branding.restaurantName);
    }
  }
  return { tenant: confirmedTenant, membership: confirmedMembership };
}

// withSecurityRulesDisabled devuelve void; conservar la instantánea dentro
// del callback antes de cerrar el contexto privilegiado del emulador.
const adminRead = async path => {
  let snapshot;
  await env.withSecurityRulesDisabled(async context => {
    snapshot = await getDoc(doc(context.firestore(), path));
  });
  assert(snapshot, 'No se pudo obtener instantánea de prueba: ' + path);
  return snapshot;
};

// Puentes hacia los servicios REALES, ejecutados solo contra Auth/Firestore emulados.
// Las vistas son React reales; los módulos de SDK viven en este proceso.
const managementBridge = {
  getBusiness: (uid: string, id: string) => getBusinessForUser(uid, id),
  updateBranding: (id: string, patch: any) => updateDoc(doc(db, businessPath(id)), JSON.parse(JSON.stringify(patch))),
  syncPublic: (id: string, tenant: any) => syncPublicProfileIfNeeded(id, JSON.parse(JSON.stringify(tenant))),
  subscribeCatalog: (id: string, callback: any, onError: any) =>
    subscribeToBusinessCatalog(id, callback, onError),
  saveCatalog: (id: string, items: any, actor: string, revision: string | null) =>
    saveBusinessCatalog(id, JSON.parse(JSON.stringify(items)), actor, revision),
};
const publicationBridge = {
  getBusiness: (uid: string, id: string) => getBusinessForUser(uid, id),
  getMembership: (uid: string, id: string) => getBusinessMembership(uid, id),
  getStatus: (id: string) => getBusinessPublicationStatus(id),
  setPublication: (id: string, tenant: any, published: boolean) =>
    setBusinessPublication(id, JSON.parse(JSON.stringify(tenant)), published),
  syncPublic: (id: string, tenant: any) => syncPublicProfileIfNeeded(id, JSON.parse(JSON.stringify(tenant))),
};

try {
  const a = await registerThroughOnboardingUI({
    name: 'Restaurante candidato A', handle: idA, email: emailA,
    businessType: 'restaurant', onRegister: registerCandidate,
  });
  const uidA = a.membership.userId;
  assert.equal(auth.currentUser?.uid, uidA);
  assert.equal((await getDoc(doc(db, businessPath(idA)))).data()?.ownerUserId, uidA);
  assert.equal((await getDoc(doc(db, memberPath(idA, uidA)))).data()?.role, 'OWNER');
  assert.equal((await adminRead(reservePath(idA))).data()?.ownerUserId, uidA);
  assert((await getDoc(doc(db, businessPath(idA) + '/catalog/menu_catalog')))
    .data()?.items?.length > 0, 'La plantilla del negocio A fue sembrada');
  await deny(getDoc(doc(db, reservePath(idA))), 'Reserva ilegible incluso para OWNER');
  // La propuesta de tres documentos debe permitir gestionar un negocio real,
  // no solo completar su alta: catálogo, publicación y marca desde React.
  await addCatalogProductThroughUI({
    businessId: idA, businessName: a.tenant.branding.restaurantName,
    user: auth.currentUser!, bridge: managementBridge, productName: 'Producto candidato A', price: 41,
  });
  assert((await getDoc(doc(db, businessPath(idA) + '/catalog/menu_catalog')))
    .data()?.items?.some((item: { name: string }) => item.name === 'Producto candidato A'));
  await publishBusinessThroughUI({
    businessId: idA, user: auth.currentUser!, bridge: publicationBridge,
  });
  await saveBrandingThroughUI({
    tenant: (await getBusinessForUser(uidA, idA))!, user: auth.currentUser!,
    bridge: managementBridge, name: 'Candidato A configurado',
  });
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.published, true);
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA)))
    .data()?.branding.restaurantName, 'Candidato A configurado');

  await signOut(auth);
  const b = await registerThroughOnboardingUI({
    name: 'Ghost Kitchen candidata B', handle: idB, email: emailB,
    businessType: 'ghost-kitchen', onRegister: registerCandidate,
  });
  const uidB = b.membership.userId;
  assert.notEqual(uidA, uidB);
  assert.equal((await adminRead(reservePath(idB))).data()?.ownerUserId, uidB);
  assert((await getDoc(doc(db, businessPath(idB) + '/catalog/menu_catalog')))
    .data()?.items?.length > 0, 'La plantilla del negocio B fue sembrada');
  await addCatalogProductThroughUI({
    businessId: idB, businessName: b.tenant.branding.restaurantName,
    user: auth.currentUser!, bridge: managementBridge, productName: 'Producto candidato B', price: 26,
  });
  await publishAndHideBusinessThroughUI({
    businessId: idB, user: auth.currentUser!, bridge: publicationBridge,
  });
  await saveBrandingThroughUI({
    tenant: (await getBusinessForUser(uidB, idB))!, user: auth.currentUser!,
    bridge: managementBridge, name: 'Candidato B configurado',
  });
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idB))).data()?.published, false);
  assert.equal((await getDoc(doc(db, businessPath(idB) + '/catalog/menu_catalog')))
    .data()?.items?.some((item: { name: string }) => item.name === 'Producto candidato A'), false);
  assert.equal((await getDoc(doc(db, businessPath(idA) + '/catalog/menu_catalog')))
    .data()?.items?.some((item: { name: string }) => item.name === 'Producto candidato B'), false);
  await assertForeignWorkspaceDeniedThroughUI({
    businessId: idA, user: auth.currentUser!, bridge: publicationBridge,
  });
  await assert.rejects(setBusinessPublication(idA, a.tenant, false),
    /propietario|permission-denied/i, 'B no puede ocultar la página pública de A');
  await deny(getDoc(doc(db, businessPath(idA))), 'B no lee A');
  await deny(getDoc(doc(db, businessPath(idA) + '/catalog/menu_catalog')), 'B no lee catálogo A');
  await deny(registerCandidate({
    businessName: 'Intento de B', handle: idA, email: emailB, password,
  }), 'B no puede reclamar el handle de A');
  assert.equal((await adminRead(memberPath(idA, uidB))).exists(), false,
    'La colisión no crea membresía cruzada');

  await signOut(auth);
  await signInWithEmailAndPassword(auth, emailA, password);
  const retry = await registerCandidate({
    businessName: 'No debe reemplazar A', handle: idA, email: emailA,
    password, businessType: 'ghost-kitchen',
  });
  assert.equal(retry.membership.userId, uidA, 'Reintento legítimo recupera OWNER');
  assert.equal(retry.tenant.branding.restaurantName, 'Restaurante candidato A',
    'Reintento no sobrescribe la identidad original');
  assert.equal((await adminRead(reservePath(idA))).data()?.ownerUserId, uidA);
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idA))).data()?.published, true,
    'El reintento de A conserva su publicación');
  assert.equal((await getDoc(doc(db, 'publicBusinessProfiles', idB))).data()?.published, false,
    'La sesión de A no publica B');
  await deny(getDoc(doc(db, businessPath(idB))), 'A no lee la ficha privada de B');

  // Respuesta perdida DESPUÉS del commit: recuperar los documentos del mismo
  // propietario sin leer la reserva desde el SDK cliente ni repetir la siembra.
  const lostId = 'beta-three-lost-ack';
  const recovered = await registerCandidate({
    businessName: 'Alta confirmada sin respuesta', handle: lostId,
    email: emailA, password, businessType: 'restaurant',
  }, { simulatedCommitFailure: 'after' });
  assert.equal(recovered.membership.userId, uidA);
  assert.equal(recovered.tenant.branding.restaurantName, 'Alta confirmada sin respuesta');
  assert.equal((await adminRead(reservePath(lostId))).data()?.ownerUserId, uidA);
  assert((await getDoc(doc(db, businessPath(lostId) + '/catalog/menu_catalog')))
    .data()?.items?.length > 0, 'La recuperación siembra el catálogo');
  const lostRetry = await registerCandidate({
    businessName: 'No reemplazar el alta recuperada', handle: lostId,
    email: emailA, password, businessType: 'ghost-kitchen',
  });
  assert.equal(lostRetry.tenant.branding.restaurantName, 'Alta confirmada sin respuesta',
    'Un reintento posterior no reemplaza la identidad confirmada');
  assert.equal((await adminRead(reservePath(lostId))).data()?.ownerUserId, uidA);

  // Fallo ANTES de commit: no existe nada propio que recuperar, por lo que
  // debe conservarse el error y no dejar documentos parciales.
  const preCommitId = 'beta-three-precommit-failure';
  await assert.rejects(registerCandidate({
    businessName: 'Alta no confirmada', handle: preCommitId,
    email: emailA, password, businessType: 'restaurant',
  }, { simulatedCommitFailure: 'before' }), /SIMULATED_PRE_COMMIT_FAILURE/);
  for (const path of [businessPath(preCommitId), memberPath(preCommitId, uidA), reservePath(preCommitId)]) {
    assert.equal((await adminRead(path)).exists(), false, 'Fallo previo sin escrituras: ' + path);
  }

  // Otro UID no puede reclamar el alta cuya respuesta se perdió.
  await signOut(auth);
  await signInWithEmailAndPassword(auth, emailB, password);
  await deny(registerCandidate({
    businessName: 'Reclamo ajeno de alta recuperada', handle: lostId,
    email: emailB, password,
  }), 'B no puede reclamar una alta confirmada de A');
  assert.equal((await adminRead(memberPath(lostId, uidB))).exists(), false);
  await signOut(auth);
  await signInWithEmailAndPassword(auth, emailA, password);

  // Un lote sin reserva y otro con OWNER inválido deben fallar enteros.
  const missing = writeBatch(db);
  missing.set(doc(db, businessPath('beta-three-missing')), {
    restaurantId: 'beta-three-missing', ownerUserId: uidA,
  });
  missing.set(doc(db, memberPath('beta-three-missing', uidA)), {
    restaurantId: 'beta-three-missing', userId: uidA, role: 'OWNER', active: true,
  });
  await deny(missing.commit(), 'No aceptar cliente antiguo de dos documentos');
  assert.equal((await adminRead(businessPath('beta-three-missing'))).exists(), false);
  assert.equal((await adminRead(memberPath('beta-three-missing', uidA))).exists(), false);

  const invalid = writeBatch(db);
  invalid.set(doc(db, businessPath('beta-three-invalid')), {
    restaurantId: 'beta-three-invalid', ownerUserId: uidA,
  });
  invalid.set(doc(db, memberPath('beta-three-invalid', uidA)), {
    restaurantId: 'beta-three-invalid', userId: uidA, role: 'ADMIN', active: true,
  });
  invalid.set(doc(db, reservePath('beta-three-invalid')), {
    businessId: 'beta-three-invalid', ownerUserId: uidA,
  });
  await deny(invalid.commit(), 'OWNER incorrecto debe abortar los tres documentos');
  for (const path of [
    businessPath('beta-three-invalid'),
    memberPath('beta-three-invalid', uidA),
    reservePath('beta-three-invalid'),
  ]) assert.equal((await adminRead(path)).exists(), false, 'Sin escritura parcial: ' + path);
  await deny(deleteDoc(doc(db, businessPath(idA))), 'No borrar raíz desde cliente');
  await deny(deleteDoc(doc(db, reservePath(idA))), 'No borrar reserva desde cliente');

  // Simular borrado privilegiado exclusivamente en el emulador; la reserva
  // persiste y bloquea la reutilización aunque la raíz haya desaparecido.
  await env.withSecurityRulesDisabled(async context => {
    await deleteDoc(doc(context.firestore(), businessPath(idA)));
  });
  await signOut(auth);
  await signInWithEmailAndPassword(auth, emailB, password);
  await deny(registerCandidate({
    businessName: 'B intenta reabrir A', handle: idA, email: emailB, password,
  }), 'Reserva permanente impide reabrir A tras borrado privilegiado');
  assert.equal((await adminRead(reservePath(idA))).data()?.ownerUserId, uidA);
  assert.equal((await adminRead(memberPath(idA, uidB))).exists(), false);
  await deny(getDoc(doc(db, businessPath(idA) + '/catalog/menu_catalog')),
    'B no accede a datos residuales de A');

  // Comprobar explícitamente el cliente ACTUAL, sin modificarlo: su batch de
  // dos documentos debe ser rechazado por la propuesta permanente. La cuenta
  // ficticia puede quedar creada en Auth, pero NO debe dejar datos en Firestore.
  await signOut(auth);
  const { registerBusiness } = await import('../src/lib/businessAuthService.ts');
  await deny(registerBusiness({
    businessName: 'Cliente actual incompatible', handle: 'beta-three-old-client',
    email: 'three-doc-old-client@beta.example.test', password,
    businessType: 'restaurant',
  }), 'El cliente vigente de dos documentos NO cumple la propuesta');
  const oldClientUid = auth.currentUser?.uid;
  assert(oldClientUid, 'La cuenta ficticia existe aunque el lote fue rechazado');
  for (const path of [
    businessPath('beta-three-old-client'),
    memberPath('beta-three-old-client', oldClientUid),
    reservePath('beta-three-old-client'),
  ]) assert.equal((await adminRead(path)).exists(), false,
    'Cliente incompatible no deja escrituras parciales: ' + path);

  console.log('PASS (solo emulador): onboarding React 3 documentos, catálogo/identidad/publicación React de dos negocios, aislamiento cruzado, recuperación, colisión y reserva persistente.');
  console.warn('PENDIENTE: registerBusiness de producción sigue escribiendo DOS documentos; coordinar cliente, reglas y migración histórica antes de cualquier despliegue.');
  console.warn('PENDIENTE: la respuesta perdida se inyecta sintéticamente DESPUÉS del commit; falta comprobar fallos reales de transporte, compatibilidad de clientes antiguos y reglas desplegadas.');
} finally {
  await signOut(auth).catch(() => {});
  await terminate(db);
  await deleteApp(app);
  await env.cleanup();
}

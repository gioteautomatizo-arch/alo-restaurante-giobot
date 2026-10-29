/**
 * Propuesta aislada: no exponer menu_import_draft en negocios publicados.
 * Deriva reglas en memoria y ejecuta Firebase Emulator; NO cambia ni despliega
 * firestore.rules o docs/firestore.launch-security.STAGED.rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const staged=readFileSync('docs/firestore.launch-security.STAGED.rules','utf8');
const original=[
  '      allow read: if isPublishedBusiness(businessId)',
  '        || hasActiveMembership(businessId)',
  '        || isPlatformSuperAdmin();',
].join('\n');
assert.equal(staged.split(original).length,2,'El bloque staged de catálogo cambió: revisar manualmente, no aplicar sustitución silenciosa');
// Contrato fail-closed SOLO en memoria. El acceso privado exige que los campos
// internos de la membresía coincidan con su ruta. Los históricos incompletos
// requieren auditoría y migración explícita antes de cualquier corte.
const membershipHelper=[
  "    function hasIdentifiedCatalogMembership(businessId) {",
  "      return isSignedIn()",
  "        && exists(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid))",
  "        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.active == true",
  "        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.get('restaurantId', null) == businessId",
  "        && get(/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)).data.get('userId', null) == request.auth.uid;",
  "    }",
].join('\n');
// Un perfil publicado no debe hacer público el menú de una raíz ausente o
// discordante. Contrato candidato: requiere identidad explícita en ambos docs.
const publicCatalogHelper=[
  "    function isIdentifiedPublishedCatalog(businessId) {",
  "      return exists(/databases/$(database)/documents/businesses/$(businessId))",
  "        && get(/databases/$(database)/documents/businesses/$(businessId)).data.get('restaurantId', null) == businessId",
  "        && exists(/databases/$(database)/documents/publicBusinessProfiles/$(businessId))",
  "        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.published == true",
  "        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.get('businessId', null) == businessId",
  "        && get(/databases/$(database)/documents/publicBusinessProfiles/$(businessId)).data.get('restaurantId', null) == businessId;",
  "    }",
].join('\n');

const catalogMatch='    match /businesses/{businessId}/catalog/{catalogDoc} {';
assert.equal(staged.split(catalogMatch).length,2,'La ubicación de reglas del catálogo cambió; revisar propuesta manualmente');
const proposed=staged.replace(catalogMatch,membershipHelper+'\n\n'+publicCatalogHelper+'\n\n'+catalogMatch).replace(original,[
  "      // Únicamente menu_catalog es público si la página está publicada.",
  "      // Borradores requieren identidad y rol; otros IDs fallan cerrados.",
  "      allow read: if isPlatformSuperAdmin()",
  "        || (catalogDoc == 'menu_catalog'",
  "          && resource.data.get('businessId', null) == businessId",
  "          && (isIdentifiedPublishedCatalog(businessId) || hasIdentifiedCatalogMembership(businessId)))",
  "        || (catalogDoc == 'menu_import_draft'",
  "          && hasIdentifiedCatalogMembership(businessId)",
  "          && getCallerMembershipRole(businessId) in ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN']);",
].join('\n'));
const seed=async env=>{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const [id,owner,published] of [['tenant-a','alice',true],['tenant-b','bob',false]]){
      await setDoc(doc(db,'businesses',id),{restaurantId:id,ownerUserId:owner});
      await setDoc(doc(db,'publicBusinessProfiles',id),{businessId:id,restaurantId:id,published});
      await setDoc(doc(db,'businesses',id,'catalog','menu_catalog'),{businessId:id,items:[{name:'Visible'}]});
      await setDoc(doc(db,'businesses',id,'catalog','internal_future_draft'),{businessId:id,secret:'INTERNAL'});
      await setDoc(doc(db,'businesses',id,'catalog','menu_import_draft'),{
        businessId:id,sourceImageUrl:'https://example.test/private.jpg',items:[{name:'No publicado'}],
      });
    }
    // STAGED considera públicos estos perfiles aunque la identidad sea inválida.
    for(const id of ['tenant-c','tenant-d','tenant-e','tenant-f','tenant-g']){
      await setDoc(doc(db,'businesses',id,'catalog','menu_catalog'),{businessId:id,items:[{name:'Privado por identidad inválida'}]});
      if(id !== 'tenant-c') await setDoc(doc(db,'businesses',id),{restaurantId:id === 'tenant-d' ? 'tenant-a' : id,ownerUserId:'owner-'+id});
      if(id === 'tenant-g') await setDoc(doc(db,'businesses',id),{ownerUserId:'owner-'+id});
      await setDoc(doc(db,'publicBusinessProfiles',id),{
        ...(id === 'tenant-f' ? {} : {businessId:id === 'tenant-e' ? 'tenant-a' : id,restaurantId:id}),
        published:true,
      });
    }
    // Raíz y perfil correctos no bastan si el documento menu_catalog está
    // cruzado, incompleto o mal tipado. STAGED lo sigue exponiendo.
    for(const [id,catalogBusinessId] of [['tenant-h','tenant-b'],['tenant-i',undefined],['tenant-j',42]]){
      await setDoc(doc(db,'businesses',id),{restaurantId:id,ownerUserId:'owner-'+id});
      await setDoc(doc(db,'publicBusinessProfiles',id),{businessId:id,restaurantId:id,published:true});
      await setDoc(doc(db,'businessMemberships',id+'_owner-'+id),{restaurantId:id,userId:'owner-'+id,role:'OWNER',active:true});
      await setDoc(doc(db,'businesses',id,'catalog','menu_catalog'),{
        ...(catalogBusinessId === undefined ? {} : {businessId:catalogBusinessId}),
        items:[{name:'No debe exponerse'}],
      });
    }
    await setDoc(doc(db,'businesses','tenant-k'),{restaurantId:'tenant-k',ownerUserId:'carol'});
    await setDoc(doc(db,'publicBusinessProfiles','tenant-k'),{businessId:'tenant-k',restaurantId:'tenant-k',published:false});
    await setDoc(doc(db,'businesses','tenant-k','catalog','menu_catalog'),{businessId:'tenant-a',items:[{name:'Cruzado privado'}]});
    await setDoc(doc(db,'businessMemberships','tenant-k_carol'),{restaurantId:'tenant-k',userId:'carol',role:'OWNER',active:true});
    for(const [uid,role,active] of [['alice','OWNER',true],['manager','MANAGER',true],['cashier','CASHIER',true],['revoked','MANAGER',false]]){
      await setDoc(doc(db,'businessMemberships','tenant-a_'+uid),{
        restaurantId:'tenant-a',userId:uid,role,active,
      });
    }
    await setDoc(doc(db,'businessMemberships','tenant-a_mismatch'),{restaurantId:'tenant-b',userId:'mismatch',role:'MANAGER',active:true});
    await setDoc(doc(db,'businessMemberships','tenant-b_wrong'),{restaurantId:'tenant-a',userId:'wrong',role:'MANAGER',active:true});
    await setDoc(doc(db,'businessMemberships','tenant-b_legacy'),{restaurantId:'tenant-b',role:'OWNER',active:true});
    await setDoc(doc(db,'businessMemberships','tenant-b_bob'),{
      restaurantId:'tenant-b',userId:'bob',role:'OWNER',active:true,
    });
  });
};
const draft=db=>doc(db,'businesses/tenant-a/catalog/menu_import_draft');
const catalog=db=>doc(db,'businesses/tenant-a/catalog/menu_catalog');
const otherCatalog=db=>doc(db,'businesses/tenant-a/catalog/internal_future_draft');
const unpublishedCatalog=db=>doc(db,'businesses/tenant-b/catalog/menu_catalog');
const unpublishedDraft=db=>doc(db,'businesses/tenant-b/catalog/menu_import_draft');
const stagedEnv=await initializeTestEnvironment({
  projectId:'gioteautomatizo-menu-draft-staged-diagnostic',
  firestore:{rules:staged,host:'127.0.0.1',port:8080},
});
try{
  await seed(stagedEnv);
  await assertSucceeds(getDoc(draft(stagedEnv.unauthenticatedContext().firestore())));
  await assertSucceeds(getDoc(otherCatalog(stagedEnv.unauthenticatedContext().firestore())));
  for(const id of ['tenant-c','tenant-d','tenant-e','tenant-f','tenant-g','tenant-h','tenant-i','tenant-j']){
    await assertSucceeds(getDoc(doc(stagedEnv.unauthenticatedContext().firestore(),'businesses',id,'catalog','menu_catalog')));
  }
  await assertSucceeds(getDoc(doc(stagedEnv.authenticatedContext('carol').firestore(),'businesses/tenant-k/catalog/menu_catalog')));
  console.log('PENDIENTE: STAGED expone catálogos con perfil huérfano o identidad de raíz/perfil inconsistente.');
  console.log('PENDIENTE: STAGED permite leer menu_catalog cruzado, sin businessId o mal tipado, incluso para el miembro legítimo de un tenant privado.');
  console.log('PENDIENTE: STAGED permite lectura pública de menu_import_draft en negocios publicados; NO corregido.');
}finally{await stagedEnv.cleanup();}
const proposalEnv=await initializeTestEnvironment({
  projectId:'gioteautomatizo-menu-draft-proposal',
  firestore:{rules:proposed,host:'127.0.0.1',port:8080},
});
try{
  await seed(proposalEnv);
  const guest=proposalEnv.unauthenticatedContext().firestore();
  const alice=proposalEnv.authenticatedContext('alice').firestore();
  const manager=proposalEnv.authenticatedContext('manager').firestore();
  const cashier=proposalEnv.authenticatedContext('cashier').firestore();
  const revoked=proposalEnv.authenticatedContext('revoked').firestore();
  const bob=proposalEnv.authenticatedContext('bob').firestore();
  const mismatch=proposalEnv.authenticatedContext('mismatch').firestore();
  const wrong=proposalEnv.authenticatedContext('wrong').firestore();
  const legacy=proposalEnv.authenticatedContext('legacy').firestore();
  const carol=proposalEnv.authenticatedContext('carol').firestore();
  await assertSucceeds(getDoc(catalog(guest)));
  await assertFails(getDoc(otherCatalog(guest)));
  await assertFails(getDoc(unpublishedCatalog(guest)));
  await assertFails(getDoc(unpublishedDraft(guest)));
  await assertFails(getDoc(draft(guest)));
  for(const id of ['tenant-c','tenant-d','tenant-e','tenant-f','tenant-g','tenant-h','tenant-i','tenant-j']){
    await assertFails(getDoc(doc(guest,'businesses',id,'catalog','menu_catalog')));
  }
  for(const id of ['tenant-h','tenant-i','tenant-j']){
    await assertFails(getDoc(doc(proposalEnv.authenticatedContext('owner-'+id).firestore(),'businesses',id,'catalog','menu_catalog')));
  }
  await assertFails(getDoc(doc(carol,'businesses/tenant-k/catalog/menu_catalog')));
  await assertFails(getDoc(doc(guest,'businesses/tenant-b/catalog/menu_catalog')));
  await assertFails(getDoc(doc(guest,'businesses/tenant-b/catalog/menu_import_draft')));
  await assertSucceeds(getDoc(draft(alice)));
  await assertSucceeds(getDoc(draft(manager)));
  await assertSucceeds(getDoc(catalog(cashier)));
  await assertFails(getDoc(otherCatalog(cashier)));
  await assertFails(getDoc(otherCatalog(alice)));
  await assertFails(getDoc(otherCatalog(manager)));
  await assertFails(getDoc(draft(mismatch)));
  await assertFails(getDoc(draft(cashier)));
  await assertFails(getDoc(draft(revoked)));
  await assertFails(getDoc(draft(bob)));
  await assertFails(getDoc(otherCatalog(bob)));
  await assertSucceeds(getDoc(unpublishedCatalog(bob)));
  await assertFails(getDoc(unpublishedCatalog(wrong)));
  await assertFails(getDoc(unpublishedCatalog(legacy)));
  await assertFails(getDoc(unpublishedDraft(wrong)));
  await assertFails(getDoc(unpublishedDraft(legacy)));
  await assertSucceeds(getDoc(unpublishedDraft(bob)));
  await assertFails(getDoc(draft(proposalEnv.authenticatedContext('stranger').firestore())));
  await assertSucceeds(setDoc(draft(alice),{businessId:'tenant-a',items:[]}));
  await assertFails(setDoc(draft(cashier),{businessId:'tenant-a',items:[]}));
  await assertFails(setDoc(draft(guest),{businessId:'tenant-a',items:[]}));
  console.log('PASS (propuesta aislada): raíz, perfil y documento menu_catalog identificados; rechaza documento cruzado/sin ID/tipo inválido en público y privado; preserva catálogos A/B válidos, borradores privados, roles e aislamiento.');
  console.log('HOLD compatibilidad: miembros históricos sin userId/restaurantId necesitarían auditoría y migración autorizada antes de activar esta propuesta.');
  console.log('PENDIENTE: revisión independiente de reglas, compatibilidad y autorización antes de cualquier cambio staged/despliegue.');
}finally{await proposalEnv.cleanup();}

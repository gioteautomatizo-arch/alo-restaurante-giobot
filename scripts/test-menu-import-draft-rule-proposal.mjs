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
const proposed=staged.replace(original,[
  "      // Solo menu_catalog se expone al público cuando el negocio está publicado.",
  "      // menu_import_draft contiene trabajo privado y requiere rol de editor.",
  "      allow read: if (catalogDoc == 'menu_catalog' && isPublishedBusiness(businessId))",
  "        || (catalogDoc == 'menu_import_draft'",
  "          ? getCallerMembershipRole(businessId) in ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN']",
  "          : hasActiveMembership(businessId))",
  "        || isPlatformSuperAdmin();",
].join('\n'));
const seed=async env=>{
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    for(const [id,owner,published] of [['tenant-a','alice',true],['tenant-b','bob',false]]){
      await setDoc(doc(db,'businesses',id),{restaurantId:id,ownerUserId:owner});
      await setDoc(doc(db,'publicBusinessProfiles',id),{businessId:id,restaurantId:id,published});
      await setDoc(doc(db,'businesses',id,'catalog','menu_catalog'),{businessId:id,items:[{name:'Visible'}]});
      await setDoc(doc(db,'businesses',id,'catalog','menu_import_draft'),{
        businessId:id,sourceImageUrl:'https://example.test/private.jpg',items:[{name:'No publicado'}],
      });
    }
    for(const [uid,role,active] of [['alice','OWNER',true],['manager','MANAGER',true],['cashier','CASHIER',true],['revoked','MANAGER',false]]){
      await setDoc(doc(db,'businessMemberships','tenant-a_'+uid),{
        restaurantId:'tenant-a',userId:uid,role,active,
      });
    }
    await setDoc(doc(db,'businessMemberships','tenant-b_bob'),{
      restaurantId:'tenant-b',userId:'bob',role:'OWNER',active:true,
    });
  });
};
const draft=db=>doc(db,'businesses/tenant-a/catalog/menu_import_draft');
const catalog=db=>doc(db,'businesses/tenant-a/catalog/menu_catalog');
const stagedEnv=await initializeTestEnvironment({
  projectId:'gioteautomatizo-menu-draft-staged-diagnostic',
  firestore:{rules:staged,host:'127.0.0.1',port:8080},
});
try{
  await seed(stagedEnv);
  await assertSucceeds(getDoc(draft(stagedEnv.unauthenticatedContext().firestore())));
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
  await assertSucceeds(getDoc(catalog(guest)));
  await assertFails(getDoc(draft(guest)));
  await assertFails(getDoc(doc(guest,'businesses/tenant-b/catalog/menu_catalog')));
  await assertFails(getDoc(doc(guest,'businesses/tenant-b/catalog/menu_import_draft')));
  await assertSucceeds(getDoc(draft(alice)));
  await assertSucceeds(getDoc(draft(manager)));
  await assertFails(getDoc(draft(cashier)));
  await assertFails(getDoc(draft(revoked)));
  await assertFails(getDoc(draft(bob)));
  await assertSucceeds(setDoc(draft(alice),{businessId:'tenant-a',items:[]}));
  await assertFails(setDoc(draft(cashier),{businessId:'tenant-a',items:[]}));
  await assertFails(setDoc(draft(guest),{businessId:'tenant-a',items:[]}));
  console.log('PASS (propuesta aislada): catálogo publicado visible, borrador privado por rol y aislamiento A/B en emulador.');
  console.log('PENDIENTE: revisión independiente de reglas, compatibilidad y autorización antes de cualquier cambio staged/despliegue.');
}finally{await proposalEnv.cleanup();}

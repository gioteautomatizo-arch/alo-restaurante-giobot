/**
 * CAS del servicio REAL de borradores con Firebase SDK y Firestore Emulator.
 * Solo datos ficticios. NO conecta Firebase real ni despliega reglas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080',
  'ALTO: ejecutar únicamente con Firebase Emulator local.');
const env = await initializeTestEnvironment({
  projectId: 'gioteautomatizo-draft-cas-emulator-test',
  firestore: {host:'127.0.0.1',port:8080,
    rules:readFileSync('docs/firestore.launch-security.STAGED.rules','utf8')},
});
globalThis.draftSdk = sdk;
globalThis.draftDb = null;
globalThis.draftAuth = {currentUser:null};
const mocks = {
  'firebase/firestore': [
    'export const doc = (_db,...parts) => globalThis.draftSdk.doc(globalThis.draftDb,...parts);',
    'export const getDoc = ref => globalThis.draftSdk.getDoc(ref);',
    'export const runTransaction = (_db,fn) => globalThis.draftSdk.runTransaction(globalThis.draftDb,fn);',
    'export const onSnapshot = (...args) => globalThis.draftSdk.onSnapshot(...args);',
    'export const setDoc = (...args) => globalThis.draftSdk.setDoc(...args);',
  ].join('\n'),
  './firebase': 'export const db = {}; export const auth = globalThis.draftAuth;',
  './catalogOptions': 'export const cleanOptionGroups = groups => groups || [];',
};
const bundle = await build({
  absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),
  entryPoints:['src/lib/businessMenuImportService.ts'],
  bundle:true,write:false,format:'esm',platform:'node',
  plugins:[{name:'draft-emulator-sdk',setup(builder){
    builder.onResolve({filter:/.*/},args=>{
      if (['/businessMenuImportService.ts','/businessCatalogService.ts'].some(path=>args.importer.endsWith(path))
          && Object.hasOwn(mocks,args.path)) return {path:args.path,namespace:'mock'};
    });
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const {getMenuImportDraft:read,saveMenuImportDraft:save,clearMenuImportDraft:clear} = await import(
  'data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const signed = uid => env.authenticatedContext(uid).firestore();
const ownerA=signed('owner-a'), ownerB=signed('owner-b'), manager=signed('manager-a'), cashier=signed('cashier-a'), revoked=signed('revoked-a');
const as=(uid,db)=>{globalThis.draftAuth.currentUser={uid};globalThis.draftDb=db;};
const ref=(db,id)=>sdk.doc(db,'businesses',id,'catalog','menu_import_draft');
const input=name=>({sourceImageUrl:'',items:[{id:'p1',name,category:'Comida',price:'40',description:''}]});
const conflict=/CONFLICTO_BORRADOR/;
try {
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    for(const [id,owner] of [['tenant-a','owner-a'],['tenant-b','owner-b']]){
      await sdk.setDoc(sdk.doc(db,'businesses',id),{restaurantId:id,ownerUserId:owner});
      await sdk.setDoc(sdk.doc(db,'businessMemberships',id+'_'+owner),{restaurantId:id,userId:owner,role:'OWNER',active:true});
    }
    for(const [uid,role,active] of [['manager-a','MANAGER',true],['cashier-a','CASHIER',true],['revoked-a','MANAGER',false]]){
      await sdk.setDoc(sdk.doc(db,'businessMemberships','tenant-a_'+uid),{restaurantId:'tenant-a',userId:uid,role,active});
    }
  });

  as('owner-a',ownerA);
  assert.equal(await read('tenant-a'),null,'Alta desde borrador inexistente');
  const created=await save('tenant-a',input('Inicial'),'Dueño A',null);
  assert.equal((await read('tenant-a')).revision,created.revision);
  await assert.rejects(save('tenant-a',input('Sobrescritura'),'Dueño A',null),conflict);
  const updated=await save('tenant-a',input('Actualizado'),'Dueño A',created.revision);
  assert.notEqual(updated.revision,created.revision);
  await assert.rejects(save('tenant-a',input('Obsoleto'),'Dueño A',created.revision),conflict);
  await assert.rejects(clear('tenant-a',created.revision),conflict);
  assert.equal((await read('tenant-a')).items[0].name,'Actualizado');
  await clear('tenant-a',updated.revision);
  assert.equal(await read('tenant-a'),null);

  // Dos guardados simultáneos con una misma revisión: uno solo debe ganar.
  const seed=await save('tenant-a',input('Base'),'Dueño A',null);
  const attempts=await Promise.allSettled([
    save('tenant-a',input('Pestaña 1'),'Dueño A',seed.revision),
    save('tenant-a',input('Pestaña 2'),'Dueño A',seed.revision),
  ]);
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(attempts.filter(x=>x.status==='rejected'&&conflict.test(String(x.reason))).length,1);
  const winner=await read('tenant-a');
  assert.equal(winner.revision,attempts.find(x=>x.status==='fulfilled').value.revision);

  as('manager-a',manager);
  const managed=await save('tenant-a',input('Encargado'),'Manager A',winner.revision);
  assert.equal(managed.items[0].name,'Encargado');
  as('cashier-a',cashier);
  await assert.rejects(read('tenant-a'),/No tienes permiso/);
  await assert.rejects(save('tenant-a',input('Caja'),'Caja',managed.revision),/No tienes permiso/);
  as('revoked-a',revoked);
  await assert.rejects(clear('tenant-a',managed.revision),/No tienes permiso/);
  as('owner-b',ownerB);
  await assert.rejects(read('tenant-a'),/No tienes permiso/);
  const b=await save('tenant-b',input('Solo B'),'Dueño B',null);
  assert.equal((await read('tenant-b')).revision,b.revision);
  assert.equal((await sdk.getDoc(ref(ownerB,'tenant-b'))).data().items[0].name,'Solo B');

  // Registros históricos: updatedAt como versión, o marcador sin versión.
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    await sdk.setDoc(ref(db,'tenant-a'),{businessId:'tenant-a',items:[],updatedAt:'legacy-2026'});
  });
  as('owner-a',ownerA);
  assert.equal((await read('tenant-a')).revision,'legacy-2026');
  await assert.rejects(clear('tenant-a','__legacy_no_version__'),conflict);
  await clear('tenant-a','legacy-2026');
  await env.withSecurityRulesDisabled(async ctx=>{
    await sdk.setDoc(ref(ctx.firestore(),'tenant-a'),{businessId:'tenant-a',items:[]});
  });
  assert.equal((await read('tenant-a')).revision,'__legacy_no_version__');
  await clear('tenant-a','__legacy_no_version__');

  // Documento corrupto bajo A con businessId B: ni lectura ni CAS deben mutarlo.
  await env.withSecurityRulesDisabled(async ctx=>{
    await sdk.setDoc(ref(ctx.firestore(),'tenant-a'),{businessId:'tenant-b',items:[],revision:'cross-v1'});
  });
  await assert.rejects(read('tenant-a'),/datos inconsistentes/);
  await assert.rejects(save('tenant-a',input('No tocar'),'Dueño A','cross-v1'),/datos inconsistentes/);
  await assert.rejects(clear('tenant-a','cross-v1'),/datos inconsistentes/);
  await env.withSecurityRulesDisabled(async ctx=>{
    assert.equal((await sdk.getDoc(ref(ctx.firestore(),'tenant-a'))).data().businessId,'tenant-b');
  });
  console.log('PASS: CAS real Firestore Emulator, dos pestañas, versiones históricas, roles A/B, revocación e identidad discordante sin mutación.');
  console.log('PENDIENTE: reglas STAGED de lectura pública de borradores; este test NO las corrige ni despliega.');
} finally {
  globalThis.draftDb=null;
  await env.cleanup();
}

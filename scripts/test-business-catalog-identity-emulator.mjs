/**
 * Contrato REAL del catálogo: SDK Firestore + reglas STAGED en Firebase Emulator.
 * Dos tenants ficticios, sin cuentas ni datos reales, sin despliegue.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080',
  'ALTO: solo ejecutar con Firebase Emulator local.');
const env=await initializeTestEnvironment({
  projectId:'gioteautomatizo-catalog-identity-emulator-test',
  firestore:{host:'127.0.0.1',port:8080,
    rules:readFileSync('docs/firestore.launch-security.STAGED.rules','utf8')},
});
globalThis.catalogSdk=sdk;
globalThis.catalogDb=null;
globalThis.catalogAuth={currentUser:null};
const mocks={
  'firebase/firestore':[
    'export const doc = (_db,...parts) => globalThis.catalogSdk.doc(globalThis.catalogDb,...parts);',
    'export const getDoc = ref => globalThis.catalogSdk.getDoc(ref);',
    'export const onSnapshot = (...args) => globalThis.catalogSdk.onSnapshot(...args);',
    'export const runTransaction = (_db,fn) => globalThis.catalogSdk.runTransaction(globalThis.catalogDb,fn);',
    'export const setDoc = (...args) => globalThis.catalogSdk.setDoc(...args);',
  ].join('\n'),
  './firebase':'export const db={}; export const auth=globalThis.catalogAuth;',
  './catalogOptions':'export const cleanOptionGroups = groups => groups || [];',
};
const bundle=await build({
  absWorkingDir:fileURLToPath(new URL('../',import.meta.url)),
  entryPoints:['src/lib/businessCatalogService.ts'],
  bundle:true,write:false,format:'esm',platform:'node',
  plugins:[{name:'catalog-identity-emulator-sdk',setup(builder){
    builder.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/businessCatalogService.ts') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'mock'};
    });
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const {subscribeToBusinessCatalog:subscribe,saveBusinessCatalog:save}=await import(
  'data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const ownerA=env.authenticatedContext('owner-a').firestore();
const ownerB=env.authenticatedContext('owner-b').firestore();
const as=(uid,db)=>{globalThis.catalogAuth.currentUser={uid};globalThis.catalogDb=db;};
const ref=(db,id)=>sdk.doc(db,'businesses',id,'catalog','menu_catalog');
const item=(name)=>({id:'product-1',name,description:'',category:'General',price:40,available:true,sortOrder:10});
async function firstSnapshot(businessId,acceptData=()=>true,acceptError=()=>true){
  return new Promise((resolve,reject)=>{
    let unsubscribe=()=>{};
    const timer=setTimeout(()=>{unsubscribe();reject(new Error('Tiempo agotado esperando catálogo '+businessId));},10000);
    const finish=(kind,value)=>{clearTimeout(timer);unsubscribe();resolve({kind,value});};
    unsubscribe=subscribe(businessId,value=>{if(acceptData(value)) finish('data',value);},error=>{if(acceptError(error)) finish('error',error);});
  });
}
try {
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    for(const [id,owner] of [['tenant-a','owner-a'],['tenant-b','owner-b']]){
      await sdk.setDoc(sdk.doc(db,'businesses',id),{restaurantId:id,ownerUserId:owner});
      await sdk.setDoc(sdk.doc(db,'businessMemberships',id+'_'+owner),{
        restaurantId:id,userId:owner,role:'OWNER',active:true,
      });
    }
    await sdk.setDoc(ref(db,'tenant-b'),{businessId:'tenant-b',revision:'b1',items:[item('Solo B')]});
  });

  as('owner-a',ownerA);
  let event=await firstSnapshot('tenant-a');
  assert.equal(event.kind,'data');
  assert.equal(event.value,null,'Catálogo ausente se distingue de error');
  const created=await save('tenant-a',[item('Solo A')],'Dueño A',null);
  event=await firstSnapshot('tenant-a',value=>value?.items?.[0]?.name==='Solo A');
  assert.equal(event.kind,'data');
  assert.equal(event.value.businessId,'tenant-a');
  assert.equal(event.value.items[0].name,'Solo A');

  as('owner-b',ownerB);
  event=await firstSnapshot('tenant-b');
  assert.equal(event.kind,'data');
  assert.equal(event.value.items[0].name,'Solo B');
  event=await firstSnapshot('tenant-a');
  assert.equal(event.kind,'error','Cuenta B no debe recibir catálogo privado A');
  assert.match(String(event.value),/permission-denied|Missing or insufficient permissions/i);

  // Simular un documento corrupto sin modificar nada fuera del emulador.
  await env.withSecurityRulesDisabled(async ctx=>{
    await sdk.setDoc(ref(ctx.firestore(),'tenant-a'),{
      businessId:'tenant-b',revision:'cross-v1',items:[item('Privado de B')],
    });
  });
  as('owner-a',ownerA);
  event=await firstSnapshot('tenant-a',()=>false);
  assert.equal(event.kind,'error','La lectura de A no puede presentar un catálogo con identidad B');
  assert.match(String(event.value),/identidad o lista de productos inconsistente/);
  await assert.rejects(save('tenant-a',[item('No sobrescribir')],'Dueño A','cross-v1'),/datos inconsistentes/);
  await env.withSecurityRulesDisabled(async ctx=>{
    const snap=await sdk.getDoc(ref(ctx.firestore(),'tenant-a'));
    assert.equal(snap.data().businessId,'tenant-b');
    assert.equal(snap.data().items[0].name,'Privado de B');
  });

  await env.withSecurityRulesDisabled(async ctx=>{
    await sdk.setDoc(ref(ctx.firestore(),'tenant-a'),{businessId:'tenant-a',revision:'bad-items'});
  });
  event=await firstSnapshot('tenant-a',()=>false);
  assert.equal(event.kind,'error','No interpretar catálogo sin items como menú vacío');
  await assert.rejects(save('tenant-a',[item('No sobrescribir')],'Dueño A','bad-items'),/datos inconsistentes/);

  await env.withSecurityRulesDisabled(async ctx=>{
    await sdk.setDoc(ref(ctx.firestore(),'tenant-a'),{
      businessId:'tenant-a',revision:created.revision,items:[item('Restaurado A')],
    });
  });
  event=await firstSnapshot('tenant-a',value=>value?.items?.[0]?.name==='Restaurado A',()=>false);
  assert.equal(event.kind,'data');
  assert.equal(event.value.items[0].name,'Restaurado A');
  const updated=await save('tenant-a',[item('Actualizado A')],'Dueño A',created.revision);
  assert.equal(updated.items[0].name,'Actualizado A');
  await assert.rejects(save('tenant-a',[item('Obsoleto A')],'Dueño A',created.revision),/CONFLICTO_CATALOGO/);
  as('owner-b',ownerB);
  event=await firstSnapshot('tenant-b');
  assert.equal(event.kind,'data');
  assert.equal(event.value.items[0].name,'Solo B','A no modificó catálogo B');

  console.log('PASS: catálogo SDK real en emulador, lectura A/B, ausente, corrupto, CAS sin mutación y revisión concurrente.');
  console.log('PENDIENTE: lectura pública STAGED de borradores y permisos desplegados; este test no los corrige.');
} finally {
  globalThis.catalogDb=null;
  await env.cleanup();
}

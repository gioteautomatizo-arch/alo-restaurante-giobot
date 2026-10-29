// Guardas reales de borrador con Auth/Firestore simulados. No toca Firebase real.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': [
    'export const doc = (_db, ...segments) => ({path: segments.join("/")});',
    'export const getDoc = ref => new Promise((resolve,reject) => window.qa.pending.push({ref,resolve,reject}));',
    'export const setDoc = async (ref,data) => {window.qa.writes.push({type:"set",ref,data});};',
    'export const deleteDoc = async ref => {window.qa.writes.push({type:"delete",ref});};',
    'export const onSnapshot = () => {throw Error("No listeners");};',
    'export const runTransaction = async (_db,fn) => fn({get:ref=>new Promise((resolve,reject)=>window.qa.pending.push({ref,resolve,reject})),set:(ref,data)=>window.qa.writes.push({type:"set",ref,data}),delete:ref=>window.qa.writes.push({type:"delete",ref})});',
  ].join('\n'),
  './firebase': 'export const auth = {currentUser:null}; export const db = {}; window.qa.auth = auth;',
  './catalogOptions': 'export const cleanOptionGroups = groups => groups || [];',
};
const bundle = await build({
  absWorkingDir:root,bundle:true,write:false,format:'iife',platform:'browser',
  stdin:{resolveDir:root,loader:'js',contents:[
    "import {getMenuImportDraft,saveMenuImportDraft,clearMenuImportDraft} from './src/lib/businessMenuImportService';",
    'window.qa.read=getMenuImportDraft;window.qa.save=saveMenuImportDraft;window.qa.clear=clearMenuImportDraft;',
  ].join('\n')},
  plugins:[{name:'mock-menu-draft',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if (['/businessMenuImportService.ts','/businessCatalogService.ts'].some(s=>args.importer.endsWith(s)) && Object.hasOwn(mocks,args.path)) {
        return {path:args.path,namespace:'mock'};
      }
    });
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom = new JSDOM('',{url:'https://example.test/',runScripts:'outside-only'});
const {window}=dom;
window.qa={pending:[],writes:[]};
const waitFor=async(predicate,label)=>{
  for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}
  assert.fail(label);
};
const membership=(tenant,uid,role='OWNER',active=true)=>({
  exists:()=>true,data:()=>({restaurantId:tenant,userId:uid,role,active}),
});
const rootSnap=(tenant,owner)=>({
  exists:()=>true,data:()=>({restaurantId:tenant,ownerUserId:owner}),
});
const draft=(tenant,overrides={})=>({
  exists:()=>true,data:()=>({businessId:tenant,items:[{id:'draft-1',name:'Taco',category:'Comida',price:'25',description:''}],sourceImageUrl:'',updatedAt:'',updatedBy:'Prueba',...overrides}),
});
const resolveRead=async(index,snapshot,path)=>{
  await waitFor(()=>window.qa.pending.length>index,'Falta lectura '+index+' '+path);
  assert.equal(window.qa.pending[index].ref.path,path);
  window.qa.pending[index].resolve(snapshot);
};
const reset=(uid='owner-a')=>{
  window.qa.pending=[];window.qa.writes=[];
  window.qa.auth.currentUser=uid?{uid}:null;
};
const allow=async(tenant='tenant-a',uid='owner-a',role='OWNER',owner='owner-a',legacy=false)=>{
  await resolveRead(0,membership(tenant,uid,role),'businessMemberships/'+tenant+'_'+uid);
  await resolveRead(1,legacy?{exists:()=>true,data:()=>({restaurantId:tenant})}:rootSnap(tenant,owner),'businesses/'+tenant);
  await resolveRead(2,membership(tenant,uid,role),'businessMemberships/'+tenant+'_'+uid);
};
const input={sourceImageUrl:'',items:[{id:'d1',name:'Quesadilla',category:'Comida',price:'40',description:''}]};
try{
  window.eval(bundle.outputFiles[0].text);

  reset();
  const valid=window.qa.read('tenant-a');
  await allow();
  await resolveRead(3,draft('tenant-a'),'businesses/tenant-a/catalog/menu_import_draft');
  assert.equal((await valid)?.items[0]?.name,'Taco');
  assert.equal(window.qa.writes.length,0);

  reset('owner-b');
  const validB=window.qa.read('tenant-b');
  await allow('tenant-b','owner-b','OWNER','owner-b');
  await resolveRead(3,draft('tenant-b'),'businesses/tenant-b/catalog/menu_import_draft');
  assert.equal((await validB)?.businessId,'tenant-b');

  reset();
  const wrongTenant=window.qa.read('tenant-a');
  await resolveRead(0,membership('tenant-b','owner-a'),'businessMemberships/tenant-a_owner-a');
  await assert.rejects(wrongTenant,/No tienes permiso/);
  assert.equal(window.qa.pending.length,1,'No leer raíz de tenant ajeno');

  reset();
  const revoked=window.qa.save('tenant-a',input,'Prueba',null);
  await resolveRead(0,membership('tenant-a','owner-a'),'businessMemberships/tenant-a_owner-a');
  await resolveRead(1,rootSnap('tenant-a','owner-a'),'businesses/tenant-a');
  await resolveRead(2,membership('tenant-a','owner-a','OWNER',false),'businessMemberships/tenant-a_owner-a');
  await assert.rejects(revoked,/permisos del catálogo cambiaron/);
  assert.equal(window.qa.writes.length,0);

  reset();
  const wrongOwner=window.qa.clear('tenant-a','__legacy_no_version__');
  await resolveRead(0,membership('tenant-a','owner-a'),'businessMemberships/tenant-a_owner-a');
  await resolveRead(1,rootSnap('tenant-a','owner-b'),'businesses/tenant-a');
  await assert.rejects(wrongOwner,/identidad del negocio o propietario/);
  assert.equal(window.qa.writes.length,0);

  reset('cashier-a');
  const cashier=window.qa.read('tenant-a');
  await resolveRead(0,membership('tenant-a','cashier-a','CASHIER'),'businessMemberships/tenant-a_cashier-a');
  await assert.rejects(cashier,/No tienes permiso/);
  assert.equal(window.qa.pending.length,1);

  reset('manager-a');
  const manager=window.qa.save('tenant-a',input,'Prueba',null);
  await allow('tenant-a','manager-a','MANAGER','owner-a');
  await resolveRead(3,{exists:()=>false},'businesses/tenant-a/catalog/menu_import_draft');
  assert.equal((await manager).businessId,'tenant-a');
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].ref.path,'businesses/tenant-a/catalog/menu_import_draft');

  reset();
  const historical=window.qa.clear('tenant-a','__legacy_no_version__');
  await allow('tenant-a','owner-a','OWNER','owner-a',true);
  await resolveRead(3,draft('tenant-a'),'businesses/tenant-a/catalog/menu_import_draft');
  await historical;
  assert.deepEqual(window.qa.writes.map(w=>w.type),['delete']);

  // Dos pestañas parten de la misma versión: solo la primera escritura gana.
  reset();
  const firstTab=window.qa.save('tenant-a',input,'Tab A','v1');
  await allow();
  await resolveRead(3,draft('tenant-a',{revision:'v1'}),'businesses/tenant-a/catalog/menu_import_draft');
  const firstSaved=await firstTab;
  assert.ok(firstSaved.revision && firstSaved.revision!=='v1');
  assert.equal(window.qa.writes.length,1);

  reset();
  const staleTab=window.qa.save('tenant-a',input,'Tab B','v1');
  await allow();
  await resolveRead(3,draft('tenant-a',{revision:firstSaved.revision}),'businesses/tenant-a/catalog/menu_import_draft');
  await assert.rejects(staleTab,/CONFLICTO_BORRADOR/);
  assert.equal(window.qa.writes.length,0,'La segunda pestaña no sobrescribe');

  reset();
  const staleDelete=window.qa.clear('tenant-a','v1');
  await allow();
  await resolveRead(3,draft('tenant-a',{revision:firstSaved.revision}),'businesses/tenant-a/catalog/menu_import_draft');
  await assert.rejects(staleDelete,/CONFLICTO_BORRADOR/);
  assert.equal(window.qa.writes.length,0,'Publicar no borra borrador modificado en otra pestaña');

  reset();
  const staleCreate=window.qa.save('tenant-a',input,'Tab A',null);
  await allow();
  await resolveRead(3,draft('tenant-a',{revision:'already-exists'}),'businesses/tenant-a/catalog/menu_import_draft');
  await assert.rejects(staleCreate,/CONFLICTO_BORRADOR/);
  assert.equal(window.qa.writes.length,0,'Crear desde vacío no pisa borrador nuevo');

  reset();
  const invalidDraft=window.qa.read('tenant-a');
  await allow();
  await resolveRead(3,draft('tenant-b'),'businesses/tenant-a/catalog/menu_import_draft');
  await assert.rejects(invalidDraft,/datos inconsistentes/);
  assert.equal(window.qa.writes.length,0);

  reset();
  const changedSession=window.qa.read('tenant-a');
  await allow();
  await waitFor(()=>window.qa.pending.length===4,'Falta lectura borrador');
  window.qa.auth.currentUser={uid:'owner-b'};
  window.qa.pending[3].resolve(draft('tenant-a'));
  await assert.rejects(changedSession,/La sesión cambió/);
  assert.equal(window.qa.writes.length,0);

  reset();
  await assert.rejects(window.qa.save('tenant/a',input,'Prueba',null),/identidad del negocio/);
  assert.equal(window.qa.pending.length,0);
  reset(null);
  await assert.rejects(window.qa.clear('tenant-a','__legacy_no_version__'),/Debes iniciar sesión/);
  assert.equal(window.qa.writes.length,0);

  console.log('PASS: borradores A/B con OWNER/MANAGER, raíz histórica, revocación, lectura inconsistente, cambio de sesión y transacciones de dos pestañas (mock Auth/Firestore).');
}finally{window.close();}

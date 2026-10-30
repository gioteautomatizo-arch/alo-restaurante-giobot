// Servicios reales con Auth/Firestore simulados; sin cuentas, reglas ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': [
    'export const doc = (_db, ...segments) => ({path: segments.join("/")});',
    'export function getDoc(ref) {return new Promise((resolve, reject) => window.qa.pending.push({ref,resolve,reject}));}',
    'export async function setDoc(ref, data, options) {window.qa.writes.push({ref,data,options});}',
    'export function onSnapshot() {throw new Error("No subscriptions in this test");}',
    'export async function runTransaction(_db, fn) { const transaction = {get: ref => getDoc(ref), set: (ref,data) => window.qa.writes.push({ref,data,transaction:true})}; return fn(transaction); }',
  ].join('\n'),
  './firebase': 'export const auth = {currentUser:null}; export const db = {}; window.qa.auth = auth;',
  './catalogOptions': 'export const cleanOptionGroups = groups => groups || [];',
  './businessAuthService': 'export async function isPlatformAdmin() {return window.qa.admin;}',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {saveBusinessCatalog, seedBusinessCatalogIfMissing, upsertBusinessCatalogItem, deleteBusinessCatalogItem} from './src/lib/businessCatalogService';",
    "import {setBusinessPublication} from './src/lib/businessPublicProfileService';",
    'window.qa.saveCatalog = saveBusinessCatalog; window.qa.seedCatalog = seedBusinessCatalogIfMissing;',
    'window.qa.upsertItem = upsertBusinessCatalogItem; window.qa.deleteItem = deleteBusinessCatalogItem;',
    'window.qa.publish = setBusinessPublication;',
  ].join('\n')},
  plugins: [{name:'mock-tenant-auth', setup(build) {
    build.onResolve({filter:/.*/}, args => {
      if (['/businessCatalogService.ts','/businessPublicProfileService.ts'].some(suffix => args.importer.endsWith(suffix)) && Object.hasOwn(mocks,args.path)) {
        return {path:args.path,namespace:'mock'};
      }
    });
    build.onLoad({filter:/.*/,namespace:'mock'}, args => ({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom = new JSDOM('', {url:'http://localhost/',runScripts:'outside-only'});
const {window} = dom;
window.qa = {pending:[],writes:[],admin:false};
const reset = (uid='owner-a') => {
  window.qa.pending = []; window.qa.writes = []; window.qa.admin = false;
  window.qa.auth.currentUser = {uid,email:uid+'@example.test'};
};
const waitFor = async (condition, label) => {
  for (let i=0;i<100;i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve,10));
  }
  assert.fail(label);
};
const membership = (uid,role='OWNER',restaurantId='tenant-a',active=true) => ({
  exists: () => true, data: () => ({restaurantId,userId:uid,role,active}),
});
const item = {id:'product-a',name:'Producto A',description:'',category:'General',price:25,available:true,sortOrder:10};
const tenant = id => ({restaurantId:id,branding:{restaurantName:id,publicSlug:id}});
const businessRoot = (id, ownerId, legacy=false) => ({
  exists: () => true,
  data: () => legacy ? {restaurantId:id} : {restaurantId:id,ownerUserId:ownerId},
});
const resolveRead = async (index, snapshot, expectedPath) => {
  await waitFor(() => window.qa.pending.length > index, 'Falta lectura '+index+' '+expectedPath);
  assert.equal(window.qa.pending[index].ref.path,expectedPath);
  window.qa.pending[index].resolve(snapshot);
};
const passCatalogReads = async (id='tenant-a', uid='owner-a', role='OWNER', legacy=false) => {
  await resolveRead(0,membership(uid,role,id),'businessMemberships/'+id+'_'+uid);
  await resolveRead(1,businessRoot(id,uid,legacy),'businesses/'+id);
  await resolveRead(2,membership(uid,role,id),'businessMemberships/'+id+'_'+uid);
};
const passCatalog = async (promise, id='tenant-a', uid='owner-a', role='OWNER', legacy=false) => {
  await passCatalogReads(id,uid,role,legacy);
  await resolveRead(3,{exists:()=>false,data:()=>null},'businesses/'+id+'/catalog/menu_catalog');
  await promise;
};
const passOwner = async (promise, id='tenant-a', uid='owner-a', legacy=false) => {
  await resolveRead(0,membership(uid,'OWNER',id),'businessMemberships/'+id+'_'+uid);
  await resolveRead(1,businessRoot(id,uid,legacy),'businesses/'+id);
  await resolveRead(2,membership(uid,'OWNER',id),'businessMemberships/'+id+'_'+uid);
  await promise;
};
try {
  window.eval(bundle.outputFiles[0].text);
  reset();
  const good = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await passCatalog(good);
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].ref.path,'businesses/tenant-a/catalog/menu_catalog');
  assert.equal(window.qa.writes[0].data.businessId,'tenant-a');

  reset();
  const wrongRole = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await waitFor(() => window.qa.pending.length === 1,'Falta consulta rol');
  window.qa.pending[0].resolve(membership('owner-a','CASHIER'));
  await assert.rejects(wrongRole,/No tienes permiso/);
  assert.equal(window.qa.writes.length,0);

  // Una membresía almacenada bajo la ruta de A no autoriza editar B.
  reset();
  const wrongTenantCatalog = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await waitFor(() => window.qa.pending.length === 1,'Falta membresía cruzada del catálogo');
  window.qa.pending[0].resolve(membership('owner-a','OWNER','tenant-b'));
  await assert.rejects(wrongTenantCatalog,/No tienes permiso/);
  assert.equal(window.qa.writes.length,0,'Membresía discordante no guarda catálogo');

  reset();
  const inactiveCatalog = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await waitFor(() => window.qa.pending.length === 1,'Falta membresía inactiva');
  window.qa.pending[0].resolve(membership('owner-a','OWNER','tenant-a',false));
  await assert.rejects(inactiveCatalog,/No tienes permiso/);
  assert.equal(window.qa.writes.length,0);

  reset();
  const switched = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await waitFor(() => window.qa.pending.length === 1,'Falta consulta antes de cambio UID');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.pending[0].resolve(membership('owner-a'));
  await assert.rejects(switched,/La sesión cambió/);
  assert.equal(window.qa.writes.length,0,'Cambio de cuenta no debe guardar catálogo A');

  reset('owner-b');
  const second = window.qa.saveCatalog('tenant-b',[{...item,id:'product-b'}],'Prueba B');
  await passCatalog(second,'tenant-b','owner-b');
  assert.equal(window.qa.writes[0].ref.path,'businesses/tenant-b/catalog/menu_catalog');

  // El catálogo rechaza raíces ajenas, OWNER discordante y revocaciones
  // sin intentar guardar; un MANAGER legítimo y OWNER histórico conservan acceso.
  reset();
  await passCatalog(window.qa.saveCatalog('tenant-a',[item],'Prueba'), 'tenant-a','owner-a','OWNER',true);
  assert.equal(window.qa.writes.length,1,'OWNER histórico conserva acceso');

  reset('manager-a');
  await passCatalog(window.qa.saveCatalog('tenant-a',[item],'Prueba'), 'tenant-a','manager-a','MANAGER');
  assert.equal(window.qa.writes.length,1,'MANAGER legítimo conserva acceso');

  for (const root of [
    businessRoot('tenant-a','owner-b'),
    businessRoot('tenant-b','owner-a'),
    {exists:()=>false,data:()=>null},
  ]) {
    reset();
    const blocked = window.qa.saveCatalog('tenant-a',[item],'Prueba');
    await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
    await resolveRead(1,root,'businesses/tenant-a');
    await assert.rejects(blocked,/identidad del negocio o propietario/);
    assert.equal(window.qa.writes.length,0,'Raíz inconsistente no modifica catálogo');
  }

  for (const latest of [
    membership('owner-a','OWNER','tenant-a',false),
    membership('owner-a','MANAGER'),
    membership('owner-b'),
    membership('owner-a','OWNER','tenant-b'),
    {exists:()=>false,data:()=>null},
  ]) {
    reset();
    const blocked = window.qa.saveCatalog('tenant-a',[item],'Prueba');
    await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
    await resolveRead(1,businessRoot('tenant-a','owner-a'),'businesses/tenant-a');
    await resolveRead(2,latest,'businessMemberships/tenant-a_owner-a');
    await assert.rejects(blocked,/permisos del catálogo cambiaron/);
    assert.equal(window.qa.writes.length,0,'Revocación no modifica catálogo');
  }

  reset();
  const switchedCatalogAfterRoot = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
  await waitFor(()=>window.qa.pending.length===2,'Falta raíz de catálogo');
  window.qa.auth.currentUser={uid:'owner-b'};
  window.qa.pending[1].resolve(businessRoot('tenant-a','owner-a'));
  await assert.rejects(switchedCatalogAfterRoot,/La sesión cambió/);
  assert.equal(window.qa.writes.length,0);

  // Tanto la siembra como el guardado con revisión deben pasar el preflight.
  reset();
  const seed = window.qa.seedCatalog('tenant-a',[item],'Prueba');
  await passCatalogReads();
  await resolveRead(3,{exists:()=>false,data:()=>null},'businesses/tenant-a/catalog/menu_catalog');
  assert.equal(await seed,true);
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].transaction,true);

  reset();
  const versioned = window.qa.saveCatalog('tenant-a',[item],'Prueba',null);
  await passCatalogReads();
  await resolveRead(3,{exists:()=>false,data:()=>null},'businesses/tenant-a/catalog/menu_catalog');
  await versioned;
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].transaction,true);

  reset();
  const conflict = window.qa.saveCatalog('tenant-a',[item],'Prueba',null);
  await passCatalogReads();
  await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-a',items:[],revision:'newer'})},'businesses/tenant-a/catalog/menu_catalog');
  await assert.rejects(conflict,/CONFLICTO_CATALOGO/);
  assert.equal(window.qa.writes.length,0);

  // Documento existente corrupto: aunque la revisión coincida, no se sobrescribe.
  for (const invalid of [
    {businessId:'tenant-b',items:[],revision:'cross-v1'},
    {businessId:'tenant-a',revision:'no-items'},
  ]) {
    reset();
    const blocked = window.qa.saveCatalog('tenant-a',[item],'Prueba',invalid.revision);
    await passCatalogReads();
    await resolveRead(3,{exists:()=>true,data:()=>invalid},'businesses/tenant-a/catalog/menu_catalog');
    await assert.rejects(blocked,/datos inconsistentes/);
    assert.equal(window.qa.writes.length,0,'Catálogo corrupto no se sobrescribe');
  }

  // El guardado heredado sin revisión mantiene compatibilidad, pero rechaza
  // documentos corruptos sin sobrescribirlos y también comprueba sesión.
  for (const invalid of [
    {businessId:'tenant-b',items:[],revision:'cross-legacy'},
    {businessId:'tenant-a',revision:'bad-legacy'},
  ]) {
    reset();
    const blocked = window.qa.saveCatalog('tenant-a',[item],'Prueba');
    await passCatalogReads();
    await resolveRead(3,{exists:()=>true,data:()=>invalid},'businesses/tenant-a/catalog/menu_catalog');
    await assert.rejects(blocked,/datos inconsistentes/);
    assert.equal(window.qa.writes.length,0,'Guardado heredado no modifica catálogo corrupto');
  }

  reset();
  const legacyValid = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await passCatalogReads();
  await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-a',items:[],revision:'old'})},'businesses/tenant-a/catalog/menu_catalog');
  await legacyValid;
  assert.equal(window.qa.writes.length,1,'Guardado heredado válido conserva compatibilidad');
  assert.equal(window.qa.writes[0].transaction,true);

  // Los helpers heredados no deben reescribir otros productos desde un
  // currentItems obsoleto: la mutación se aplica al snapshot transaccional.
  const other = {...item,id:'product-b',name:'Producto B'};
  reset();
  const upsertStale = window.qa.upsertItem('tenant-a',[item],{...item,name:'Editado A'},'Prueba');
  await passCatalogReads();
  await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-a',items:[item,other],revision:'v2'})},'businesses/tenant-a/catalog/menu_catalog');
  const merged = await upsertStale;
  assert.deepEqual(Array.from(merged.items, product => product.name),['Editado A','Producto B']);
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].transaction,true);

  reset();
  const deleteStale = window.qa.deleteItem('tenant-a',[item],'product-a','Prueba');
  await passCatalogReads();
  await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-a',items:[item,other],revision:'v3'})},'businesses/tenant-a/catalog/menu_catalog');
  const deleted = await deleteStale;
  assert.deepEqual(Array.from(deleted.items, product => product.name),['Producto B']);
  assert.equal(window.qa.writes.length,1);

  // El snapshot anterior solo puede editar/borrar el MISMO producto si sigue
  // idéntico; otros productos nuevos no son motivo para bloquear.
  for (const operation of [
    () => window.qa.upsertItem('tenant-a',[item],{...item,name:'Mi cambio obsoleto'},'Prueba'),
    () => window.qa.deleteItem('tenant-a',[item],'product-a','Prueba'),
  ]) {
    reset();
    const blocked = operation();
    await passCatalogReads();
    await resolveRead(3,{exists:()=>true,data:()=>({
      businessId:'tenant-a',items:[{...item,name:'Cambio más reciente'},other],revision:'v4',
    })},'businesses/tenant-a/catalog/menu_catalog');
    await assert.rejects(blocked,/CONFLICTO_CATALOGO/);
    assert.equal(window.qa.writes.length,0,'Cambio obsoleto al mismo producto no muta el catálogo');
  }

  reset();
  const concurrentCreate = window.qa.upsertItem('tenant-a',[item],other,'Prueba');
  await passCatalogReads();
  await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-a',items:[item,other],revision:'v5'})},'businesses/tenant-a/catalog/menu_catalog');
  await assert.rejects(concurrentCreate,/CONFLICTO_CATALOGO/);
  assert.equal(window.qa.writes.length,0,'Alta con ID ocupado en otra pestaña no sobrescribe');

  // La comparación de campos no depende del orden de las claves JSON.
  reset();
  const reordered = window.qa.upsertItem('tenant-a',[item],{...item,name:'Editado con claves reordenadas'},'Prueba');
  await passCatalogReads();
  const reorderedCurrent = Object.fromEntries(Object.entries(item).reverse());
  await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-a',items:[reorderedCurrent,other],revision:'v6'})},'businesses/tenant-a/catalog/menu_catalog');
  await reordered;
  assert.equal(window.qa.writes.length,1,'Orden de claves no provoca falso conflicto');

  for (const operation of [
    () => window.qa.upsertItem('tenant-a',[item],other,'Prueba'),
    () => window.qa.deleteItem('tenant-a',[item],'product-a','Prueba'),
  ]) {
    reset();
    const blocked = operation();
    await passCatalogReads();
    await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-b',items:[item]})},'businesses/tenant-a/catalog/menu_catalog');
    await assert.rejects(blocked,/datos inconsistentes/);
    assert.equal(window.qa.writes.length,0,'Helper heredado no modifica catálogo cruzado');
  }

  reset();
  const missingDelete = window.qa.deleteItem('tenant-a',[item],'product-a','Prueba');
  await passCatalogReads();
  await resolveRead(3,{exists:()=>false,data:()=>null},'businesses/tenant-a/catalog/menu_catalog');
  await assert.rejects(missingDelete,/CONFLICTO_CATALOGO/);
  assert.equal(window.qa.writes.length,0,'Borrar producto ausente no crea catálogo vacío');

  reset();
  const staleDelete = window.qa.deleteItem('tenant-a',[item],'product-a','Prueba');
  await passCatalogReads();
  await resolveRead(3,{exists:()=>true,data:()=>({businessId:'tenant-a',items:[other]})},'businesses/tenant-a/catalog/menu_catalog');
  await assert.rejects(staleDelete,/CONFLICTO_CATALOGO/);
  assert.equal(window.qa.writes.length,0,'Borrar producto ya eliminado no altera otros productos');

  // Publicación legítima: membresía OWNER, raíz y relectura de permisos.
  reset();
  await passOwner(window.qa.publish('tenant-a',tenant('tenant-a'),true));
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].ref.path,'publicBusinessProfiles/tenant-a');
  assert.equal(window.qa.writes[0].data.published,true);

  reset();
  const wrongTenantPublication = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await resolveRead(0,membership('owner-a','OWNER','tenant-b'),'businessMemberships/tenant-a_owner-a');
  await assert.rejects(wrongTenantPublication,/Solo el propietario/);
  assert.equal(window.qa.writes.length,0,'Membresía cruzada no publica');

  reset();
  const inactivePublication = window.qa.publish('tenant-a',tenant('tenant-a'),false);
  await resolveRead(0,membership('owner-a','OWNER','tenant-a',false),'businessMemberships/tenant-a_owner-a');
  await assert.rejects(inactivePublication,/Solo el propietario/);
  assert.equal(window.qa.writes.length,0);

  reset();
  const wrongRolePublication = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await resolveRead(0,membership('owner-a','MANAGER'),'businessMemberships/tenant-a_owner-a');
  await assert.rejects(wrongRolePublication,/Solo el propietario/);
  assert.equal(window.qa.writes.length,0);

  reset();
  const stalePublication = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await waitFor(()=>window.qa.pending.length===1,'Falta lectura de publicación obsoleta');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.pending[0].resolve(membership('owner-a'));
  await assert.rejects(stalePublication,/La sesión cambió/);
  assert.equal(window.qa.writes.length,0,'No publicar con sesión distinta');

  reset();
  await assert.rejects(window.qa.publish('tenant-b',tenant('tenant-a'),true),/identidad del negocio/);
  assert.equal(window.qa.pending.length,0);
  assert.equal(window.qa.writes.length,0);

  // OWNER con raíz de otro propietario: ni publicar ni despublicar.
  for (const published of [true,false]) {
    reset();
    const wrongOwner = window.qa.publish('tenant-a',tenant('tenant-a'),published);
    await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
    await resolveRead(1,businessRoot('tenant-a','owner-b'),'businesses/tenant-a');
    await assert.rejects(wrongOwner,/propietario es inconsistente/);
    assert.equal(window.qa.pending.length,2,'No revalidar permisos de raíz ajena');
    assert.equal(window.qa.writes.length,0);
  }

  reset();
  const wrongRoot = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
  await resolveRead(1,businessRoot('tenant-b','owner-a'),'businesses/tenant-a');
  await assert.rejects(wrongRoot,/identidad del negocio/);
  assert.equal(window.qa.writes.length,0);

  // OWNER histórico sin ownerUserId conserva la ruta legítima.
  reset();
  await passOwner(window.qa.publish('tenant-a',tenant('tenant-a'),true),'tenant-a','owner-a',true);
  assert.equal(window.qa.writes.length,1);

  // Revocación, cambio de rol, identidad cruzada o borrado entre lecturas.
  for (const latest of [
    membership('owner-a','OWNER','tenant-a',false),
    membership('owner-a','MANAGER'),
    membership('owner-b'),
    membership('owner-a','OWNER','tenant-b'),
    {exists:()=>false,data:()=>null},
  ]) {
    reset();
    const revoked = window.qa.publish('tenant-a',tenant('tenant-a'),true);
    await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
    await resolveRead(1,businessRoot('tenant-a','owner-a'),'businesses/tenant-a');
    await resolveRead(2,latest,'businessMemberships/tenant-a_owner-a');
    await assert.rejects(revoked,/permisos de publicación cambiaron/);
    assert.equal(window.qa.writes.length,0,'No escribir tras revocación/cambio de identidad');
  }

  reset();
  const switchedAfterRoot = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
  await waitFor(()=>window.qa.pending.length===2,'Falta lectura de raíz previa a cambio de sesión');
  window.qa.auth.currentUser={uid:'owner-b'};
  window.qa.pending[1].resolve(businessRoot('tenant-a','owner-a'));
  await assert.rejects(switchedAfterRoot,/La sesión cambió/);
  assert.equal(window.qa.writes.length,0);

  reset('owner-b');
  await passOwner(window.qa.publish('tenant-b',tenant('tenant-b'),false),'tenant-b','owner-b');
  assert.equal(window.qa.writes[0].ref.path,'publicBusinessProfiles/tenant-b');
  assert.equal(window.qa.writes[0].data.published,false);

  // Super Admin legítimo mantiene acceso sin membresía OWNER; revalidar su rol.
  reset('admin-user');
  window.qa.admin=true;
  const adminPublication=window.qa.publish('tenant-b',tenant('tenant-b'),true);
  await resolveRead(0,{exists:()=>false,data:()=>null},'businessMemberships/tenant-b_admin-user');
  await resolveRead(1,businessRoot('tenant-b','owner-b'),'businesses/tenant-b');
  await adminPublication;
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].ref.path,'publicBusinessProfiles/tenant-b');

  reset('admin-user');
  window.qa.admin=true;
  const revokedAdmin=window.qa.publish('tenant-b',tenant('tenant-b'),true);
  await resolveRead(0,{exists:()=>false,data:()=>null},'businessMemberships/tenant-b_admin-user');
  await waitFor(()=>window.qa.pending.length===2,'Falta raíz para admin');
  window.qa.admin=false;
  window.qa.pending[1].resolve(businessRoot('tenant-b','owner-b'));
  await assert.rejects(revokedAdmin,/permisos de publicación cambiaron/);
  assert.equal(window.qa.writes.length,0);

  console.log('PASS: catálogo (guardar, siembra, revisión) y publicación A/B comprueban OWNER/raíz, rol, revocación, sesión, Super Admin y despublicación (Firebase simulado).');
} finally {
  window.close();
}

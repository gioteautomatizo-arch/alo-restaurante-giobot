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
    'export function runTransaction() {throw new Error("No se prueba siembra transaccional en este script");}',
  ].join('\n'),
  './firebase': 'export const auth = {currentUser:null}; export const db = {}; window.qa.auth = auth;',
  './catalogOptions': 'export const cleanOptionGroups = groups => groups || [];',
  './businessAuthService': 'export async function isPlatformAdmin() {return window.qa.admin;}',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {saveBusinessCatalog} from './src/lib/businessCatalogService';",
    "import {setBusinessPublication} from './src/lib/businessPublicProfileService';",
    'window.qa.saveCatalog = saveBusinessCatalog;',
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
const root = (id, ownerId, legacy=false) => ({
  exists: () => true,
  data: () => legacy ? {restaurantId:id} : {restaurantId:id,ownerUserId:ownerId},
});
const resolveRead = async (index, snapshot, expectedPath) => {
  await waitFor(() => window.qa.pending.length > index, 'Falta lectura '+index+' '+expectedPath);
  assert.equal(window.qa.pending[index].ref.path,expectedPath);
  window.qa.pending[index].resolve(snapshot);
};
const passOwner = async (promise, id='tenant-a', uid='owner-a', legacy=false) => {
  await resolveRead(0,membership(uid,'OWNER',id),'businessMemberships/'+id+'_'+uid);
  await resolveRead(1,root(id,uid,legacy),'businesses/'+id);
  await resolveRead(2,membership(uid,'OWNER',id),'businessMemberships/'+id+'_'+uid);
  await promise;
};
try {
  window.eval(bundle.outputFiles[0].text);
  reset();
  const good = window.qa.saveCatalog('tenant-a',[item],'Prueba');
  await waitFor(() => window.qa.pending.length === 1,'Falta consulta de permisos catálogo A');
  assert.equal(window.qa.pending[0].ref.path,'businessMemberships/tenant-a_owner-a');
  window.qa.pending[0].resolve(membership('owner-a'));
  await good;
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
  await waitFor(() => window.qa.pending.length === 1,'Falta consulta catálogo B');
  assert.equal(window.qa.pending[0].ref.path,'businessMemberships/tenant-b_owner-b');
  window.qa.pending[0].resolve(membership('owner-b','OWNER','tenant-b'));
  await second;
  assert.equal(window.qa.writes[0].ref.path,'businesses/tenant-b/catalog/menu_catalog');

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
    await resolveRead(1,root('tenant-a','owner-b'),'businesses/tenant-a');
    await assert.rejects(wrongOwner,/propietario es inconsistente/);
    assert.equal(window.qa.pending.length,2,'No revalidar permisos de raíz ajena');
    assert.equal(window.qa.writes.length,0);
  }

  reset();
  const wrongRoot = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
  await resolveRead(1,root('tenant-b','owner-a'),'businesses/tenant-a');
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
    await resolveRead(1,root('tenant-a','owner-a'),'businesses/tenant-a');
    await resolveRead(2,latest,'businessMemberships/tenant-a_owner-a');
    await assert.rejects(revoked,/permisos de publicación cambiaron/);
    assert.equal(window.qa.writes.length,0,'No escribir tras revocación/cambio de identidad');
  }

  reset();
  const switchedAfterRoot = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await resolveRead(0,membership('owner-a'),'businessMemberships/tenant-a_owner-a');
  await waitFor(()=>window.qa.pending.length===2,'Falta lectura de raíz previa a cambio de sesión');
  window.qa.auth.currentUser={uid:'owner-b'};
  window.qa.pending[1].resolve(root('tenant-a','owner-a'));
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
  await resolveRead(1,root('tenant-b','owner-b'),'businesses/tenant-b');
  await adminPublication;
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].ref.path,'publicBusinessProfiles/tenant-b');

  reset('admin-user');
  window.qa.admin=true;
  const revokedAdmin=window.qa.publish('tenant-b',tenant('tenant-b'),true);
  await resolveRead(0,{exists:()=>false,data:()=>null},'businessMemberships/tenant-b_admin-user');
  await waitFor(()=>window.qa.pending.length===2,'Falta raíz para admin');
  window.qa.admin=false;
  window.qa.pending[1].resolve(root('tenant-b','owner-b'));
  await assert.rejects(revokedAdmin,/permisos de publicación cambiaron/);
  assert.equal(window.qa.writes.length,0);

  console.log('PASS: catálogo y publicación A/B comprueban OWNER/raíz, rol, revocación entre lecturas, sesión, Super Admin y despublicación (Firebase simulado).');
} finally {
  window.close();
}

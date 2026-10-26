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

  reset();
  const publishA = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await waitFor(() => window.qa.pending.length === 1,'Falta consulta de publicación');
  window.qa.pending[0].resolve(membership('owner-a'));
  await publishA;
  assert.equal(window.qa.writes.length,1);
  assert.equal(window.qa.writes[0].ref.path,'publicBusinessProfiles/tenant-a');
  assert.equal(window.qa.writes[0].data.published,true);

  reset();
  const wrongTenantPublication = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await waitFor(() => window.qa.pending.length === 1,'Falta membresía cruzada de publicación');
  window.qa.pending[0].resolve(membership('owner-a','OWNER','tenant-b'));
  await assert.rejects(wrongTenantPublication,/Solo el propietario/);
  assert.equal(window.qa.writes.length,0,'Membresía cruzada no publica');

  reset();
  const inactivePublication = window.qa.publish('tenant-a',tenant('tenant-a'),false);
  await waitFor(() => window.qa.pending.length === 1,'Falta membresía inactiva de publicación');
  window.qa.pending[0].resolve(membership('owner-a','OWNER','tenant-a',false));
  await assert.rejects(inactivePublication,/Solo el propietario/);
  assert.equal(window.qa.writes.length,0);

  reset();
  const wrongRolePublication = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await waitFor(() => window.qa.pending.length === 1,'Falta rol de publicación');
  window.qa.pending[0].resolve(membership('owner-a','MANAGER'));
  await assert.rejects(wrongRolePublication,/Solo el propietario/);
  assert.equal(window.qa.writes.length,0);

  reset();
  const stalePublication = window.qa.publish('tenant-a',tenant('tenant-a'),true);
  await waitFor(() => window.qa.pending.length === 1,'Falta consulta de publicación obsoleta');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.pending[0].resolve(membership('owner-a'));
  await assert.rejects(stalePublication,/La sesión cambió/);
  assert.equal(window.qa.writes.length,0,'No publicar con sesión distinta');

  reset();
  await assert.rejects(window.qa.publish('tenant-b',tenant('tenant-a'),true),/identidad del negocio/);
  assert.equal(window.qa.pending.length,0);
  assert.equal(window.qa.writes.length,0);

  reset('owner-b');
  const hideB = window.qa.publish('tenant-b',tenant('tenant-b'),false);
  await waitFor(() => window.qa.pending.length === 1,'Falta consulta para despublicar B');
  window.qa.pending[0].resolve(membership('owner-b','OWNER','tenant-b'));
  await hideB;
  assert.equal(window.qa.writes[0].ref.path,'publicBusinessProfiles/tenant-b');
  assert.equal(window.qa.writes[0].data.published,false);
  console.log('PASS: catálogo y publicación validan UID, tenant interno, rol, estado, sesión y despublicación (Firestore simulado).');
} finally {
  window.close();
}

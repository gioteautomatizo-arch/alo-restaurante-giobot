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
const membership = (uid,role='OWNER') => ({
  exists: () => true, data: () => ({userId:uid,role,active:true}),
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
  window.qa.pending[0].resolve(membership('owner-b'));
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
  window.qa.pending[0].resolve(membership('owner-b'));
  await hideB;
  assert.equal(window.qa.writes[0].ref.path,'publicBusinessProfiles/tenant-b');
  assert.equal(window.qa.writes[0].data.published,false);
  console.log('PASS: catálogo y publicación por tenant, rol, cambio de UID y despublicación (Auth/Firestore simulados; sin escrituras reales).');
} finally {
  window.close();
}

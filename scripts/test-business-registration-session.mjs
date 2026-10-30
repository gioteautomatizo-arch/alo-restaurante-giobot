// Prueba del alta con Firebase/Auth simulados: no usa cuentas ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/auth': [
    'export async function createUserWithEmailAndPassword(auth, email) {',
    '  window.qa.events.push("create");',
    '  if (window.qa.emailUsed) throw {code: "auth/email-already-in-use"};',
    '  const user = {uid: "owner-a", email};',
    '  auth.currentUser = window.qa.switchAt === "after-create" ? {uid:"owner-b",email:"b@example.test"} : user;',
    '  return {user};',
    '}',
    'export async function signInWithEmailAndPassword(auth, email) {',
    '  window.qa.events.push("signin");',
    '  const user = {uid:"owner-a", email}; auth.currentUser = user; return {user};',
    '}',
    'export async function signOut() {}',
  ].join('\n'),
  'firebase/firestore': [
    'export const collection = (_db, name) => ({name});',
    'export const doc = (_db, collection, id) => ({collection,id});',
    'export const getDoc = async ref => {',
    '  window.qa.events.push("cache:" + ref.collection);',
    '  const data = window.qa.cacheDocs[ref.collection + "/" + ref.id];',
    '  return {exists:()=>!!data,data:()=>data};',
    '};',
    'export const getDocFromServer = async ref => {',
    '  window.qa.events.push("server:" + ref.collection);',
    '  if (window.qa.serverUnavailable) throw new Error("SIMULATED_OFFLINE");',
    '  const data = window.qa.serverDocs[ref.collection + "/" + ref.id];',
    '  return {exists:()=>!!data,data:()=>data};',
    '};',
    'export const getDocs = async () => ({docs:[]});',
    'export const getDocsFromServer = async () => ({docs:[]});',
    'export const query = (...args) => args;',
    'export const where = (...args) => args;',
    'export const writeBatch = () => ({',
    '  set(ref, data) {window.qa.writes.push({ref,data});},',
    '  async commit() {',
    '    window.qa.events.push("commit");',
    '    if (window.qa.commitMode === "reject") throw new Error("SIMULATED_COMMIT_REJECTED");',
    '    if (window.qa.commitMode === "lost-after") {',
    '      for (const {ref,data} of window.qa.writes) window.qa.serverDocs[ref.collection + "/" + ref.id] = data;',
    '      throw new Error("SIMULATED_LOST_COMMIT_RESPONSE");',
    '    }',
    '    if (window.qa.switchAt === "after-commit") window.qa.auth.currentUser = {uid:"owner-b",email:"b@example.test"};',
    '  },',
    '});',
  ].join('\n'),
  './firebase': 'export const auth = {currentUser:null}; export const db = {}; window.qa.auth = auth;',
  './businessCatalogService': [
    'export async function seedBusinessCatalogIfMissing(id, items) {window.qa.catalogs.push({id,items}); return true;}',
    'export const createCatalogItemId = () => "item";',
  ].join('\n'),
  '../data/businessCatalogTemplates': 'export const getBusinessCatalogTemplate = () => ({items:[{name:"Producto de prueba",price:15}]});',
  './restaurantCore': [
    'export const normalizeRestaurantSlug = value => value.trim().toLowerCase().replace(/\\s+/g,"-");',
    'export const createRestaurantTenant = input => ({...input, branding:{restaurantName:input.restaurantName}});',
  ].join('\n'),
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {registerBusiness} from './src/lib/businessAuthService';",
    'window.qa.register = registerBusiness;',
  ].join('\n')},
  plugins: [{name:'mock-firebase-registration', setup(build) {
    build.onResolve({filter:/.*/}, args => {
      if (args.importer.endsWith('/businessAuthService.ts') && Object.hasOwn(mocks,args.path)) {
        return {path:args.path,namespace:'mock'};
      }
    });
    build.onLoad({filter:/.*/,namespace:'mock'}, args => ({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom = new JSDOM('', {url:'http://localhost/',runScripts:'outside-only'});
const {window} = dom;
window.qa = {events:[],writes:[],catalogs:[],switchAt:null,emailUsed:false,commitMode:null,serverUnavailable:false,serverDocs:{},cacheDocs:{}};
const input = {businessName:'Negocio A',handle:'tenant-a',email:'a@example.test',password:'test-only-password'};
const reset = () => {
  window.qa.events = []; window.qa.writes = []; window.qa.catalogs = [];
  window.qa.auth.currentUser = null; window.qa.switchAt = null; window.qa.emailUsed = false;
  window.qa.commitMode = null; window.qa.serverUnavailable = false;
  window.qa.serverDocs = {}; window.qa.cacheDocs = {};
};
try {
  window.eval(bundle.outputFiles[0].text);
  const normal = await window.qa.register(input);
  assert.equal(normal.tenant.restaurantId,'tenant-a');
  assert.equal(normal.membership.userId,'owner-a');
  assert.equal(window.qa.writes.length,2,'Tenant y OWNER en el mismo batch');
  assert.equal(window.qa.writes[0].ref.collection,'businesses');
  assert.equal(window.qa.writes[1].ref.collection,'businessMemberships');
  assert.equal(window.qa.catalogs.length,1,'Catálogo solo bajo la cuenta correcta');

  reset();
  window.qa.switchAt = 'after-create';
  await assert.rejects(window.qa.register(input), /La sesión cambió durante el alta/);
  assert.equal(window.qa.writes.length,0,'No escribir tras cambiar de UID');
  assert.equal(window.qa.catalogs.length,0);

  reset();
  window.qa.switchAt = 'after-commit';
  const saved = await window.qa.register(input);
  assert.equal(saved.membership.userId,'owner-a','El alta confirmada no se reporta como fallida');
  assert.equal(window.qa.writes.length,2);
  assert.equal(window.qa.events.includes('commit'),true);
  assert.equal(window.qa.catalogs.length,0,'No sembrar catálogo con otro UID');

  reset();
  window.qa.emailUsed = true;
  window.qa.auth.currentUser = {uid:'owner-a',email:'A@EXAMPLE.TEST'};
  await window.qa.register(input);
  assert.equal(window.qa.events.includes('signin'),false,'No cambiar sesión cuando ya corresponde al correo');
  assert.equal(window.qa.catalogs.length,1);

  reset();
  window.qa.emailUsed = true;
  await window.qa.register(input);
  assert.equal(window.qa.events.includes('signin'),true,'Reautenticación de cuenta existente');
  assert.equal(window.qa.writes.length,2);


  // El batch puede fallar mientras la caché contiene una alta vieja o
  // especulativa. No se debe devolver un OWNER ni sembrar catálogo sin servidor.
  reset();
  window.qa.commitMode = 'reject';
  window.qa.cacheDocs = {
    'businessMemberships/tenant-a_owner-a': {restaurantId:'tenant-a',userId:'owner-a',role:'OWNER',active:true},
    'businesses/tenant-a': {restaurantId:'tenant-a',ownerUserId:'owner-a',branding:{restaurantName:'Fantasma'}},
  };
  await assert.rejects(window.qa.register(input), /SIMULATED_COMMIT_REJECTED/,
    'Una caché aparentemente válida no confirma el alta rechazada');
  assert.equal(window.qa.events.some(event => event.startsWith('cache:')), false,
    'La recuperación nunca consulta caché');
  assert.deepEqual(Array.from(window.qa.events.filter(event => event.startsWith('server:'))),
    ['server:businessMemberships']);
  assert.equal(window.qa.catalogs.length, 0);

  reset();
  window.qa.commitMode = 'reject';
  window.qa.serverUnavailable = true;
  await assert.rejects(window.qa.register(input), /SIMULATED_COMMIT_REJECTED/,
    'Sin conexión no se confirma un alta no verificada');
  assert.equal(window.qa.catalogs.length, 0);

  reset();
  window.qa.commitMode = 'lost-after';
  const recovered = await window.qa.register(input);
  assert.equal(recovered.tenant.restaurantId, 'tenant-a');
  assert.equal(recovered.membership.role, 'OWNER');
  assert.deepEqual(Array.from(window.qa.events.filter(event => event.startsWith('server:'))),
    ['server:businessMemberships','server:businesses'],
    'Una respuesta perdida solo se recupera tras comprobar ambos documentos en servidor');
  assert.equal(window.qa.catalogs.length, 1,
    'Una alta realmente confirmada permite continuar con catálogo');

  reset();
  window.qa.commitMode = 'reject';
  window.qa.serverDocs = {
    'businessMemberships/tenant-a_owner-a': {restaurantId:'tenant-a',userId:'owner-a',role:'OWNER',active:true},
    'businesses/tenant-a': {restaurantId:'tenant-a',ownerUserId:'owner-b',branding:{restaurantName:'Otro propietario'}},
  };
  await assert.rejects(window.qa.register(input), /SIMULATED_COMMIT_REJECTED/,
    'OWNER residual no recupera negocio con propietario diferente');
  assert.equal(window.qa.catalogs.length, 0);

  console.log('PASS: alta simulada, UID, recuperación remota sin caché, fallo offline, respuesta perdida, OWNER ajeno y catálogo aislado (sin Firebase).');
} finally {
  window.close();
}

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
    'export const getDoc = async () => ({exists:()=>false});',
    'export const getDocFromServer = async () => ({exists:()=>false});',
    'export const getDocs = async () => ({docs:[]});',
    'export const getDocsFromServer = async () => ({docs:[]});',
    'export const query = (...args) => args;',
    'export const where = (...args) => args;',
    'export const writeBatch = () => ({',
    '  set(ref, data) {window.qa.writes.push({ref,data});},',
    '  async commit() {',
    '    window.qa.events.push("commit");',
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
window.qa = {events:[],writes:[],catalogs:[],switchAt:null,emailUsed:false};
const input = {businessName:'Negocio A',handle:'tenant-a',email:'a@example.test',password:'test-only-password'};
const reset = () => {
  window.qa.events = []; window.qa.writes = []; window.qa.catalogs = [];
  window.qa.auth.currentUser = null; window.qa.switchAt = null; window.qa.emailUsed = false;
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

  console.log('PASS: alta atómica simulada, cambio de UID antes/después del commit, catálogo aislado y correo existente (sin Firebase).');
} finally {
  window.close();
}

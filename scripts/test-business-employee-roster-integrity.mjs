// Servicio real con Auth/Firestore simulados; no toca Firebase ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/app': [
    'export const initializeApp = () => ({});',
    'export const deleteApp = async () => {};',
    'export const getApps = () => [];',
  ].join('\n'),
  'firebase/auth': [
    'export const getAuth = () => window.qa.auth;',
    'export const createUserWithEmailAndPassword = async () => ({});',
    'export const signInWithEmailAndPassword = async () => ({});',
    'export const signInWithPopup = async () => ({});',
    'export const GoogleAuthProvider = class {};',
  ].join('\n'),
  'firebase/firestore': [
    'export const doc = (_db, collection, id) => ({collection,id});',
    'export const getDoc = ref => new Promise((resolve,reject) => window.qa.pending.push({ref,resolve,reject}));',
    'export const arrayRemove = () => ({});',
    'export const arrayUnion = () => ({});',
    'export const collection = () => ({});',
    'export const deleteDoc = async () => {};',
    'export const getDocs = async () => ({});',
    'export const query = () => ({});',
    'export const setDoc = async () => {};',
    'export const updateDoc = async () => {};',
    'export const where = () => ({});',
    'export const writeBatch = () => {throw new Error("No writes in roster test");};',
  ].join('\n'),
  './firebase': 'export const auth = {currentUser: {uid:"owner-a"}}; export const db = {}; window.qa.auth = auth;',
  './restaurantCore': 'export const ROLE_PERMISSIONS = {}; export const hasBusinessPermission = () => false;',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {listBusinessEmployees} from './src/lib/businessEmployeeService';",
    'window.qa.load = listBusinessEmployees;',
  ].join('\n')},
  plugins: [{name: 'mock-roster-reads', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/businessEmployeeService.ts') && Object.hasOwn(mocks, args.path)) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('', {url: 'https://example.test/', runScripts: 'outside-only'});
const {window} = dom;
window.qa = {pending: []};
const waitFor = async (predicate, message) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const businessSnap = (id, employeeUserIds, tenantId = id) => ({
  exists: () => true,
  data: () => ({restaurantId: tenantId, employeeUserIds}),
});
const employee = (tenant, uid, overrides = {}) => ({
  restaurantId: tenant, userId: uid, name: uid, email: uid + '@example.test',
  role: 'WAITER', active: true, ...overrides,
});
const memberSnap = (tenant, uid, overrides = {}, id = tenant + '_' + uid) => ({
  id, exists: () => true, data: () => employee(tenant, uid, overrides),
});
async function begin(tenant, ids) {
  window.qa.pending = [];
  const promise = window.qa.load(tenant);
  await waitFor(() => window.qa.pending.length === 1, 'Falta lectura del negocio');
  window.qa.pending[0].resolve(businessSnap(tenant, ids));
  if (Array.isArray(ids) && ids.length) {
    await waitFor(() => window.qa.pending.length === 1 + new Set(ids).size, 'Faltan membresías');
  }
  return promise;
}
try {
  window.eval(bundle.outputFiles[0].text);

  // Dos miembros del tenant A; los índices duplicados no duplican personas.
  let promise = await begin('tenant-a', ['user-z', 'user-a', 'user-a']);
  assert.equal(window.qa.pending.length, 3);
  window.qa.pending[1].resolve(memberSnap('tenant-a', 'user-z'));
  window.qa.pending[2].resolve(memberSnap('tenant-a', 'user-a', {active: false}));
  assert.deepEqual((await promise).map(x => x.userId), ['user-a', 'user-z']);

  // El tenant B se lee independientemente, sin reutilizar la lista de A.
  promise = await begin('tenant-b', ['user-b']);
  window.qa.pending[1].resolve(memberSnap('tenant-b', 'user-b'));
  assert.deepEqual((await promise).map(x => x.restaurantId), ['tenant-b']);

  // Índice vacío válido, sin lecturas de membresías.
  promise = await begin('tenant-a', []);
  assert.deepEqual(await promise, []);
  assert.equal(window.qa.pending.length, 1);

  // Documento mal identificado: nunca devolver una membresía del tenant B en A.
  for (const bad of [
    memberSnap('tenant-b', 'user-a'),
    memberSnap('tenant-a', 'user-b'),
    memberSnap('tenant-a', 'user-a', {role: 'OWNER'}),
    memberSnap('tenant-a', 'user-a', {active: 'yes'}),
    memberSnap('tenant-a', 'user-a', {}, 'tenant-b_user-a'),
    {id: 'tenant-a_user-a', exists: () => false},
  ]) {
    promise = await begin('tenant-a', ['user-a']);
    const rejected = assert.rejects(promise, /membresía.*inconsistente|membresía ausente/);
    window.qa.pending[1].resolve(bad);
    await rejected;
  }

  // Un miembro ausente no se transforma en una lista parcial aparentemente correcta.
  promise = await begin('tenant-a', ['user-a', 'user-b']);
  const partialRejected = assert.rejects(promise, /membresía ausente/);
  window.qa.pending[1].resolve(memberSnap('tenant-a', 'user-a'));
  window.qa.pending[2].resolve({id: 'tenant-a_user-b', exists: () => false});
  await partialRejected;

  // Índices corruptos y negocio con ID discordante fallan antes de consultar miembros.
  for (const ids of ['not-an-array', ['user-a', null], ['user/a']]) {
    window.qa.pending = [];
    promise = window.qa.load('tenant-a');
    const rejected = assert.rejects(promise, /índice de empleados/);
    await waitFor(() => window.qa.pending.length === 1, 'Lectura índice');
    window.qa.pending[0].resolve(businessSnap('tenant-a', ids));
    await rejected;
    assert.equal(window.qa.pending.length, 1);
  }
  window.qa.pending = [];
  promise = window.qa.load('tenant-a');
  const wrongBusiness = assert.rejects(promise, /identificador es inconsistente/);
  await waitFor(() => window.qa.pending.length === 1, 'Lectura negocio');
  window.qa.pending[0].resolve(businessSnap('tenant-a', ['user-a'], 'tenant-b'));
  await wrongBusiness;
  assert.equal(window.qa.pending.length, 1);

  // Cambio de cuenta durante la lectura no devuelve datos del UID anterior.
  promise = await begin('tenant-a', ['user-a']);
  const switched = assert.rejects(promise, /sesión cambió/);
  window.qa.auth.currentUser = {uid: 'owner-b'};
  window.qa.pending[1].resolve(memberSnap('tenant-a', 'user-a'));
  await switched;
  window.qa.auth.currentUser = {uid: 'owner-a'};

  // Un fallo de permisos no se convierte en lista vacía.
  window.qa.pending = [];
  promise = window.qa.load('tenant-a');
  const denied = assert.rejects(promise, /permission-denied/);
  await waitFor(() => window.qa.pending.length === 1, 'Lectura fallida');
  window.qa.pending[0].reject(new Error('permission-denied'));
  await denied;

  window.qa.auth.currentUser = null;
  await assert.rejects(window.qa.load('tenant-a'), /Inicia sesión/);
  assert.equal(window.qa.pending.length, 1, 'Sin sesión no se debe consultar Firestore');

  console.log('PASS: lista de empleados validada por tenant, UID, rol, índice y sesión; fallos sin datos parciales (Firestore/Auth simulados).');
} finally {
  window.close();
}

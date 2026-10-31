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
    'export const getDoc = ref => {',
    '  if (ref.collection === "businessMemberships" && ref.id.endsWith("_owner-a")) {',
    '    const tenant = ref.id.slice(0, -"_owner-a".length);',
    '    const index = ++window.qa.managerReads;',
    '    const fallback = {restaurantId:tenant,userId:"owner-a",role:"OWNER",active:true};',
    '    const data = typeof window.qa.managerOverride === "function" ? window.qa.managerOverride(index, fallback) : (window.qa.managerOverride ?? fallback);',
    '    return Promise.resolve({id:ref.id,exists:()=>!!data,data:()=>data});',
    '  }',
    '  if (ref.collection === "businesses" && window.qa.lastRootSnap) {',
    '    return Promise.resolve(window.qa.rootRecheckOverride || window.qa.lastRootSnap);',
    '  }',
    '  return new Promise((resolve,reject) => window.qa.pending.push({ref,',
    '    resolve:snap => { if (ref.collection === "businesses") window.qa.lastRootSnap = snap; resolve(snap); },reject',
    '  }));',
    '};',
    'export const getDocFromServer = ref => {window.qa.serverReads++; if (window.qa.serverError) return Promise.reject(window.qa.serverError); return getDoc(ref);};',
    'export const arrayRemove = () => ({});',
    'export const arrayUnion = () => ({});',
    'export const collection = () => ({});',
    'export const deleteDoc = async () => {};',
    'export const getDocs = async () => ({});',
    'export const query = () => ({});',
    'export const setDoc = async () => {};',
    'export const updateDoc = async () => {};',
    'export const where = () => ({});',
    'export const runTransaction = () => {throw new Error("No writes in roster test");};',
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
window.qa = {pending: [], managerReads: 0, managerOverride: undefined, serverReads: 0, serverError: null, lastRootSnap: null, rootRecheckOverride: null};
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
async function begin(tenant, ids, managerOverride = undefined, rootOverride = null) {
  window.qa.pending = [];
  window.qa.managerReads = 0;
  window.qa.managerOverride = managerOverride;
  const promise = window.qa.load(tenant);
  await waitFor(() => window.qa.pending.length === 1, 'Falta lectura del negocio');
  window.qa.pending[0].resolve(rootOverride || businessSnap(tenant, ids));
  if (Array.isArray(ids) && ids.length) {
    await waitFor(() => window.qa.pending.length === 1 + new Set(ids).size, 'Faltan membresías');
  }
  return {promise};
}
try {
  window.eval(bundle.outputFiles[0].text);
  // Cada consulta empieza con una raíz nueva; solo su segunda lectura se
  // resuelve automáticamente desde el snapshot inicial (o una mutación test).
  const originalLoad = window.qa.load;
  window.qa.load = (...args) => {
    window.qa.lastRootSnap = null;
    window.qa.rootRecheckOverride = null;
    return originalLoad(...args);
  };

  // Dos miembros del tenant A; los índices duplicados no duplican personas.
  let {promise} = await begin('tenant-a', ['user-z', 'user-a', 'user-a']);
  assert.equal(window.qa.pending.length, 3);
  window.qa.pending[1].resolve(memberSnap('tenant-a', 'user-z'));
  window.qa.pending[2].resolve(memberSnap('tenant-a', 'user-a', {active: false}));
  assert.equal((await promise).map(x => x.userId).join(','), 'user-a,user-z');

  // El tenant B se lee independientemente, sin reutilizar la lista de A.
  ({promise} = await begin('tenant-b', ['user-b']));
  window.qa.pending[1].resolve(memberSnap('tenant-b', 'user-b'));
  assert.equal((await promise).map(x => x.restaurantId).join(','), 'tenant-b');

  // Índice vacío válido, sin lecturas de membresías.
  ({promise} = await begin('tenant-a', []));
  assert.equal((await promise).length, 0);
  assert.equal(window.qa.pending.length, 1);

  // El índice vacío también requiere permisos vigentes; una cuenta ajena o
  // revocada no debe recibir una respuesta engañosa de lista vacía.
  for (const invalid of [
    {restaurantId:'tenant-b',userId:'owner-a',role:'OWNER',active:true},
    {restaurantId:'tenant-a',userId:'owner-b',role:'OWNER',active:true},
    {restaurantId:'tenant-a',userId:'owner-a',role:'WAITER',active:true},
    {restaurantId:'tenant-a',userId:'owner-a',role:'OWNER',active:false},
  ]) {
    window.qa.pending = [];
    window.qa.managerReads = 0;
    window.qa.managerOverride = invalid;
    await assert.rejects(window.qa.load('tenant-a'), /No tienes permiso/);
    assert.equal(window.qa.pending.length, 0, 'No leer raíz ni roster sin permiso');
  }
  ({promise} = await begin('tenant-a', [], undefined, {
    exists:()=>true, data:()=>({restaurantId:'tenant-a',ownerUserId:'owner-b',employeeUserIds:[]}),
  }));
  await assert.rejects(promise, /propietario es inconsistente/);
  assert.equal(window.qa.pending.length, 1, 'OWNER residual no consulta personal');

  // Revocación o cambio de rol entre índice y entrega: no retornar un roster
  // ni siquiera si está vacío. El segundo permiso se lee de nuevo.
  ({promise} = await begin('tenant-a', [], (n, valid) => n === 1 ? valid : {...valid,active:false}));
  await assert.rejects(promise, /No tienes permiso/);
  assert.equal(window.qa.managerReads, 2);
  ({promise} = await begin('tenant-a', ['user-a'], (n, valid) => n === 1 ? valid : {...valid,role:'WAITER'}));
  const revokedRoster = assert.rejects(promise, /No tienes permiso/);
  window.qa.pending[1].resolve(memberSnap('tenant-a','user-a'));
  await revokedRoster;
  assert.equal(window.qa.managerReads, 2);

  // Un ADMIN legítimo puede ver su roster aunque no sea el OWNER de la raíz.
  ({promise} = await begin('tenant-a', ['user-a'], (_n, valid) => ({...valid,role:'ADMIN'}), {
    exists:()=>true, data:()=>({restaurantId:'tenant-a',ownerUserId:'owner-b',employeeUserIds:['user-a']}),
  }));
  window.qa.pending[1].resolve(memberSnap('tenant-a','user-a'));
  assert.equal((await promise)[0].userId,'user-a');

  // Revalidación nueva: aunque la membresía del OWNER siga activa,
  // no devolver roster si la raíz cambió durante las lecturas de empleados.
  for (const [label, changedRoot, error] of [
    ['OWNER reasignado', {restaurantId:'tenant-a',ownerUserId:'owner-b',employeeUserIds:['user-a']}, /propiedad/],
    ['tenant de raíz cambiado', {restaurantId:'tenant-b',ownerUserId:'owner-a',employeeUserIds:['user-a']}, /identidad/],
    ['índice de empleados cambiado', {restaurantId:'tenant-a',ownerUserId:'owner-a',employeeUserIds:['user-b']}, /índice/],
  ]) {
    ({promise} = await begin('tenant-a', ['user-a'], undefined, {
      exists:()=>true, data:()=>({restaurantId:'tenant-a',ownerUserId:'owner-a',employeeUserIds:['user-a']}),
    }));
    const rejected = assert.rejects(promise, error, label);
    window.qa.rootRecheckOverride = {exists:()=>true,data:()=>changedRoot};
    window.qa.pending[1].resolve(memberSnap('tenant-a','user-a'));
    await rejected;
    assert.equal(window.qa.pending.length, 2, label + ': no emitir lecturas adicionales no controladas');
  }

  // Documento mal identificado: nunca devolver una membresía del tenant B en A.
  for (const bad of [
    memberSnap('tenant-b', 'user-a'),
    memberSnap('tenant-a', 'user-b'),
    memberSnap('tenant-a', 'user-a', {role: 'OWNER'}),
    memberSnap('tenant-a', 'user-a', {active: 'yes'}),
    memberSnap('tenant-a', 'user-a', {}, 'tenant-b_user-a'),
    {id: 'tenant-a_user-a', exists: () => false},
  ]) {
    ({promise} = await begin('tenant-a', ['user-a']));
    const rejected = assert.rejects(promise, /membresía.*inconsistente|membresía ausente/);
    window.qa.pending[1].resolve(bad);
    await rejected;
  }

  // Un miembro ausente no se transforma en una lista parcial aparentemente correcta.
  ({promise} = await begin('tenant-a', ['user-a', 'user-b']));
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
  ({promise} = await begin('tenant-a', ['user-a']));
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

  window.qa.auth.currentUser = {uid: 'owner-a'};
  window.qa.pending = [];
  window.qa.serverError = new Error('offline');
  await assert.rejects(window.qa.load('tenant-a'), /offline/);
  assert.equal(window.qa.pending.length, 0, 'No consultar roster con permiso cacheado si servidor falla');
  window.qa.serverError = null;
  assert(window.qa.serverReads > 0, 'Todas las lecturas de roster pasan por servidor');
  console.log('PASS: roster A/B y permisos vigentes requieren servidor; sin caché offline (simulado).');
  console.log('PASS: lista de empleados validada por tenant, UID, rol, índice y sesión; fallos sin datos parciales (Firestore/Auth simulados).');
} finally {
  window.close();
}

// Servicio real de Super Admin con Firebase/Auth simulados; nunca usa datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/auth': [
    'export async function createUserWithEmailAndPassword() {}',
    'export async function signInWithEmailAndPassword() {}',
    'export async function signOut() {}',
  ].join('\n'),
  'firebase/firestore': [
    'export const collection = (_db, name) => ({name});',
    'export const doc = (_db, collection, id) => ({collection, id});',
    'export const where = (field, op, value) => ({field, op, value});',
    'export const query = (collection, ...filters) => ({collection, filters});',
    'export const getDoc = ref => new Promise((resolve, reject) => window.qa.docs.push({ref, resolve, reject}));',
    'export const getDocs = ref => new Promise((resolve, reject) => window.qa.lists.push({ref, resolve, reject}));',
    'export const writeBatch = () => {throw new Error("No writes in this test")};',
  ].join('\n'),
  './firebase': 'export const auth = {currentUser: {uid:"admin-a"}}; export const db = {}; window.qa.auth = auth;',
  './businessCatalogService': 'export const seedBusinessCatalogIfMissing = () => {}; export const createCatalogItemId = () => "";',
  '../data/businessCatalogTemplates': 'export const getBusinessCatalogTemplate = () => null;',
  './restaurantCore': 'export const createRestaurantTenant = () => ({}); export const normalizeRestaurantSlug = value => value;',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {isPlatformAdmin, getAllBusinesses} from './src/lib/businessAuthService';",
    'window.qa.check = isPlatformAdmin;',
    'window.qa.list = getAllBusinesses;',
  ].join('\n')},
  plugins: [{name: 'mock-firebase', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/businessAuthService.ts') && Object.hasOwn(mocks, args.path)) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('', {url: 'http://localhost/', runScripts: 'outside-only'});
const {window} = dom;
window.qa = {docs: [], lists: []};
const waitFor = async (condition, label) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(label);
};
const adminSnap = (active = true) => ({exists: () => true, data: () => ({active})});
const listing = (...records) => ({
  forEach: callback => records.forEach(([id, data]) => callback({id, data: () => data})),
});
const tenant = id => ({restaurantId: id, branding: {restaurantName: id}});
const use = uid => { window.qa.auth.currentUser = uid ? {uid} : null; };
try {
  window.eval(bundle.outputFiles[0].text);

  const pendingCheck = window.qa.check('admin-a');
  await waitFor(() => window.qa.docs.length === 1, 'Admin read missing');
  use('outsider-b');
  window.qa.docs[0].resolve(adminSnap());
  assert.equal(await pendingCheck, false, 'No devolver permisos de una cuenta anterior');

  const noAccess = window.qa.list('outsider-b');
  const denied = assert.rejects(noAccess, /no tiene permisos/i);
  await waitFor(() => window.qa.docs.length === 2, 'Outsider admin check missing');
  window.qa.docs[1].resolve({exists: () => false});
  await denied;
  assert.equal(window.qa.lists.length, 0, 'No consultar listado global sin permiso');

  use('admin-a');
  const beforeList = window.qa.list('admin-a');
  const beforeListRejected = assert.rejects(beforeList, /no tiene permisos|sesión cambió/i);
  await waitFor(() => window.qa.docs.length === 3, 'Admin check before list missing');
  use('outsider-b');
  window.qa.docs[2].resolve(adminSnap());
  await beforeListRejected;
  assert.equal(window.qa.lists.length, 0, 'No iniciar consulta global después del cambio de UID');

  use('admin-a');
  const inFlight = window.qa.list('admin-a');
  const inFlightRejected = assert.rejects(inFlight, /sesión cambió/i);
  await waitFor(() => window.qa.docs.length === 4, 'Admin check missing');
  window.qa.docs[3].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 1, 'Global list read missing');
  use('outsider-b');
  window.qa.lists[0].resolve(listing(['tenant-a', tenant('tenant-a')]));
  await inFlightRejected;

  use('admin-a');
  const inconsistent = window.qa.list('admin-a');
  const inconsistentRejected = assert.rejects(inconsistent, /identificador inconsistente/i);
  await waitFor(() => window.qa.docs.length === 5, 'Admin check for corrupt tenant missing');
  window.qa.docs[4].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 2, 'Corrupt list read missing');
  window.qa.lists[1].resolve(listing(['tenant-a', tenant('tenant-b')]));
  await inconsistentRejected;

  const successful = window.qa.list('admin-a');
  await waitFor(() => window.qa.docs.length === 6, 'Admin check for valid list missing');
  window.qa.docs[5].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 3, 'Valid list read missing');
  window.qa.lists[2].resolve(listing(
    ['tenant-a', tenant('tenant-a')],
    ['alo-restaurante', tenant('alo-restaurante')],
    ['tenant-b', tenant('tenant-b')],
  ));
  await waitFor(() => window.qa.docs.length === 7, 'Revalidación Super Admin después del listado');
  window.qa.docs[6].resolve(adminSnap());
  assert.equal((await successful).map(item => item.restaurantId).join(','), 'tenant-a,tenant-b');

  const failedRead = window.qa.list('admin-a');
  const failedReadRejected = assert.rejects(failedRead, /permission-denied/);
  await waitFor(() => window.qa.docs.length === 8, 'Admin check for failed read missing');
  window.qa.docs[7].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 4, 'Failed list read missing');
  window.qa.lists[3].reject(new Error('permission-denied'));
  await failedReadRejected;

  // Revocar Super Admin mientras se consulta el listado global debe bloquear
  // el resultado, aunque la primera lectura de permisos fuera válida.
  const revoked = window.qa.list('admin-a');
  const revokedRejected = assert.rejects(revoked, /ya no tiene permisos/i);
  await waitFor(() => window.qa.docs.length === 9, 'Permiso inicial antes de revocación');
  window.qa.docs[8].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 5, 'Listado global antes de revocación');
  window.qa.lists[4].resolve(listing(['tenant-a', tenant('tenant-a')]));
  await waitFor(() => window.qa.docs.length === 10, 'Revalidación tras leer raíces');
  window.qa.docs[9].resolve(adminSnap(false));
  await revokedRejected;

  const removed = window.qa.list('admin-a');
  const removedRejected = assert.rejects(removed, /ya no tiene permisos/i);
  await waitFor(() => window.qa.docs.length === 11, 'Permiso inicial antes de borrado');
  window.qa.docs[10].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 6, 'Listado antes de borrar permiso');
  window.qa.lists[5].resolve(listing(['tenant-b', tenant('tenant-b')]));
  await waitFor(() => window.qa.docs.length === 12, 'Revalidación tras borrado');
  window.qa.docs[11].resolve({exists:()=>false});
  await removedRejected;

  const switchedDuringRecheck = window.qa.list('admin-a');
  const switchedRejected = assert.rejects(switchedDuringRecheck, /ya no tiene permisos|sesión cambió/i);
  await waitFor(() => window.qa.docs.length === 13, 'Permiso inicial antes de cambiar UID');
  window.qa.docs[12].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 7, 'Listado antes de cambiar UID');
  window.qa.lists[6].resolve(listing(['tenant-b', tenant('tenant-b')]));
  await waitFor(() => window.qa.docs.length === 14, 'Revalidación pendiente durante cambio de UID');
  use('outsider-b');
  window.qa.docs[13].resolve(adminSnap());
  await switchedRejected;

  // Un reintento con permiso vigente puede volver a listar normalmente.
  use('admin-a');
  const restored = window.qa.list('admin-a');
  await waitFor(() => window.qa.docs.length === 15, 'Permiso inicial recuperado');
  window.qa.docs[14].resolve(adminSnap());
  await waitFor(() => window.qa.lists.length === 8, 'Listado recuperado');
  window.qa.lists[7].resolve(listing(['tenant-b', tenant('tenant-b')]));
  await waitFor(() => window.qa.docs.length === 16, 'Revalidación recuperada');
  window.qa.docs[15].resolve(adminSnap());
  assert.equal((await restored).map(item => item.restaurantId).join(','), 'tenant-b');

  use(null);
  assert.equal(await window.qa.check('admin-a'), false);
  assert.equal(window.qa.docs.length, 16, 'No leer permisos tras cerrar sesión');
  console.log('PASS: Super Admin servicio verifica UID antes/después de lecturas, deniega cuentas ajenas y rechaza listas corruptas (Firebase simulado).');
} finally {
  window.close();
}

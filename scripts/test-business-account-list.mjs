// Prueba de getBusinessesForUser con Firestore simulado: nunca toca datos reales.
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
    'export async function getDocs() {return {docs: window.qa.memberships.map(data => ({data: () => data}))};}',
    'export function getDoc(ref) {return new Promise((resolve, reject) => window.qa.pending.push({ref, resolve, reject}));}',
    'export function writeBatch() {throw new Error("No Firestore writes in this test");}',
  ].join('\n'),
  './firebase': 'export const auth = {}; export const db = {};',
  './businessCatalogService': 'export const saveBusinessCatalog = () => {}; export const createCatalogItemId = () => "";',
  '../data/businessCatalogTemplates': 'export const getBusinessCatalogTemplate = () => null;',
  './restaurantCore': 'export const createRestaurantTenant = () => ({}); export const normalizeRestaurantSlug = value => value;',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {getBusinessesForUser} from './src/lib/businessAuthService';",
    "window.qa.load = getBusinessesForUser;",
  ].join('\n')},
  plugins: [{name: 'mock-business-reads', setup(build) {
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
window.qa = {memberships: [], pending: []};
const waitFor = async (condition, message) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const snap = id => ({exists: () => true, data: () => ({restaurantId: id, branding: {restaurantName: id}})});
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.memberships = [{restaurantId: 'tenant-a'}, {restaurantId: 'tenant-b'}];
  const first = window.qa.load('owner-a');
  const failed = assert.rejects(first, /No pudimos cargar todos tus negocios/);
  await waitFor(() => window.qa.pending.length === 2, 'Deben leerse ambos tenants');
  window.qa.pending[0].resolve(snap('tenant-a'));
  window.qa.pending[1].reject(new Error('permission-denied'));
  await failed;

  // Una nueva consulta recupera ambos negocios sin arrastrar resultados anteriores.
  window.qa.pending = [];
  const second = window.qa.load('owner-a');
  await waitFor(() => window.qa.pending.length === 2, 'Retry must read both tenants');
  window.qa.pending[0].resolve(snap('tenant-a'));
  window.qa.pending[1].resolve(snap('tenant-b'));
  assert.equal((await second).map(item => item.restaurantId).join(','), 'tenant-a,tenant-b');

  // No presentar una membresía rota como si el negocio no existiera en la cuenta.
  window.qa.pending = [];
  const missing = window.qa.load('owner-a');
  const missingFailed = assert.rejects(missing, /No pudimos cargar todos tus negocios/);
  await waitFor(() => window.qa.pending.length === 2, 'Missing tenant reads');
  window.qa.pending[0].resolve({exists: () => false});
  window.qa.pending[1].resolve(snap('tenant-b'));
  await missingFailed;

  // Nunca mezclar un documento cuyo ID interno no corresponde a la membresía.
  window.qa.pending = [];
  const mismatched = window.qa.load('owner-a');
  const mismatchFailed = assert.rejects(mismatched, /No pudimos cargar todos tus negocios/);
  await waitFor(() => window.qa.pending.length === 2, 'Mismatch reads');
  window.qa.pending[0].resolve(snap('tenant-b'));
  window.qa.pending[1].resolve(snap('tenant-b'));
  await mismatchFailed;

  // No repetir lecturas por membresías duplicadas.
  window.qa.memberships = [{restaurantId: 'tenant-a'}, {restaurantId: 'tenant-a'}];
  window.qa.pending = [];
  const deduplicated = window.qa.load('owner-a');
  await waitFor(() => window.qa.pending.length === 1, 'One read for duplicate tenant IDs');
  window.qa.pending[0].resolve(snap('tenant-a'));
  assert.equal((await deduplicated).length, 1);
  console.log('PASS: lecturas parciales no ocultan negocios, reintento, membresía rota, ID discordante y duplicados (Firestore simulado).');
} finally {
  window.close();
}

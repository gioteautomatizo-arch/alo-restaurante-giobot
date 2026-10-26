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
    'export async function getDocs() {return {docs: window.qa.memberships.map(data => ({id: data.id || data.restaurantId + "_" + data.userId, data: () => data}))};}',
    'export function getDoc(ref) {return new Promise((resolve, reject) => window.qa.pending.push({ref, resolve, reject}));}',
    'export function writeBatch() {throw new Error("No Firestore writes in this test");}',
  ].join('\n'),
  './firebase': 'export const auth = {currentUser: {uid:"owner-a"}}; export const db = {}; window.qa.auth = auth;',
  './businessCatalogService': 'export const seedBusinessCatalogIfMissing = () => {}; export const createCatalogItemId = () => "";',
  '../data/businessCatalogTemplates': 'export const getBusinessCatalogTemplate = () => null;',
  './restaurantCore': 'export const createRestaurantTenant = () => ({}); export const normalizeRestaurantSlug = value => value;',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {getBusinessesForUser, getBusinessForUser, getBusinessMembership} from './src/lib/businessAuthService';",
    "window.qa.load = getBusinessesForUser;",
    "window.qa.one = getBusinessForUser;",
    "window.qa.member = getBusinessMembership;",
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
const member = (id, uid = 'owner-a', role = 'OWNER', active = true) => ({restaurantId:id, userId:uid, role, active});
const memberSnap = data => ({exists: () => true, data: () => data});
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.memberships = [member('tenant-a'), member('tenant-b')];
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
  window.qa.memberships = [member('tenant-a'), member('tenant-a')];
  window.qa.pending = [];
  const deduplicated = window.qa.load('owner-a');
  await waitFor(() => window.qa.pending.length === 1, 'One read for duplicate tenant IDs');
  window.qa.pending[0].resolve(snap('tenant-a'));
  assert.equal((await deduplicated).length, 1);

  // La lista debe fallar cerrada si el índice de una membresía fue corrompido.
  window.qa.memberships = [{...member('tenant-a'), id:'tenant-b_owner-a'}];
  window.qa.pending = [];
  await assert.rejects(window.qa.load('owner-a'), /membresía.*inconsistentes/);
  assert.equal(window.qa.pending.length, 0, 'No consultar tenants con índice de membresía discordante');

  // Una sesión distinta durante una lectura no puede devolver tarjetas de A a B.
  window.qa.memberships = [member('tenant-a')];
  window.qa.pending = [];
  const switchedList = window.qa.load('owner-a');
  await waitFor(() => window.qa.pending.length === 1, 'Lectura A pendiente');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.pending[0].resolve(snap('tenant-a'));
  await assert.rejects(switchedList, /sesión cambió|No pudimos cargar/);
  window.qa.auth.currentUser = {uid:'owner-a'};

  // Acceso individual: validar UID, tenant, estado y rol ANTES de leer negocio.
  window.qa.pending = [];
  const individual = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Membresía individual pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a')));
  await waitFor(() => window.qa.pending.length === 2, 'Negocio individual pendiente');
  window.qa.pending[1].resolve(snap('tenant-a'));
  assert.equal((await individual)?.restaurantId, 'tenant-a');

  window.qa.pending = [];
  const wrongMember = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Membresía discordante pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-b')));
  assert.equal(await wrongMember, null, 'No aceptar membresía de otro tenant');
  assert.equal(window.qa.pending.length, 1, 'No leer negocio tras membresía discordante');

  window.qa.pending = [];
  const wrongTenant = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Membresía válida pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a')));
  await waitFor(() => window.qa.pending.length === 2, 'Documento negocio pendiente');
  window.qa.pending[1].resolve(snap('tenant-b'));
  assert.equal(await wrongTenant, null, 'No devolver negocio con ID interno de otro tenant');

  window.qa.pending = [];
  const badRole = window.qa.member('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Rol pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a', 'owner-a', 'ROL_DESCONOCIDO')));
  assert.equal(await badRole, null, 'No conceder permisos a un rol desconocido');

  window.qa.pending = [];
  const inactive = window.qa.member('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Estado pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a', 'owner-a', 'OWNER', false)));
  assert.equal(await inactive, null, 'No aceptar membresía inactiva');

  window.qa.pending = [];
  const stale = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Membresía de A pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a')));
  await waitFor(() => window.qa.pending.length === 2, 'Negocio de A pendiente');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.pending[1].resolve(snap('tenant-a'));
  await assert.rejects(stale, /sesión cambió/, 'No devolver negocio privado tras cambiar cuenta');
  window.qa.auth.currentUser = {uid:'owner-a'};
  console.log('PASS: lista, membresías y negocio individual aislados por UID/tenant/rol/sesión (Firestore simulado).');
} finally {
  window.close();
}

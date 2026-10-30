// Prueba de la opción de corte seguro en cliente. Auth/API simulados; sin Firebase real.
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
    'export const collection = () => ({});',
    'export const doc = () => ({});',
    'export const where = () => ({});',
    'export const query = () => ({});',
    'export async function getDocs() {window.qa.unsafeReads++; throw Error("NO consultar Firestore directo");}',
    'export async function getDocsFromServer() {window.qa.unsafeReads++; throw Error("NO consultar Firestore directo");}',
    'export async function getDoc() {throw Error("NO leer Firestore directo");}',
    'export function writeBatch() {throw Error("NO escribir Firestore");}',
  ].join('\n'),
  './firebase': [
    'export const db = {};',
    'export const auth = {currentUser: {uid:"alice", getIdToken: async () => "token-alice"}};',
    'window.qa.auth = auth;',
  ].join('\n'),
  './businessCatalogService': 'export const seedBusinessCatalogIfMissing = () => {}; export const createCatalogItemId = () => "";',
  '../data/businessCatalogTemplates': 'export const getBusinessCatalogTemplate = () => null;',
  './restaurantCore': 'export const createRestaurantTenant = () => ({}); export const normalizeRestaurantSlug = value => value;',
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'import.meta.env': '{"VITE_SECURE_BUSINESS_LIST":"true"}'},
  stdin: {resolveDir: root, loader: 'js', contents: [
    "import {getBusinessesForUser} from './src/lib/businessAuthService';",
    'window.qa.load = getBusinessesForUser;',
  ].join('\n')},
  plugins: [{name: 'mock-secure-directory-client', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/businessAuthService.ts') && Object.hasOwn(mocks, args.path)) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args =>
      ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('', {url: 'http://localhost/', runScripts: 'outside-only'});
const {window} = dom;
window.qa = {unsafeReads: 0, pending: [], requests: []};
window.fetch = (url, options) => new Promise(resolve => {
  window.qa.requests.push({url, options});
  window.qa.pending.push(resolve);
});
const waitFor = async (predicate, message) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const business = id => ({
  restaurantId: id, branding: {restaurantName: id, publicSlug: id},
});
const respond = (index, status, payload) =>
  window.qa.pending[index]({ok: status >= 200 && status < 300,
    status, json: async () => payload});
try {
  window.eval(bundle.outputFiles[0].text);
  const first = window.qa.load('alice');
  await waitFor(() => window.qa.pending.length === 1, 'Falta request seguro');
  assert.equal(window.qa.requests[0].url, '/api/businesses/mine');
  assert.equal(window.qa.requests[0].options.headers.Authorization, 'Bearer token-alice');
  assert.equal(window.qa.requests[0].options.cache, 'no-store');
  respond(0, 200, {businesses: [business('tenant-a'), business('tenant-b')]});
  assert.equal((await first).length, 2);

  const unavailable = window.qa.load('alice');
  await waitFor(() => window.qa.pending.length === 2, 'Falta retry seguro');
  respond(1, 404, {error: 'Endpoint desactivado'});
  await assert.rejects(unavailable, /servicio protegido/, 'Sin fallback a lectura insegura');

  const malformed = window.qa.load('alice');
  await waitFor(() => window.qa.pending.length === 3, 'Falta respuesta inválida');
  respond(2, 200, {businesses: [business('tenant-a'), business('tenant-a')]});
  await assert.rejects(malformed, /inconsistentes/, 'No aceptar duplicados');

  const switched = window.qa.load('alice');
  await waitFor(() => window.qa.pending.length === 4, 'Falta request A pendiente');
  window.qa.auth.currentUser = {uid: 'bob', getIdToken: async () => 'token-bob'};
  respond(3, 200, {businesses: [business('tenant-a')]});
  await assert.rejects(switched, /sesión cambió/, 'No devolver datos de A tras cambio a B');

  const bob = window.qa.load('bob');
  await waitFor(() => window.qa.pending.length === 5, 'Falta request B');
  assert.equal(window.qa.requests[4].options.headers.Authorization, 'Bearer token-bob');
  respond(4, 200, {businesses: [business('tenant-b')]});
  assert.equal((await bob).map(item => item.restaurantId).join(','), 'tenant-b');

  const extraRoot = window.qa.load('bob');
  await waitFor(() => window.qa.pending.length === 6, 'Falta respuesta con campos privados');
  respond(5, 200, {businesses: [{...business('tenant-b'), assistant: {
    customInstructions: 'NO-DEVOLVER',
  }}]});
  await assert.rejects(extraRoot, /inconsistentes/, 'Rechazar raíz completa en vez de tarjeta');

  const extraBranding = window.qa.load('bob');
  await waitFor(() => window.qa.pending.length === 7, 'Falta respuesta con branding extra');
  respond(6, 200, {businesses: [{...business('tenant-b'), branding: {
    ...business('tenant-b').branding, internalNote: 'NO-DEVOLVER',
  }}]});
  await assert.rejects(extraBranding, /inconsistentes/, 'No aceptar campos de branding ajenos al contrato');

  const invalidLogo = window.qa.load('bob');
  await waitFor(() => window.qa.pending.length === 8, 'Falta respuesta con logo inválido');
  respond(7, 200, {businesses: [{...business('tenant-b'), branding: {
    ...business('tenant-b').branding, logoUrl: 123,
  }}]});
  await assert.rejects(invalidLogo, /inconsistentes/, 'Logo debe ser string');

  const validLogo = window.qa.load('bob');
  await waitFor(() => window.qa.pending.length === 9, 'Falta respuesta con logo válido');
  respond(8, 200, {businesses: [{...business('tenant-b'), branding: {
    ...business('tenant-b').branding, logoUrl: 'https://example.test/logo.png',
  }}]});
  assert.equal((await validLogo)[0].branding.logoUrl, 'https://example.test/logo.png');

  assert.equal(window.qa.unsafeReads, 0, 'Nunca caer en consulta Firestore directa');
  console.log('PASS (cliente opt-in NO activado): bearer/UID, tarjetas mínimas, campos privados rechazados, no fallback, retry y cambio de cuenta (jsdom).');
} finally {
  window.close();
}

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
    'export async function getDocs() {throw new Error("Lectura cacheada de membresías prohibida");}',
    'export async function getDocsFromServer() { window.qa.serverReads++; if (window.qa.serverPending) return new Promise((resolve, reject) => window.qa.serverRequests.push({resolve, reject})); if (window.qa.serverError) throw window.qa.serverError; return {docs: (window.qa.latestMemberships ?? window.qa.memberships).map(data => ({id: data.id || data.restaurantId + "_" + data.userId, data: () => data}))}; }',
    'export function getDoc() {throw new Error("Lectura cacheada de rol prohibida");}',
    'export function getDocFromServer(ref) {return new Promise((resolve, reject) => window.qa.pending.push({ref, resolve, reject, source:"server"}));}',
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
window.qa = {memberships: [], pending: [], latestMemberships: null, serverReads: 0, serverPending: false, serverRequests: [], serverError: null};
const waitFor = async (condition, message) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const snap = (id, extra = {}) => ({exists: () => true, data: () => ({
  restaurantId: id, branding: {restaurantName: id, publicSlug: id}, ...extra,
})});
const member = (id, uid = 'owner-a', role = 'OWNER', active = true) => ({restaurantId:id, userId:uid, role, active});
const memberSnap = data => ({exists: () => true, data: () => data});

// Simula la secuencia real: membresía -> raíz -> revalidación de membresía.
// Ninguna lectura ni escritura sale de jsdom.
const readIndividual = async ({first = member('tenant-a'), root = snap('tenant-a'),
  last = first, expectedReads = 3} = {}) => {
  window.qa.pending = [];
  const request = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Primera membresía pendiente');
  window.qa.pending[0].resolve(memberSnap(first));
  await waitFor(() => window.qa.pending.length === 2, 'Raíz privada pendiente');
  window.qa.pending[1].resolve(root);
  if (expectedReads === 3) {
    await waitFor(() => window.qa.pending.length === 3, 'Revalidación pendiente');
    window.qa.pending[2].resolve(last === null ? {exists: () => false} : memberSnap(last));
  }
  const result = await request;
  assert.equal(window.qa.pending.length, expectedReads);
  assert.equal(window.qa.pending[0].source, 'server', 'Primera membresía debe venir del servidor');
  if (expectedReads >= 2) assert.equal(window.qa.pending[1].source, 'server', 'Raíz privada debe venir del servidor');
  if (expectedReads === 3) assert.equal(window.qa.pending[2].source, 'server', 'Permiso final debe venir del servidor');
  return result;
};
try {
  window.eval(bundle.outputFiles[0].text);
  // Una membresía cacheada revocada en servidor no inicia lectura privada.
  window.qa.memberships = [member('tenant-a')];
  window.qa.latestMemberships = [];
  assert.deepEqual(await window.qa.load('owner-a'), []);
  assert.equal(window.qa.pending.length, 0, 'No leer raíz con permiso solo cacheado');
  window.qa.latestMemberships = null;
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
  window.qa.pending[0].resolve(snap('tenant-a', {
    assistant: {customInstructions: 'PRIVADO-NO-DEVOLVER'},
    privateSettings: {token: 'PRIVADO-NO-DEVOLVER'},
  }));
  window.qa.pending[1].resolve(snap('tenant-b'));
  const cards = await second;
  assert.equal(cards.map(item => item.restaurantId).join(','), 'tenant-a,tenant-b');
  assert.deepEqual(Object.keys(cards[0]).sort(), ['branding', 'restaurantId'],
    'El Portal heredado solo recibe una tarjeta, nunca la raíz completa');
  assert.deepEqual(Object.keys(cards[0].branding).sort(), ['publicSlug', 'restaurantName']);
  assert.equal(JSON.stringify(cards).includes('PRIVADO-NO-DEVOLVER'), false);

  // Una membresía OWNER mal asociada no puede presentar la raíz de otro
  // propietario. Las raíces antiguas sin ownerUserId siguen siendo compatibles.
  window.qa.memberships = [member('tenant-a')];
  window.qa.pending = [];
  const wrongOwner = window.qa.load('owner-a');
  const wrongOwnerRejected = assert.rejects(wrongOwner, /No pudimos cargar todos tus negocios/);
  await waitFor(() => window.qa.pending.length === 1, 'OWNER/raíz pendiente');
  window.qa.pending[0].resolve(snap('tenant-a', {ownerUserId: 'owner-b'}));
  await wrongOwnerRejected;

  window.qa.pending = [];
  const historicOwner = window.qa.load('owner-a');
  await waitFor(() => window.qa.pending.length === 1, 'OWNER histórico pendiente');
  window.qa.pending[0].resolve(snap('tenant-a'));
  assert.equal((await historicOwner)[0].restaurantId, 'tenant-a',
    'Una raíz histórica sin ownerUserId sigue disponible');

  // Un empleado legítimo no tiene que ser el propietario de la raíz.
  window.qa.memberships = [member('tenant-a', 'owner-a', 'WAITER')];
  window.qa.pending = [];
  const staff = window.qa.load('owner-a');
  await waitFor(() => window.qa.pending.length === 1, 'Empleado pendiente');
  window.qa.pending[0].resolve(snap('tenant-a', {ownerUserId: 'owner-b'}));
  assert.equal((await staff)[0].restaurantId, 'tenant-a');

  // La validación de branding debe coincidir con el candidato privado.
  window.qa.memberships = [member('tenant-a')];
  window.qa.pending = [];
  const badBranding = window.qa.load('owner-a');
  const brandingRejected = assert.rejects(badBranding, /No pudimos cargar todos tus negocios/);
  await waitFor(() => window.qa.pending.length === 1, 'Branding inválido pendiente');
  window.qa.pending[0].resolve(snap('tenant-a', {
    branding: {restaurantName: 'A', publicSlug: 'tenant-a', logoUrl: 123},
  }));
  await brandingRejected;

  // No presentar una membresía rota como si el negocio no existiera en la cuenta.
  window.qa.memberships = [member('tenant-a'), member('tenant-b')];
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

  // Un documento de membresía con rol global forjado no es un permiso tenant:
  // rechazar ANTES de solicitar la raíz, aunque UID y ruta sean coherentes.
  window.qa.memberships = [member('tenant-a', 'owner-a', 'SUPER_ADMIN')];
  window.qa.pending = [];
  await assert.rejects(window.qa.load('owner-a'), /membresía.*inconsistentes/);
  assert.equal(window.qa.pending.length, 0,
    'El selector no debe leer raíces con rol SUPER_ADMIN de membresía');

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
  const individual = await readIndividual({root: snap('tenant-a', {ownerUserId: 'owner-a'})});
  assert.equal(individual?.restaurantId, 'tenant-a');

  // Una membresía OWNER no permite abrir una raíz con propietario explícito ajeno.
  assert.equal(await readIndividual({
    root: snap('tenant-a', {ownerUserId: 'owner-b'}), expectedReads: 2,
  }), null, 'OWNER discordante no puede abrir Workspace de otro propietario');

  // Mantener compatibilidad con OWNER histórico sin ownerUserId.
  assert.equal((await readIndividual())?.restaurantId, 'tenant-a');

  // Un empleado legítimo puede trabajar en una raíz de otro propietario.
  assert.equal((await readIndividual({
    first: member('tenant-a', 'owner-a', 'WAITER'),
    root: snap('tenant-a', {ownerUserId: 'owner-b'}),
    last: member('tenant-a', 'owner-a', 'WAITER'),
  }))?.restaurantId, 'tenant-a');

  // Revocación, borrado y cambio de rol entre la primera lectura y la raíz
  // no deben entregar un tenant al Workspace con permisos caducados.
  assert.equal(await readIndividual({
    root: snap('tenant-a', {ownerUserId: 'owner-a'}),
    last: member('tenant-a', 'owner-a', 'OWNER', false),
  }), null, 'Revocación durante lectura debe bloquear el acceso');
  assert.equal(await readIndividual({last: null}), null,
    'Borrado de membresía durante lectura debe bloquear el acceso');
  assert.equal(await readIndividual({
    last: member('tenant-a', 'owner-a', 'WAITER'),
  }), null, 'Cambio de rol durante lectura debe invalidar el permiso inicial');
  assert.equal(await readIndividual({
    last: member('tenant-b'),
  }), null, 'Revalidación con tenant ajeno debe bloquear acceso');
  assert.equal(await readIndividual({
    last: member('tenant-a', 'owner-b'),
  }), null, 'Revalidación con UID ajeno debe bloquear acceso');

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
  const forgedBusiness = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Lectura de rol global forjado');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a', 'owner-a', 'SUPER_ADMIN')));
  assert.equal(await forgedBusiness, null, 'Rol global no abre Workspace por membresía');
  assert.equal(window.qa.pending.length, 1, 'No leer raíz tras rol global forjado');

  window.qa.pending = [];
  const forgedMembership = window.qa.member('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Rol global forjado en permisos');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a', 'owner-a', 'SUPER_ADMIN')));
  assert.equal(await forgedMembership, null, 'Rol global no concede permisos de tenant');
  assert.equal(window.qa.pending.length, 1, 'No leer raíz tras rol global en permisos');

  window.qa.pending = [];
  const inactive = window.qa.member('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Estado pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a', 'owner-a', 'OWNER', false)));
  assert.equal(await inactive, null, 'No aceptar membresía inactiva');

  // La lectura de rol que usa Workspace también debe cotejar la raíz y
  // revalidar la membresía: OWNER residual no obtiene controles del nuevo dueño.
  const readRole = async ({first = member('tenant-a'), root = snap('tenant-a', {ownerUserId:'owner-a'}),
    last = first, rootValid = true} = {}) => {
    window.qa.pending = [];
    const request = window.qa.member('owner-a', 'tenant-a');
    await waitFor(() => window.qa.pending.length === 1, 'Primera lectura del rol');
    window.qa.pending[0].resolve(memberSnap(first));
    await waitFor(() => window.qa.pending.length === 2, 'Raíz para comprobar OWNER');
    window.qa.pending[1].resolve(root);
    if (rootValid) {
      await waitFor(() => window.qa.pending.length === 3, 'Revalidación del rol');
      window.qa.pending[2].resolve(last === null ? {exists: () => false} : memberSnap(last));
    }
    assert.equal(window.qa.pending[0].source, 'server', 'Rol inicial requiere servidor');
    assert.equal(window.qa.pending[1].source, 'server', 'Identidad OWNER requiere raíz remota');
    if (rootValid) assert.equal(window.qa.pending[2].source, 'server', 'Rol final requiere servidor');
    return request;
  };
  assert.equal((await readRole())?.role, 'OWNER');
  assert.equal(await readRole({root:snap('tenant-a',{ownerUserId:'owner-b'}),rootValid:false}),null,
    'OWNER residual no se devuelve con raíz de otro UID');
  assert.equal((await readRole({root:snap('tenant-a')}))?.role,'OWNER',
    'Raíz histórica sin ownerUserId conserva compatibilidad');
  assert.equal((await readRole({first:member('tenant-a','owner-a','WAITER'),
    last:member('tenant-a','owner-a','WAITER'),root:snap('tenant-a',{ownerUserId:'owner-b'})}))?.role,'WAITER',
    'Empleado legítimo no necesita ser propietario de la raíz');
  assert.equal(await readRole({last:member('tenant-a','owner-a','OWNER',false)}),null,
    'Revocación durante lectura de la raíz invalida el rol');
  assert.equal(await readRole({last:member('tenant-a','owner-a','MANAGER')}),null,
    'Cambio de rol invalida permiso leído previamente');
  assert.equal(await readRole({last:null}),null,'Membresía borrada no concede rol');
  assert.equal(await readRole({root:snap('tenant-b'),rootValid:false}),null,
    'Raíz de otro negocio no concede rol');

  // Si la sesión cambia durante la segunda lectura de permisos, no se
  // entrega el tenant aunque ambas membresías fueran válidas.
  window.qa.pending = [];
  const staleRecheck = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Membresía antes de revalidar');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a')));
  await waitFor(() => window.qa.pending.length === 2, 'Raíz antes de revalidar');
  window.qa.pending[1].resolve(snap('tenant-a'));
  await waitFor(() => window.qa.pending.length === 3, 'Segunda membresía pendiente');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.pending[2].resolve(memberSnap(member('tenant-a')));
  await assert.rejects(staleRecheck, /sesión cambió/);
  window.qa.auth.currentUser = {uid:'owner-a'};

  window.qa.pending = [];
  const stale = window.qa.one('owner-a', 'tenant-a');
  await waitFor(() => window.qa.pending.length === 1, 'Membresía de A pendiente');
  window.qa.pending[0].resolve(memberSnap(member('tenant-a')));
  await waitFor(() => window.qa.pending.length === 2, 'Negocio de A pendiente');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.pending[1].resolve(snap('tenant-a'));
  await assert.rejects(stale, /sesión cambió/, 'No devolver negocio privado tras cambiar cuenta');
  window.qa.auth.currentUser = {uid:'owner-a'};
  // Paso 2: no devolver tarjetas A/B si el rol cambia mientras se leen raíces.
  const readListWithChange = async (initial, latest, errorPattern) => {
    window.qa.memberships = initial;
    window.qa.latestMemberships = latest;
    window.qa.pending = [];
    const request = window.qa.load('owner-a');
    const rejected = assert.rejects(request, errorPattern);
    await waitFor(() => window.qa.pending.length === new Set(initial.map(m => m.restaurantId)).size,
      'Lecturas de raíces A/B antes de revalidar');
    for (const pending of window.qa.pending) pending.resolve(snap(pending.ref.id, {ownerUserId:'owner-a'}));
    await rejected;
    window.qa.latestMemberships = null;
  };
  await readListWithChange([member('tenant-a'), member('tenant-b')],
    [member('tenant-b')], /permisos.*cambiaron/,
    'Revocación de A no devuelve tarjetas A/B obsoletas');
  await readListWithChange([member('tenant-a')], [member('tenant-a','owner-a','WAITER')],
    /permisos.*cambiaron/);
  await readListWithChange([member('tenant-a')], [member('tenant-a'),member('tenant-b')],
    /permisos.*cambiaron/);
  await readListWithChange([member('tenant-a')], [{...member('tenant-a'), id:'tenant-b_owner-a'}],
    /permisos.*inconsistentes/);

  // Si falla la primera lectura remota, no consultar ninguna raíz privada.
  window.qa.memberships = [member('tenant-a')];
  window.qa.pending = [];
  window.qa.serverError = new Error('permission-denied');
  await assert.rejects(window.qa.load('owner-a'), /permission-denied/);
  assert.equal(window.qa.pending.length, 0, 'Sin servidor no se leen raíces privadas');
  window.qa.serverError = null;

  // Una respuesta tardía del segundo chequeo no entrega tarjetas a otro UID.
  window.qa.serverPending = true;
  window.qa.pending = [];
  window.qa.serverRequests = [];
  const delayed = window.qa.load('owner-a');
  const delayedRejected = assert.rejects(delayed, /sesión cambió/);
  await waitFor(() => window.qa.serverRequests.length === 1, 'Primera membresía remota pendiente');
  assert.equal(window.qa.pending.length, 0, 'No leer raíz antes de confirmar membresía remota');
  window.qa.serverRequests[0].resolve({docs:[{id:'tenant-a_owner-a',data:()=>member('tenant-a')}]});
  await waitFor(() => window.qa.pending.length === 1, 'Raíz después de primera lectura remota');
  window.qa.pending[0].resolve(snap('tenant-a', {ownerUserId:'owner-a'}));
  await waitFor(() => window.qa.serverRequests.length === 2, 'Revalidación remota pendiente');
  window.qa.auth.currentUser = {uid:'owner-b'};
  window.qa.serverRequests[1].resolve({docs:[{id:'tenant-a_owner-a',data:()=>member('tenant-a')}]});
  await delayedRejected;
  window.qa.auth.currentUser = {uid:'owner-a'};
  window.qa.serverPending = false;
  window.qa.serverRequests = [];

  // Tras un cambio de permisos, una consulta nueva recupera el listado vigente.
  window.qa.memberships = [member('tenant-b')];
  window.qa.pending = [];
  const recovered = window.qa.load('owner-a');
  await waitFor(() => window.qa.pending.length === 1, 'Raíz de B después de revocación A');
  window.qa.pending[0].resolve(snap('tenant-b', {ownerUserId:'owner-a'}));
  assert.equal((await recovered).map(item => item.restaurantId).join(','), 'tenant-b');
  assert(window.qa.serverReads >= 6, 'El selector exige revalidación remota en cada lectura exitosa');
  // Workspace y rol fallan antes de consultar la raíz si falla el servidor.
  window.qa.pending = [];
  const offlineWorkspace = window.qa.one('owner-a', 'tenant-a');
  const offlineWorkspaceRejected = assert.rejects(offlineWorkspace, /offline/);
  await waitFor(() => window.qa.pending.length === 1, 'Membresía remota inicial');
  assert.equal(window.qa.pending[0].source, 'server');
  window.qa.pending[0].reject(new Error('offline'));
  await offlineWorkspaceRejected;
  assert.equal(window.qa.pending.length, 1, 'Workspace no consulta raíz sin permiso remoto');

  window.qa.pending = [];
  const offlineRole = window.qa.member('owner-a', 'tenant-a');
  const offlineRoleRejected = assert.rejects(offlineRole, /offline/);
  await waitFor(() => window.qa.pending.length === 1, 'Rol remoto inicial');
  assert.equal(window.qa.pending[0].source, 'server');
  window.qa.pending[0].reject(new Error('offline'));
  await offlineRoleRejected;
  assert.equal(window.qa.pending.length, 1, 'Rol no consulta raíz sin permiso remoto');

  console.log('PASS: selector, Workspace y rol exigen membresía inicial de servidor antes de leer raíces (simulados).');
  console.log('PASS: selector A/B revalida membresías en servidor, bloquea revocación, cambio de rol, fallo de red y UID obsoleto (simulado).');
  console.log('PASS: lista, OWNER/raíz, revalidación tras revocación y negocio individual aislados por UID/tenant/rol/sesión (Firestore simulado).');
} finally {
  window.close();
}

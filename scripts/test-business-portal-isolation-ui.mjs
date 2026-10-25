// React real en jsdom; frontera de Auth y Firestore simulada. Sin cuentas ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/adminStorage': 'export const loginStaff = () => {};',
  '../../lib/restaurantCore': 'export const CALIENTITO_TENANT = {branding:{restaurantName:"Calientito"},assistant:{name:"Tita"}};',
  '../../lib/firebase': [
    'export const auth = {};',
    'export function subscribeToAuth(callback) {',
    '  window.qa.authListener = callback;',
    '  callback(null);',
    '  return () => {};',
    '}',
  ].join('\n'),
  'firebase/auth': 'export async function sendPasswordResetEmail() {}',
  '../../lib/businessAuthService': [
    'export function getBusinessesForUser(uid) {',
    '  window.qa.reads.push(uid);',
    '  return new Promise((resolve, reject) => window.qa.pending.push({uid, resolve, reject}));',
    '}',
    'export function isPlatformAdmin(uid) {',
    '  return new Promise((resolve, reject) => window.qa.adminPending.push({uid, resolve, reject}));',
    '}',
    'export async function loginBusinessOwner() {}',
    'export async function logoutBusinessOwner() {}',
  ].join('\n'),
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: root, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessPortal} from './src/components/platform/BusinessPortal';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.unmount = () => root.unmount();",
    "root.render(<BusinessPortal />);",
  ].join('\n')},
  plugins: [{name: 'mock-auth-and-firestore', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/BusinessPortal.tsx') && Object.hasOwn(mocks, args.path)) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url: 'http://localhost/', runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
});
const {window} = dom;
window.qa = {pending: [], adminPending: [], reads: []};
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
const document = window.document;
const waitFor = async (condition, message) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
const business = (id, label) => ({
  restaurantId: id,
  branding: {restaurantName: label, publicSlug: id},
});
const pending = (uid, index = 0) => window.qa.pending.filter(item => item.uid === uid)[index];
const adminPending = (uid, index = 0) => window.qa.adminPending.filter(item => item.uid === uid)[index];
const emit = uid => window.qa.authListener(uid ? {uid, email: uid + '@example.test'} : null);
const visible = name => document.body.textContent.includes(name);

try {
  window.eval(bundle.outputFiles[0].text);
  await waitFor(() => !!window.qa.authListener, 'Auth subscription missing');
  emit('owner-a');
  await waitFor(() => !!pending('owner-a') && !!adminPending('owner-a'), 'A reads missing');

  // Aún pendiente A, se inicia la sesión B. Respuestas A no deben entrar en B.
  emit('owner-b');
  await waitFor(() => !!pending('owner-b') && !!adminPending('owner-b'), 'B reads missing');
  pending('owner-a').resolve([business('tenant-a', 'Negocio A de prueba')]);
  adminPending('owner-a').resolve(true);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(visible('Negocio A de prueba'), false, 'No reutilizar negocios de A en sesión B');
  assert.equal(button('Super Admin'), undefined, 'No reutilizar permisos de administrador de A');
  pending('owner-b').resolve([business('tenant-b', 'Negocio B de prueba')]);
  adminPending('owner-b').resolve(false);
  await waitFor(() => visible('Negocio B de prueba'), 'B business not displayed');
  assert.equal(visible('Negocio A de prueba'), false);
  assert.equal(button('Super Admin'), undefined);

  // El cierre de sesión oculta inmediatamente el tenant anterior.
  emit(null);
  await waitFor(() => visible('Acceso para negocios'), 'Sign out must return to login');
  assert.equal(visible('Negocio B de prueba'), false);

  // Error de lectura: no aparentar que la cuenta carece de negocios.
  emit('owner-a');
  await waitFor(() => !!pending('owner-a', 1), 'Second A read missing');
  pending('owner-a', 1).reject({code: 'permission-denied'});
  adminPending('owner-a', 1).resolve(true);
  await waitFor(() => !!button('Reintentar carga de negocios'), 'Failure must offer retry');
  assert.equal(visible('Negocio B de prueba'), false);
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('permission-denied'));
  button('Reintentar carga de negocios').click();
  await waitFor(() => !!pending('owner-a', 2), 'Retry must start new read');
  pending('owner-a', 2).resolve([business('tenant-a', 'Negocio A de prueba')]);
  adminPending('owner-a', 2).resolve(true);
  await waitFor(() => visible('Negocio A de prueba'), 'Retry must recover business A');
  await waitFor(() => !!button('Super Admin'), 'Admin badge must be resolved for current UID');
  assert.equal(button('Reintentar carga de negocios'), undefined);

  // Al cambiar de una sesión cargada, no renderizar ni un instante sus tarjetas.
  emit('owner-b');
  await waitFor(() => !!pending('owner-b', 1), 'Second B read missing');
  assert.equal(visible('Negocio A de prueba'), false, 'Old cards must be hidden while B loads');
  assert.equal(button('Super Admin'), undefined, 'Old admin role must be hidden while B loads');
  pending('owner-b', 1).resolve([business('tenant-b', 'Negocio B de prueba')]);
  adminPending('owner-b', 1).resolve(false);
  await waitFor(() => visible('Negocio B de prueba'), 'B must load again');
  assert.deepEqual(window.qa.reads, ['owner-a', 'owner-b', 'owner-a', 'owner-a', 'owner-b']);
  assert.deepEqual(errors, [], 'No React errors');
  console.log('PASS: cambio de UID, respuestas obsoletas, cierre, error/reintento y permisos de admin aislados (React + jsdom; sin Firebase).');
} finally {
  window.qa.unmount?.();
  window.close();
}

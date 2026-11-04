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
    'export const auth = window.qa.auth;',
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
    "import {PreviewInterfaceNavigator} from './src/components/platform/PreviewInterfaceNavigator';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.unmount = () => root.unmount();",
    "root.render(<PreviewInterfaceNavigator />);",
  ].join('\n')},
  plugins: [{name: 'mock-auth-and-firestore', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/PreviewInterfaceNavigator.tsx') && Object.hasOwn(mocks, args.path)) {
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
window.qa = {pending: [], adminPending: [], reads: [], auth: {currentUser: null}};
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
const emit = uid => { window.qa.auth.currentUser = uid ? {uid} : null; window.qa.authListener(window.qa.auth.currentUser); };
const visible = name => document.body.textContent.includes(name);

try {
  window.eval(bundle.outputFiles[0].text);
  await waitFor(() => !!window.qa.authListener, 'Auth missing');
  assert.equal(visible('Probar interfaces'), false);
  emit('admin-a');
  await waitFor(() => !!adminPending('admin-a'), 'Admin check missing');
  emit('owner-b');
  await waitFor(() => !!adminPending('owner-b'), 'Owner check missing');
  adminPending('admin-a').resolve(true);
  adminPending('owner-b').resolve(false);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(visible('Probar interfaces'), false, 'Stale admin response must not expose controls');
  emit('admin-c');
  await waitFor(() => !!adminPending('admin-c'), 'New admin check missing');
  adminPending('admin-c').resolve(true);
  await waitFor(() => !!button('Probar interfaces'), 'Verified admin needs navigation');
  button('Probar interfaces').click();
  await waitFor(() => visible('Mi panel de plataforma'), 'Admin dashboard shortcut missing');
  emit(null);
  await waitFor(() => !visible('Probar interfaces') && !visible('Mi panel de plataforma'), 'Logout must hide navigation');
  assert.deepEqual(errors, []);
  console.log('PASS: interfaces ocultas para visitantes/propietarios, cambio de cuenta, administrador y cierre.');
} finally {
  window.qa.unmount?.();
  window.close();
}

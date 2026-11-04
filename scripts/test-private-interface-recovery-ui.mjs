/**
 * React/jsdom: enlace #mis-interfaces siempre recuperable, menú solo Super Admin.
 * Firebase mock; sin credenciales, PIN ni datos reales.
 */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/firebase': [
    'export const auth = window.qa.auth;',
    'export function subscribeToAuth(cb) { window.qa.authListener = cb; cb(null); return () => {}; }',
  ].join('\n'),
  '../../lib/businessAuthService': [
    'export function isPlatformAdmin(uid) {',
    ' return new Promise((resolve, reject) => window.qa.authRequests.push({uid, resolve, reject}));',
    '}',
  ].join('\n'),
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: root, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {PrivateInterfaceAccess} from './src/components/platform/PrivateInterfaceAccess';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.unmount = () => root.unmount();",
    "root.render(<PrivateInterfaceAccess />);",
  ].join('\n')},
  plugins: [{name: 'mock-firebase-auth', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/PrivateInterfaceAccess.tsx') &&
          Object.hasOwn(mocks, args.path)) return {path: args.path, namespace: 'mock'};
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args => ({
      contents: mocks[args.path], loader: 'js',
    }));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url: 'http://localhost/#mis-interfaces', runScripts: 'outside-only',
  virtualConsole: new VirtualConsole(),
});
const {window} = dom;
window.qa = {auth: {currentUser: null}, authRequests: []};
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
const text = () => window.document.body.textContent;
const links = () => [...window.document.querySelectorAll('a')];
const waitFor = async (f, why) => {
  for(let i=0;i<200;i++) {
    if(f())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(why);
};
const emit = uid => {
  window.qa.auth.currentUser = uid ? {uid} : null;
  window.qa.authListener(window.qa.auth.currentUser);
};
const pending = uid => window.qa.authRequests.find(x => x.uid === uid);
const menuHas = fragment => links().some(x => x.getAttribute('href') === fragment);

try {
  window.eval(bundle.outputFiles[0].text);
  await waitFor(() => window.qa.authListener, 'No Auth observer');
  await waitFor(() => text().includes('Iniciar sesión'), 'El enlace privado exige login');
  assert.equal(menuHas('#admin'), false, 'Visitante no recibe acceso interno Calientito');
  emit('owner-not-platform');
  await waitFor(() => pending('owner-not-platform'), 'Comprobación de propietario');
  pending('owner-not-platform').resolve(false);
  await waitFor(() => text().includes('no tiene un permiso Super Admin'), 'Un propietario no es Super Admin');
  assert.equal(menuHas('#admin'), false);
  emit('admin-old');
  await waitFor(() => pending('admin-old'), 'Comprobación admin');
  emit('user-new');
  await waitFor(() => pending('user-new'), 'Comprobación después de cambio de cuenta');
  pending('admin-old').resolve(true);
  pending('user-new').resolve(false);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(menuHas('#admin'), false, 'Respuesta vieja no autoriza el nuevo usuario');
  emit('admin-gio');
  await waitFor(() => pending('admin-gio'), 'Comprobación de plataforma');
  pending('admin-gio').resolve(true);
  await waitFor(() => menuHas('#admin'), 'Super Admin recupera administración Calientito');
  assert.equal(menuHas('#negocio/alo-restaurante'), true);
  assert.equal(menuHas('#platform-admin'), true);
  assert.equal(menuHas('#business-new'), true);
  emit(null);
  await waitFor(() => !menuHas('#admin'), 'Cerrar sesión oculta accesos privados');
  assert.deepEqual(errors, []);
  console.log('PASS: enlace privado recuperable, PIN separado, denegación a público/propietario, cambio de UID y cierre sin fuga.');
} finally {
  window.qa.unmount?.();
  window.close();
}

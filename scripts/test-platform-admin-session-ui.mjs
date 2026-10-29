// Panel React real con dos cuentas ficticias; Auth y servicio simulados, sin Firebase real.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/firebase': [
    'export const auth = {currentUser:null};',
    'export function subscribeToAuth(callback) {',
    '  window.qa.emit = uid => {auth.currentUser = uid ? {uid} : null; callback(auth.currentUser);};',
    '  callback(null);',
    '  return () => {};',
    '}',
  ].join('\n'),
  '../../lib/businessAuthService': [
    'export function isPlatformAdmin(uid) {',
    '  return new Promise((resolve, reject) => window.qa.admin.push({uid, resolve, reject}));',
    '}',
    'export function getAllBusinesses(uid) {',
    '  return new Promise((resolve, reject) => window.qa.lists.push({uid, resolve, reject}));',
    '}',
  ].join('\n'),
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: root, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {PlatformAdminPanel} from './src/components/platform/PlatformAdminPanel';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.unmount = () => root.unmount();",
    "root.render(<PlatformAdminPanel />);",
  ].join('\n')},
  plugins: [{name: 'mock-admin-service', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/PlatformAdminPanel.tsx') && Object.hasOwn(mocks, args.path)) {
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
window.qa = {admin: [], lists: []};
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
const document = window.document;
const waitFor = async (condition, label) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(label);
};
const tenant = (id, label) => ({
  restaurantId: id, businessType: 'restaurant',
  branding: {restaurantName: label, publicSlug: id},
});
const visible = label => document.body.textContent.includes(label);
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
const admin = (uid, index = 0) => window.qa.admin.filter(x => x.uid === uid)[index];
const list = (uid, index = 0) => window.qa.lists.filter(x => x.uid === uid)[index];
try {
  window.eval(bundle.outputFiles[0].text);
  await waitFor(() => !!window.qa.emit, 'Auth subscription missing');
  window.qa.emit('admin-a');
  await waitFor(() => !!admin('admin-a'), 'A admin check missing');
  admin('admin-a').resolve(true);
  await waitFor(() => !!list('admin-a'), 'A global read missing');

  // A estaba leyendo negocios; B no puede recibir su respuesta tardía.
  window.qa.emit('outsider-b');
  await waitFor(() => !!admin('outsider-b'), 'B admin check missing');
  list('admin-a').resolve([tenant('tenant-a', 'Solo Negocio A')]);
  admin('outsider-b').resolve(false);
  await waitFor(() => visible('Acceso restringido'), 'B must be denied');
  assert.equal(visible('Solo Negocio A'), false, 'No filtrar datos globales de A a B');
  assert.equal(button('Actualizar'), undefined);

  // Volver a A: una consulta nueva debe resolver permisos y lista.
  window.qa.emit('admin-a');
  await waitFor(() => !!admin('admin-a', 1), 'Second A admin check missing');
  admin('admin-a', 1).resolve(true);
  await waitFor(() => !!list('admin-a', 1), 'Second A list missing');
  list('admin-a', 1).resolve([tenant('tenant-a', 'Solo Negocio A')]);
  await waitFor(() => visible('Solo Negocio A'), 'A must display own admin data');

  // Actualizar oculta el listado anterior de inmediato y descarta errores
  // de la consulta anterior; un fallo no debe fingir una lista vacía válida.
  button('Actualizar').click();
  await waitFor(() => !!admin('admin-a', 2), 'Refresh admin check missing');
  assert.equal(visible('Solo Negocio A'), false, 'No mostrar datos previos durante refresco');
  admin('admin-a', 2).resolve(true);
  await waitFor(() => !!list('admin-a', 2), 'Refresh list missing');
  list('admin-a', 2).reject(new Error('permission-denied'));
  await waitFor(() => !!button('Reintentar carga de plataforma'), 'Failure must be recoverable');
  assert.equal(visible('Solo Negocio A'), false, 'No conservar datos tras error');

  button('Reintentar carga de plataforma').click();
  await waitFor(() => !!admin('admin-a', 3), 'Retry admin check missing');
  admin('admin-a', 3).resolve(true);
  await waitFor(() => !!list('admin-a', 3), 'Retry list missing');
  list('admin-a', 3).resolve([tenant('tenant-a', 'Solo Negocio A')]);
  await waitFor(() => visible('Solo Negocio A'), 'Retry must recover');

  // Una cuenta distinta no debe ver el listado ni un fotograma mientras carga.
  window.qa.emit('outsider-b');
  assert.equal(visible('Solo Negocio A'), false, 'No mostrar datos A durante cambio B');
  await waitFor(() => !!admin('outsider-b', 1), 'Second B check missing');
  admin('outsider-b', 1).resolve(false);
  await waitFor(() => visible('Acceso restringido'), 'B denied again');

  // Cerrar sesión tampoco debe mantener la lista global.
  window.qa.emit(null);
  await waitFor(() => visible('Acceso restringido'), 'Sign out restricted');
  assert.equal(visible('Solo Negocio A'), false);
  assert.deepEqual(errors, [], 'No React runtime errors');
  console.log('PASS: panel Super Admin sin filtración entre A/B, refresh fail-closed, error/reintento y cierre (React/jsdom; backend simulado).');
} finally {
  window.qa.unmount?.();
  window.close();
}

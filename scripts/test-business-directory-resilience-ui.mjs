// Paso 1: directorio React real en jsdom; Firestore simulado, sin escrituras ni red.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': [
    'export const collection = (_db, path) => ({path});',
    'export const where = (...args) => args;',
    'export const query = (...args) => args;',
    'export const getDocs = () => new Promise((resolve, reject) => window.qa.pending.push({resolve, reject}));',
  ].join('\\n'),
  '../../lib/firebase': 'export const db = {};',
};
const bundle = await build({
  absWorkingDir: rootDir, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: rootDir, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessDirectory} from './src/components/platform/BusinessDirectory';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.mount = () => root.render(<BusinessDirectory />);",
    "window.qa.unmount = () => root.unmount();",
  ].join('\\n')},
  plugins: [{name: 'mock-public-directory', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/BusinessDirectory.tsx') && Object.hasOwn(mocks, args.path)) {
        return {path: args.path, namespace: 'mock'};
      }
    });
    build.onLoad({filter: /.*/, namespace: 'mock'}, args =>
      ({contents: mocks[args.path], loader: 'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url: 'https://example.test/#explorar', runScripts: 'outside-only',
  virtualConsole: new VirtualConsole(),
});
const {window} = dom;
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
window.qa = {pending: []};
const document = window.document;
const visible = value => document.body.textContent.includes(value);
const waitFor = async (predicate, message) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const row = (id, data) => ({id, data: () => data});
const profile = (id, name, branding = {}) => ({
  businessId: id, restaurantId: id, published: true, businessType: 'restaurant',
  branding: {restaurantName: name, publicSlug: id, ...branding},
});
const respond = (index, docs) => window.qa.pending[index].resolve({docs});
const retry = () => [...document.querySelectorAll('button')]
  .find(button => button.textContent.trim() === 'Reintentar directorio');
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.mount();
  await waitFor(() => window.qa.pending.length === 1, 'Debe consultar fichas públicas');
  window.qa.pending[0].reject(Object.assign(new Error('Sin permiso de lectura'), {code: 'permission-denied'}));
  await waitFor(() => !!document.querySelector('[role="alert"]') && !!retry(),
    'Error de lectura debe mostrar Reintentar');
  assert(visible('Restaurante Calientito'), 'El error no debe dejar pantalla en blanco');
  retry().click();
  await waitFor(() => window.qa.pending.length === 2, 'Reintento tras error');
  respond(1, [
    row('tenant-a', profile('tenant-a', 'Ficticio A', {
      description: {private: 'NO RENDERIZAR'}, coverUrl: {bad: true}, tagline: 'Menú A',
    })),
    row('tenant-b', profile('tenant-b', 'Ficticio B')),
    row('broken', {businessId: 'broken', restaurantId: 'broken', published: true}),
    row('tenant-foreign', profile('tenant-a', 'Perfil de A bajo ID ajeno')),
    row('unpublished', {...profile('unpublished', 'No publicado'), published: false}),
    row('alo-restaurante', profile('tenant-b', 'Suplantación Calientito')),
  ]);
  await waitFor(() => visible('Ficticio A') && visible('Ficticio B') && !!document.querySelector('[role="status"]'),
    'A/B válidos deben verse y las fichas corruptas deben notificarse');
  assert(!visible('Perfil de A bajo ID ajeno'), 'No presentar ficha cruzada');
  assert(!visible('No publicado'), 'No presentar ficha no publicada');
  assert(!visible('Suplantación Calientito'), 'No sustituir Calientito con ID ajeno');
  assert(!visible('NO RENDERIZAR'), 'No presentar objetos ni campos inesperados');
  assert.equal(document.querySelectorAll('button.group').length, 3,
    'Solo A, B y Calientito deben ofrecerse como tarjetas');
  const cardA = [...document.querySelectorAll('button.group')].find(button => button.textContent.includes('Ficticio A'));
  assert(cardA, 'Debe existir tarjeta de A');
  cardA.click();
  assert.equal(window.location.hash, '#negocio/tenant-a', 'Navegación por ID comprobado');
  retry().click();
  await waitFor(() => window.qa.pending.length === 3, 'Reintento tras perfil corrupto');
  respond(2, [row('tenant-a', profile('tenant-a', 'Ficticio A')),
    row('tenant-b', profile('tenant-b', 'Ficticio B'))]);
  await waitFor(() => !document.querySelector('[role="status"]') && visible('Ficticio B'),
    'Recuperación limpia sin advertencia obsoleta');
  assert.equal(document.querySelectorAll('button.group').length, 3);
  assert.equal(errors.length, 0, 'Ningún error de render React');
  console.log('PASS: directorio público React A/B, filas malformadas, identidad cruzada, error/reintento y navegación (Firestore simulado).');
} finally {
  window.qa.unmount?.();
  window.close();
}

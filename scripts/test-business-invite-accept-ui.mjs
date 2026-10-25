// Componente React real en jsdom. Invitaciones y Auth simulados: sin Firebase ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/firebase': 'export const auth = {get currentUser() {return window.qa.user;}};',
  'firebase/auth': [
    'export function onAuthStateChanged(_auth, callback) {',
    '  window.qa.authListener = callback; callback(window.qa.user); return () => {};',
    '}',
    'export async function createUserWithEmailAndPassword() {throw new Error("No crear cuentas reales en QA");}',
    'export async function sendEmailVerification() {}',
    'export async function signInWithEmailAndPassword() {}',
    'export async function signOut() {}',
  ].join('\n'),
  '../../lib/businessInvitesService': [
    'export function previewBusinessInvite(token) {',
    '  return new Promise((resolve, reject) => window.qa.previews.push({token, resolve, reject}));',
    '}',
    'export function acceptBusinessInvite(token) {',
    '  return new Promise((resolve, reject) => window.qa.accepts.push({token, resolve, reject}));',
    '}',
  ].join('\n'),
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: root, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessInviteAccept} from './src/components/platform/BusinessInviteAccept';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.render = token => root.render(<BusinessInviteAccept token={token} />);",
    "window.qa.unmount = () => root.unmount();",
  ].join('\n')},
  plugins: [{name: 'mock-invites-and-auth', setup(build) {
    build.onResolve({filter: /.*/}, args => {
      if (args.importer.endsWith('/BusinessInviteAccept.tsx') && Object.hasOwn(mocks, args.path)) {
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
const document = window.document;
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
const user = (uid, verified = true) => ({
  uid, email: uid + '@example.test', emailVerified: verified,
  reload: async () => {}, getIdToken: async () => 'fake-token',
});
window.qa = {user: user('employee-b'), previews: [], accepts: []};
const waitFor = async (condition, message) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
};
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label);
const visible = value => document.body.textContent.includes(value);
const preview = (token, businessName) => ({businessName, role: 'KITCHEN', emailHint: 'e***@example.test', expiresAt: Date.now() + 3600000});

try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('invite-a');
  await waitFor(() => window.qa.previews.length === 1, 'A preview not requested');
  window.qa.render('invite-b');
  await waitFor(() => window.qa.previews.length === 2, 'B preview not requested');
  assert.equal(button('Aceptar invitación'), undefined, 'No aceptar sin vista previa vigente');

  // Respuesta tardía de A no puede presentar ni habilitar la invitación A sobre B.
  window.qa.previews[0].resolve(preview('invite-a', 'Negocio A confidencial'));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(visible('Negocio A confidencial'), false);
  assert.equal(button('Aceptar invitación'), undefined);

  window.qa.previews[1].reject(new Error('Fallo de red simulado'));
  await waitFor(() => !!button('Reintentar consulta'), 'El error debe permitir reintentar');
  assert.equal(button('Aceptar invitación'), undefined);
  button('Reintentar consulta').click();
  await waitFor(() => window.qa.previews.length === 3, 'No reintentó consulta B');
  assert.equal(window.qa.previews[2].token, 'invite-b');
  window.qa.previews[2].resolve(preview('invite-b', 'Negocio B de prueba'));
  await waitFor(() => visible('Negocio B de prueba') && !!button('Aceptar invitación'), 'B no cargó');
  assert.equal(visible('Negocio A confidencial'), false);

  // Dos clics consecutivos antes del render no generan dos aceptaciones.
  button('Aceptar invitación').click();
  button('Aceptar invitación').click();
  await waitFor(() => window.qa.accepts.length === 1, 'No se inició la aceptación');
  assert.equal(window.qa.accepts[0].token, 'invite-b');
  assert.equal(window.qa.accepts.length, 1, 'Se aceptó dos veces la misma invitación');

  // Si la ruta cambia durante una aceptación, su resultado anterior no redirige.
  window.qa.render('invite-c');
  await waitFor(() => window.qa.previews.length === 4, 'C preview not requested');
  window.qa.accepts[0].resolve({businessId: 'tenant-b'});
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.notEqual(window.location.hash, '#business/tenant-b', 'No navegar a un negocio de una invitación anterior');
  assert.equal(visible('Negocio B de prueba'), false);
  window.qa.previews[3].resolve(preview('invite-c', 'Negocio C de prueba'));
  await waitFor(() => visible('Negocio C de prueba'), 'C preview not displayed');
  button('Aceptar invitación').click();
  await waitFor(() => window.qa.accepts.length === 2, 'C acceptance missing');
  assert.equal(window.qa.accepts[1].token, 'invite-c');
  window.qa.accepts[1].resolve({businessId: 'tenant-c'});
  await waitFor(() => window.location.hash === '#business/tenant-c', 'C acceptance must navigate to C');

  // La cuenta no verificada no debe llamar al API de aceptación.
  window.qa.user = user('employee-unverified', false);
  window.qa.authListener(window.qa.user);
  window.qa.render('invite-d');
  await waitFor(() => window.qa.previews.length === 5, 'D preview not requested');
  window.qa.previews[4].resolve(preview('invite-d', 'Negocio D de prueba'));
  await waitFor(() => visible('Negocio D de prueba') && !!button('Aceptar invitación'), 'D preview missing');
  button('Aceptar invitación').click();
  await waitFor(() => visible('abre el correo de verificación'), 'Debe pedir verificación de correo');
  assert.equal(window.qa.accepts.length, 2, 'No enviar aceptación sin verificar');
  assert.deepEqual(errors, [], 'No React errors');
  console.log('PASS: token aislado, respuesta tardía, error/reintento, doble clic, navegación obsoleta y correo sin verificar (React + jsdom; sin Firebase).');
} finally {
  window.qa.unmount?.();
  window.close();
}

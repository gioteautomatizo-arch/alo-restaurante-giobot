// Puente de interfaz REAL (React/jsdom) a servicios/API REALES en emuladores.
// Los módulos de Firebase no se empaquetan en jsdom: cada operación se delega
// al SDK Auth/Firestore y al servidor Express locales del proceso llamador.
// Nunca utiliza cuentas, URLs, reglas desplegadas ni datos de producción.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/businessInvitesService': [
    'export const BUSINESS_INVITES_ENABLED = true;',
    'export function listBusinessInvites(id) {return window.qa.bridge.listInvites(id);}',
    'export function createBusinessInvite(id,name,email,role) {window.qa.creates++;return window.qa.bridge.createInvite(id,name,email,role);}',
    'export function revokeBusinessInvite(id,inviteId) {return window.qa.bridge.revokeInvite(id,inviteId);}',
    'export function previewBusinessInvite(token) {return window.qa.bridge.previewInvite(token);}',
    'export function acceptBusinessInvite(token) {window.qa.accepts++;return window.qa.bridge.acceptInvite(token);}',
  ].join('\n'),
  '../../lib/businessEmployeeService': [
    'export const MANAGEABLE_EMPLOYEE_ROLES = ["ADMIN","MANAGER","CASHIER","WAITER","KITCHEN","EMPLOYEE"];',
    'export function canManageEmployeeRole(role,target) {return (role==="OWNER" || role==="ADMIN" || role==="SUPER_ADMIN") && MANAGEABLE_EMPLOYEE_ROLES.includes(target) || role==="MANAGER" && ["CASHIER","WAITER","KITCHEN","EMPLOYEE"].includes(target);}',
    'export function getRolePermissions() {return []; }',
    'export function listBusinessEmployees(id) {return window.qa.bridge.listEmployees(id);}',
    'export function createBusinessEmployee() {throw new Error("No crear cuentas desde esta prueba");}',
    'export function updateBusinessEmployee(id,userId,changes) {return window.qa.bridge.updateEmployee(id,userId,changes);}',
    'export function removeBusinessEmployee() {throw new Error("No retirar empleados desde esta prueba");}',
  ].join('\n'),
  '../../lib/firebase': 'export const auth = {get currentUser() {return window.qa.user;}};',
  'firebase/auth': [
    'export function onAuthStateChanged(_auth,callback) {callback(window.qa.user);return () => {}; }',
    'export async function createUserWithEmailAndPassword() {throw new Error("Solo Auth Emulator");}',
    'export async function sendEmailVerification() {throw new Error("Solo Auth Emulator");}',
    'export async function signInWithEmailAndPassword() {throw new Error("Solo Auth Emulator");}',
    'export async function signOut() {throw new Error("Solo Auth Emulator");}',
  ].join('\n'),
};
let bundlePromise;
function getBundle() {
  bundlePromise ??= build({
    absWorkingDir: rootDir, bundle: true, write: false, format: 'iife',
    platform: 'browser', define: {'process.env.NODE_ENV': '"development"'},
    stdin: {resolveDir: rootDir, loader: 'jsx', contents: [
      "import React from 'react';",
      "import {createRoot} from 'react-dom/client';",
      "import {BusinessEmployeesView} from './src/components/platform/BusinessEmployeesView';",
      "import {BusinessInviteAccept} from './src/components/platform/BusinessInviteAccept';",
      "const root = createRoot(document.getElementById('root'));",
      "window.qa.mountEmployees = (id,role='OWNER') => root.render(<BusinessEmployeesView businessId={id} managerRole={role} onBack={() => {}} />);",
      "window.qa.mountAccept = token => root.render(<BusinessInviteAccept token={token} />);",
      "window.qa.unmount = () => root.unmount();",
    ].join('\n')},
    plugins: [{name: 'emulator-ui-bridge', setup(plugin) {
      plugin.onResolve({filter: /.*/}, args => {
        if ((args.importer.endsWith('/BusinessEmployeesView.tsx')
            || args.importer.endsWith('/BusinessInviteAccept.tsx'))
            && Object.hasOwn(mocks, args.path)) {
          return {path: args.path, namespace: 'qa-bridge'};
        }
      });
      plugin.onLoad({filter: /.*/, namespace: 'qa-bridge'}, args => ({
        contents: mocks[args.path], loader: 'js',
      }));
    }}],
  });
  return bundlePromise;
}
async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 300; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail(message);
}
async function withView(bridge, user, callback) {
  const bundle = await getBundle();
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://example.test/#business',
    runScripts: 'outside-only', virtualConsole: new VirtualConsole(),
  });
  const {window} = dom;
  const errors = [];
  window.addEventListener('error', event => errors.push(event.error));
  window.qa = {bridge, user, creates: 0, accepts: 0};
  try {
    window.eval(bundle.outputFiles[0].text);
    const result = await callback(window, window.document);
    assert.deepEqual(errors, [], 'Sin errores de ejecución de React');
    return result;
  } finally {
    window.qa.unmount?.();
    window.close();
  }
}
const button = (document, label) => [...document.querySelectorAll('button')]
  .find(element => element.textContent.trim() === label);
function setInput(window, element, value) {
  assert(element, 'Falta campo de formulario');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
    .set.call(element, value);
  element.dispatchEvent(new window.Event('input', {bubbles: true}));
  element.dispatchEvent(new window.Event('change', {bubbles: true}));
}

export async function inspectEmployeesUI({businessId, bridge, forbiddenText}) {
  return withView(bridge, null, async (window, document) => {
    window.qa.mountEmployees(businessId);
    await waitFor(() => !!button(document, 'Invitar empleado')
      && !button(document, 'Invitar empleado').disabled, 'Equipo e invitaciones cargados');
    if (forbiddenText) {
      assert(!document.body.textContent.includes(forbiddenText),
        'No debe mostrarse información de otro negocio');
    }
    return document.body.textContent;
  });
}

export async function createInviteThroughEmployeesUI({
  businessId, name, email, role, bridge,
}) {
  return withView(bridge, null, async (window, document) => {
    window.qa.mountEmployees(businessId);
    await waitFor(() => !!button(document, 'Invitar empleado')
      && !button(document, 'Invitar empleado').disabled, 'Equipo e invitaciones cargados');
    button(document, 'Invitar empleado').click();
    await waitFor(() => !!document.querySelector('form'), 'Formulario de invitación');
    const form = document.querySelector('form');
    setInput(window, form.querySelector('input:not([type])'), name);
    setInput(window, form.querySelector('input[type="email"]'), email);
    const roleSelect = form.querySelector('select');
    assert(roleSelect, 'Selector de rol');
    roleSelect.value = role;
    roleSelect.dispatchEvent(new window.Event('change', {bubbles: true}));
    await waitFor(() => roleSelect.value === role, 'Rol solicitado');
    const submit = () => form.dispatchEvent(new window.Event('submit', {
      bubbles: true, cancelable: true,
    }));
    submit();
    submit();
    await waitFor(() => window.qa.creates === 1, 'Un solo envío de invitación');
    const linkSelector = 'input[aria-label="Enlace de invitación"]';
    await waitFor(() => !!document.querySelector(linkSelector),
      'Enlace creado por API local');
    assert.equal(window.qa.creates, 1, 'No duplicar invitaciones');
    const link = document.querySelector(linkSelector).value;
    const token = link.split('#invite/')[1];
    assert(token && token.length > 10, 'Token de invitación de prueba');
    await waitFor(() => document.body.textContent.includes(email),
      'Invitación aparece en lista tras refrescar');
    return token;
  });
}

export async function acceptInviteThroughUI({token, user, bridge, businessId}) {
  return withView(bridge, user, async (window, document) => {
    window.qa.mountAccept(token);
    await waitFor(() => !!button(document, 'Aceptar invitación'),
      'Vista previa y sesión del invitado');
    button(document, 'Aceptar invitación').click();
    button(document, 'Aceptar invitación').click();
    await waitFor(() => window.location.hash === '#business/' + businessId,
      'Aceptación real de invitación y redirección');
    assert.equal(window.qa.accepts, 1, 'La UI no duplica aceptaciones');
    return window.location.hash;
  });
}

export async function deactivateEmployeeThroughUI({businessId, name, bridge}) {
  return withView(bridge, null, async (window, document) => {
    window.qa.mountEmployees(businessId);
    await waitFor(() => document.body.textContent.includes(name)
      && !!button(document, 'Activo') && !button(document, 'Activo').disabled,
      'Empleado aceptado visible y administrable');
    button(document, 'Activo').click();
    await waitFor(() => !!button(document, 'Inactivo')
      && document.body.textContent.includes('Acceso bloqueado'),
      'Revocación efectiva y recarga de lista');
    assert(document.body.textContent.includes(name), 'Se conserva empleado inactivo');
  });
}

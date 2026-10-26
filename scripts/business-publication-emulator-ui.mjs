// Ejercita el botón REAL de BusinessWorkspace contra servicios Firebase SDK
// conectados por el proceso llamador a Auth/Firestore emulados.
// Los submódulos ajenos a publicación se sustituyen por componentes vacíos.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const components = [
  'BusinessActivityBell', 'BusinessQrPanel', 'BusinessSummaryTab',
  'BusinessShiftView', 'BusinessExpensesView', 'BusinessAuditView',
  'BusinessVaultView', 'BusinessVipPanel', 'BusinessLedgerView',
  'BusinessModuleToggles', 'BusinessBrandingSettings',
  'BusinessCatalogEditor', 'BusinessEmployeesView',
  'BusinessOperationsView', 'BusinessMenuImport',
  'BusinessReportsView', 'BusinessModulesView',
];
const mocks = {
  '../../lib/firebase': 'export function subscribeToAuth(callback) {callback(window.qa.user);return () => {}; }',
  '../../lib/businessAuthService': [
    'export function getBusinessForUser(uid,id) {return window.qa.bridge.getBusiness(uid,id);}',
    'export function getBusinessMembership(uid,id) {return window.qa.bridge.getMembership(uid,id);}',
  ].join('\n'),
  '../../lib/businessPublicProfileService': [
    'export function getBusinessPublicationStatus(id) {return window.qa.bridge.getStatus(id);}',
    'export function setBusinessPublication(id,tenant,published) {window.qa.writes++;return window.qa.bridge.setPublication(id,tenant,published);}',
    'export function syncPublicProfileIfNeeded(id,tenant) {return window.qa.bridge.syncPublic(id,tenant);}',
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
      "import {BusinessWorkspace} from './src/components/platform/BusinessWorkspace';",
      "const root = createRoot(document.getElementById('root'));",
      "window.qa.mount = id => root.render(<BusinessWorkspace key={id + ':' + window.qa.user.uid} businessId={id} />);",
      "window.qa.unmount = () => root.unmount();",
    ].join('\n')},
    plugins: [{name:'publication-ui-emulator-bridge',setup(plugin) {
      plugin.onResolve({filter:/.*/},args=>{
        if (!args.importer.endsWith('/BusinessWorkspace.tsx')) return;
        if (Object.hasOwn(mocks,args.path)) return {path:args.path,namespace:'qa-bridge'};
        if (args.path.startsWith('./') && components.includes(args.path.slice(2))) {
          return {path:args.path,namespace:'qa-component'};
        }
      });
      plugin.onLoad({filter:/.*/,namespace:'qa-bridge'},args=>({
        contents:mocks[args.path],loader:'js',
      }));
      plugin.onLoad({filter:/.*/,namespace:'qa-component'},args=>({
        contents:'export const ' + args.path.slice(2) + ' = () => null;',loader:'js',
      }));
    }}],
  });
  return bundlePromise;
}
async function waitFor(predicate,label) {
  for (let i=0;i<400;i++) {
    if (predicate()) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label);
}
function button(document,label) {
  return [...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);
}
async function withWorkspace({businessId,user,bridge},callback) {
  const bundle=await getBundle();
  const dom=new JSDOM('<div id="root"></div>',{
    url:'https://example.test/#business',runScripts:'outside-only',
    virtualConsole:new VirtualConsole(),
  });
  const {window}=dom;
  const errors=[];
  window.addEventListener('error',event=>errors.push(event.error));
  window.qa={user,bridge,writes:0};
  try {
    window.eval(bundle.outputFiles[0].text);
    window.qa.mount(businessId);
    const result=await callback(window,window.document);
    assert.deepEqual(errors,[],'Sin errores de ejecución React en publicación');
    return result;
  } finally {
    window.qa.unmount?.();
    window.close();
  }
}

// Un propietario publica desde el botón real y dos clicks inmediatos
// no envían dos escrituras al servicio Firebase.
export async function publishBusinessThroughUI({businessId,user,bridge}) {
  return withWorkspace({businessId,user,bridge},async(window,document)=>{
    await waitFor(()=>!!button(document,'Publicar mi negocio'),'Publicación disponible para OWNER');
    const publish=button(document,'Publicar mi negocio');
    publish.click();
    publish.click();
    await waitFor(()=>window.qa.writes===1,'Una escritura de publicación');
    await waitFor(()=>!!button(document,'Ocultar del directorio'),'Estado publicado en UI');
    assert(document.body.textContent.includes('Tu página ya está publicada en el directorio.'));
    assert.equal(window.qa.writes,1,'Doble pulsación no duplica publicación');
  });
}

// Otro propietario puede publicar y ocultar SU negocio; el estado del botón
// debe reflejar ambos cambios y no permitir un segundo envío concurrente.
export async function publishAndHideBusinessThroughUI({businessId,user,bridge}) {
  return withWorkspace({businessId,user,bridge},async(window,document)=>{
    await waitFor(()=>!!button(document,'Publicar mi negocio'),'B inicialmente oculto');
    const publish=button(document,'Publicar mi negocio');
    publish.click();
    publish.click();
    await waitFor(()=>!!button(document,'Ocultar del directorio'),'B publicado');
    assert.equal(window.qa.writes,1);
    const hide=button(document,'Ocultar del directorio');
    hide.click();
    hide.click();
    await waitFor(()=>!!button(document,'Publicar mi negocio'),'B oculto de nuevo');
    assert.equal(window.qa.writes,2,'Solo publicar y ocultar, sin duplicados');
    assert(document.body.textContent.includes('Tu página se ocultó del directorio público.'));
  });
}

// Un usuario ajeno no obtiene el botón aunque conozca el ID de A.
export async function assertForeignWorkspaceDeniedThroughUI({businessId,user,bridge}) {
  return withWorkspace({businessId,user,bridge},async(window,document)=>{
    await waitFor(()=>document.body.textContent.includes('No pudimos abrir este negocio'),
      'Acceso privado ajeno denegado en UI');
    assert(!button(document,'Publicar mi negocio'));
    assert(!button(document,'Ocultar del directorio'));
    assert.equal(window.qa.writes,0);
  });
}

// Un empleado válido puede abrir su espacio, pero no publicar.
export async function assertStaffCannotPublishThroughUI({businessId,user,bridge}) {
  return withWorkspace({businessId,user,bridge},async(window,document)=>{
    await waitFor(()=>document.body.textContent.includes('| Panel'),'Panel de empleado cargado');
    assert(!button(document,'Publicar mi negocio'));
    assert(!button(document,'Ocultar del directorio'));
    assert.equal(window.qa.writes,0);
  });
}

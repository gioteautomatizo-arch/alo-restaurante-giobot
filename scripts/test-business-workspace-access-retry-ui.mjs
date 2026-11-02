// React real en jsdom; Auth, negocio y membresías simulados. Sin Firebase ni datos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const components = [
  'BusinessActivityBell', 'BusinessQrPanel', 'BusinessShiftView', 'BusinessExpensesView',
  'BusinessAuditView', 'BusinessVaultView', 'BusinessVipPanel', 'BusinessLedgerView',
  'BusinessModuleToggles', 'BusinessBrandingSettings', 'BusinessCatalogEditor',
  'BusinessEmployeesView', 'BusinessOperationsView', 'BusinessMenuImport',
  'BusinessReportsView', 'BusinessModulesView',
];
const mocks = Object.fromEntries(components.map(name => ['./' + name, 'export const ' + name + ' = () => null;']));
Object.assign(mocks, {
  './BusinessSummaryTab': 'import React from "react"; export const BusinessSummaryTab = ({business}) => React.createElement("div", {"data-testid":"summary"}, business.branding.restaurantName);',
  '../../data/businessTemplates': 'export function getBusinessTemplateConfig() { return {capabilities:[],modules:[],name:"Prueba"}; }',
  '../../lib/restaurantCore': 'export function hasBusinessPermission(role) {return role==="OWNER";}',
  '../../lib/businessWorkspaceAccess': [
    'export function isWorkspaceAccessLoaded(id,ready,uid,resolved) {return ready && !!resolved && resolved.businessId===id && resolved.userId===(uid||"");}',
    'export function hasCurrentWorkspaceAccess(id,ready,uid,resolved,tenantId,role) {return !!uid && !!role && isWorkspaceAccessLoaded(id,ready,uid,resolved) && tenantId===id;}',
  ].join('\n'),
  '../../lib/businessVipPermissions': 'export const canAdministerBusinessVip = () => true;',
  '../../lib/businessAuthService': [
    'export function getBusinessForUser(uid,id) {return new Promise((resolve,reject)=>window.qa.reads.push({kind:"root",uid,id,resolve,reject}));}',
    'export function getBusinessMembership(uid,id) {return new Promise((resolve,reject)=>window.qa.reads.push({kind:"membership",uid,id,resolve,reject}));}',
  ].join('\n'),
  '../../lib/businessPublicProfileService': [
    'export async function getBusinessPublicationStatus() {return false;}',
    'export async function setBusinessPublication() {}',
    'export async function syncPublicProfileIfNeeded() {return false;}',
  ].join('\n'),
  '../../lib/firebase': [
    'export function subscribeToAuth(callback) {window.qa.authListener=callback; callback({uid:"owner-a",email:"a@example.test"}); return () => {}; }',
  ].join('\n'),
});
const bundle = await build({
  absWorkingDir: rootDir, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV':'"development"'},
  stdin: {resolveDir: rootDir, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessWorkspace} from './src/components/platform/BusinessWorkspace';",
    "const root=createRoot(document.getElementById('root'));",
    "window.qa.render=(id)=>root.render(<BusinessWorkspace businessId={id} />);",
    "window.qa.unmount=()=>root.unmount();",
  ].join('\n')},
  plugins: [{name:'workspace-access-mocks',setup(builder) {
    builder.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/BusinessWorkspace.tsx') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'mock'};
    });
    builder.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'jsx',resolveDir:rootDir}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url:'https://example.test/',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
});
const {window}=dom, document=window.document;
window.qa={reads:[]};
const errors=[];
window.addEventListener('error',event=>errors.push(event.error));
const waitFor=async (predicate,label)=>{
  for(let i=0;i<250;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label);
};
const read=(kind,uid,id,index=0)=>window.qa.reads.filter(x=>x.kind===kind && x.uid===uid && x.id===id)[index];
const button=label=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);
const summary=()=>document.querySelector('[data-testid="summary"]')?.textContent;
const tenant=(id)=>({restaurantId:id,branding:{restaurantName:'Negocio '+id},features:{pos:false},capabilities:[],businessType:'other'});
const member=(uid,id,active=true)=>({restaurantId:id,userId:uid,role:'OWNER',active});
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a');
  await waitFor(()=>!!read('root','owner-a','tenant-a') && !!read('membership','owner-a','tenant-a'),'Lecturas iniciales A');
  read('root','owner-a','tenant-a').reject(new Error('Sin conexión'));
  read('membership','owner-a','tenant-a').resolve(member('owner-a','tenant-a'));
  await waitFor(()=>!!button('Reintentar acceso'),'Fallo de red ofrece reintento');
  assert.equal(summary(),undefined,'No presentar datos privados después de error');
  button('Reintentar acceso').click();
  await waitFor(()=>!!read('root','owner-a','tenant-a',1),'Nueva lectura de raíz A');
  assert.equal(button('Reintentar acceso'),undefined,'El reintento limpia el error');
  read('root','owner-a','tenant-a',1).resolve(tenant('tenant-a'));
  read('membership','owner-a','tenant-a',1).resolve(member('owner-a','tenant-a'));
  await waitFor(()=>summary()==='Negocio tenant-a','A recupera Workspace');

  // Una lectura iniciada con otro UID no puede contaminar B.
  window.qa.authListener({uid:'owner-a2',email:'a2@example.test'});
  await waitFor(()=>!!read('root','owner-a2','tenant-a'),'Lectura pendiente A2');
  window.qa.render('tenant-b');
  window.qa.authListener({uid:'owner-b',email:'b@example.test'});
  await waitFor(()=>!!read('root','owner-b','tenant-b'),'Lectura B');
  assert.equal(summary(),undefined,'No mostrar A durante cambio de cuenta/tenant');
  read('root','owner-a2','tenant-a').resolve(tenant('tenant-a'));
  read('membership','owner-a2','tenant-a').resolve(member('owner-a2','tenant-a'));
  read('root','owner-b','tenant-b').resolve(tenant('tenant-b'));
  read('membership','owner-b','tenant-b').resolve(null);
  await waitFor(()=>document.body.textContent.includes('No tienes acceso a este negocio'),'B sin membresía debe quedar bloqueado');
  assert.equal(button('Reintentar acceso'),undefined,'Permiso denegado no se confunde con fallo transitorio');
  assert.equal(summary(),undefined,'Respuesta A tardía no restaura datos');

  window.qa.authListener({uid:'owner-b2',email:'b2@example.test'});
  await waitFor(()=>!!read('membership','owner-b2','tenant-b'),'Lectura B2');
  read('root','owner-b2','tenant-b').resolve(tenant('tenant-b'));
  read('membership','owner-b2','tenant-b').reject(new Error('Red temporal'));
  await waitFor(()=>!!button('Reintentar acceso'),'Fallo de membresía permite reintento');
  button('Reintentar acceso').click();
  await waitFor(()=>!!read('membership','owner-b2','tenant-b',1),'Nueva lectura de membresía B2');
  read('root','owner-b2','tenant-b',1).resolve(tenant('tenant-b'));
  read('membership','owner-b2','tenant-b',1).resolve(member('owner-b2','tenant-b'));
  await waitFor(()=>summary()==='Negocio tenant-b','B2 recupera Workspace');
  assert.equal(summary(),'Negocio tenant-b');

  // Un rechazo real de Firestore por permisos no es una desconexión.
  // No ofrecer reintentos indefinidos ni conservar el resumen anterior.
  window.qa.authListener({uid:'owner-denied',email:'denied@example.test'});
  await waitFor(()=>!!read('root','owner-denied','tenant-b'),'Lectura denegada de raíz');
  read('root','owner-denied','tenant-b').reject(Object.assign(new Error('Missing permissions'),{code:'permission-denied'}));
  read('membership','owner-denied','tenant-b').resolve(member('owner-denied','tenant-b'));
  await waitFor(()=>document.body.textContent.includes('No tienes permiso para acceder a este negocio'),
    'Firestore permission-denied no se presenta como fallo de red');
  assert.equal(button('Reintentar acceso'),undefined,'Denegación de Firestore sin reintento de red');
  assert.equal(summary(),undefined,'Sin resumen privado tras permiso denegado');

  window.qa.authListener({uid:'owner-unauth',email:'unauth@example.test'});
  await waitFor(()=>!!read('membership','owner-unauth','tenant-b'),'Lectura sin autenticación');
  read('root','owner-unauth','tenant-b').resolve(tenant('tenant-b'));
  read('membership','owner-unauth','tenant-b').reject(Object.assign(new Error('Expired token'),{code:'unauthenticated'}));
  await waitFor(()=>document.body.textContent.includes('No tienes permiso para acceder a este negocio'),
    'Auth caducada no se presenta como fallo de red');
  assert.equal(button('Reintentar acceso'),undefined,'Sin reintento de red con Auth caducada');
  assert.equal(summary(),undefined,'Sin resumen tras Auth caducada');

  assert.deepEqual(errors,[],'Sin errores React');
  console.log('PASS: Workspace distingue permiso/Auth denegados de fallos transitorios, reintenta red y aísla respuestas A/B/UID (React/jsdom; backend simulado).');
} finally {
  window.qa.unmount?.();
  window.close();
}

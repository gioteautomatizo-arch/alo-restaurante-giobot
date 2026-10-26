// React real + jsdom. Servicios Auth/Firestore simulados; no toca Firebase real.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const componentMocks = [
  'BusinessActivityBell', 'BusinessQrPanel', 'BusinessSummaryTab',
  'BusinessShiftView', 'BusinessExpensesView', 'BusinessAuditView',
  'BusinessVaultView', 'BusinessVipPanel', 'BusinessLedgerView',
  'BusinessModuleToggles', 'BusinessBrandingSettings', 'BusinessCatalogEditor',
  'BusinessEmployeesView', 'BusinessOperationsView', 'BusinessMenuImport',
  'BusinessReportsView', 'BusinessModulesView',
];
const mocks = Object.fromEntries(componentMocks.map(name => [
  './' + name, 'export const ' + name + ' = () => null;',
]));
Object.assign(mocks, {
  '../../data/businessTemplates': 'export function getBusinessTemplateConfig() { return {capabilities:[],modules:[],name:"Prueba"}; }',
  '../../lib/restaurantCore': 'export function hasBusinessPermission(role) {return role==="OWNER";}',
  '../../lib/businessWorkspaceAccess': [
    'export function isWorkspaceAccessLoaded(id,ready,uid,resolved) {return ready && !!resolved && resolved.businessId===id && resolved.userId===(uid||"");}',
    'export function hasCurrentWorkspaceAccess(id,ready,uid,resolved,tenantId,role) {return !!uid && !!role && isWorkspaceAccessLoaded(id,ready,uid,resolved) && tenantId===id;}',
  ].join('\n'),
  '../../lib/businessVipPermissions': 'export const canAdministerBusinessVip = () => true;',
  '../../lib/businessAuthService': [
    'export async function getBusinessForUser(uid,id) {return {restaurantId:id,branding:{restaurantName:"Negocio "+id},features:{pos:false},capabilities:[],businessType:"other"};}',
    'export async function getBusinessMembership(uid,id) {return {restaurantId:id,userId:uid,role:"OWNER",active:true};}',
  ].join('\n'),
  '../../lib/businessPublicProfileService': [
    'export function getBusinessPublicationStatus(id) {return new Promise((resolve,reject)=>window.qa.statusReads.push({id,resolve,reject}));}',
    'export function setBusinessPublication(id,tenant,published) {return new Promise((resolve,reject)=>window.qa.writes.push({id,tenant,published,resolve,reject}));}',
    'export async function syncPublicProfileIfNeeded() {return false;}',
  ].join('\n'),
  '../../lib/firebase': [
    'export function subscribeToAuth(callback) {window.qa.authListener=callback; callback({uid:"owner-a",email:"owner-a@example.test"}); return () => {}; }',
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
  plugins: [{name:'workspace-publication-mocks',setup(build) {
    build.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/BusinessWorkspace.tsx') && Object.hasOwn(mocks,args.path)) {
        return {path:args.path,namespace:'mock'};
      }
    });
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>',{
  url:'https://example.test/',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
});
const {window}=dom;
const document=window.document;
window.qa={statusReads:[],writes:[]};
const errors=[];
window.addEventListener('error',event=>errors.push(event.error));
const waitFor=async (predicate,label)=>{
  for(let i=0;i<250;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label);
};
const button=label=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);
const visible=text=>document.body.textContent.includes(text);
const read=(id,index=0)=>window.qa.statusReads.filter(x=>x.id===id)[index];
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a');
  await waitFor(()=>!!read('tenant-a'),'Primera lectura de publicación A');
  read('tenant-a').reject(new Error('Sin conexión'));
  await waitFor(()=>!!button('Reintentar publicación'),'Fallo de lectura debe permitir reintento');
  assert.equal(button('Publicar mi negocio'),undefined,'No permitir publicar sin conocer el estado actual');
  assert.equal(visible('No se pudo consultar la publicación'),true);

  button('Reintentar publicación').click();
  await waitFor(()=>!!read('tenant-a',1),'Nueva consulta A');
  read('tenant-a',1).resolve(false);
  await waitFor(()=>!!button('Publicar mi negocio') && !button('Publicar mi negocio').disabled,'A listo para publicar');
  const publishA=button('Publicar mi negocio');
  publishA.click();
  publishA.click();
  await waitFor(()=>window.qa.writes.length===1,'Dos pulsaciones no deben escribir dos veces');
  assert.equal(window.qa.writes[0].id,'tenant-a');
  assert.equal(window.qa.writes[0].published,true);

  // La petición A queda pendiente mientras se abre otro negocio y otra cuenta.
  window.qa.render('tenant-b');
  window.qa.authListener({uid:'owner-b',email:'owner-b@example.test'});
  await waitFor(()=>!!read('tenant-b'),'Lectura B');
  read('tenant-b').resolve(false);
  await waitFor(()=>!!button('Publicar mi negocio') && !button('Publicar mi negocio').disabled,'B listo');
  window.qa.writes[0].resolve();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(visible('Tu página ya está publicada en el directorio.'),false,'Éxito tardío de A no debe mostrarse en B');
  assert.equal(visible('No aparece en el directorio'),true,'B conserva su propio estado');
  assert.equal(button('Ocultar del directorio'),undefined,'A no puede marcar B como publicado');

  button('Publicar mi negocio').click();
  await waitFor(()=>window.qa.writes.length===2,'Publicación B independiente');
  assert.equal(window.qa.writes[1].id,'tenant-b');
  window.qa.writes[1].resolve();
  await waitFor(()=>visible('Tu página ya está publicada en el directorio.'),'Confirmación B');
  assert.ok(button('Ocultar del directorio'),'B publicado');

  // Una consulta de A que llegue tarde no puede sustituir el estado ya leído de B.
  window.qa.authListener({uid:'owner-a',email:'owner-a@example.test'});
  window.qa.render('tenant-a');
  await waitFor(()=>!!read('tenant-a',2),'Nueva lectura A');
  window.qa.render('tenant-b');
  window.qa.authListener({uid:'owner-b',email:'owner-b@example.test'});
  await waitFor(()=>!!read('tenant-b',1),'Nueva lectura B');
  read('tenant-a',2).resolve(true);
  read('tenant-b',1).resolve(false);
  await waitFor(()=>visible('No aparece en el directorio'),'B no debe heredar el estado A');
  assert.equal(button('Ocultar del directorio'),undefined);
  assert.deepEqual(errors,[],'Sin errores React');
  console.log('PASS: reintento de publicación, doble clic, respuestas obsoletas y aislamiento por UID/tenant (React/jsdom; Firebase simulado).');
} finally {
  window.qa.unmount?.();
  window.close();
}

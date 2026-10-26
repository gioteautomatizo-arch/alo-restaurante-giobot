// Editor React real en jsdom con catálogo simulado. No lee ni escribe Firebase.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/menuImagesService': 'export async function uploadMenuImage() {return "test-image";}',
  './BusinessMenuPasteImport': 'export const BusinessMenuPasteImport = () => null;',
  '../../lib/businessCatalogService': [
    'export const createCatalogItemId = name => name;',
    'export const ensureUniqueIds = items => items;',
    'export function subscribeToBusinessCatalog(businessId, callback, onError) {',
    '  const entry = {businessId,callback,onError,active:true};',
    '  window.qa.subscriptions.push(entry);',
    '  return () => {entry.active=false;};',
    '}',
    'export async function saveBusinessCatalog(businessId, items) {window.qa.writes.push({businessId,items});}',
  ].join('\n'),
  '../../data/businessCatalogTemplates': 'export const getBusinessCatalogTemplate = () => null;',
  '../../lib/businessAuthService': 'export async function getBusinessForUser() {return {businessType:"restaurant"};}',
  '../../lib/firebase': 'export function subscribeToAuth(callback) {callback(null);return () => {};}', 
};
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV':'"development"'},
  stdin: {resolveDir: root, loader:'jsx', contents:[
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessCatalogEditor} from './src/components/platform/BusinessCatalogEditor';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.render = id => root.render(<BusinessCatalogEditor businessId={id} businessName={id} onBack={() => {}} />);",
    "window.qa.unmount = () => root.unmount();",
  ].join('\n')},
  plugins:[{name:'mock-catalog-editor',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if (args.importer.endsWith('/BusinessCatalogEditor.tsx') && Object.hasOwn(mocks,args.path)) {
        return {path:args.path,namespace:'mock'};
      }
    });
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url:'http://localhost/',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
});
const {window} = dom;
const document = window.document;
window.qa = {subscriptions:[],writes:[]};
const errors = [];
window.addEventListener('error',e=>errors.push(e.error));
const waitFor = async (condition,label) => {
  for(let i=0;i<200;i++){
    if(condition()) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label);
};
const button = label => [...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);
const visible = text => document.body.textContent.includes(text) || [...document.querySelectorAll('input')].some(input => input.value === text);
const catalog = name => ({items:[{
  id:name,name,description:'',category:'General',price:25,available:true,sortOrder:10,
}]});
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a');
  await waitFor(()=>window.qa.subscriptions.length===1,'Falta suscripción A');
  window.qa.subscriptions[0].onError({code:'permission-denied'});
  await waitFor(()=>!!button('Reintentar catálogo'),'Error debe permitir reintentar');
  assert.equal(button('Guardar catálogo'),undefined,'Error no debe permitir sobrescribir menú con lista vacía');
  assert.equal(window.qa.writes.length,0);
  assert.ok(document.querySelector('[role="alert"]'),'Error visible y accesible');

  button('Reintentar catálogo').click();
  await waitFor(()=>window.qa.subscriptions.length===2,'Reintento debe suscribirse otra vez');
  assert.equal(window.qa.subscriptions[0].active,false,'Reintento debe cancelar listener anterior');
  window.qa.subscriptions[0].callback(catalog('Producto obsoleto'));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(visible('Producto obsoleto'),false);
  window.qa.subscriptions[1].callback(catalog('Producto A'));
  await waitFor(()=>visible('Producto A'),'Catálogo A debe recuperarse');
  button('Guardar catálogo').click();
  await waitFor(()=>window.qa.writes.length===1,'Guardar debe funcionar después de recuperar');
  assert.equal(window.qa.writes[0].businessId,'tenant-a');

  window.qa.render('tenant-b');
  await waitFor(()=>window.qa.subscriptions.length===3,'Falta suscripción B');
  assert.equal(visible('Producto A'),false,'Cambio de tenant no debe mostrar catálogo anterior');
  assert.equal(button('Guardar catálogo'),undefined,'No guardar mientras B carga');
  window.qa.subscriptions[1].callback(catalog('Producto A tardío'));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(visible('Producto A tardío'),false);
  window.qa.subscriptions[2].callback(catalog('Producto B'));
  await waitFor(()=>visible('Producto B'),'B debe mostrar solo su catálogo');
  assert.equal(visible('Producto A'),false);
  window.qa.subscriptions[2].onError({code:'unavailable'});
  await waitFor(()=>!!button('Reintentar catálogo'),'Error posterior debe bloquear editor');
  assert.equal(button('Guardar catálogo'),undefined);
  assert.equal(window.qa.writes.length,1,'Error B no debe escribir sobre ningún catálogo');
  assert.deepEqual(errors,[],'No deben aparecer errores de React');
  console.log('PASS: error de lectura bloquea edición, reintento recupera, cambio de tenant descarta callbacks obsoletos (React + jsdom).');
} finally {
  window.qa.unmount?.();
  window.close();
}

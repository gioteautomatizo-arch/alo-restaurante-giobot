// Pantallas React reales de configuración y catálogo conectadas por un puente
// a servicios SDK REALES en Firebase Auth/Firestore emulados. No toca producción.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': [
    'export const doc = (_db, collection, id) => ({collection,id});',
    'export const updateDoc = (ref, patch) => window.qa.bridge.updateBranding(ref.id, patch);',
  ].join('\n'),
  '../../lib/firebase': [
    'export const db = {};',
    'export const auth = {get currentUser() {return window.qa.user;}};',
    'export function subscribeToAuth(callback) {callback(window.qa.user); return () => {}; }',
  ].join('\n'),
  '../../lib/menuImagesService': [
    'export async function uploadBusinessLogo() {throw new Error("No se suben archivos en pruebas");}',
    'export async function uploadBusinessMenuImage() {throw new Error("No se suben archivos en pruebas");}',
    'export async function uploadMenuImage() {throw new Error("No se suben archivos en pruebas");}',
  ].join('\n'),
  '../../lib/businessPublicProfileService': [
    'export function syncPublicProfileIfNeeded(id, tenant) {return window.qa.bridge.syncPublic(id, tenant);}',
  ].join('\n'),
  '../../lib/businessCatalogService': [
    'export function createCatalogItemId(name) {return name + "-ui-" + Math.random().toString(36).slice(2);}',
    'export function ensureUniqueIds(items) {return items;}',
    'export function subscribeToBusinessCatalog(id, cb, err) {return window.qa.bridge.subscribeCatalog(id, cb, err);}',
    'export function saveBusinessCatalog(id, items, actor, revision) {window.qa.catalogWrites++;return window.qa.bridge.saveCatalog(id, items, actor, revision).catch(error => {window.qa.lastSaveError = String(error);throw error;});}',
  ].join('\n'),
  '../../lib/businessAuthService': [
    'export function getBusinessForUser(uid, id) {return window.qa.bridge.getBusiness(uid, id);}',
  ].join('\n'),
  './BusinessMenuPasteImport': 'export const BusinessMenuPasteImport = () => null;',
};
let bundlePromise;
function getBundle() {
  bundlePromise ??= build({
    absWorkingDir: rootDir, bundle: true, write: false, format: 'iife',
    platform: 'browser', define: {'process.env.NODE_ENV': '"development"'},
    stdin: {resolveDir: rootDir, loader: 'jsx', contents: [
      "import React from 'react';",
      "import {createRoot} from 'react-dom/client';",
      "import {BusinessBrandingSettings} from './src/components/platform/BusinessBrandingSettings';",
      "import {BusinessCatalogEditor} from './src/components/platform/BusinessCatalogEditor';",
      "const root = createRoot(document.getElementById('root'));",
      "window.qa.mountBranding = tenant => root.render(<BusinessBrandingSettings key={tenant.restaurantId + ':' + window.qa.user.uid} business={tenant} onBack={() => {}} onSaved={saved => window.qa.saved.push(saved)} />);",
      "window.qa.mountCatalog = (id,name) => root.render(<BusinessCatalogEditor key={id + ':' + window.qa.user.uid} businessId={id} businessName={name} onBack={() => {}} />);",
      "window.qa.unmount = () => root.unmount();",
    ].join('\n')},
    plugins: [{name:'emulator-management-bridge',setup(plugin) {
      plugin.onResolve({filter:/.*/},args=>{
        const source = args.importer;
        if ((source.endsWith('/BusinessBrandingSettings.tsx')
          || source.endsWith('/BusinessCatalogEditor.tsx'))
          && Object.hasOwn(mocks,args.path)) {
          return {path:args.path,namespace:'qa-bridge'};
        }
      });
      plugin.onLoad({filter:/.*/,namespace:'qa-bridge'},args=>({
        contents:mocks[args.path],loader:'js',
      }));
    }}],
  });
  return bundlePromise;
}
async function waitFor(predicate,label) {
  for (let i=0;i<350;i++) {
    if (predicate()) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label);
}
function button(document,label) {
  return [...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);
}
function setInput(window,input,value) {
  assert(input,'Campo editable no encontrado');
  const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(input,value);
  input.dispatchEvent(new window.Event('input',{bubbles:true}));
}
async function withView({bridge,user},callback) {
  const bundle=await getBundle();
  const dom=new JSDOM('<div id="root"></div>',{
    url:'https://example.test/#business',runScripts:'outside-only',
    virtualConsole:new VirtualConsole(),
  });
  const {window}=dom;
  const errors=[];
  window.addEventListener('error',event=>errors.push(event.error));
  window.qa={bridge,user,saved:[],catalogWrites:0};
  try {
    window.eval(bundle.outputFiles[0].text);
    const result=await callback(window,window.document);
    assert.deepEqual(errors,[],'Sin errores de ejecución de React');
    return result;
  } finally {
    window.qa.unmount?.();
    window.close();
  }
}

export async function saveBrandingThroughUI({tenant,user,bridge,name}) {
  return withView({bridge,user},async(window,document)=>{
    window.qa.mountBranding(tenant);
    await waitFor(()=>!!button(document,'Guardar cambios'),'Formulario de identidad');
    const input=[...document.querySelectorAll('label')].find(el=>el.textContent.includes('Nombre del negocio'))?.querySelector('input');
    setInput(window,input,name);
    await waitFor(()=>document.querySelector('h1')?.textContent===name,'Nombre editado y renderizado en React');
    const save=button(document,'Guardar cambios');
    save.click();
    save.click();
    await waitFor(()=>window.qa.saved.length===1,'Guardar identidad mediante Firestore emulado');
    assert.equal(window.qa.saved[0].restaurantId,tenant.restaurantId);
    assert.equal(window.qa.saved[0].branding.restaurantName,name);
    await waitFor(()=>button(document,'Guardar cambios')?.disabled===false,'Formulario vuelve a estar disponible');
    return window.qa.saved[0];
  });
}

export async function addCatalogProductThroughUI({businessId,businessName,user,bridge,productName,price,expectedExistingItemName = null}) {
  return withView({bridge,user},async(window,document)=>{
    window.qa.mountCatalog(businessId,businessName);
    await waitFor(()=>!!button(document,'Producto') && !!document.querySelector('input[placeholder="Nombre del producto"]')
      && (!expectedExistingItemName || [...document.querySelectorAll('input[placeholder="Nombre del producto"]')]
        .some(input=>input.value===expectedExistingItemName)),
      'Esperar el catálogo más reciente antes de editar en React');
    button(document,'Producto').click();
    await waitFor(()=>document.querySelectorAll('input[placeholder="Nombre del producto"]').length>=2,
      'Nuevo producto editable');
    const inputs=[...document.querySelectorAll('input[placeholder="Nombre del producto"]')];
    const nameInput=inputs[inputs.length-1];
    setInput(window,nameInput,productName);
    await waitFor(()=>nameInput.value===productName,'Nombre de producto actualizado');
    const row=nameInput.closest('.rounded-2xl');
    const priceInput=row?.querySelector('input[placeholder="$ Precio"]');
    setInput(window,priceInput,String(price));
    await waitFor(()=>priceInput.value===String(price),'Precio actualizado');
    await new Promise(resolve=>setTimeout(resolve,20));
    const save=button(document,'Guardar cambios');
    assert(save && !save.disabled,'Guardar catálogo disponible');
    save.click();
    save.click();
    await waitFor(()=>window.qa.catalogWrites===1,'Un solo guardado por doble pulsación');
    try {
      await waitFor(()=>document.body.textContent.includes('Catálogo guardado correctamente.')
        || document.body.textContent.includes('No pudimos guardar el catálogo')
        || document.body.textContent.includes('El catálogo cambió en otra sesión'),
        'Respuesta del guardado de catálogo');
    } catch (error) {
      assert.fail('Sin confirmación: ' + document.body.textContent.slice(0,450) + ' / ' + window.qa.lastSaveError);
    }
    assert(document.body.textContent.includes('Catálogo guardado correctamente.'),
      'El catálogo no se guardó: ' + document.body.textContent.slice(0,450) + ' / ' + window.qa.lastSaveError);
    return {businessId,productName,price};
  });
}

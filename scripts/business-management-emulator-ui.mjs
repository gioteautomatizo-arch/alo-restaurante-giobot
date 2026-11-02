// Pantallas React reales de configuración y catálogo conectadas por un puente
// a servicios SDK REALES en Firebase Auth/Firestore emulados. No toca producción.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/businessBrandingService': 'export function saveBusinessBranding(tenant, branding) {return window.qa.bridge.updateBranding(tenant, branding);}',
  '../../lib/businessCapabilitiesService': 'export function saveBusinessCapabilities(tenant, capabilities) {return window.qa.bridge.updateCapabilities(tenant, capabilities);}',
  '../../lib/firebase': [
    'export const db = {};',
    'export const auth = {get currentUser() {return window.qa.user;}};',
    'export const getCurrentAuthUser=()=>window.qa.user;',
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
  '../admin/VipClientsAdminView': 'export const VipClientsAdminView = () => null;',
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
      "import {BusinessVipPanel} from './src/components/platform/BusinessVipPanel';",
      "import {BusinessModuleToggles} from './src/components/platform/BusinessModuleToggles';",
      "import {BusinessCatalogEditor} from './src/components/platform/BusinessCatalogEditor';",
      "const root = createRoot(document.getElementById('root'));",
      "window.qa.mountBranding = tenant => root.render(<BusinessBrandingSettings key={tenant.restaurantId + ':' + window.qa.user.uid} business={tenant} onBack={() => {}} onSaved={saved => window.qa.saved.push(saved)} />);",
      "window.qa.mountCatalog = (id,name) => root.render(<BusinessCatalogEditor key={id + ':' + window.qa.user.uid} businessId={id} businessName={name} onBack={() => {}} />);",
      "window.qa.mountVip = (tenant,published) => root.render(<BusinessVipPanel key={tenant.restaurantId + ':' + window.qa.user.uid} businessId={tenant.restaurantId} business={tenant} isOwner={true} managerRole='OWNER' isPublished={published} onBusinessUpdated={saved=>window.qa.saved.push(saved)} />);",
      "window.qa.mountModules = tenant => root.render(<BusinessModuleToggles key={tenant.restaurantId + ':' + window.qa.user.uid} business={tenant} enabled={new Set(tenant.capabilities || [])} isOwner={true} onChanged={caps=>window.qa.changed.push(caps)} />);",
      "window.qa.unmount = () => root.unmount();",
    ].join('\n')},
    plugins: [{name:'emulator-management-bridge',setup(plugin) {
      plugin.onResolve({filter:/.*/},args=>{
        const source = args.importer;
        if ((source.endsWith('/BusinessBrandingSettings.tsx')
          || source.endsWith('/BusinessCatalogEditor.tsx')
          || source.endsWith('/BusinessVipPanel.tsx')
          || source.endsWith('/BusinessModuleToggles.tsx'))
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
  window.qa={bridge,user,saved:[],changed:[],catalogWrites:0};
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

/** Panel VIP React con servicio CAS real y Auth/Firestore Emulator, sin despliegue. */
export async function saveVipThroughUI({tenant,user,bridge,isPublished}) {
  return withView({bridge,user},async(window,document)=>{
    window.qa.mountVip(tenant,isPublished);
    await waitFor(()=>!!button(document,'Guardar tarjeta VIP'),'Panel VIP');
    const toggle=document.querySelector('button[role="switch"]');
    assert(toggle,'Interruptor VIP');
    toggle.click();
    await waitFor(()=>toggle.getAttribute('aria-checked')==='true','Activar VIP');
    const save=button(document,'Guardar tarjeta VIP');
    save.click();
    save.click();
    await waitFor(()=>window.qa.saved.length===1,'Guardar VIP por CAS real');
    assert.equal(window.qa.saved[0].restaurantId,tenant.restaurantId);
    assert.equal(window.qa.saved[0].branding.vipEnabled,true);
    await waitFor(()=>document.querySelector('[role="status"]')?.textContent.includes('Tarjeta VIP guardada'),
      'Confirmación de guardado VIP');
    return window.qa.saved[0];
  });
}

/** React real y servicio CAS real con Auth/Firestore Emulator, sin datos productivos. */
export async function saveModulesThroughUI({tenant,user,bridge,capability='VIP'}) {
  return withView({bridge,user},async(window,document)=>{
    window.qa.mountModules(tenant);
    const labels={VIP:'Tarjeta VIP',SHIFTS:'Turnos y cortes'};
    const label=labels[capability];
    assert(label,'Capacidad conocida en el panel');
    await waitFor(()=>!!document.querySelector('[role="switch"][aria-label="'+label+'"]'),'Módulos React');
    const toggle=document.querySelector('[role="switch"][aria-label="'+label+'"]');
    toggle.click();toggle.click();
    await waitFor(()=>window.qa.changed.length===1,'Guardar módulos con CAS real');
    const expected=new Set(tenant.capabilities || []);
    if(expected.has(capability)) expected.delete(capability); else expected.add(capability);
    assert.deepEqual(Array.from(window.qa.changed[0]),Array.from(expected));
    return Array.from(window.qa.changed[0]);
  });
}

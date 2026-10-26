// Prueba de regresión React/jsdom. Firestore y Cloudinary están simulados:
// no crea cuentas, no escribe datos reales y no sube imágenes.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': [
    'export const doc = (_db, collection, id) => ({collection,id});',
    'export const updateDoc = (ref, data) => new Promise((resolve,reject) => window.qa.writes.push({ref,data,resolve,reject}));',
  ].join('\n'),
  '../../lib/firebase': 'export const db = {}; export const auth = {get currentUser() {return window.qa.user;}};',
  '../../lib/menuImagesService': [
    'export const uploadBusinessLogo = (id,file) => new Promise((resolve,reject) => window.qa.uploads.push({id,file,resolve,reject}));',
    'export const uploadBusinessMenuImage = uploadBusinessLogo;',
  ].join('\n'),
  '../../lib/businessPublicProfileService': [
    'export async function syncPublicProfileIfNeeded(id) {window.qa.syncs.push(id);return true;}',
  ].join('\n'),
};
const bundle = await build({
  absWorkingDir: rootDir, bundle: true, write: false, format: 'iife', platform: 'browser',
  define: {'process.env.NODE_ENV': '"development"'},
  stdin: {resolveDir: rootDir, loader: 'jsx', contents: [
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessBrandingSettings} from './src/components/platform/BusinessBrandingSettings';",
    "const root=createRoot(document.getElementById('root'));",
    "window.qa.render=id=>root.render(<BusinessBrandingSettings key={id+':'+(window.qa.user?.uid||'')} business={{restaurantId:id,branding:{restaurantName:'Negocio '+id}}} onBack={()=>{}} onSaved={b=>window.qa.saved.push(b.restaurantId)} />);",
    "window.qa.unmount=()=>root.unmount();",
  ].join('\n')},
  plugins: [{name:'branding-mocks',setup(plugin) {
    plugin.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/BusinessBrandingSettings.tsx') && Object.hasOwn(mocks,args.path)) {
        return {path:args.path,namespace:'mock'};
      }
    });
    plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>', {
  url:'https://example.test/#business',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
});
const {window} = dom, document = window.document;
const errors=[];
window.addEventListener('error',event=>errors.push(event.error));
window.qa={user:{uid:'owner-a'},writes:[],uploads:[],syncs:[],saved:[]};
const waitFor=async(predicate,label)=>{
  for(let i=0;i<250;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label);
};
const button=label=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a');
  await waitFor(()=>!!button('Guardar cambios'),'Formulario A');
  const saveA=button('Guardar cambios');
  saveA.click();
  saveA.click();
  await waitFor(()=>window.qa.writes.length===1,'Un solo guardado A pese a doble clic');
  assert.equal(window.qa.writes[0].ref.id,'tenant-a');
  assert(button('Guardando…')?.disabled,'Guardado bloqueado durante operación');

  // Cambio de tenant y cuenta antes de que responda Firestore.
  window.qa.user={uid:'owner-b'};
  window.qa.render('tenant-b');
  await waitFor(()=>!!button('Guardar cambios') && document.body.textContent.includes('Negocio tenant-b'),'Formulario B');
  window.qa.writes[0].resolve();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.deepEqual(window.qa.saved,[],'El guardado tardío de A no actualiza B');
  assert.deepEqual(window.qa.syncs,[],'No sincronizar página pública con cuenta cambiada');
  assert(!document.body.textContent.includes('Identidad guardada'),'No mostrar confirmación vieja');

  button('Guardar cambios').click();
  await waitFor(()=>window.qa.writes.length===2,'Guardado B');
  assert.equal(window.qa.writes[1].ref.id,'tenant-b');
  window.qa.writes[1].resolve();
  await waitFor(()=>window.qa.saved.length===1 && !!document.querySelector('[role="status"]'),'Confirmación B');
  assert.deepEqual(window.qa.saved,['tenant-b']);
  assert.deepEqual(window.qa.syncs,['tenant-b']);

  // El error debe permitir reintentar sin crear un guardado duplicado.
  button('Guardar cambios').click();
  await waitFor(()=>window.qa.writes.length===3,'Intento B con error');
  window.qa.writes[2].reject(new Error('Sin conexión'));
  await waitFor(()=>!!document.querySelector('[role="alert"]') && !!button('Guardar cambios'),'Error y reintento B');
  button('Guardar cambios').click();
  await waitFor(()=>window.qa.writes.length===4,'Reintento B');
  window.qa.writes[3].resolve();
  await waitFor(()=>window.qa.saved.length===2,'Reintento B confirmado');

  // Subida pendiente de B: nunca incorporar su URL al formulario de A.
  const logoInput=document.querySelector('input[type="file"]');
  assert(logoInput,'Campo de logo');
  Object.defineProperty(logoInput,'files',{configurable:true,value:[new window.File(['x'],'logo.png',{type:'image/png'})]});
  logoInput.dispatchEvent(new window.Event('change',{bubbles:true}));
  await waitFor(()=>window.qa.uploads.length===1,'Subida simulada B');
  assert.equal(window.qa.uploads[0].id,'tenant-b');
  window.qa.user={uid:'owner-a'};
  window.qa.render('tenant-a');
  await waitFor(()=>!!button('Guardar cambios') && document.body.textContent.includes('Negocio tenant-a'),'Regreso a A');
  window.qa.uploads[0].resolve('https://example.test/logo-b.png');
  await new Promise(resolve=>setTimeout(resolve,30));
  assert(!document.querySelector('img[alt="Logo del negocio"]'),'Logo tardío B no aparece en A');

  // Sin sesión no se debe iniciar ningún guardado.
  window.qa.user=null;
  window.qa.render('tenant-c');
  await waitFor(()=>!!button('Guardar cambios') && document.body.textContent.includes('Negocio tenant-c'),'Formulario C sin sesión');
  const count=window.qa.writes.length;
  button('Guardar cambios').click();
  await waitFor(()=>!!document.querySelector('[role="alert"]'),'Error de sesión');
  assert.equal(window.qa.writes.length,count,'No escribir sin sesión');
  assert.deepEqual(errors,[],'Sin errores React');
  console.log('PASS: identidad por tenant/UID, doble clic, respuesta tardía, error/reintento y subida obsoleta (React/jsdom, backend simulado).');
} finally {
  window.qa.unmount?.();
  window.close();
}

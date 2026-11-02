// Paso 2: panel VIP React real, servicios CAS/publicación simulados. Sin Firebase real.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/firebase': 'export const getCurrentAuthUser=()=>window.qa.user;',
  '../../lib/businessBrandingService': [
    'export function saveBusinessBranding(observed,branding) {',
    ' return new Promise((resolve,reject)=>window.qa.writes.push({observed,branding,resolve,reject}));',
    '}',
  ].join('\n'),
  '../../lib/businessPublicProfileService': [
    'export function syncPublicProfileIfNeeded(id,tenant) {',
    ' return new Promise((resolve,reject)=>window.qa.syncs.push({id,tenant,resolve,reject}));',
    '}',
  ].join('\n'),
  '../admin/VipClientsAdminView': 'export const VipClientsAdminView=()=>null;',
};
const bundle=await build({
  absWorkingDir:rootDir,bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"development"'},
  stdin:{resolveDir:rootDir,loader:'jsx',contents:[
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessVipPanel} from './src/components/platform/BusinessVipPanel';",
    "const root=createRoot(document.getElementById('root'));",
    "window.qa.mount=(id,published=true,owner=true)=>{",
    "const tenant={restaurantId:id,ownerUserId:'owner-'+id.at(-1),businessType:'restaurant',branding:{restaurantName:'Negocio '+id,publicSlug:id,vipEnabled:false,loyaltyProgramName:'Sellos '+id,vipStampsRequired:5}};",
    "root.render(<BusinessVipPanel key={id+':'+(window.qa.user?.uid||'anon')} businessId={id} business={tenant} isOwner={owner} managerRole={owner?'OWNER':'WAITER'} isPublished={published} onBusinessUpdated={updated=>window.qa.saved.push(updated)} />);",
    "};",
    "window.qa.unmount=()=>root.unmount();",
  ].join('\n')},
  plugins:[{name:'vip-mocks',setup(plugin){
    plugin.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/BusinessVipPanel.tsx') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'vip-mock'};
    });
    plugin.onLoad({filter:/.*/,namespace:'vip-mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom=new JSDOM('<div id="root"></div>',{
  url:'https://example.test/#business',runScripts:'outside-only',
  virtualConsole:new VirtualConsole(),
});
const {window}=dom, document=window.document;
const errors=[];
window.addEventListener('error',event=>errors.push(event.error));
window.qa={user:{uid:'owner-a'},writes:[],syncs:[],saved:[]};
const waitFor=async(predicate,label)=>{
  for(let i=0;i<250;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label+': '+document.body.textContent.slice(0,250));
};
const saveButton=()=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='Guardar tarjeta VIP');
const status=()=>document.querySelector('[role="status"]')?.textContent||'';
const alert=()=>document.querySelector('[role="alert"]')?.textContent||'';
const flush=()=>new Promise(resolve=>setTimeout(resolve,30));
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.mount('tenant-a',true);
  await waitFor(()=>!!saveButton(),'Formulario VIP A');
  saveButton().click();
  saveButton().click();
  await waitFor(()=>window.qa.writes.length===1,'Una escritura pese a doble clic');
  assert.equal(window.qa.writes[0].observed.restaurantId,'tenant-a');
  assert.equal(window.qa.writes[0].branding.vipStampsRequired,5);
  assert(saveButton().disabled,'Bloqueo de botón mientras guarda');
  window.qa.writes[0].resolve();
  await waitFor(()=>window.qa.saved.length===1 && window.qa.syncs.length===1,'Privado confirmado antes de sync');
  assert.equal(window.qa.syncs[0].id,'tenant-a');
  window.qa.syncs[0].resolve(true);
  await waitFor(()=>status().includes('página pública actualizada'),'Confirmación pública legítima');

  // Conflicto CAS: ni éxito privado ni publicación.
  saveButton().click();
  await waitFor(()=>window.qa.writes.length===2,'Conflicto');
  window.qa.writes[1].reject(new Error('CONFLICTO_IDENTIDAD: El negocio cambió en otra sesión. Regresa al panel.'));
  await waitFor(()=>alert().includes('Regresa al panel.'),'Error CAS visible');
  assert.equal(window.qa.saved.length,1);
  assert.equal(window.qa.syncs.length,1);

  // Un cambio de UID/tenant durante la escritura no actualiza la nueva pantalla.
  saveButton().click();
  await waitFor(()=>window.qa.writes.length===3,'Escritura A tardía');
  window.qa.user={uid:'owner-b'};
  window.qa.mount('tenant-b',true);
  await waitFor(()=>document.querySelector('input[placeholder^="Nombre del programa"]')?.value==='Sellos tenant-b' && !!saveButton(),'Formulario B');
  window.qa.writes[2].resolve();
  await flush();
  assert.equal(window.qa.saved.length,1,'A no debe confirmar en B');
  assert.equal(window.qa.syncs.length,1,'A no debe publicar desde B');

  // B guarda, pero una página oculta entretanto no debe volver a publicarse.
  saveButton().click();
  await waitFor(()=>window.qa.writes.length===4,'Escritura B');
  window.qa.writes[3].resolve();
  await waitFor(()=>window.qa.saved.length===2 && window.qa.syncs.length===2,'Guardado B');
  window.qa.syncs[1].resolve(false);
  await waitFor(()=>status().includes('Comprueba si tu página pública sigue publicada'),'No afirmar publicación');
  assert.equal(window.qa.saved[1].restaurantId,'tenant-b');

  // Fallo de sincronización: el guardado privado SÍ quedó confirmado.
  saveButton().click();
  await waitFor(()=>window.qa.writes.length===5,'Escritura B con sync fallido');
  window.qa.writes[4].resolve();
  await waitFor(()=>window.qa.saved.length===3 && window.qa.syncs.length===3,'Privado B confirmado');
  window.qa.syncs[2].reject(new Error('SIMULATED_PUBLIC_SYNC_FAILURE'));
  await waitFor(()=>status().includes('Tarjeta VIP guardada, pero no se confirmó'),'Distinguir sync fallido');
  assert.equal(alert(),'','No presentar error de guardado privado');

  // Panel inicialmente oculto: guardar VIP nunca debe publicar.
  window.qa.user={uid:'owner-a'};
  window.qa.mount('tenant-a',false);
  await waitFor(()=>!!saveButton() && document.querySelector('input[placeholder^="Nombre del programa"]')?.value==='Sellos tenant-a','Panel oculto');
  saveButton().click();
  await waitFor(()=>window.qa.writes.length===6,'VIP oculto');
  window.qa.writes[5].resolve();
  await waitFor(()=>window.qa.saved.length===4 && status().includes('página pública está oculta'),'Privado oculto');
  assert.equal(window.qa.syncs.length,3,'No publicar página oculta');

  window.qa.mount('tenant-a',true,false);
  await waitFor(()=>!saveButton(),'No OWNER sin botón de guardar');
  window.qa.user=null;
  window.qa.mount('tenant-a',true,true);
  await waitFor(()=>!!saveButton(),'Panel sin sesión');
  const before=window.qa.writes.length;
  saveButton().click();
  await waitFor(()=>alert().includes('sesión expiró'),'Rechazo sin UID');
  assert.equal(window.qa.writes.length,before);
  assert.deepEqual(errors,[],'Sin errores React');
  console.log('PASS: VIP React A/B CAS, doble clic, conflicto, UID/tenant, sync fallido/oculto y permisos (mock; sin Firebase real).');
} finally {
  window.qa.unmount?.();
  window.close();
}

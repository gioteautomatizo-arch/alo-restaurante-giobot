// Paso 2: componente React real, Auth y guardado CAS simulados. Sin Firebase real.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootDir=fileURLToPath(new URL('../',import.meta.url));
const mocks={
  '../../lib/businessCapabilitiesService': [
    'export const saveBusinessCapabilities=(business,list)=>new Promise((resolve,reject)=>',
    '  window.qa.saves.push({business,list,resolve,reject}));',
  ].join(''),
  '../../lib/firebase':'export const auth={get currentUser(){return window.qa.user;}};',
};
const bundle=await build({
  absWorkingDir:rootDir,bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"development"'},
  stdin:{resolveDir:rootDir,loader:'jsx',contents:[
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessModuleToggles} from './src/components/platform/BusinessModuleToggles';",
    "const root=createRoot(document.getElementById('root'));",
    "window.qa.render=(id,owner=true)=>{",
    "  const business=window.qa.tenants[id];",
    "  root.render(<BusinessModuleToggles key={id+':'+(window.qa.user?.uid||'')} business={business}",
    "    enabled={new Set(business.capabilities || [])} isOwner={owner}",
    "    onChanged={list=>{window.qa.changed.push({id,list});window.qa.tenants[id]={...business,capabilities:list};}} />);",
    "};",
    "window.qa.unmount=()=>root.unmount();",
  ].join('\n')},
  plugins:[{name:'capabilities-ui-mocks',setup(plugin){
    plugin.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/BusinessModuleToggles.tsx') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'mock'};
    });
    plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom=new JSDOM('<div id="root"></div>',{
  url:'https://example.test/#business',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
});
const {window}=dom,document=window.document;
const errors=[];
window.addEventListener('error',event=>errors.push(event.error));
window.qa={
  user:{uid:'owner-a'},saves:[],changed:[],
  tenants:{
    'tenant-a':{restaurantId:'tenant-a',ownerUserId:'owner-a',businessType:'restaurant',capabilities:['VIP','SHIFTS']},
    'tenant-b':{restaurantId:'tenant-b',ownerUserId:'owner-b',businessType:'restaurant',capabilities:['VIP']},
  },
};
const waitFor=async(predicate,label)=>{
  for(let i=0;i<250;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(label);
};
const toggle=label=>document.querySelector('[role="switch"][aria-label="'+label+'"]');
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a');
  await waitFor(()=>!!toggle('Tarjeta VIP'),'Panel A');
  const vipA=toggle('Tarjeta VIP');
  vipA.click();vipA.click();
  await waitFor(()=>window.qa.saves.length===1,'Un solo guardado pese a doble clic');
  assert.equal(window.qa.saves[0].business.restaurantId,'tenant-a');
  assert(toggle('Turnos y cortes').disabled,'Todos los interruptores bloqueados mientras guarda');

  // La respuesta de A no puede cambiar la vista B.
  window.qa.user={uid:'owner-b'};
  window.qa.render('tenant-b');
  await waitFor(()=>!!toggle('Tarjeta VIP') && !toggle('Tarjeta VIP').disabled,'Panel B');
  window.qa.saves[0].resolve();
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(window.qa.changed.length,0,'Respuesta tardía A descartada');

  // B puede desactivar el último módulo y la lista vacía debe conservarse.
  toggle('Tarjeta VIP').click();
  await waitFor(()=>window.qa.saves.length===2,'Guardado B');
  assert.equal(window.qa.saves[1].business.restaurantId,'tenant-b');
  assert.equal(window.qa.saves[1].list.length,0);
  window.qa.saves[1].resolve();
  await waitFor(()=>window.qa.changed.length===1,'Cambio B confirmado');
  assert.equal(window.qa.changed[0].id,'tenant-b');
  assert.deepEqual(Array.from(window.qa.changed[0].list),[]);
  window.qa.render('tenant-b');
  await waitFor(()=>toggle('Tarjeta VIP')?.getAttribute('aria-checked')==='false','VIP B desactivado');

  // Conflicto CAS: no confirmar ni reactivar el módulo.
  toggle('Turnos y cortes').click();
  await waitFor(()=>window.qa.saves.length===3,'Intento obsoleto B');
  window.qa.saves[2].reject(new Error('CONFLICTO_MODULOS: Vuelve a abrir el negocio.'));
  await waitFor(()=>document.querySelector('[role="alert"]')?.textContent.includes('CONFLICTO_MODULOS'),
    'Error recuperable visible');
  assert.equal(window.qa.changed.length,1,'Conflicto no confirma cambio');

  // Sin OWNER, todos los interruptores quedan deshabilitados.
  window.qa.render('tenant-b',false);
  await waitFor(()=>toggle('Tarjeta VIP')?.disabled,'Permiso sin OWNER');
  toggle('Tarjeta VIP').click();
  assert.equal(window.qa.saves.length,3,'Sin OWNER no escribe');

  // Sin sesión tampoco puede enviar.
  window.qa.user=null;
  window.qa.render('tenant-b',true);
  await waitFor(()=>!!toggle('Tarjeta VIP') && !toggle('Tarjeta VIP').disabled,'Panel sin sesión');
  toggle('Tarjeta VIP').click();
  await waitFor(()=>document.querySelector('[role="alert"]')?.textContent.includes('sesión expiró'),
    'Aviso de sesión');
  assert.equal(window.qa.saves.length,3);

  const workspace=readFileSync(new URL('../src/components/platform/BusinessWorkspace.tsx',import.meta.url),'utf8');
  assert(workspace.includes('Array.isArray(business.capabilities) ? business.capabilities : template.capabilities'),
    'Workspace debe distinguir [] de capacidades ausentes');
  assert(workspace.includes('setBusiness(current => current?.restaurantId === businessId'),
    'Workspace no debe sobrescribir estado React de otro tenant');
  assert.equal(errors.length,0,'Sin excepciones React/jsdom');
  console.log('PASS: toggles React A/B, doble clic, cuenta, [], conflicto, OWNER y sesión (servicio simulado).');
} finally {
  window.qa.unmount?.();
  window.close();
}

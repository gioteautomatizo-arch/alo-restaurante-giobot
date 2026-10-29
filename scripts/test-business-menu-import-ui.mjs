// React real en jsdom; borrador, catálogo y Auth simulados. Sin Firebase ni red.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const mocks={
  '../../lib/firebase':'export const auth={currentUser:{uid:"owner-a",displayName:"Prueba"}};window.qa.auth=auth;',
  '../../lib/menuImagesService':[
    'export const validateMenuImage=()=>null;',
    'export const uploadBusinessMenuImage=async()=>{throw Error("No uploads in UI test");};',
  ].join('\n'),
  '../../lib/businessCatalogService':[
    'export const createCatalogItemId=name=>name;',
    'export const saveBusinessCatalog=async(businessId,items,actorName,revision)=>{',
    ' window.qa.catalogWrites.push({businessId,items,actorName,revision});',
    ' if(window.qa.conflict){window.qa.conflict=false;throw Error("CONFLICTO_CATALOGO: Otra pestaña modificó el catálogo.");}',
    ' return {businessId,items,revision};',
    '};',
    'export const subscribeToBusinessCatalog=(businessId,callback,onError)=>{',
    ' const entry={businessId,callback,onError,active:true};window.qa.subscriptions.push(entry);',
    ' return ()=>{entry.active=false;};',
    '};',
  ].join('\n'),
  '../../lib/businessMenuImportService':[
    'export const getMenuImportDraft=businessId=>new Promise((resolve,reject)=>window.qa.draftReads.push({businessId,resolve,reject}));',
    'export const saveMenuImportDraft=async(businessId,input,_actor,revision)=>{window.qa.draftWrites.push({businessId,input,revision});if(window.qa.draftConflict)throw Error("CONFLICTO_BORRADOR: Otra pestaña modificó tu borrador.");return {businessId,...input,revision:"saved-"+window.qa.draftWrites.length};};',
    'export const clearMenuImportDraft=async(businessId,revision)=>{window.qa.clears.push(businessId);window.qa.clearVersions.push(revision);if(window.qa.clearConflict)throw Error("CONFLICTO_BORRADOR: borrador cambiado");};',
  ].join('\n'),
};
const bundle=await build({
  absWorkingDir:root,bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"development"'},
  stdin:{resolveDir:root,loader:'jsx',contents:[
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessMenuImport} from './src/components/platform/BusinessMenuImport';",
    "const root=createRoot(document.getElementById('root'));",
    "window.qa.render=(id,uid)=>{window.qa.auth.currentUser={uid,displayName:uid};root.render(<BusinessMenuImport key={id+':'+uid} businessId={id} businessName={id} onBack={()=>{}}/>);};",
    "window.qa.unmount=()=>root.unmount();",
  ].join('\n')},
  plugins:[{name:'mock-menu-import-ui',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/BusinessMenuImport.tsx') && Object.hasOwn(mocks,args.path)){
        return {path:args.path,namespace:'mock'};
      }
    });
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom=new JSDOM('<div id="root"></div>',{
  url:'https://example.test/',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
});
const {window}=dom,document=window.document;
window.qa={draftReads:[],draftWrites:[],catalogWrites:[],clears:[],subscriptions:[],conflict:false,draftConflict:false,clearConflict:false,clearVersions:[]};
const errors=[];
window.addEventListener('error',event=>errors.push(event.error));
const waitFor=async(predicate,label)=>{
  for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail(label);
};
const button=label=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===label);
const visible=label=>document.body.textContent.includes(label)||[...document.querySelectorAll('input')].some(el=>el.value===label);
const draft=(businessId,name)=>({businessId,sourceImageUrl:'',updatedAt:'',updatedBy:'Prueba',revision:'original-'+businessId,items:[{
  id:'draft-1',name,category:'Comida',price:'45',description:'',
}]});
const catalog=(id,revision)=>({businessId:id,revision,items:[],updatedAt:'2026-10-29T00:00:00.000Z'});
try{
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a','owner-a');
  await waitFor(()=>window.qa.draftReads.length===1,'Falta lectura A');
  await waitFor(()=>window.qa.subscriptions.length===1,'Falta listener catálogo A');
  window.qa.subscriptions[0].callback(catalog('tenant-a','rev-a'));
  window.qa.draftReads[0].reject(Error('unavailable'));
  await waitFor(()=>!!button('Reintentar borrador'),'Error de lectura debe bloquear editor y permitir reintento');
  assert.equal(button('Agregar producto'),undefined,'Fallo de lectura no puede habilitar editor vacío');
  assert.equal(button('Publicar en mi catálogo'),undefined,'Fallo de lectura no puede publicar');
  assert.ok(document.querySelector('[role="alert"]'));
  assert.equal(window.qa.draftWrites.length,0);

  button('Reintentar borrador').click();
  await waitFor(()=>window.qa.draftReads.length===2,'Falta segunda lectura A');
  window.qa.draftReads[1].resolve(draft('tenant-a','Quesadilla A'));
  await waitFor(()=>visible('Quesadilla A'),'Borrador A debe recuperarse');
  assert.equal(button('Reintentar borrador'),undefined);
  assert(button('Publicar en mi catálogo'),'Debe permitir publicar tras lectura válida');

  window.qa.conflict=true;
  button('Publicar en mi catálogo').click();
  await waitFor(()=>window.qa.catalogWrites.length===1,'Falta intento de publicar A');
  assert.equal(window.qa.catalogWrites[0].revision,'rev-a','Importador debe pasar revisión de catálogo');
  await waitFor(()=>visible('CONFLICTO_CATALOGO'),'Conflicto debe aparecer y conservar borrador');
  assert.equal(window.qa.clears.length,0,'Conflicto no borra borrador');
  assert.equal(visible('Quesadilla A'),true);

  button('Publicar en mi catálogo').click();
  await waitFor(()=>window.qa.catalogWrites.length===2,'Falta reintento de publicación');
  await waitFor(()=>window.qa.clears.length===1,'Falta limpiar borrador tras publicación');
  assert.deepEqual(window.qa.clears,['tenant-a']);
  assert.deepEqual(window.qa.clearVersions,['original-tenant-a']);
  assert.equal(window.qa.catalogWrites[1].revision,'rev-a');

  window.qa.render('tenant-b','owner-b');
  await waitFor(()=>window.qa.draftReads.length===3,'Falta lectura B');
  assert.equal(visible('Quesadilla A'),false,'Cambio de tenant no muestra borrador A');
  assert.equal(button('Publicar en mi catálogo'),undefined,'B no publica antes de cargar borrador');
  await waitFor(()=>window.qa.subscriptions.length===2,'Falta listener B');
  window.qa.subscriptions[1].callback(catalog('tenant-b','rev-b'));
  window.qa.draftReads[2].resolve(draft('tenant-b','Taco B'));
  await waitFor(()=>visible('Taco B'),'Falta borrador B');
  button('Publicar en mi catálogo').click();
  await waitFor(()=>window.qa.catalogWrites.length===3,'Falta publicación B');
  assert.equal(window.qa.catalogWrites[2].businessId,'tenant-b');
  assert.equal(window.qa.catalogWrites[2].revision,'rev-b');
  assert.equal(window.qa.catalogWrites[2].items[0].name,'Taco B');
  // Una versión obsoleta no debe publicar ni borrar el borrador remoto.
  window.qa.render('tenant-c','owner-c');
  await waitFor(()=>window.qa.draftReads.length===4,'Falta lectura C');
  await waitFor(()=>window.qa.subscriptions.length===3,'Falta catálogo C');
  window.qa.subscriptions[2].callback(catalog('tenant-c','rev-c'));
  window.qa.draftReads[3].resolve(draft('tenant-c','Tamal C'));
  await waitFor(()=>visible('Tamal C'),'Falta borrador C');
  window.qa.draftConflict=true;
  button('Agregar producto').click();
  const beforeConflict=window.qa.catalogWrites.length;
  button('Publicar en mi catálogo').click();
  await waitFor(()=>visible('CONFLICTO_BORRADOR'),'Debe mostrar conflicto de borrador');
  assert.equal(window.qa.catalogWrites.length,beforeConflict,'No publicar con borrador en conflicto');
  assert.equal(window.qa.clears.includes('tenant-c'),false,'No borrar borrador en conflicto');
  assert.equal(visible('Tamal C'),true,'Conservar datos locales para recuperación');
  window.qa.draftConflict=false;
  // El catálogo ya se publicó: si el borrado falla, no destruir la edición local.
  window.qa.render('tenant-d','owner-d');
  await waitFor(()=>window.qa.draftReads.length===5,'Falta lectura D');
  await waitFor(()=>window.qa.subscriptions.length===4,'Falta catálogo D');
  window.qa.subscriptions[3].callback(catalog('tenant-d','rev-d'));
  window.qa.draftReads[4].resolve(draft('tenant-d','Pozole D'));
  await waitFor(()=>visible('Pozole D'),'Falta borrador D');
  window.qa.clearConflict=true;
  button('Publicar en mi catálogo').click();
  await waitFor(()=>window.qa.clears.includes('tenant-d'),'Falta intento de limpieza D');
  await waitFor(()=>visible('Se conserva tu borrador'),'Aviso de limpieza fallida');
  assert.equal(visible('Pozole D'),true,'No vaciar el editor si la limpieza falla');
  assert.equal(window.qa.clearVersions.at(-1),'original-tenant-d');
  window.qa.clearConflict=false;
  assert.deepEqual(errors,[],'Sin errores de React');
  console.log('PASS: fallo de borrador bloquea editor, reintento recupera, conflicto de borrador bloquea publicación, limpieza fallida conserva edición, conflicto de catálogo conserva borrador, revisión transaccional y cambio de tenant aislado (React/jsdom).');
}finally{
  window.qa.unmount?.();
  window.close();
}

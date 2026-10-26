// React real en jsdom; empleados e invitaciones completamente simulados, sin Firebase.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  '../../lib/businessInvitesService': [
    'export const BUSINESS_INVITES_ENABLED = true;',
    'export function listBusinessInvites(businessId) {return new Promise((resolve,reject)=>window.qa.inviteReads.push({businessId,resolve,reject}));}',
    'export function createBusinessInvite(businessId,name,email,role) {return new Promise((resolve,reject)=>window.qa.creates.push({businessId,name,email,role,resolve,reject}));}',
    'export async function revokeBusinessInvite(businessId,id) {window.qa.revokes.push({businessId,id});}',
  ].join('\n'),
  '../../lib/businessEmployeeService': [
    'export const MANAGEABLE_EMPLOYEE_ROLES = ["ADMIN","MANAGER","CASHIER","WAITER","KITCHEN","EMPLOYEE"];',
    'export function canManageEmployeeRole(role,target) {return role==="OWNER" || role==="ADMIN" || (role==="MANAGER" && !["OWNER","ADMIN","MANAGER"].includes(target));}',
    'export function getRolePermissions() {return []; }',
    'export function listBusinessEmployees(businessId) {return new Promise((resolve,reject)=>window.qa.employeeReads.push({businessId,resolve,reject}));}',
    'export async function createBusinessEmployee() {}',
    'export async function updateBusinessEmployee() {}',
    'export async function removeBusinessEmployee() {}',
  ].join('\n'),
};
const bundle = await build({
  absWorkingDir:root,bundle:true,write:false,format:'iife',platform:'browser',
  define:{'process.env.NODE_ENV':'"development"'},
  stdin:{resolveDir:root,loader:'jsx',contents:[
    "import React from 'react';",
    "import {createRoot} from 'react-dom/client';",
    "import {BusinessEmployeesView} from './src/components/platform/BusinessEmployeesView';",
    "const root = createRoot(document.getElementById('root'));",
    "window.qa.render = (id,role='OWNER') => root.render(<BusinessEmployeesView businessId={id} managerRole={role} onBack={() => {}} />);",
    "window.qa.unmount = () => root.unmount();",
  ].join('\n')},
  plugins:[{name:'mock-employees',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/BusinessEmployeesView.tsx') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'mock'};
    });
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom = new JSDOM('<div id="root"></div>',{
  url:'https://example.test/',runScripts:'outside-only',virtualConsole:new VirtualConsole(),
});
const {window} = dom;
const document = window.document;
window.qa = {employeeReads:[],inviteReads:[],creates:[],revokes:[]};
window.confirm = () => true;
const errors=[];
window.addEventListener('error',event=>errors.push(event.error));
const waitFor=async (predicate,message)=>{
  for(let i=0;i<200;i++){
    if(predicate())return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail(message);
};
const visible=text=>document.body.textContent.includes(text)
  || [...document.querySelectorAll('input')].some(input=>input.value.includes(text));
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const employee=(businessId,name)=>({
  id:businessId+'_'+name,userId:name,restaurantId:businessId,name,
  email:name+'@example.test',role:'WAITER',active:true,
});
const invite=(id,name)=>({
  id,name,email:name+'@example.test',role:'WAITER',
  status:'PENDING',createdAt:Date.now(),expiresAt:Date.now()+100000,
});
const employeeRead=(id,index=0)=>window.qa.employeeReads.filter(x=>x.businessId===id)[index];
const inviteRead=(id,index=0)=>window.qa.inviteReads.filter(x=>x.businessId===id)[index];
try {
  window.eval(bundle.outputFiles[0].text);
  window.qa.render('tenant-a');
  await waitFor(()=>!!employeeRead('tenant-a') && !!inviteRead('tenant-a'),'Lecturas A');
  window.qa.render('tenant-b');
  await waitFor(()=>!!employeeRead('tenant-b') && !!inviteRead('tenant-b'),'Lecturas B');
  employeeRead('tenant-a').resolve([employee('tenant-a','Empleado A obsoleto')]);
  inviteRead('tenant-a').resolve([invite('invite-a','Invitación A obsoleta')]);
  await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(visible('Empleado A obsoleto'),false);
  assert.equal(visible('Invitación A obsoleta'),false);

  employeeRead('tenant-b').reject(new Error('Error de empleados B'));
  inviteRead('tenant-b').reject(new Error('Error de invitaciones B'));
  await waitFor(()=>!!button('Reintentar empleados') && !!button('Reintentar invitaciones'),'Ambos errores deben ser recuperables');
  assert.equal(visible('Todavía no hay empleados registrados.'),false,'Fallo no debe fingir lista vacía');
  assert.equal(button('Invitar empleado').disabled,true,'No escribir con lecturas fallidas');
  button('Reintentar empleados').click();
  button('Reintentar invitaciones').click();
  await waitFor(()=>!!employeeRead('tenant-b',1) && !!inviteRead('tenant-b',1),'Reintentos B');
  employeeRead('tenant-b',1).resolve([employee('tenant-b','Empleado B válido')]);
  inviteRead('tenant-b',1).resolve([invite('invite-b','Invitación B válida')]);
  await waitFor(()=>visible('Empleado B válido') && visible('Invitación B válida'),'Datos B');
  assert.equal(visible('Empleado A obsoleto'),false);
  assert.equal(button('Invitar empleado').disabled,false);

  button('Invitar empleado').click();
  await waitFor(()=>!!document.querySelector('form'),'Formulario');
  const form=document.querySelector('form');
  const submit=()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  submit();submit();
  await waitFor(()=>window.qa.creates.length===1,'Debe crearse una sola invitación');
  assert.equal(window.qa.creates[0].businessId,'tenant-b');
  window.qa.creates[0].resolve({token:'token-b'});
  await waitFor(()=>!!document.querySelector('input[aria-label="Enlace de invitación"]'),'Enlace B');
  assert.ok(document.querySelector('input[aria-label="Enlace de invitación"]').value.includes('token-b'));
  await waitFor(()=>!!inviteRead('tenant-b',2),'Actualización invitaciones B');
  inviteRead('tenant-b',2).resolve([invite('invite-b2','Invitación B reciente')]);
  await waitFor(()=>visible('Invitación B reciente'),'Lista B actualizada');

  window.qa.render('tenant-a');
  await waitFor(()=>!!employeeRead('tenant-a',1) && !!inviteRead('tenant-a',1),'Regreso A');
  assert.equal(visible('token-b'),false,'El enlace secreto no puede sobrevivir al cambio de negocio');
  assert.equal(visible('Empleado B válido'),false);
  assert.equal(visible('Invitación B reciente'),false);
  employeeRead('tenant-a',1).resolve([]);
  inviteRead('tenant-a',1).resolve([]);
  await waitFor(()=>visible('Todavía no hay empleados registrados.'),'A vacío');
  assert.deepEqual(errors,[]);
  console.log('PASS: aislamiento de empleados/invitaciones, error y reintento, bloqueo de escritura, doble envío y enlace efímero (React/jsdom).');
} finally {
  window.qa.unmount?.();
  window.close();
}

// Auth/Firestore simulados: no conecta con Firebase ni crea usuarios reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/app': [
    'export const initializeApp = (_config,name) => ({name});',
    'export const deleteApp = async () => {};',
    'export const getApps = () => [];',
  ].join('\n'),
  'firebase/auth': [
    'export const getAuth = app => app ? {currentUser:null} : window.qa.auth;',
    'export const createUserWithEmailAndPassword = async () => {window.qa.created++; window.qa.onCreated?.(); return {user:{uid:"employee-new"}};};',
    'export const signInWithEmailAndPassword = async () => ({user:{uid:"employee-existing"}});',
    'export const signInWithPopup = async () => ({user:{uid:"employee-existing",email:"employee@example.test"}});',
    'export const GoogleAuthProvider = class {};',
  ].join('\n'),
  'firebase/firestore': [
    'export const doc = (_db,...parts) => ({path:parts.join("/")});',
    'export const getDoc = async ref => {window.qa.reads.push(ref.path); window.qa.onRead?.(ref); const data=window.qa.docs[ref.path]; return {id:ref.path.split("/").at(-1),exists:()=>!!data,data:()=>data};};',
    'export const writeBatch = () => {const actions=[]; return {set:(ref,data)=>actions.push({op:"set",path:ref.path,data}),update:(ref,data)=>actions.push({op:"update",path:ref.path,data}),delete:ref=>actions.push({op:"delete",path:ref.path}),commit:async()=>window.qa.writes.push(...actions)};};',
    'export const updateDoc = async (ref,data) => {window.qa.writes.push({op:"updateDoc",path:ref.path,data});};',
    'export const arrayUnion = value => ({arrayUnion:value});',
    'export const arrayRemove = value => ({arrayRemove:value});',
    'export const collection = () => ({});',
    'export const deleteDoc = async () => {};',
    'export const getDocs = async () => ({});',
    'export const query = () => ({});',
    'export const setDoc = async () => {};',
    'export const where = () => ({});',
  ].join('\n'),
  './firebase': 'export const auth={currentUser:null}; export const db={}; window.qa.auth=auth;',
  './restaurantCore': 'export const ROLE_PERMISSIONS={}; export const hasBusinessPermission=()=>false;',
};
const bundle = await build({
  absWorkingDir: root, bundle:true, write:false, format:'iife', platform:'browser',
  stdin:{resolveDir:root,loader:'js',contents:[
    "import {createBusinessEmployee,updateBusinessEmployee,removeBusinessEmployee} from './src/lib/businessEmployeeService';",
    'window.qa.create=createBusinessEmployee;',
    'window.qa.update=updateBusinessEmployee;',
    'window.qa.remove=removeBusinessEmployee;',
  ].join('\n')},
  plugins:[{name:'mock-employee-lifecycle',setup(build){
    build.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/businessEmployeeService.ts') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'mock'};
    });
    build.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const dom=new JSDOM('',{url:'https://example.test/',runScripts:'outside-only'});
const {window}=dom;
window.qa={reads:[],writes:[],created:0,docs:{}};
const user=uid=>({uid,email:uid+'@example.test'});
const member=(tenant,uid,role='OWNER',active=true)=>({
  restaurantId:tenant,userId:uid,role,active,name:uid,email:uid+'@example.test',
});
const input=(tenant='tenant-a',role='WAITER',accountMode='new')=>({
  businessId:tenant,name:'Empleado',email:'employee@example.test',password:'password123',role,accountMode,
});
const reset=(role='OWNER')=>{
  window.qa.auth.currentUser=user('owner-a');
  window.qa.reads=[];window.qa.writes=[];window.qa.created=0;
  window.qa.onRead=null;window.qa.onCreated=null;
  window.qa.docs={
    'businessMemberships/tenant-a_owner-a':member('tenant-a','owner-a',role),
    'businesses/tenant-a':{restaurantId:'tenant-a',ownerUserId:'owner-a'},
    'businessMemberships/tenant-a_employee-existing':member('tenant-a','employee-existing','WAITER'),
    'businessMemberships/tenant-a_employee-new':member('tenant-a','employee-new','WAITER'),
    'businesses/tenant-b':{restaurantId:'tenant-b',ownerUserId:'owner-b'},
    'businessMemberships/tenant-b_owner-b':member('tenant-b','owner-b'),
  };
};
try {
  window.eval(bundle.outputFiles[0].text);

  // Una cuenta no autorizada no debe iniciar siquiera la creación de Auth secundaria.
  reset();
  delete window.qa.docs['businessMemberships/tenant-a_owner-a'];
  await assert.rejects(window.qa.create(input()),/No tienes permiso/);
  assert.equal(window.qa.created,0);
  assert.equal(window.qa.writes.length,0);

  // Dos negocios ficticios: OWNER de A no puede crear empleados en B.
  reset();
  await assert.rejects(window.qa.create(input('tenant-b')),/No tienes permiso/);
  assert.equal(window.qa.created,0);

  // Un responsable MANAGER no puede otorgar ADMIN.
  reset('MANAGER');
  await assert.rejects(window.qa.create(input('tenant-a','ADMIN')),/Tu rol/);
  assert.equal(window.qa.created,0);

  // Propietario explícito incorrecto: no iniciar Auth ni escribir.
  reset();
  window.qa.docs['businesses/tenant-a'].ownerUserId='owner-b';
  await assert.rejects(window.qa.create(input()),/propietario es inconsistente/);
  assert.equal(window.qa.created,0);

  // Alta legítima: permiso previo y posterior a Auth, membresía + índice en un batch.
  reset();
  const created=await window.qa.create(input());
  assert.equal(created.userId,'employee-new');
  assert.equal(window.qa.created,1);
  assert.deepEqual(window.qa.writes.map(w=>w.path),[
    'businessMemberships/tenant-a_employee-new','businesses/tenant-a',
  ]);
  assert.equal(window.qa.writes[0].data.restaurantId,'tenant-a');
  assert.equal(window.qa.writes[1].data.employeeUserIds.arrayUnion,'employee-new');

  // Revocación entre creación Auth y batch: no se vincula al empleado.
  reset();
  window.qa.onCreated=()=>{window.qa.docs['businessMemberships/tenant-a_owner-a'].active=false;};
  await assert.rejects(window.qa.create(input()),/No tienes permiso/);
  assert.equal(window.qa.created,1);
  assert.equal(window.qa.writes.length,0);

  // Cambio de cuenta durante la operación secundaria: no escribir con UID ajeno.
  reset();
  window.qa.onCreated=()=>{window.qa.auth.currentUser=user('owner-b');};
  await assert.rejects(window.qa.create(input()),/cambió la sesión/);
  assert.equal(window.qa.writes.length,0);

  // Una cuenta existente se valida, sin crear otra cuenta Auth.
  reset();
  const existing=await window.qa.create(input('tenant-a','WAITER','existing'));
  assert.equal(existing.userId,'employee-existing');
  assert.equal(window.qa.created,0);
  assert.equal(window.qa.writes.length,2);

  // Editar empleado legítimo: únicamente campos permitidos.
  reset();
  await window.qa.update('tenant-a','employee-existing',{role:'CASHIER',active:false,name:' Ana '});
  assert.equal(window.qa.writes.length,1);
  assert.deepEqual(Object.keys(window.qa.writes[0].data).sort(),['active','name','role','updatedAt']);
  assert.equal(window.qa.writes[0].data.name,'Ana');

  // No editar propietario, ni la propia cuenta, ni un miembro del otro tenant.
  reset();
  await assert.rejects(window.qa.update('tenant-a','owner-a',{active:false}),/propia membresía/);
  assert.equal(window.qa.writes.length,0);
  reset();
  window.qa.docs['businessMemberships/tenant-a_employee-existing'].role='OWNER';
  await assert.rejects(window.qa.update('tenant-a','employee-existing',{active:false}),/inconsistente/);
  assert.equal(window.qa.writes.length,0);
  reset();
  window.qa.docs['businessMemberships/tenant-a_employee-existing'].restaurantId='tenant-b';
  await assert.rejects(window.qa.update('tenant-a','employee-existing',{active:false}),/inconsistente/);
  assert.equal(window.qa.writes.length,0);

  // MANAGER no puede promover a ADMIN ni administrar a otro MANAGER.
  reset('MANAGER');
  await assert.rejects(window.qa.update('tenant-a','employee-existing',{role:'ADMIN'}),/Tu rol/);
  assert.equal(window.qa.writes.length,0);
  reset('MANAGER');
  window.qa.docs['businessMemberships/tenant-a_employee-existing'].role='MANAGER';
  await assert.rejects(window.qa.remove('tenant-a','employee-existing'),/Tu rol/);
  assert.equal(window.qa.writes.length,0);

  // Revocación del responsable durante las lecturas de edición: falla cerrado.
  reset();
  let targetRead=false;
  window.qa.onRead=ref=>{
    if(ref.path==='businessMemberships/tenant-a_employee-existing' && !targetRead) {
      targetRead=true;
      window.qa.docs['businessMemberships/tenant-a_owner-a'].active=false;
    }
  };
  await assert.rejects(window.qa.update('tenant-a','employee-existing',{active:false}),/No tienes permiso/);
  assert.equal(window.qa.writes.length,0);

  // Cambio de sesión durante la lectura de la raíz.
  reset();
  window.qa.onRead=ref=>{if(ref.path==='businesses/tenant-a')window.qa.auth.currentUser=user('owner-b');};
  await assert.rejects(window.qa.remove('tenant-a','employee-existing'),/sesión cambió/);
  assert.equal(window.qa.writes.length,0);

  // Retiro legítimo confirma membresía e índice juntos.
  reset();
  await window.qa.remove('tenant-a','employee-existing');
  assert.deepEqual(window.qa.writes.map(w=>w.op),['delete','update']);
  assert.equal(window.qa.writes[1].data.employeeUserIds.arrayRemove,'employee-existing');

  console.log('PASS: permisos y sesión del responsable antes/después de Auth, jerarquía de roles, edición y retiro aislados A/B (simulados).');
} finally {
  window.close();
}

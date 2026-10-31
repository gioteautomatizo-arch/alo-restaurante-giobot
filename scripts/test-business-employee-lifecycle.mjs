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
    'export const getDocFromServer = async ref => {',
    '  window.qa.serverReads++; if (window.qa.serverError) throw window.qa.serverError;',
    '  if (!window.qa.remoteDocs) return getDoc(ref);',
    '  const data=window.qa.remoteDocs[ref.path];',
    '  return {id:ref.path.split("/").at(-1),exists:()=>!!data,data:()=>data};',
    '};',
    'export const runTransaction = async (_db, callback) => {',
    '  window.qa.transactions++;',
    '  for (let attempt = 0; attempt < 2; attempt++) {',
    '    const observed = new Map(); const staged = [];',
    '    const transaction = {',
    '      get: async ref => {',
    '        window.qa.onTransactionRead?.(ref, attempt);',
    '        const snapshot = await getDoc(ref);',
    '        observed.set(ref.path, JSON.stringify(window.qa.docs[ref.path]));',
    '        return snapshot;',
    '      },',
    '      set: (ref, data) => staged.push({op:"set",path:ref.path,data}),',
    '      update: (ref, data) => staged.push({op: ref.path.startsWith("businesses/") ? "update" : "updateDoc",path:ref.path,data}),',
    '      delete: ref => staged.push({op:"delete",path:ref.path}),',
    '    };',
    '    await callback(transaction);',
    '    window.qa.onBeforeTransactionCommit?.(attempt);',
    '    if ([...observed].some(([path, version]) => JSON.stringify(window.qa.docs[path]) !== version)) {',
    '      window.qa.conflicts++;',
    '      if (attempt === 0) continue;',
    '      throw new Error("transaction-conflict");',
    '    }',
    '    if(window.qa.batchMode === "reject-cache") {',
    '      window.qa.remoteDocs={}; throw Object.assign(new Error("NETWORK_LOST_BEFORE_COMMIT"),{code:"unavailable"});',
    '    }',
    '    if(window.qa.batchMode === "lost-after") {',
    '      window.qa.remoteDocs=JSON.parse(JSON.stringify(window.qa.docs));',
    '      for(const action of staged) {',
    '        if(action.op === "set") window.qa.remoteDocs[action.path]={...action.data};',
    '        if(action.op === "update") {',
    '          const old=window.qa.remoteDocs[action.path] || {};',
    '          window.qa.remoteDocs[action.path]={...old,employeeUserIds:[...new Set([...(old.employeeUserIds||[]),action.data.employeeUserIds.arrayUnion])]};',
    '        }',
    '      }',
    '      const root=window.qa.remoteDocs["businesses/tenant-a"];',
    '      const member=window.qa.remoteDocs["businessMemberships/tenant-a_employee-new"];',
    '      if(window.qa.corruptAfterCommit === "missing-index") root.employeeUserIds=[];',
    '      if(window.qa.corruptAfterCommit === "wrong-owner") root.ownerUserId="owner-b";',
    '      if(window.qa.corruptAfterCommit === "wrong-tenant") member.restaurantId="tenant-b";',
    '      if(window.qa.corruptAfterCommit === "wrong-attempt") member.createdAt="previous-attempt";',
    '      if(window.qa.corruptAfterCommit === "switch-session") window.qa.auth.currentUser={uid:"owner-b"};',
    '      if(window.qa.corruptAfterCommit === "offline") window.qa.serverError=new Error("offline");',
    '      throw Object.assign(new Error("LOST_COMMIT_RESPONSE"),{code:"unavailable"});',
    '    }',
    '    if(window.qa.batchError) throw window.qa.batchError;',
    '    window.qa.writes.push(...staged); return;',
    '  }',
    '};',
    'export const writeBatch = () => {const actions=[]; return {',
    '  set:(ref,data)=>actions.push({op:"set",path:ref.path,data}),',
    '  update:(ref,data)=>actions.push({op:"update",path:ref.path,data}),',
    '  delete:ref=>actions.push({op:"delete",path:ref.path}),',
    '  commit:async()=>{',
    '    if(window.qa.batchMode === "reject-cache") {',
    '      window.qa.remoteDocs={};',
    '      throw Object.assign(new Error("NETWORK_LOST_BEFORE_COMMIT"),{code:"unavailable"});',
    '    }',
    '    if(window.qa.batchMode === "lost-after") {',
    '      window.qa.remoteDocs={...window.qa.docs};',
    '      for(const action of actions) {',
    '        if(action.op === "set") window.qa.remoteDocs[action.path]={...action.data};',
    '        if(action.op === "update") {',
    '          const old=window.qa.remoteDocs[action.path] || {};',
    '          window.qa.remoteDocs[action.path]={...old,employeeUserIds:[...new Set([...(old.employeeUserIds||[]),action.data.employeeUserIds.arrayUnion])]};',
    '        }',
    '      }',
    '      const root=window.qa.remoteDocs["businesses/tenant-a"];',
    '      const member=window.qa.remoteDocs["businessMemberships/tenant-a_employee-new"];',
    '      if(window.qa.corruptAfterCommit === "missing-index") root.employeeUserIds=[];',
    '      if(window.qa.corruptAfterCommit === "wrong-owner") root.ownerUserId="owner-b";',
    '      if(window.qa.corruptAfterCommit === "wrong-tenant") member.restaurantId="tenant-b";',
    '      if(window.qa.corruptAfterCommit === "wrong-attempt") member.createdAt="previous-attempt";',
    '      if(window.qa.corruptAfterCommit === "switch-session") window.qa.auth.currentUser={uid:"owner-b"};',
    '      if(window.qa.corruptAfterCommit === "offline") window.qa.serverError=new Error("offline");',
    '      throw Object.assign(new Error("LOST_COMMIT_RESPONSE"),{code:"unavailable"});',
    '    }',
    '    if(window.qa.batchError)throw window.qa.batchError;',
    '    window.qa.writes.push(...actions);',
    '  },',
    '};};',
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
    "import {createBusinessEmployee,updateBusinessEmployee,removeBusinessEmployee,listBusinessEmployees} from './src/lib/businessEmployeeService';",
    'window.qa.list=listBusinessEmployees;',
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
window.qa={reads:[],writes:[],created:0,docs:{},serverReads:0,serverError:null,remoteDocs:null,batchMode:null,corruptAfterCommit:null,transactions:0,conflicts:0};
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
  window.qa.onRead=null;window.qa.onCreated=null;window.qa.batchError=null;window.qa.serverError=null;
  window.qa.onTransactionRead=null;window.qa.onBeforeTransactionCommit=null;window.qa.transactions=0;window.qa.conflicts=0;
  window.qa.remoteDocs=null;window.qa.batchMode=null;window.qa.corruptAfterCommit=null;
  window.qa.docs={
    'businessMemberships/tenant-a_owner-a':member('tenant-a','owner-a',role),
    'businesses/tenant-a':{restaurantId:'tenant-a',ownerUserId:'owner-a'},
    'businessMemberships/tenant-a_employee-existing':member('tenant-a','employee-existing','WAITER'),
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

  assert.equal(window.qa.transactions,1,'El alta revalida permisos y raíz en una transacción');

  // Una cuenta ya indexada nunca debe volver a crear su membresía ni
  // reemplazar nombre, rol o fechas mediante un segundo formulario de alta.
  reset();
  window.qa.docs['businesses/tenant-a'].employeeUserIds=['employee-new'];
  window.qa.docs['businessMemberships/tenant-a_employee-new']={
    ...member('tenant-a','employee-new','ADMIN'),createdAt:'registro-original',
  };
  await assert.rejects(window.qa.create(input()),/No se pudo confirmar/);
  assert.equal(window.qa.writes.length,0,'El alta duplicada no sobrescribe al empleado');
  assert.equal(window.qa.docs['businessMemberships/tenant-a_employee-new'].role,'ADMIN');

  // La transacción relee el rol del responsable, la propiedad y el índice
  // incluso si cambiaron DESPUÉS de crear la cuenta Auth secundaria.
  for (const [label,ref,change] of [
    ['responsable revocado','businessMemberships/tenant-a_owner-a',
      () => {window.qa.docs['businessMemberships/tenant-a_owner-a'].active=false;}],
    ['propietario reasignado','businesses/tenant-a',
      () => {window.qa.docs['businesses/tenant-a'].ownerUserId='owner-b';}],
    ['UID ya indexado','businesses/tenant-a',
      () => {window.qa.docs['businesses/tenant-a'].employeeUserIds=['employee-new'];}],
    ['índice corrupto','businesses/tenant-a',
      () => {window.qa.docs['businesses/tenant-a'].employeeUserIds='inválido';}],
  ]) {
    reset();
    let changed=false;
    window.qa.onTransactionRead=target=>{
      if(!changed && target.path===ref){changed=true;change();}
    };
    await assert.rejects(window.qa.create(input()),/No se pudo confirmar/,label);
    assert(changed,label+': se ejecutó el cambio concurrente');
    assert.equal(window.qa.writes.length,0,label+': sin escrituras');
  }
  reset();
  window.qa.onBeforeTransactionCommit=attempt=>{
    if(attempt===0) window.qa.docs['businesses/tenant-a'].employeeUserIds=['employee-new'];
  };
  await assert.rejects(window.qa.create(input()),/No se pudo confirmar/);
  assert.equal(window.qa.conflicts,1,'Un alta concurrente obliga a reintentar');
  assert.equal(window.qa.writes.length,0,'El reintento no sobrescribe un UID indexado');

  // La transacción puede fallar después de crear Auth: no afirmar que se borró la cuenta.
  reset();
  window.qa.batchError=Object.assign(new Error('permission-denied'),{code:'permission-denied'});
  await assert.rejects(window.qa.create(input()),/No se pudo confirmar/);
  assert.equal(window.qa.created,1);
  assert.equal(window.qa.writes.length,0);

  // Una respuesta perdida después de un batch confirmado no debe anunciar
  // un fallo: verificar por servidor la membresía exacta y el índice del tenant.
  reset();
  window.qa.batchMode='lost-after';
  const recovered=await window.qa.create(input());
  assert.equal(recovered.userId,'employee-new');
  assert.equal(window.qa.created,1);
  assert.equal(window.qa.writes.length,0,'El mock perdió respuesta, no la escritura remota');
  assert(window.qa.serverReads >= 6,'Confirmar ambos documentos y revalidar responsable desde servidor');
  assert(window.qa.remoteDocs['businesses/tenant-a'].employeeUserIds.includes('employee-new'));

  // El documento en caché puede parecer correcto, pero el servidor es autoridad.
  reset();
  window.qa.batchMode='reject-cache';
  await assert.rejects(window.qa.create(input()),/No se pudo confirmar/);
  assert.equal(window.qa.created,1);
  assert.equal(window.qa.writes.length,0);

  // No recuperar ante índice ausente, membresía de otro tenant, marca de otro
  // intento, propietario cambiado, desconexión o sesión de otra cuenta.
  for (const corruption of ['missing-index','wrong-tenant','wrong-attempt','wrong-owner','offline','switch-session']) {
    reset();
    window.qa.batchMode='lost-after';
    window.qa.corruptAfterCommit=corruption;
    await assert.rejects(window.qa.create(input()),/No se pudo confirmar/,
      'Sin confirmación remota completa no declarar éxito: '+corruption);
    assert.equal(window.qa.created,1);
  }

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
  assert.equal(window.qa.transactions,1,'La edición debe confirmar su permiso dentro de una transacción');

  // El objetivo puede cambiar DESPUÉS de su primera lectura, mientras se
  // revalidan los permisos del responsable. Ni edición ni baja deben operar
  // con esa versión antigua. Las reglas Firestore siguen siendo autoridad.
  const employeePath='businessMemberships/tenant-a_employee-existing';
  const concurrentTargetChanges=[
    ['promovido a OWNER',()=>{window.qa.docs[employeePath].role='OWNER';}],
    ['desactivado',()=>{window.qa.docs[employeePath].active=false;}],
    ['trasladado a B',()=>{window.qa.docs[employeePath].restaurantId='tenant-b';}],
    ['identidad cambiada',()=>{window.qa.docs[employeePath].userId='employee-new';}],
    ['nombre cambiado',()=>{window.qa.docs[employeePath].name='Otro nombre';}],
    ['borrado',()=>{delete window.qa.docs[employeePath];}],
    ['recreado',()=>{window.qa.docs[employeePath]={...member('tenant-a','employee-existing','WAITER'),createdAt:'nuevo-registro'};}],
  ];
  for(const [label,mutate] of concurrentTargetChanges){
    for(const operation of ['update','remove']){
      reset();
      let roots=0;
      window.qa.onRead=ref=>{
        if(ref.path==='businesses/tenant-a' && ++roots===2)mutate();
      };
      const attempt=operation==='update'
        ? window.qa.update('tenant-a','employee-existing',{active:false})
        : window.qa.remove('tenant-a','employee-existing');
      await assert.rejects(attempt,/membresía del empleado cambió/,label+' / '+operation);
      assert.equal(roots,2,label+': mutación durante revalidación del responsable');
      assert.equal(window.qa.writes.length,0,label+': sin escrituras');
    }
  }
  // También se descartan la sesión cambiada y el servidor caído justo antes
  // de la segunda lectura del empleado, sin ejecutar updateDoc ni el batch.
  for(const operation of ['update','remove']){
    reset();
    let targetReads=0;
    window.qa.onRead=ref=>{
      if(ref.path===employeePath && ++targetReads===2)
        window.qa.auth.currentUser=user('owner-b');
    };
    await assert.rejects(
      operation==='update'
        ? window.qa.update('tenant-a','employee-existing',{active:false})
        : window.qa.remove('tenant-a','employee-existing'),
      /sesión cambió/,
    );
    assert.equal(targetReads,2);
    assert.equal(window.qa.writes.length,0);

    reset();
    let roots=0;
    window.qa.onRead=ref=>{
      if(ref.path==='businesses/tenant-a' && ++roots===2)
        window.qa.serverError=new Error('offline-target-recheck');
    };
    await assert.rejects(
      operation==='update'
        ? window.qa.update('tenant-a','employee-existing',{active:false})
        : window.qa.remove('tenant-a','employee-existing'),
      /offline-target-recheck/,
    );
    assert.equal(window.qa.writes.length,0);
  }

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
  assert.equal(window.qa.transactions,1,'La baja y su índice deben compartir una transacción');


  // Regresión atómica: un cambio DESPUÉS de la última lectura del preflight
  // y ANTES de las lecturas transaccionales nunca debe autorizar escrituras.
  for (const operation of ['update','remove']) {
    for (const [label, path, mutate, expected] of [
      ['objetivo promovido', employeePath, () => {window.qa.docs[employeePath].role='OWNER';}, /membresía del empleado cambió/],
      ['objetivo desactivado', employeePath, () => {window.qa.docs[employeePath].active=false;}, /membresía del empleado cambió/],
      ['objetivo movido a B', employeePath, () => {window.qa.docs[employeePath].restaurantId='tenant-b';}, /membresía del empleado cambió/],
      ['objetivo renombrado', employeePath, () => {window.qa.docs[employeePath].name='Actualizado por otro';}, /membresía del empleado cambió/],
      ['responsable revocado', 'businessMemberships/tenant-a_owner-a', () => {window.qa.docs['businessMemberships/tenant-a_owner-a'].active=false;}, /Tus permisos cambiaron/],
      ['propietario reasignado', 'businesses/tenant-a', () => {window.qa.docs['businesses/tenant-a'].ownerUserId='owner-b';}, /identidad o propiedad/],
    ]) {
      reset();
      let mutated=false;
      window.qa.onTransactionRead=ref=>{
        if (!mutated && ref.path===path) {mutated=true;mutate();}
      };
      await assert.rejects(
        operation==='update'
          ? window.qa.update('tenant-a','employee-existing',{active:false})
          : window.qa.remove('tenant-a','employee-existing'),
        expected, label+' / '+operation,
      );
      assert(mutated,label+': mutación al comenzar transacción');
      assert.equal(window.qa.transactions,1);
      assert.equal(window.qa.writes.length,0,label+': no hay escritura parcial');
    }

    // Una escritura concurrente entre lecturas y commit causa reintento;
    // el callback debe detectar el rol actualizado, no aplicar el preflight.
    reset();
    window.qa.onBeforeTransactionCommit=attempt=>{
      if(attempt===0) window.qa.docs[employeePath].role='OWNER';
    };
    await assert.rejects(
      operation==='update'
        ? window.qa.update('tenant-a','employee-existing',{active:false})
        : window.qa.remove('tenant-a','employee-existing'),
      /membresía del empleado cambió/,
    );
    assert.equal(window.qa.conflicts,1,'Conflicto optimista debe reintentar la transacción');
    assert.equal(window.qa.writes.length,0,'Un reintento no escribe con rol obsoleto');
  }

  // Sin cambios concurrentes, ADMIN puede editar en A pero no mutar B.
  reset('ADMIN');
  await window.qa.update('tenant-a','employee-existing',{name:'Nuevo nombre'});
  assert.equal(window.qa.writes.length,1);
  reset('ADMIN');
  await assert.rejects(window.qa.remove('tenant-b','employee-existing'),/No tienes permiso/);
  assert.equal(window.qa.writes.length,0);

  // La caché de OWNER no puede autorizar crear una cuenta Auth secundaria
  // si el servidor no está disponible para comprobar permisos vigentes.
  reset();
  window.qa.serverError = new Error('offline');
  await assert.rejects(window.qa.create(input()), /offline/);
  assert.equal(window.qa.created, 0, 'Sin servidor no crear Auth secundaria');
  assert.equal(window.qa.writes.length, 0);
  await assert.rejects(window.qa.update('tenant-a','employee-existing',{active:false}), /offline/);
  assert.equal(window.qa.writes.length, 0);
  assert(window.qa.serverReads > 0, 'Preflight de empleados debe leer permisos del servidor');
  // Paso 2: el listado debe revalidar la raíz y el índice después de leer
  // empleados, además de revalidar la membresía del responsable.
  const prepareRoster = (ids = ['employee-existing']) => {
    reset();
    window.qa.docs['businesses/tenant-a'].employeeUserIds = [...ids];
    if (ids.includes('employee-new')) {
      window.qa.docs['businessMemberships/tenant-a_employee-new'] =
        member('tenant-a','employee-new','WAITER');
    }
  };
  prepareRoster();
  const ownRoster = await window.qa.list('tenant-a');
  assert.deepEqual(Array.from(ownRoster, employee => employee.userId), ['employee-existing']);
  assert(window.qa.serverReads >= 5, 'El roster requiere permisos, raíz y revalidaciones remotas');

  // A no puede obtener el roster de B sin membresía de responsable en B.
  prepareRoster();
  await assert.rejects(window.qa.list('tenant-b'), /No tienes permiso/);
  assert.equal(window.qa.writes.length, 0);

  // Reordenar el índice sin cambiar su contenido no debe bloquear al equipo.
  prepareRoster(['employee-existing', 'employee-new']);
  window.qa.onRead = ref => {
    if (ref.path === 'businessMemberships/tenant-a_employee-existing') {
      window.qa.docs['businesses/tenant-a'].employeeUserIds =
        ['employee-new', 'employee-existing'];
    }
  };
  assert.equal((await window.qa.list('tenant-a')).length, 2);

  // OWNER residual, raíz reasignada o índice alterado durante la lectura:
  // nunca entregar una lista calculada con la identidad anterior.
  for (const [label, mutate, expected] of [
    ['cambio de propietario', () => { window.qa.docs['businesses/tenant-a'].ownerUserId = 'owner-b'; }, /propiedad/],
    ['cambio de tenant', () => { window.qa.docs['businesses/tenant-a'].restaurantId = 'tenant-b'; }, /identidad/],
    ['empleado agregado', () => { window.qa.docs['businesses/tenant-a'].employeeUserIds.push('employee-new'); }, /índice/],
    ['empleado retirado', () => { window.qa.docs['businesses/tenant-a'].employeeUserIds = []; }, /índice/],
    ['responsable revocado', () => { window.qa.docs['businessMemberships/tenant-a_owner-a'].active = false; }, /No tienes permiso/],
    ['sesión cambiada', () => { window.qa.auth.currentUser = user('owner-b'); }, /sesión cambió/],
  ]) {
    prepareRoster();
    let changed = false;
    window.qa.onRead = ref => {
      if (!changed && ref.path === 'businessMemberships/tenant-a_employee-existing') {
        changed = true;
        mutate();
      }
    };
    await assert.rejects(window.qa.list('tenant-a'), expected, label);
    assert(changed, label + ': la mutación debe ocurrir después de la primera lectura de raíz');
    assert.equal(window.qa.writes.length, 0, label + ': sin escrituras');
  }

  // Incluso un roster inicialmente vacío debe comprobar que no fue alterado
  // durante las dos lecturas de raíz, en lugar de devolver [] engañosamente.
  prepareRoster([]);
  let rootReads = 0;
  window.qa.onRead = ref => {
    if (ref.path === 'businesses/tenant-a' && ++rootReads === 2) {
      window.qa.docs['businesses/tenant-a'].employeeUserIds = ['employee-existing'];
    }
  };
  await assert.rejects(window.qa.list('tenant-a'), /índice/);
  assert.equal(rootReads, 2);

  prepareRoster([]);
  assert.equal((await window.qa.list('tenant-a')).length, 0, 'Roster vacío estable permitido');
  prepareRoster();
  window.qa.serverError = new Error('offline');
  await assert.rejects(window.qa.list('tenant-a'), /offline/, 'No usar caché offline para autorizar roster');

  console.log('PASS: roster A/B revalida raíz, propietario, índice y permisos; cambios en vuelo, sesión ajena y offline fallan cerrados (simulado).');
  console.log('PASS: alta transaccional A/B revalida responsable, raíz e índice; colisión indexada y conflictos se rechazan sin escrituras (simulado).');
  console.log('PASS: alta de empleado recupera respuesta perdida solo con membresía e índice exactos del servidor; caché, offline y sesión ajena fallan cerrados (simulado).');
  console.log('PASS: alta/edición de empleados no inicia Auth ni escribe con permisos cacheados offline (simulado).');
  console.log('PASS: permisos y sesión del responsable antes/después de Auth, jerarquía de roles, edición y retiro aislados A/B (simulados).');
  console.log('PASS: edición y baja transaccionales rechazan cambios de objetivo, responsable y raíz; conflicto optimista reintenta sin escrituras parciales (simulado).');
} finally {
  window.close();
}

// Paso 2: CAS de branding real con transacciones Firestore simuladas.
// Datos A/B sintéticos; nunca accede a Firebase ni escribe documentos reales.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': [
    'export const doc = (_db, collection, id) => ({collection,id});',
    'export async function runTransaction(_db, fn) {',
    '  if (globalThis.qa.failTransaction) throw new Error("SIMULATED_FIRESTORE_FAILURE");',
    '  const tx = {',
    '    get: async ref => {',
    '      globalThis.qa.reads.push(ref);',
    '      const record = globalThis.qa.records[ref.id];',
    '      if (globalThis.qa.onRead) await globalThis.qa.onRead(ref);',
    '      return {exists: () => !!record, data: () => record ? JSON.parse(JSON.stringify(record)) : undefined};',
    '    },',
    '    update: (ref, patch) => {',
    '      globalThis.qa.writes.push({ref,patch});',
    '      globalThis.qa.records[ref.id] = {...globalThis.qa.records[ref.id],...patch};',
    '    },',
    '  };',
    '  return fn(tx);',
    '}',
  ].join('\n'),
  './firebase': 'export const auth = {get currentUser() {return globalThis.qa.user;}}; export const db = {};',
};
const bundle = await build({
  absWorkingDir: rootDir, bundle: true, write: false, format: 'iife',
  platform: 'browser',
  stdin: {
    resolveDir: rootDir, loader: 'js',
    contents: "import {saveBusinessBranding} from './src/lib/businessBrandingService'; globalThis.qa.save=saveBusinessBranding;",
  },
  plugins: [{name:'mock-branding-firestore',setup(plugin) {
    plugin.onResolve({filter:/.*/},args=>{
      if (args.importer.endsWith('/businessBrandingService.ts') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'mock'};
    });
    plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const clone = value => JSON.parse(JSON.stringify(value));
const tenant = (id, uid) => ({
  restaurantId:id, ownerUserId:uid, businessType:'restaurant',
  branding:{
    restaurantName:'Negocio '+id, publicSlug:id,
    vipEnabled:true, loyaltyProgramName:'Sellos '+id, vipStampsRequired:8,
  },
});
const qa = {user:{uid:'owner-a'},records:{},reads:[],writes:[],onRead:null,failTransaction:false};
runInNewContext(bundle.outputFiles[0].text, {qa});
const a = tenant('tenant-a','owner-a');
const b = tenant('tenant-b','owner-b');
qa.records['tenant-a'] = clone(a);
qa.records['tenant-b'] = clone(b);
const rename = (observed, name) => ({...observed.branding,restaurantName:name});
const rejectNoWrite = async (operation,pattern) => {
  const count=qa.writes.length;
  await assert.rejects(operation,pattern);
  assert.equal(qa.writes.length,count,'Rechazo no debe emitir escritura');
};

// Escritura legítima en A conserva VIP y no toca B.
await qa.save(clone(a),rename(a,'A actualizada'));
assert.equal(qa.records['tenant-a'].branding.restaurantName,'A actualizada');
assert.equal(qa.records['tenant-a'].branding.vipStampsRequired,8);
assert.deepEqual(qa.records['tenant-b'],b);
assert.equal(qa.writes[0].ref.id,'tenant-a');
assert.deepEqual(Object.keys(qa.writes[0].patch),['branding'],
  'No sobrescribir OWNER, permisos ni otros campos de la raíz');

// Segunda pestaña con el mismo estado inicial no puede restaurar el nombre viejo.
await rejectNoWrite(qa.save(clone(a),rename(a,'A desde pestaña vieja')),/CONFLICTO_IDENTIDAD/);
assert.equal(qa.records['tenant-a'].branding.restaurantName,'A actualizada');

// Cambio VIP concurrente también invalida la versión antigua del formulario.
const freshA=clone(qa.records['tenant-a']);
qa.records['tenant-a'].branding.vipStampsRequired=10;
await rejectNoWrite(qa.save(freshA,rename(freshA,'Nombre peligroso')),/CONFLICTO_IDENTIDAD/);
assert.equal(qa.records['tenant-a'].branding.vipStampsRequired,10);
assert.equal(qa.records['tenant-a'].branding.restaurantName,'A actualizada');

// Un campo desconocido histórico tampoco puede borrarse por sobrescritura.
const freshVip=clone(qa.records['tenant-a']);
qa.records['tenant-a'].branding.futureVipPolicy='no-borrar';
await rejectNoWrite(qa.save(freshVip,rename(freshVip,'A antigua')),/CONFLICTO_IDENTIDAD/);
assert.equal(qa.records['tenant-a'].branding.futureVipPolicy,'no-borrar');

// Propietario, tenant o tipo modificados bloquean antes de escribir.
const freshOwner=clone(qa.records['tenant-a']);
qa.records['tenant-a'].ownerUserId='owner-b';
await rejectNoWrite(qa.save(freshOwner,rename(freshOwner,'Invasión')),/CONFLICTO_IDENTIDAD/);
qa.records['tenant-a'].ownerUserId='owner-a';
const freshId=clone(qa.records['tenant-a']);
qa.records['tenant-a'].restaurantId='tenant-b';
await rejectNoWrite(qa.save(freshId,rename(freshId,'Cruce')),/CONFLICTO_IDENTIDAD/);
qa.records['tenant-a'].restaurantId='tenant-a';
const freshType=clone(qa.records['tenant-a']);
qa.records['tenant-a'].businessType='ghost-kitchen';
await rejectNoWrite(qa.save(freshType,rename(freshType,'Tipo viejo')),/CONFLICTO_IDENTIDAD/);
qa.records['tenant-a'].businessType='restaurant';

// Sesión cambiada DURANTE lectura remota no puede escribir con UID obsoleto.
const freshSession=clone(qa.records['tenant-a']);
qa.onRead=async()=>{qa.user={uid:'owner-b'};};
await rejectNoWrite(qa.save(freshSession,rename(freshSession,'Cuenta equivocada')),/sesión cambió/);
qa.onRead=null;
qa.user=null;
await rejectNoWrite(qa.save(freshSession,rename(freshSession,'Sin sesión')),/sesión o identidad/);

// B guarda su propia identidad, A queda intacta.
qa.user={uid:'owner-b'};
const beforeA=clone(qa.records['tenant-a']);
await qa.save(clone(b),rename(b,'B actualizada'));
assert.equal(qa.records['tenant-b'].branding.restaurantName,'B actualizada');
assert.deepEqual(clone(qa.records['tenant-a']),beforeA, 'B no debe modificar A (normalizar realms VM)');
assert.equal(qa.writes.at(-1).ref.id,'tenant-b');

// Un error de Firestore se propaga sin informar éxito.
qa.failTransaction=true;
await rejectNoWrite(qa.save(clone(qa.records['tenant-b']),rename(qa.records['tenant-b'],'No guardado')),
  /SIMULATED_FIRESTORE_FAILURE/);
qa.failTransaction=false;
assert(qa.reads.every(ref=>ref.collection==='businesses'));
console.log('PASS: CAS real de branding A/B, pestañas obsoletas, VIP concurrente, identidad/OWNER, sesión y fallos (Firestore simulado; sin datos reales).');

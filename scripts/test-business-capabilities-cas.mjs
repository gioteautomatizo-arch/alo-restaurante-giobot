// Paso 2: CAS de módulos A/B con el servicio REAL y Firestore/Auth simulados.
// Sin acceso a Firebase, cuentas reales, reglas desplegadas ni datos productivos.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const mocks = {
  'firebase/firestore': [
    'export const doc = (_db, collection, id) => ({collection,id});',
    'export async function runTransaction(_db, fn) {',
    '  if (globalThis.qa.fail) throw new Error("SIMULATED_NETWORK_FAILURE");',
    '  const tx = {',
    '    get: async ref => {',
    '      globalThis.qa.reads.push(ref);',
    '      const record = globalThis.qa.records[ref.id];',
    '      if (globalThis.qa.onRead) await globalThis.qa.onRead(ref);',
    '      return {exists: () => !!record, data: () => record ? JSON.parse(JSON.stringify(record)) : undefined};',
    '    },',
    '    update: (ref,patch) => {',
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
  absWorkingDir:rootDir,bundle:true,write:false,format:'iife',platform:'browser',
  stdin:{resolveDir:rootDir,loader:'js',contents:
    "import {saveBusinessCapabilities} from './src/lib/businessCapabilitiesService'; globalThis.qa.save=saveBusinessCapabilities;"},
  plugins:[{name:'mock-capabilities-firestore',setup(plugin){
    plugin.onResolve({filter:/.*/},args=>{
      if(args.importer.endsWith('/businessCapabilitiesService.ts') && Object.hasOwn(mocks,args.path))
        return {path:args.path,namespace:'mock'};
    });
    plugin.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}));
  }}],
});
const clone=value=>JSON.parse(JSON.stringify(value));
const tenant=(id,uid,capabilities)=>({
  restaurantId:id,ownerUserId:uid,businessType:'restaurant',
  branding:{restaurantName:id,publicSlug:id,vipEnabled:true},
  ...(capabilities===undefined?{}:{capabilities}),
});
const a=tenant('tenant-a','owner-a',['VIP','SHIFTS']);
const b=tenant('tenant-b','owner-b',['VIP']);
const qa={user:{uid:'owner-a'},records:{'tenant-a':clone(a),'tenant-b':clone(b)},
  reads:[],writes:[],onRead:null,fail:false};
runInNewContext(bundle.outputFiles[0].text,{qa});
const rejectNoWrite=async(operation,pattern)=>{
  const count=qa.writes.length;
  await assert.rejects(operation,pattern);
  assert.equal(qa.writes.length,count,'No emitir escritura tras rechazo');
};

// Escritura legítima A no toca B ni branding, ni OWNER.
await qa.save(clone(a),['SHIFTS']);
assert.deepEqual(clone(qa.records['tenant-a'].capabilities),['SHIFTS']);
assert.deepEqual(clone(qa.records['tenant-b']),b);
assert.deepEqual(Object.keys(qa.writes[0].patch),['capabilities']);
assert.equal(qa.records['tenant-a'].branding.vipEnabled,true);

// Pestaña A antigua no puede reactivar VIP ni revertir el cambio.
await rejectNoWrite(qa.save(clone(a),['VIP','SHIFTS']),/CONFLICTO_MODULOS/);
assert.deepEqual(clone(qa.records['tenant-a'].capabilities),['SHIFTS']);

// [] es un estado válido y debe permanecer [] (sin reactivar plantilla).
const freshA=clone(qa.records['tenant-a']);
await qa.save(freshA,[]);
assert.deepEqual(clone(qa.records['tenant-a'].capabilities),[]);
await rejectNoWrite(qa.save(freshA,['VIP']),/CONFLICTO_MODULOS/);

// Negocio histórico sin capacidades explícitas puede guardar []; otra pestaña
// con lectura antigua no puede sobrescribirlo después.
const legacy=tenant('tenant-legacy','owner-a');
qa.records['tenant-legacy']=clone(legacy);
await qa.save(clone(legacy),[]);
assert.deepEqual(clone(qa.records['tenant-legacy'].capabilities),[]);
await rejectNoWrite(qa.save(clone(legacy),['VIP']),/CONFLICTO_MODULOS/);

// Tenant/OWNER/tipo discordantes no deben emitir escrituras.
const currentA=clone(qa.records['tenant-a']);
qa.records['tenant-a'].ownerUserId='owner-b';
await rejectNoWrite(qa.save(currentA,['VIP']),/CONFLICTO_MODULOS/);
qa.records['tenant-a'].ownerUserId='owner-a';
qa.records['tenant-a'].businessType='ghost-kitchen';
await rejectNoWrite(qa.save(currentA,['VIP']),/CONFLICTO_MODULOS/);
qa.records['tenant-a'].businessType='restaurant';
qa.records['tenant-a'].restaurantId='tenant-b';
await rejectNoWrite(qa.save(currentA,['VIP']),/CONFLICTO_MODULOS/);
qa.records['tenant-a'].restaurantId='tenant-a';

// Cambio de UID durante lectura: no puede escribir.
qa.onRead=async()=>{qa.user={uid:'owner-b'};};
await rejectNoWrite(qa.save(currentA,['VIP']),/sesión cambió/);
qa.onRead=null;
qa.user=null;
await rejectNoWrite(qa.save(currentA,['VIP']),/sesión o lista/);

// B opera solo B; errores de transporte no se confunden con éxito.
qa.user={uid:'owner-b'};
await qa.save(clone(b),[]);
assert.deepEqual(clone(qa.records['tenant-b'].capabilities),[]);
assert.deepEqual(clone(qa.records['tenant-a'].capabilities),[]);
qa.fail=true;
await rejectNoWrite(qa.save(clone(qa.records['tenant-b']),['VIP']),/SIMULATED_NETWORK_FAILURE/);
qa.fail=false;
await rejectNoWrite(qa.save(clone(qa.records['tenant-b']),['VIP','VIP']),/lista de módulos/);
assert(qa.reads.every(ref=>ref.collection==='businesses'));
console.log('PASS: CAS módulos A/B, doble pestaña, [], legado, identidad, UID y fallos (Firestore simulado).');

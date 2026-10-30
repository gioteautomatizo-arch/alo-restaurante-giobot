import assert from 'node:assert/strict';
import { auditBusinessCatalogCutover } from './business-catalog-cutover-preflight.mjs';

const root = (id, uid) => ({docId:id, restaurantId:id, ownerUserId:uid});
const member = (id, uid, role='OWNER', active=true) =>
  ({docId:id+'_'+uid, restaurantId:id, userId:uid, role, active});
const profile = (id, published) => ({docId:id, businessId:id, restaurantId:id, published});
const catalog = id => ({path:`businesses/${id}/catalog/menu_catalog`, businessId:id,
  revision:'rev-1', items:[{id:'product-1',name:'Prueba',price:25,available:true}]});
function fixture() {
  const data = {
    scope:'business-catalog-cutover-inventory',
    businesses:[root('tenant-a','uid-a'),root('tenant-b','uid-b')],
    businessMemberships:[member('tenant-a','uid-a'),member('tenant-b','uid-b'),member('tenant-b','uid-a','CASHIER')],
    publicBusinessProfiles:[profile('tenant-a',true),profile('tenant-b',false)],
    businessCatalogs:[catalog('tenant-a'),catalog('tenant-b')],
  };
  data.coverage=Object.fromEntries(['businesses','businessMemberships','publicBusinessProfiles','businessCatalogs']
    .map(key=>[key,{complete:true,documentCount:data[key].length,pagesRead:1}]));
  return data;
}
function run(mutate) { const data=fixture(); mutate?.(data); return auditBusinessCatalogCutover(data); }
function blocked(label,mutate,code) {
  const result=run(mutate);
  assert.equal(result.status,'BLOCKED',label);
  assert(result.issues.some(issue=>issue.code===code),label+' missing '+code);
  assert.equal(result.safeToDeploy,false,label);
  // Nunca mostrar IDs, UID, nombres ni productos históricos en el resultado.
  for (const privateValue of ['tenant-a','tenant-b','uid-a','uid-b','product-1','Prueba'])
    assert(!JSON.stringify(result).includes(privateValue),label+' exposed '+privateValue);
}
const clean=run();
assert.equal(clean.status,'CANDIDATE_FOR_INDEPENDENT_REVIEW');
assert.equal(clean.safeToDeploy,false);
assert.deepEqual(clean.issues,[]);
assert.deepEqual(clean.counts,{roots:2,memberships:3,profiles:2,catalogs:2,published:1,historicalHold:0});
blocked('sin scope',f=>{f.scope='other';},'INVALID_SCOPE');
blocked('sin cobertura',f=>{delete f.coverage.businessCatalogs;},'MISSING_COLLECTION_COVERAGE');
blocked('escaneo incompleto',f=>{f.coverage.businessCatalogs.complete=false;},'INCOMPLETE_COLLECTION_SCAN');
blocked('páginas inválidas',f=>{f.coverage.businessCatalogs.pagesRead=0;},'INVALID_PAGINATION_EVIDENCE');
blocked('documentos omitidos',f=>{f.businessCatalogs.pop();},'DECLARED_COUNT_MISMATCH');
blocked('sin colección',f=>{delete f.businessCatalogs;},'MISSING_DOCUMENT_INVENTORY');
blocked('raíz cruzada',f=>{f.businesses[0].restaurantId='tenant-b';},'ROOT_IDENTITY_OR_OWNER_INVALID');
blocked('owner sin uid',f=>{delete f.businesses[0].ownerUserId;},'ROOT_IDENTITY_OR_OWNER_INVALID');
blocked('owner sin membresía',f=>{f.businessMemberships[0].active=false;},'ROOT_OWNER_MEMBERSHIP_UNVERIFIED');
blocked('owner doble',f=>{f.businessMemberships.push(member('tenant-a','uid-b'));f.coverage.businessMemberships.documentCount++;},'ROOT_OWNER_MEMBERSHIP_UNVERIFIED');
blocked('membresía cruzada',f=>{f.businessMemberships[2].restaurantId='tenant-a';},'MEMBERSHIP_IDENTITY_OR_ROLE_INVALID');
blocked('membresía de tenant ausente',f=>{f.businessMemberships[2]=member('tenant-c','uid-a','CASHIER');},'MEMBERSHIP_WITHOUT_ROOT');
blocked('rol inválido',f=>{f.businessMemberships[2].role='ROOT';},'MEMBERSHIP_IDENTITY_OR_ROLE_INVALID');
blocked('perfil cruzado',f=>{f.publicBusinessProfiles[0].businessId='tenant-b';},'PROFILE_IDENTITY_OR_PUBLICATION_INVALID');
blocked('perfil sin raíz',f=>{f.publicBusinessProfiles[1]=profile('tenant-c',false);},'PROFILE_WITHOUT_ROOT');
blocked('perfil publicado sin catálogo',f=>{f.businessCatalogs.shift();f.coverage.businessCatalogs.documentCount--;},'PUBLISHED_BUSINESS_WITHOUT_CATALOG');
blocked('catálogo de otro negocio',f=>{f.businessCatalogs[0].businessId='tenant-b';},'CATALOG_TENANT_IDENTITY_MISMATCH');
blocked('catálogo sin raíz',f=>{f.businessCatalogs[1]=catalog('tenant-c');},'CATALOG_WITHOUT_ROOT');
blocked('ID de documento desconocido',f=>{f.businessCatalogs[0].path='businesses/tenant-a/catalog/secret';},'UNKNOWN_OR_INVALID_CATALOG_PATH');
blocked('catálogo sin items',f=>{delete f.businessCatalogs[0].items;},'CATALOG_ITEMS_INVALID');
blocked('producto duplicado',f=>{f.businessCatalogs[0].items.push({...f.businessCatalogs[0].items[0]});},'CATALOG_ITEM_INCOMPATIBLE');
blocked('precio inválido',f=>{f.businessCatalogs[0].items[0].price=NaN;},'CATALOG_ITEM_INCOMPATIBLE');
blocked('revisión ausente',f=>{delete f.businessCatalogs[0].revision;},'CATALOG_HISTORICAL_REVISION_HOLD');
blocked('revisión vacía',f=>{f.businessCatalogs[0].revision='';},'CATALOG_HISTORICAL_REVISION_HOLD');
blocked('duplicado',f=>{f.businessCatalogs.push({...f.businessCatalogs[0]});f.coverage.businessCatalogs.documentCount++;},'DUPLICATE_DOCUMENT_PATH');
blocked('inventario vacío',f=>{for(const key of ['businesses','businessMemberships','publicBusinessProfiles','businessCatalogs']){f[key]=[];f.coverage[key].documentCount=0;}},'EMPTY_BUSINESS_INVENTORY_NOT_PROOF');
const historical=run(f=>{delete f.businessCatalogs[0].revision;f.businessCatalogs[0].updatedAt='2026-01-01';});
assert.equal(historical.status,'CANDIDATE_FOR_INDEPENDENT_REVIEW','updatedAt histórico válido sigue siendo compatible');
assert.equal(auditBusinessCatalogCutover().status,'BLOCKED');
console.log('PASS: preflight offline A/B de cobertura, OWNER, perfiles, publicación, identidad y revisión de catálogos; no autoriza despliegue.');
console.warn('PENDIENTE: inventario real autorizado, reglas efectivas, OWNER atómico, respaldo/restauración y recorrido visual Android/iPad.');

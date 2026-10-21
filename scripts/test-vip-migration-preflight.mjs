import assert from 'node:assert/strict';
import { auditVipMigration } from './vip-migration-preflight.mjs';

const base = () => ({
  businessId: 'alo-restaurante',
  profiles: [{id:'card-1',restaurantId:'alo-restaurante',stamps:4,totalOrders:9,rewardAvailable:true}],
  memberships:[{id:'alo-restaurante_owner-1',restaurantId:'alo-restaurante',userId:'owner-1',role:'OWNER',active:true}],
  expectedAdmins:[{uid:'owner-1',role:'OWNER',identityVerifiedByOwner:true}],
});
const clean=auditVipMigration(base());
assert.equal(clean.readiness,'PREFLIGHT_PASSED');
assert.equal(clean.approvalToDeploy,false);
let input=base();
delete input.profiles[0].restaurantId;
assert(auditVipMigration(input).blockers.includes('legacy_profiles_need_individual_owner_review'));
input=base();input.profiles[0].restaurantId='';
assert(auditVipMigration(input).blockers.includes('invalid_tenant_identifiers'));
input=base();input.profiles[0].restaurantId='business-b';
assert(auditVipMigration(input).blockers.includes('cross_business_rows_in_manifest'));
input=base();input.profiles[0].stamps=-1;
assert(auditVipMigration(input).blockers.includes('invalid_loyalty_balances'));
input=base();input.profiles.push({...input.profiles[0]});
assert(auditVipMigration(input).blockers.includes('invalid_or_duplicate_profile_ids'));
input=base();input.expectedAdmins[0].identityVerifiedByOwner=false;
assert(auditVipMigration(input).blockers.includes('owner_not_verified_and_linked'));
input=base();input.expectedAdmins[0].uid='not-linked';
assert(auditVipMigration(input).blockers.includes('admin_membership_missing'));
input=base();input.memberships[0].active=false;
assert(auditVipMigration(input).blockers.includes('admin_membership_mismatch_or_inactive'));
input=base();input.memberships[0].id='wrong-id';
assert(auditVipMigration(input).blockers.includes('invalid_or_duplicate_membership_ids'));
input=base();input.profiles[0].pendingStampsToValidate=1000001;
assert(auditVipMigration(input).blockers.includes('invalid_loyalty_balances'));
input=base();
input.memberships.push({id:'alo-restaurante_owner-2',restaurantId:'alo-restaurante',userId:'owner-2',role:'OWNER',active:true});
assert(auditVipMigration(input).blockers.includes('duplicate_or_unapproved_owner_membership'),
  'no permitir crear otro propietario activo sin revisión');
assert.equal(auditVipMigration(input).counts.activeOwnerMemberships,2);
input=base();
input.memberships.push({id:'other-business_owner-z',restaurantId:'other-business',userId:'owner-z',role:'OWNER',active:true});
assert.equal(auditVipMigration(input).readiness,'PREFLIGHT_PASSED',
  'el propietario de otro negocio no duplica al de Calientito');
input=base();
input.memberships.push({id:'alo-restaurante_owner-2',restaurantId:'alo-restaurante',userId:'owner-2',role:'OWNER',active:false});
assert.equal(auditVipMigration(input).readiness,'PREFLIGHT_PASSED',
  'un registro OWNER inactivo no equivale a propietario activo');
input=base();
input.expectedAdmins.push({uid:'owner-2',role:'OWNER',identityVerifiedByOwner:true});
assert(auditVipMigration(input).blockers.includes('admin_membership_missing'),
  'la declaración verbal de un segundo OWNER no crea una membresía');
assert.throws(()=>auditVipMigration({businessId:'bad/id',profiles:[],memberships:[],expectedAdmins:[]}));
console.log('PASS: auditoría local VIP detecta bloqueos, no aprueba despliegue y respeta negocio.');

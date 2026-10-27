import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { auditRegistrationCutoverSources, REQUIRED_CUTOVER_EVIDENCE } from './business-registration-cutover-audit.mjs';

const clientSource = readFileSync('src/lib/businessAuthService.ts', 'utf8');
const stagedRules = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposalSource = readFileSync('scripts/owner-atomic-proposal-rules.mjs', 'utf8');
const inspect = (overrides = {}) => auditRegistrationCutoverSources({
  clientSource, stagedRules, proposalSource, ...overrides,
});
const current = inspect();
assert.equal(current.mode, 'READ_ONLY_NO_FIREBASE_NO_DEPLOY');
assert.equal(current.status, 'BLOCKED');
assert.equal(current.safeToDeploy, false);
assert.equal(current.clientContract, 'TWO_DOCUMENTS');
for (const blocker of [
  'CLIENT_STILL_WRITES_TWO_DOCUMENTS',
  'STAGED_OWNER_ATOMICITY_NOT_PROVEN',
  'STAGED_PERMANENT_RESERVATION_NOT_PROVEN',
  'DIRECT_ROLLBACK_TO_STAGED_UNSAFE',
  'EVIDENCE_MISSING_backupRestoreTested',
  'EVIDENCE_MISSING_independentSecurityReviewApproved',
]) assert(current.blockers.includes(blocker), blocker);
assert.equal(current.observed.hasCandidate, true);
assert.equal(current.observed.hasFreeze, true);

// No aceptar un manifest sin pruebas, ni usar strings truthy como "true".
const allEvidence = Object.fromEntries(REQUIRED_CUTOVER_EVIDENCE.map(key => [key, true]));
assert.equal(inspect({ evidence: allEvidence }).status, 'BLOCKED');
assert(inspect({ evidence: { ...allEvidence, backupRestoreTested: 'true' } })
  .blockers.includes('EVIDENCE_MISSING_backupRestoreTested'));

// Cambiar un contrato sin el otro no habilita el corte.
const oldBatch = 'batch.set(membershipRef(businessId, userId), membership);';
assert(clientSource.includes(oldBatch), 'Cambió el cliente: revisar este test');
const threeDocClient = clientSource.replace(oldBatch, oldBatch +
  "\n  batch.set(doc(db, 'businessHandleReservations', businessId), { businessId, ownerUserId: userId });");
assert.equal(inspect({ clientSource: threeDocClient }).clientContract, 'THREE_DOCUMENTS');
assert(inspect({ clientSource: threeDocClient }).blockers.includes('DIRECT_ROLLBACK_TO_STAGED_UNSAFE'));

// Simulación sintética: solo cuando TODOS los contratos y comprobantes están
// presentes el diagnóstico pasa a revisión humana, nunca a despliegue.
const rootAnchor = '&& !exists(/databases/$(database)/documents/businesses/$(businessId));';
assert(stagedRules.includes(rootAnchor), 'Cambió el contrato staged: revisar test');
const rootPath = '/databases/$(database)/documents/businesses/$(businessId)';
const ownerPath = "/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)";
const reservationPath = '/databases/$(database)/documents/businessHandleReservations/$(businessId)';
const guardedRoot = [
  `&& !exists(${rootPath})`,
  `&& existsAfter(${ownerPath})`,
  `&& getAfter(${ownerPath}).data.restaurantId == businessId`,
  `&& getAfter(${ownerPath}).data.userId == request.auth.uid`,
  `&& getAfter(${ownerPath}).data.role == 'OWNER'`,
  `&& getAfter(${ownerPath}).data.active == true`,
  `&& !exists(${reservationPath})`,
  `&& existsAfter(${reservationPath})`,
  `&& getAfter(${reservationPath}).data.businessId == businessId`,
  `&& getAfter(${reservationPath}).data.ownerUserId == request.auth.uid;`,
].join('\n        ');
const reservationRules = `    match /businessHandleReservations/{businessId} {
      allow read: if false;
      allow create: if isSignedIn()
        && request.resource.data.businessId == businessId
        && request.resource.data.ownerUserId == request.auth.uid
        && !exists(${rootPath})
        && existsAfter(${rootPath})
        && getAfter(${rootPath}).data.restaurantId == businessId
        && getAfter(${rootPath}).data.ownerUserId == request.auth.uid;
      allow update, delete: if false;
    }

`;
const strongerRules = stagedRules
  .replace(rootAnchor, guardedRoot)
  .replace('    match /businesses/{businessId} {',
    reservationRules + '    match /businesses/{businessId} {');
const reviewed = inspect({ clientSource: threeDocClient, stagedRules: strongerRules, evidence: allEvidence });
assert.equal(reviewed.status, 'READY_FOR_INDEPENDENT_REVIEW');
assert.deepEqual(reviewed.blockers, []);
assert.equal(reviewed.safeToDeploy, false, 'NUNCA aprobar despliegue automáticamente');
for (const key of ['ownerAtomic', 'ownerBinding', 'reservationAtomic', 'reservationBinding',
  'reservationRule', 'reservationCreateBinding', 'reservationImmutable']) {
  assert.equal(reviewed.observed[key], true, key);
}

// Regresiones de seguridad: la sola presencia de existsAfter no demuestra
// OWNER válido, reserva vinculada ni protección contra su eliminación.
const mutations = [
  ['owner role', `getAfter(${ownerPath}).data.role == 'OWNER'`,
    `getAfter(${ownerPath}).data.role == 'WAITER'`, 'STAGED_OWNER_UID_ROLE_TENANT_BINDING_NOT_PROVEN'],
  ['owner UID', `getAfter(${ownerPath}).data.userId == request.auth.uid`,
    `getAfter(${ownerPath}).data.userId == 'other'`, 'STAGED_OWNER_UID_ROLE_TENANT_BINDING_NOT_PROVEN'],
  ['owner active', `getAfter(${ownerPath}).data.active == true`,
    `getAfter(${ownerPath}).data.active == false`, 'STAGED_OWNER_UID_ROLE_TENANT_BINDING_NOT_PROVEN'],
  ['reservation owner', `getAfter(${reservationPath}).data.ownerUserId == request.auth.uid`,
    `getAfter(${reservationPath}).data.ownerUserId == 'other'`, 'STAGED_RESERVATION_RECIPROCAL_BINDING_NOT_PROVEN'],
  ['reservation root', `getAfter(${rootPath}).data.ownerUserId == request.auth.uid`,
    `getAfter(${rootPath}).data.ownerUserId == 'other'`, 'STAGED_RESERVATION_RECIPROCAL_BINDING_NOT_PROVEN'],
  ['mutable reservation', 'allow update, delete: if false;',
    'allow update, delete: if true;', 'STAGED_RESERVATION_IMMUTABILITY_NOT_PROVEN'],
  ['owner OR bypass', `getAfter(${ownerPath}).data.active == true`,
    `getAfter(${ownerPath}).data.active == true || true`, 'STAGED_OWNER_ATOMICITY_NOT_PROVEN'],
  ['reservation OR bypass', `getAfter(${rootPath}).data.ownerUserId == request.auth.uid`,
    `getAfter(${rootPath}).data.ownerUserId == request.auth.uid || true`,
    'STAGED_RESERVATION_RECIPROCAL_BINDING_NOT_PROVEN'],
];
for (const [name, before, after, blocker] of mutations) {
  assert(strongerRules.includes(before), `Cambió el fixture: ${name}`);
  const result = inspect({
    clientSource: threeDocClient,
    stagedRules: strongerRules.replace(before, after),
    evidence: allEvidence,
  });
  assert.equal(result.status, 'BLOCKED', name);
  assert(result.blockers.includes(blocker), `${name}: falta ${blocker}`);
  assert(result.blockers.includes('DIRECT_ROLLBACK_TO_STAGED_UNSAFE'), name);
}
const fakeCommentRules = stagedRules.replace(rootAnchor,
  `&& !exists(${rootPath}); // existsAfter(${ownerPath})`);
assert(inspect({ clientSource: threeDocClient, stagedRules: fakeCommentRules, evidence: allEvidence })
  .blockers.includes('STAGED_OWNER_ATOMICITY_NOT_PROVEN'));

// Cambios desconocidos y propuestas ausentes deben bloquear, no asumir éxito.
assert(inspect({ clientSource: '' }).blockers.includes('CLIENT_CONTRACT_UNVERIFIED'));
assert(inspect({ stagedRules: '' }).blockers.includes('STAGED_OWNER_ATOMICITY_NOT_PROVEN'));
assert(inspect({ proposalSource: '' }).blockers.includes('ISOLATED_CANDIDATE_OR_FREEZE_MISSING'));
assert(inspect({ evidence: null }).status === 'BLOCKED');

// --enforce es la puerta fail-closed: el CLI debe salir con error en la rama actual.
const enforced = spawnSync(process.execPath, ['scripts/business-registration-cutover-audit.mjs', '--enforce'], {
  encoding: 'utf8',
});
assert.equal(enforced.status, 1, enforced.stderr);
assert.match(enforced.stdout, /"status": "BLOCKED"/);
assert.match(enforced.stderr, /PENDIENTE/);

console.log('PASS: auditoría de transición solo lectura, contratos 2/3, rollback inseguro y evidencia incompleta bloqueados; nunca autoriza despliegue.');
console.warn('PENDIENTE: cliente de 2 documentos, staged sin reserva/OWNER atómico, inventario/backfill, restauración, revisión independiente y recorrido manual.');

/**
 * Paso 2: diagnóstico local y conservador del corte de registro 2 -> 3.
 * NO es una autorización de despliegue: nunca conecta a Firebase ni escribe.
 * Los patrones son intencionalmente estrictos; código desconocido = bloqueo.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';


function compactRules(value) {
  return value.replace(/\s+/g, '').replace(/"/g, "'");
}

function hasRule(value, expression) {
  return compactRules(value).includes(compactRules(expression));
}

// Leer solo el bloque exacto: un match de otra ruta o un comentario no es evidencia.
function matchRulesBlock(source, path) {
  const marker = `match ${path} {`;
  const start = source.indexOf(marker);
  if (start < 0 || source.indexOf(marker, start + marker.length) >= 0) return '';
  const open = start + marker.length - 1;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return '';
}

function createClause(section) {
  return section.match(/\ballow\s+create\s*:\s*if\s+([^;]*);/)?.[1] || '';
}

function hasNoAlternatives(condition) {
  // Conservador: una cláusula con OR necesita revisión manual, aunque sea válida.
  return !!condition && !condition.includes('||');
}

function isImmutableReservation(section) {
  const rules = [...section.matchAll(/\ballow\s+([^:;]+)\s*:\s*if\s+([^;]*);/g)];
  const mutations = rules.filter(([, verbs]) => /\b(?:update|delete|write)\b/.test(verbs));
  return mutations.length > 0
    && mutations.some(([, verbs]) => /\bupdate\b/.test(verbs))
    && mutations.some(([, verbs]) => /\bdelete\b/.test(verbs))
    && mutations.every(([, , condition]) => condition.trim() === 'false');
}

export const REQUIRED_CUTOVER_EVIDENCE = Object.freeze([
  'historicalInventoryCertified',
  'historicalReservationsReviewed',
  'backupRestoreTested',
  'independentSecurityReviewApproved',
  'clientRulesCompatibilityVerified',
  'frozenRollbackReviewed',
  'twoTenantManualJourneyVerified',
]);

function executableSource(source) {
  return typeof source === 'string'
    ? source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    : '';
}

export function auditRegistrationCutoverSources({ clientSource, stagedRules, proposalSource, evidence = {} } = {}) {
  const client = executableSource(clientSource);
  const staged = typeof stagedRules === 'string' ? stagedRules : '';
  const proposal = executableSource(proposalSource);
  const blockers = [];

  const start = client.indexOf('export async function registerBusiness(');
  const next = start < 0 ? -1 : client.indexOf('\nexport ', start + 1);
  const registration = start < 0 ? '' : client.slice(start, next < 0 ? undefined : next);
  const writes = [...registration.matchAll(/\bbatch\.set\s*\(/g)].length;
  const writesRoot = /batch\.set\s*\(\s*businessRef\s*\(\s*businessId\s*\)/.test(registration);
  const writesOwner = /batch\.set\s*\(\s*membershipRef\s*\(\s*businessId\s*,\s*userId\s*\)/.test(registration);
  const writesReservation = /batch\.set\s*\(\s*(?:handleReservationRef\s*\(|doc\s*\(\s*db\s*,\s*['"]businessHandleReservations['"])/.test(registration);
  const clientContract = writesRoot && writesOwner && writes === 2 && !writesReservation
    ? 'TWO_DOCUMENTS'
    : writesRoot && writesOwner && writes === 3 && writesReservation
      ? 'THREE_DOCUMENTS'
      : 'UNKNOWN';
  if (clientContract !== 'THREE_DOCUMENTS') {
    blockers.push(clientContract === 'TWO_DOCUMENTS' ? 'CLIENT_STILL_WRITES_TWO_DOCUMENTS' : 'CLIENT_CONTRACT_UNVERIFIED');
  }

  const cleanRules = executableSource(staged);
  const rootSection = matchRulesBlock(cleanRules, '/businesses/{businessId}');
  const reservationSection = matchRulesBlock(cleanRules, '/businessHandleReservations/{businessId}');
  const rootCreate = createClause(rootSection);
  const reservationCreate = createClause(reservationSection);
  const ownerPath = "/databases/$(database)/documents/businessMemberships/$(businessId + '_' + request.auth.uid)";
  const reservationPath = '/databases/$(database)/documents/businessHandleReservations/$(businessId)';
  const rootPath = '/databases/$(database)/documents/businesses/$(businessId)';

  const rootIdentity = hasNoAlternatives(rootCreate)
    && hasRule(rootCreate, 'request.resource.data.restaurantId == businessId')
    && hasRule(rootCreate, 'request.resource.data.ownerUserId == request.auth.uid')
    && hasRule(rootCreate, `!exists(${rootPath})`);
  const ownerAtomic = rootIdentity && hasRule(rootCreate, `existsAfter(${ownerPath})`);
  const ownerBinding = ownerAtomic
    && hasRule(rootCreate, `getAfter(${ownerPath}).data.restaurantId == businessId`)
    && hasRule(rootCreate, `getAfter(${ownerPath}).data.userId == request.auth.uid`)
    && hasRule(rootCreate, `getAfter(${ownerPath}).data.role == 'OWNER'`)
    && hasRule(rootCreate, `getAfter(${ownerPath}).data.active == true`);

  const reservationAtomic = rootIdentity
    && hasRule(rootCreate, `!exists(${reservationPath})`)
    && hasRule(rootCreate, `existsAfter(${reservationPath})`);
  const reservationBinding = reservationAtomic
    && hasRule(rootCreate, `getAfter(${reservationPath}).data.businessId == businessId`)
    && hasRule(rootCreate, `getAfter(${reservationPath}).data.ownerUserId == request.auth.uid`);
  const reservationRule = !!reservationSection;
  const reservationCreateBinding = reservationRule && hasNoAlternatives(reservationCreate)
    && hasRule(reservationCreate, 'isSignedIn()')
    && hasRule(reservationCreate, 'request.resource.data.businessId == businessId')
    && hasRule(reservationCreate, 'request.resource.data.ownerUserId == request.auth.uid')
    && hasRule(reservationCreate, `!exists(${rootPath})`)
    && hasRule(reservationCreate, `existsAfter(${rootPath})`)
    && hasRule(reservationCreate, `getAfter(${rootPath}).data.restaurantId == businessId`)
    && hasRule(reservationCreate, `getAfter(${rootPath}).data.ownerUserId == request.auth.uid`);
  const reservationImmutable = reservationRule && isImmutableReservation(reservationSection)
    && /\ballow\s+read\s*:\s*if\s+false\s*;/.test(reservationSection);

  if (!ownerAtomic) blockers.push('STAGED_OWNER_ATOMICITY_NOT_PROVEN');
  if (!ownerBinding) blockers.push('STAGED_OWNER_UID_ROLE_TENANT_BINDING_NOT_PROVEN');
  if (!reservationAtomic || !reservationRule) blockers.push('STAGED_PERMANENT_RESERVATION_NOT_PROVEN');
  if (!reservationBinding || !reservationCreateBinding) blockers.push('STAGED_RESERVATION_RECIPROCAL_BINDING_NOT_PROVEN');
  if (!reservationImmutable) blockers.push('STAGED_RESERVATION_IMMUTABILITY_NOT_PROVEN');
  if (![ownerAtomic, ownerBinding, reservationAtomic, reservationRule,
    reservationBinding, reservationCreateBinding, reservationImmutable].every(Boolean)) {
    blockers.push('DIRECT_ROLLBACK_TO_STAGED_UNSAFE');
  }

  const hasCandidate = proposal.includes('export function buildAtomicOwnerAndPermanentHandleProposalRules(');
  const hasFreeze = proposal.includes('export function buildRegistrationFreezeProposalRules(');
  if (!hasCandidate || !hasFreeze) blockers.push('ISOLATED_CANDIDATE_OR_FREEZE_MISSING');

  const missingEvidence = REQUIRED_CUTOVER_EVIDENCE.filter(key => evidence?.[key] !== true);
  for (const key of missingEvidence) blockers.push('EVIDENCE_MISSING_' + key);

  return {
    mode: 'READ_ONLY_NO_FIREBASE_NO_DEPLOY',
    status: blockers.length ? 'BLOCKED' : 'READY_FOR_INDEPENDENT_REVIEW',
    safeToDeploy: false,
    clientContract,
    observed: { ownerAtomic, ownerBinding, reservationAtomic, reservationBinding, reservationRule, reservationCreateBinding, reservationImmutable, hasCandidate, hasFreeze },
    missingEvidence,
    blockers,
    caveat: 'La revisión automatizada no certifica reglas desplegadas, respaldos ni aprobaciones humanas.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = auditRegistrationCutoverSources({
    clientSource: readFileSync('src/lib/businessAuthService.ts', 'utf8'),
    stagedRules: readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8'),
    proposalSource: readFileSync('scripts/owner-atomic-proposal-rules.mjs', 'utf8'),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.blockers.length) console.warn('PENDIENTE: corte 2/3, rollback y evidencia humana no autorizados.');
  if (process.argv.includes('--enforce') && result.status !== 'READY_FOR_INDEPENDENT_REVIEW') process.exitCode = 1;
}

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

// Una segunda ruta coincidente puede anular por OR el match exacto que
// inspecciona la auditoría. Este detector es deliberadamente conservador:
// si no puede interpretar un match, NO acredita el corte.
function matchingRuleBlocks(source) {
  const matcher = /\\bmatch\\s+(\\/(?:[^\\s{]|\\{[^}]*\\})+)\\s*\\{/g;
  const blocks = [];
  for (const found of source.matchAll(matcher)) {
    const open = found.index + found[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let i = open; i < source.length; i++) {
      if (source[i] === '{') depth++;
      if (source[i] === '}' && --depth === 0) { close = i; break; }
    }
    if (close < 0) return null;
    blocks.push({ path: found[1], section: source.slice(open + 1, close) });
  }
  return blocks.length === [...source.matchAll(/\\bmatch\\s+\\//g)].length ? blocks : null;
}

function rulePathOverlapsTenantRoot(pattern, collection) {
  const parts = pattern.split('/').filter(Boolean);
  const target = [collection, 'synthetic-tenant'];
  const matches = (i, j) => {
    if (i === parts.length) return j === target.length;
    if (/^\\{[^}]+=\\*\\*\\}$/.test(parts[i])) {
      return matches(i + 1, j) || (j < target.length && matches(i, j + 1));
    }
    if (j === target.length) return false;
    return (parts[i] === target[j] || /^\\{[^}]+\\}$/.test(parts[i]))
      && matches(i + 1, j + 1);
  };
  return matches(0, 0);
}

function hasNoOverlappingTenantGrants(source) {
  const blocks = matchingRuleBlocks(source);
  if (!blocks) return false;
  const audited = new Set(['/businesses/{businessId}', '/businessHandleReservations/{businessId}']);
  for (const block of blocks) {
    if (audited.has(block.path)) continue; // Sus cláusulas se validan por separado.
    if (!['businesses', 'businessHandleReservations']
      .some(collection => rulePathOverlapsTenantRoot(block.path, collection))) continue;
    const grants = [...block.section.matchAll(/\\ballow\\s+([^:;]+)\\s*:\\s*if\\s+([^;]*);/g)];
    if (grants.some(([, , condition]) => condition.trim() !== 'false')) return false;
  }
  return true;
}

function createClause(section) {
  return section.match(/\ballow\s+create\s*:\s*if\s+([^;]*);/)?.[1] || '';
}

function hasNoAlternatives(condition) {
  // Conservador: una cláusula con OR necesita revisión manual, aunque sea válida.
  return !!condition && !condition.includes('||');
}

function hasSingleCreateClause(section) {
  // Firestore combina reglas allow con OR: otra cláusula create/write puede
  // anular todos los guards aunque la primera cláusula sea correcta.
  const grants = [...section.matchAll(/\ballow\s+([^:;]+)\s*:\s*if\s+([^;]*);/g)]
    .filter(([, verbs]) => /\b(?:create|write)\b/.test(verbs));
  return grants.length === 1
    && /\bcreate\b/.test(grants[0][1])
    && !/\bwrite\b/.test(grants[0][1]);
}

function hasClosedReservationReads(section) {
  // Firestore combina todos los allow con OR: read:false no anula get/list.
  const grants = [...section.matchAll(/\ballow\s+([^:;]+)\s*:\s*if\s+([^;]*);/g)]
    .filter(([, verbs]) => /\b(?:read|get|list)\b/.test(verbs));
  return grants.length > 0
    && grants.some(([, verbs]) => /\bread\b/.test(verbs))
    && grants.every(([, , condition]) => condition.trim() === 'false');
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

  const rootIdentity = hasSingleCreateClause(rootSection) && hasNoAlternatives(rootCreate)
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
  const reservationCreateBinding = reservationRule && hasSingleCreateClause(reservationSection)
    && hasNoAlternatives(reservationCreate)
    && hasRule(reservationCreate, 'isSignedIn()')
    && hasRule(reservationCreate, 'request.resource.data.businessId == businessId')
    && hasRule(reservationCreate, 'request.resource.data.ownerUserId == request.auth.uid')
    && hasRule(reservationCreate, `!exists(${rootPath})`)
    && hasRule(reservationCreate, `existsAfter(${rootPath})`)
    && hasRule(reservationCreate, `getAfter(${rootPath}).data.restaurantId == businessId`)
    && hasRule(reservationCreate, `getAfter(${rootPath}).data.ownerUserId == request.auth.uid`);
  const reservationImmutable = reservationRule && isImmutableReservation(reservationSection)
    && hasClosedReservationReads(reservationSection);
  const overlappingGrantsClosed = hasNoOverlappingTenantGrants(cleanRules);

  if (!ownerAtomic) blockers.push('STAGED_OWNER_ATOMICITY_NOT_PROVEN');
  if (!ownerBinding) blockers.push('STAGED_OWNER_UID_ROLE_TENANT_BINDING_NOT_PROVEN');
  if (!reservationAtomic || !reservationRule) blockers.push('STAGED_PERMANENT_RESERVATION_NOT_PROVEN');
  if (!reservationBinding || !reservationCreateBinding) blockers.push('STAGED_RESERVATION_RECIPROCAL_BINDING_NOT_PROVEN');
  if (!reservationImmutable) blockers.push('STAGED_RESERVATION_IMMUTABILITY_NOT_PROVEN');
  if (!overlappingGrantsClosed) blockers.push('STAGED_OVERLAPPING_GRANTS_NOT_PROVEN');
  if (![ownerAtomic, ownerBinding, reservationAtomic, reservationRule,
    reservationBinding, reservationCreateBinding, reservationImmutable, overlappingGrantsClosed].every(Boolean)) {
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
    observed: { ownerAtomic, ownerBinding, reservationAtomic, reservationBinding, reservationRule, reservationCreateBinding, reservationImmutable, overlappingGrantsClosed, hasCandidate, hasFreeze },
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

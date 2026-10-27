/**
 * Paso 2: diagnóstico local y conservador del corte de registro 2 -> 3.
 * NO es una autorización de despliegue: nunca conecta a Firebase ni escribe.
 * Los patrones son intencionalmente estrictos; código desconocido = bloqueo.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  const rootStart = staged.indexOf('match /businesses/{businessId} {');
  const rootSection = rootStart < 0 ? '' : staged.slice(rootStart, staged.indexOf('match /businesses/{businessId}/', rootStart) < 0
    ? undefined : staged.indexOf('match /businesses/{businessId}/', rootStart));
  const createStart = rootSection.indexOf('allow create: if');
  const rootCreate = createStart < 0 ? '' : rootSection.slice(createStart).split(';')[0];
  const ownerAtomic = /existsAfter\s*\(\s*\/databases\/\$\(database\)\/documents\/businessMemberships\//.test(rootCreate);
  const reservationAtomic = /existsAfter\s*\(\s*\/databases\/\$\(database\)\/documents\/businessHandleReservations\//.test(rootCreate);
  const reservationRule = /match\s+\/businessHandleReservations\/\{businessId\}\s*\{/.test(staged);
  if (!ownerAtomic) blockers.push('STAGED_OWNER_ATOMICITY_NOT_PROVEN');
  if (!reservationAtomic || !reservationRule) blockers.push('STAGED_PERMANENT_RESERVATION_NOT_PROVEN');
  if (!ownerAtomic || !reservationAtomic || !reservationRule) blockers.push('DIRECT_ROLLBACK_TO_STAGED_UNSAFE');

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
    observed: { ownerAtomic, reservationAtomic, reservationRule, hasCandidate, hasFreeze },
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

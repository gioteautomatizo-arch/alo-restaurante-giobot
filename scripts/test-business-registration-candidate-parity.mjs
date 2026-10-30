// Paso 2: asegurar que el candidato 3-doc conserve el contrato funcional
// del registro vigente y que NO esté conectado al onboarding público.
// Solo lee archivos locales; no conecta con Firebase ni escribe datos.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildThreeDocumentRecoveryMarkerProposalRules, buildRegistrationFreezeProposalRules } from './owner-atomic-proposal-rules.mjs';

const current = readFileSync('src/lib/businessAuthService.ts', 'utf8');
const candidate = readFileSync('src/lib/businessRegistrationThreeDocumentCandidate.ts', 'utf8');
const onboarding = readFileSync('src/components/platform/BusinessOnboardingDemo.tsx', 'utf8');
const emulator = readFileSync('scripts/test-business-three-document-registration-emulator.mts', 'utf8');

function functionSection(source, signature, nextExport) {
  const start = source.indexOf(signature);
  assert(start >= 0, 'Firma ausente: ' + signature);
  const end = nextExport ? source.indexOf(nextExport, start + signature.length) : -1;
  assert(!nextExport || end > start, 'Límite de función ausente: ' + nextExport);
  return source.slice(start, end < 0 ? undefined : end).trim();
}

const currentFn = functionSection(current,
  'export async function registerBusiness(', 'export async function loginBusinessOwner');
const candidateFn = functionSection(candidate,
  'export async function registerBusinessThreeDocumentCandidate(');
assert.equal((currentFn.match(/\bbatch\.set\s*\(/g) || []).length, 2,
  'El registro público no debe cambiar de contrato sin corte aprobado');
assert.equal((candidateFn.match(/\bbatch\.set\s*\(/g) || []).length, 3,
  'El candidato requiere negocio, OWNER y reserva en un solo batch');
for (const [name, fn] of [['cliente 2-doc', currentFn], ['candidato 3-doc', candidateFn]]) {
  assert.equal((fn.match(/\bgetDocFromServer\s*\(/g) || []).length, 2,
    name + ': la recuperación debe consultar OWNER y raíz directamente al servidor');
  assert.doesNotMatch(fn, /\bgetDoc\s*\(/,
    name + ': no recuperar altas fallidas con caché local');
}
assert.doesNotMatch(currentFn, /registrationContractVersion/,
  'El registro público no debe simular el contrato 3-doc');
assert.match(candidateFn, /const registrationTenant = \{ \.\.\.tenant, registrationContractVersion: 3 \};/,
  'El candidato debe marcar nuevas altas 3-doc');
assert.match(candidateFn, /batch\.set\(businessRef\(businessId\), registrationTenant\)/,
  'El marcador debe persistirse en la raíz del negocio');
assert.match(candidateFn, /existingTenant as RestaurantTenant & \{ registrationContractVersion\?: number \}\)\.registrationContractVersion !== 3/,
  'Una raíz legacy sin marcador no puede recuperarse como alta 3-doc');



const emulatorAdapter = functionSection(emulator, 'async function registerCandidate(', '\n// withSecurityRulesDisabled');
assert.equal((emulatorAdapter.match(/\bgetDocFromServer\s*\(/g) || []).length, 2,
  'El adaptador de fallos del emulador también debe recuperar OWNER y raíz desde servidor');
assert.doesNotMatch(emulatorAdapter, /\bgetDoc\s*\(/,
  'No simular recuperación insegura mediante caché en la matriz de 3 documentos');

const normalizedCandidate = candidateFn
  .replace('export async function registerBusinessThreeDocumentCandidate(',
    'export async function registerBusiness(')
  // El marcador del contrato solo existe en el candidato; NO prueba la reserva.
  .replace("  // Señal de contrato para distinguir altas nuevas de raíces legacy sin reserva.\n  // NO certifica la existencia de la reserva: exige revisión privilegiada antes del corte.\n  const registrationTenant = { ...tenant, registrationContractVersion: 3 };\n\n", '')
  .replace('  batch.set(businessRef(businessId), registrationTenant);',
    '  batch.set(businessRef(businessId), tenant);')
  .replace('\n          || (existingTenant as RestaurantTenant & { registrationContractVersion?: number }).registrationContractVersion !== 3', '')
  .replace("  batch.set(doc(db, 'businessHandleReservations', businessId), { businessId, ownerUserId: userId });\n", '')
  .replace('// El tenant, OWNER y reserva permanente se crean en una sola operación: todos se guardan',
    '// El tenant y su OWNER se crean en una sola operación: ambos se guardan')
  .replace('// o ninguno. Las reglas candidatas validan el UID mediante getAfter().',
    '// o ninguno. Las reglas validan el UID del creador mediante getAfter().');
assert.equal(normalizedCandidate.trim(), currentFn,
  'El candidato debe conservar Auth, recuperación, validación de sesión y catálogo del cliente vigente');
assert.match(onboarding,
  /import\s*\{\s*registerBusiness\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/businessAuthService['"]/,
  'El onboarding público sigue usando el cliente vigente');
assert.doesNotMatch(onboarding, /registerBusinessThreeDocumentCandidate|businessRegistrationThreeDocumentCandidate/,
  'No activar el candidato sin revisión de reglas, migración y rollback');
// Solo propuesta de emulador: comprobar que el OWNER no pueda añadir/quitar
// el marcador de recuperación por una actualización ordinaria de la raíz.
const staged = readFileSync('docs/firestore.launch-security.STAGED.rules', 'utf8');
const proposal = buildThreeDocumentRecoveryMarkerProposalRules(staged);
const rootStart = proposal.indexOf('match /businesses/{businessId} {');
const rootEnd = proposal.indexOf('match /businesses/{businessId}/employees/{employeeUserId} {');
assert(rootStart >= 0 && rootEnd > rootStart, 'La propuesta debe conservar la raíz de negocios');
const rootRules = proposal.slice(rootStart, rootEnd);
assert.match(rootRules, /request\.resource\.data\.registrationContractVersion == 3/,
  'Las reglas candidatas deben exigir el marcador al crear');
assert.equal(rootRules.split("request.resource.data.get('registrationContractVersion', null) == resource.data.get('registrationContractVersion', null)").length - 1, 2,
  'Ambas rutas de update deben preservar el marcador sin cambios');
const presenceGuard = "request.resource.data.keys().hasAny(['registrationContractVersion']) == resource.data.keys().hasAny(['registrationContractVersion'])";
assert.equal(rootRules.split(presenceGuard).length - 1, 2,
  'Ambas rutas candidate deben preservar la presencia del marcador (no añadir null)');
assert.doesNotMatch(staged, /registrationContractVersion/,
  'La propuesta de emulador nunca debe modificar las reglas staged originales');
const frozen = buildRegistrationFreezeProposalRules(staged);
const freezeStart = frozen.indexOf('match /businesses/{businessId} {');
const freezeEnd = frozen.indexOf('match /businesses/{businessId}/employees/{employeeUserId} {');
assert(freezeStart >= 0 && freezeEnd > freezeStart, 'La congelación conserva el bloque raíz');
const freezeRoot = frozen.slice(freezeStart, freezeEnd);
assert.equal(freezeRoot.split("request.resource.data.get('registrationContractVersion', null) == resource.data.get('registrationContractVersion', null)").length - 1, 2,
  'Freeze-before/after deben preservar el marcador en ambas rutas de update');
assert.equal(freezeRoot.split(presenceGuard).length - 1, 2,
  'Freeze-before/after no deben permitir insertar marcador null en legacy');
assert.match(freezeRoot, /allow create: if false;/,
  'La congelación debe rechazar altas nuevas');
assert.match(freezeRoot, /allow delete: if false;/,
  'La congelación debe rechazar borrados de raíces');

console.log('PASS: paridad funcional 2/3 documentos y candidato desconectado del onboarding público.');

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findForbiddenCandidateReferences, scanInactiveCandidate } from './guard-inactive-registration-candidate.mjs';

const cases = [
  ["import { registerBusinessThreeDocumentCandidate as registerBusiness } from '../lib/businessRegistrationThreeDocumentCandidate';", true],
  ["export * from '../lib/businessRegistrationThreeDocumentCandidate';", true],
  ["const x = import('../lib/businessRegistrationThreeDocumentCandidate');", true],
  ["const x = require('../lib/businessRegistrationThreeDocumentCandidate');", true],
  ["registerBusinessThreeDocumentCandidate(input);", true],
  ["const x = import('../../scripts/business-registration-cutover-gate.mjs');", true],
  ["// registerBusinessThreeDocumentCandidate and businessRegistrationThreeDocumentCandidate", false],
  ["const x = 'registerBusiness';", false],
  ["import { registerBusiness } from '../lib/businessAuthService';", false],
];
for (const [source, shouldBlock] of cases) {
  assert.equal(findForbiddenCandidateReferences(source).length > 0, shouldBlock, source);
}
const root = mkdtempSync(join(tmpdir(), 'giote-candidate-guard-'));
try {
  mkdirSync(join(root, 'lib'));
  mkdirSync(join(root, 'components'));
  writeFileSync(join(root, 'lib', 'businessRegistrationThreeDocumentCandidate.ts'),
    'export function registerBusinessThreeDocumentCandidate() {}');
  writeFileSync(join(root, 'components', 'Onboarding.tsx'),
    "import { registerBusiness } from '../lib/businessAuthService';");
  assert.deepEqual(scanInactiveCandidate(root), []);
  writeFileSync(join(root, 'components', 'Onboarding.tsx'),
    "export { registerBusinessThreeDocumentCandidate as registerBusiness } from '../lib/businessRegistrationThreeDocumentCandidate';");
  const violations = scanInactiveCandidate(root);
  assert.ok(violations.length >= 2, 'detectar reexportación con alias en un componente anidado');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(`PASS: ${cases.length} casos AST y dos recorridos de directorio; guard 3-doc fail-closed.`);

// Pruebas OFFLINE: solo inventarios A/B sintéticos; nunca Firebase ni PII real.
import assert from 'node:assert/strict';
import { auditBusinessInviteCaptureManifest } from './business-invite-capture-manifest-preflight.mjs';

const SOURCE = 'a'.repeat(64);
const SNAPSHOT = 'b'.repeat(64);
const collection = pageCounts => ({ sourceFingerprint: SOURCE, snapshotFingerprint: SNAPSHOT,
  pageSize: 150, pageCounts });
const fixture = () => ({
  capture: {
    sourceFingerprint: SOURCE, snapshotFingerprint: SNAPSHOT,
    startedAt: 1800000000000, finishedAt: 1800000000500,
    collections: {
      businesses: collection([2]), businessMemberships: collection([3]),
      business_invites: collection([150, 1]),
    },
  },
  coverage: {
    businesses: { complete: true, documentCount: 2, pagesRead: 1 },
    businessMemberships: { complete: true, documentCount: 3, pagesRead: 1 },
    business_invites: { complete: true, documentCount: 151, pagesRead: 2 },
  },
  businesses: [{ docId: 'tenant-a' }, { docId: 'tenant-b' }],
  memberships: [{ docId: 'member-a' }, { docId: 'member-b' }, { docId: 'member-c' }],
  invites: Array.from({ length: 151 }, (_, index) => ({ docId: 'secret-token-' + index })),
});
const inspect = mutate => { const f = fixture(); mutate?.(f); return auditBusinessInviteCaptureManifest(f); };
const noLeak = result => {
  const json = JSON.stringify(result);
  for (const secret of ['tenant-a', 'tenant-b', 'member-a', 'secret-token-', SOURCE, SNAPSHOT]) {
    assert(!json.includes(secret), 'El resultado no debe revelar documentos ni fingerprints');
  }
  assert.equal(result.safeToDeploy, false);
};
const blocked = (label, mutate, code) => {
  const result = inspect(mutate);
  assert.equal(result.status, 'BLOCKED', label);
  assert(result.issues.some(i => i.code === code), label + ': falta ' + code);
  noLeak(result);
};
const good = inspect();
assert.equal(good.status, 'READY_FOR_INDEPENDENT_REVIEW');
assert.equal(good.counts.pagesDeclared, 4);
noLeak(good);
blocked('Sin manifiesto', f => { delete f.capture; }, 'MISSING_CAPTURE_MANIFEST');
blocked('Fuente inválida', f => { f.capture.sourceFingerprint = 'proyecto-real'; }, 'INVALID_SOURCE_FINGERPRINT');
blocked('Snapshot inválido', f => { f.capture.snapshotFingerprint = ''; }, 'INVALID_SNAPSHOT_FINGERPRINT');
blocked('Captura invertida', f => { f.capture.finishedAt = f.capture.startedAt - 1; }, 'INVALID_CAPTURE_TIME_RANGE');
blocked('Colección sin evidencia', f => { delete f.capture.collections.businesses; }, 'MISSING_CAPTURE_COLLECTION');
blocked('Fuente diferente en invitaciones', f => { f.capture.collections.business_invites.sourceFingerprint = 'c'.repeat(64); }, 'CROSS_COLLECTION_CAPTURE_MISMATCH');
blocked('Snapshot diferente en membresías', f => { f.capture.collections.businessMemberships.snapshotFingerprint = 'c'.repeat(64); }, 'CROSS_COLLECTION_CAPTURE_MISMATCH');
blocked('Tamaño de página inválido', f => { f.capture.collections.business_invites.pageSize = 0; }, 'INVALID_CAPTURE_PAGE_SIZE');
blocked('Secuencia vacía', f => { f.capture.collections.businesses.pageCounts = []; }, 'INVALID_CAPTURE_PAGE_SEQUENCE');
blocked('Página negativa', f => { f.capture.collections.businesses.pageCounts = [-1]; }, 'INVALID_CAPTURE_PAGE_COUNTS');
blocked('Página intermedia corta', f => { f.capture.collections.business_invites.pageCounts = [149, 2]; }, 'NONTERMINAL_PAGE_INCOMPLETE');
blocked('Última página llena sin consulta terminal', f => {
  f.invites.pop(); f.coverage.business_invites.documentCount = 150;
  f.capture.collections.business_invites.pageCounts = [150];
  f.coverage.business_invites.pagesRead = 1;
}, 'MISSING_TERMINAL_PAGE');
const exact150 = inspect(f => {
  f.invites.pop(); f.coverage.business_invites.documentCount = 150;
  f.capture.collections.business_invites.pageCounts = [150, 0];
});
assert.equal(exact150.status, 'READY_FOR_INDEPENDENT_REVIEW', '150 exactos con página terminal vacía');
blocked('Páginas y documentos discordantes', f => { f.capture.collections.business_invites.pageCounts = [150, 2]; }, 'CAPTURE_COUNT_MISMATCH');
blocked('Cobertura no exhaustiva', f => { f.coverage.business_invites.complete = false; }, 'CAPTURE_COVERAGE_MISMATCH');
blocked('Número de páginas declarado distinto', f => { f.coverage.business_invites.pagesRead = 1; }, 'CAPTURE_COVERAGE_MISMATCH');
blocked('Inventario no entregado', f => { delete f.memberships; }, 'MISSING_DOCUMENT_INVENTORY');
const emptyInvites = inspect(f => {
  f.invites = []; f.coverage.business_invites.documentCount = 0;
  f.coverage.business_invites.pagesRead = 1;
  f.capture.collections.business_invites.pageCounts = [0];
});
assert.equal(emptyInvites.status, 'READY_FOR_INDEPENDENT_REVIEW', 'Colección vacía con página terminal');
noLeak(emptyInvites);
console.log('PASS: manifiesto offline A/B, páginas terminales, conteos, fuente/snapshot declarados y cero filtración.');

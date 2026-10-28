import assert from 'node:assert/strict';
import { sortModuleRows } from '../src/lib/tenantModuleSort.ts';

// Datos sintéticos de dos negocios: la consulta Firestore ya filtra businessId.
const rows = [
  { id: 'missing', businessId: 'beta-a' },
  { id: 'old', businessId: 'beta-a', createdAt: '2026-10-25T10:00:00.000Z' },
  { id: 'new', businessId: 'beta-a', createdAt: '2026-10-27T10:00:00.000Z' },
];
const before = rows.map(row => row.id);
assert.deepEqual(sortModuleRows(rows, 'createdAt').map(row => row.id),
  ['new', 'old', 'missing']);
assert.deepEqual(rows.map(row => row.id), before, 'No mutar el snapshot original');

assert.deepEqual(sortModuleRows([
  { id: 'small', amount: 2 }, { id: 'large', amount: 10 },
], 'amount').map(row => row.id), ['large', 'small'], 'Orden numérico, no lexicográfico');

assert.deepEqual(sortModuleRows([
  { id: 'earlier', at: { toMillis: () => 100 } },
  { id: 'later', at: { toMillis: () => 200 } },
], 'at').map(row => row.id), ['later', 'earlier'], 'Compatibilidad con Timestamp');

assert.deepEqual(sortModuleRows([
  { id: 'b', createdAt: '2026-10-27' },
  { id: 'a', createdAt: '2026-10-27' },
], 'createdAt').map(row => row.id), ['a', 'b'], 'Empates deterministas');

assert.deepEqual(sortModuleRows([
  { id: 'old', at: new Date('2026-10-25T00:00:00Z') },
  { id: 'new', at: new Date('2026-10-27T00:00:00Z') },
], 'at').map(row => row.id), ['new', 'old']);

console.log('PASS: orden local por fecha, número y Timestamp; faltantes al final, empates estables y sin mutar entradas.');

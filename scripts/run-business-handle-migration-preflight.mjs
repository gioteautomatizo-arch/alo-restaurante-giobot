#!/usr/bin/env node
/**
 * Solo lectura de un JSON LOCAL previamente revisado y autorizado.
 * No abre Firebase, no exporta datos, no escribe reservas ni cambia permisos.
 * La salida omite UIDs y datos personales; muestra IDs y motivos de revisión.
 */
import { readFileSync } from 'node:fs';
import { auditHistoricalHandles } from './business-handle-migration-preflight.mjs';

const input = process.argv[2];
if (process.argv.includes('--help') || !input || process.argv.length !== 3) {
  console.log('Uso: node scripts/run-business-handle-migration-preflight.mjs inventario-local.json');
  console.log('Entrada: { "scope": "business-identifier-inventory", "complete": true, "records": [{"path":"businesses/id","data":{...}}, ...] }');
  console.log('No conecta a Firebase ni genera escrituras. El indicador complete debe verificarse externamente.');
  process.exit(input ? 0 : 2);
}
try {
  const data = JSON.parse(readFileSync(input, 'utf8'));
  const report = auditHistoricalHandles(data);
  console.log(JSON.stringify(report, null, 2));
  console.error('PENDIENTE: incluso sin bloqueos, se requiere respaldo, inventario exhaustivo verificado, revisión humana y autorización antes de cualquier backfill.');
  if (report.globalBlockers.length || report.counts.blockedOrHeld) process.exitCode = 2;
} catch (error) {
  console.error('ALTO: inventario inválido o inaccesible:', error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}

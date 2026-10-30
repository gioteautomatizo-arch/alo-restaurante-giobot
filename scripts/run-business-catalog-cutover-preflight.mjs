/** CLI offline. Nunca muestra los documentos de entrada, solo hallazgos agregados. */
import { readFileSync } from 'node:fs';
import { auditBusinessCatalogCutover } from './business-catalog-cutover-preflight.mjs';
const filename = process.argv[2];
if (!filename) {
  console.error('Uso: node scripts/run-business-catalog-cutover-preflight.mjs inventario-autorizado.json');
  process.exitCode = 2;
} else {
  try {
    const result = auditBusinessCatalogCutover(JSON.parse(readFileSync(filename,'utf8')));
    console.log(JSON.stringify(result,null,2));
    if (result.status === 'BLOCKED') process.exitCode = 1;
  } catch {
    // No imprimir errores con rutas o fragmentos potencialmente sensibles.
    console.error('No se pudo leer o validar el inventario local. Comprueba el archivo y su formato.');
    process.exitCode = 2;
  }
}

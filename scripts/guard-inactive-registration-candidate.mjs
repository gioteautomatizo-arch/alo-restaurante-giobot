/**
 * Paso 2: puerta de CI para impedir que el candidato 3-doc llegue al runtime
 * antes de un corte aprobado. Analiza AST de TODO src, no solo onboarding.
 * No importa el candidato, no lee Firebase y no cambia datos ni reglas.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const CANDIDATE_MODULE = 'businessRegistrationThreeDocumentCandidate';
const CANDIDATE_SYMBOL = 'registerBusinessThreeDocumentCandidate';
const CUTOVER_SCRIPT = 'business-registration-cutover-gate';
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;

export function findForbiddenCandidateReferences(source, fileName = 'fixture.ts') {
  const scriptKind = /\.(?:tsx|jsx)$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const ast = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const findings = [];
  function walk(node) {
    if (ts.isIdentifier(node) && node.text === CANDIDATE_SYMBOL) {
      const pos = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      findings.push({ file: fileName, line: pos.line + 1, kind: 'candidate-symbol' });
    } else if (ts.isStringLiteralLike(node)
        && (node.text.includes(CANDIDATE_MODULE) || node.text.includes(CUTOVER_SCRIPT))) {
      const pos = ast.getLineAndCharacterOfPosition(node.getStart(ast));
      findings.push({ file: fileName, line: pos.line + 1, kind: 'candidate-module' });
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  return findings;
}

export function scanInactiveCandidate(root = 'src') {
  if (!existsSync(root)) throw new Error(`No existe el árbol de producción: ${root}`);
  const findings = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.test(entry.name)) {
        const relativePath = relative(root, full).replaceAll('\\', '/');
        if (relativePath === 'lib/businessRegistrationThreeDocumentCandidate.ts') continue;
        findings.push(...findForbiddenCandidateReferences(readFileSync(full, 'utf8'), full));
      }
    }
  };
  walk(resolve(root));
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scanInactiveCandidate('src');
  if (findings.length) {
    for (const issue of findings) console.error(`BLOCKED ${issue.file}:${issue.line} (${issue.kind})`);
    console.error('El candidato 3-doc NO debe importarse ni invocarse desde src antes de un corte autorizado.');
    process.exitCode = 1;
  } else {
    console.log('PASS: candidato 3-doc aislado en todo src (AST); sin activación de producción.');
  }
}

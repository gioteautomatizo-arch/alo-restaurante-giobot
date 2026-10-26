// Evita falsos positivos: Firebase CLI usa rutas relativas al directorio del config.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
for (const configPath of [
  'scripts/firebase.invites-emulator.json',
  'scripts/firebase.security-emulator.json',
  'firebase.launch-security-emulator.json',
]) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const rulesPath = resolve(dirname(configPath), config.firestore?.rules || '');
  assert(config.firestore?.rules, configPath + ': falta ruta de reglas');
  assert(existsSync(rulesPath), configPath + ': reglas inexistentes ' + rulesPath);
  const rules = readFileSync(rulesPath, 'utf8');
  assert(rules.includes("rules_version = '2'") && rules.includes('match /databases/'),
    configPath + ': reglas inválidas o vacías');
  console.log('PASS: ' + configPath + ' -> ' + rulesPath);
}

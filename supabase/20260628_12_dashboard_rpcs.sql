import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptsDir = resolve(import.meta.dirname);
const checks = readdirSync(scriptsDir)
  .filter(name => /^check-.*\.mjs$/.test(name))
  .sort();

for (const check of checks) {
  console.log(`\n== ${check} ==`);
  execFileSync(process.execPath, [resolve(scriptsDir, check)], { stdio: 'inherit' });
}
console.log(`\nOK: ${checks.length} validações concluídas.`);

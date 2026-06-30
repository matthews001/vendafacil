import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checks = [
  'check-project-structure.mjs',
  'check-inline-syntax.mjs',
  'check-template.mjs',
  'check-storefront-core-flow.mjs',
  'check-pwa-service-worker.mjs',
  'check-delivery-cep-only.mjs',
  'check-pdv-cart-add.mjs'
];

for (const check of checks) {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts', check)], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('Validação principal concluída.');

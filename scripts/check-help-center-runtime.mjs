import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [template, runtime, build] = await Promise.all([
  readFile(resolve(root, 'src/templates/index.template.html'), 'utf8'),
  readFile(resolve(root, 'src/assets/js/help-center.js'), 'utf8'),
  readFile(resolve(root, 'scripts/build.mjs'), 'utf8')
]);
for (const token of [
  '/assets/help-center.v20260630-2.js',
  'vf-help-center-runtime-style',
  '#vf-help-center.vf-help-center',
  'ensureStyles();'
]) {
  if (!`${template}\n${runtime}\n${build}`.includes(token)) throw new Error(`Ajuda sem proteção contra CSS em cache: ${token}`);
}
console.log('Central de ajuda: janela independente de CSS externo validada.');

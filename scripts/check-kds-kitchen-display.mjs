import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [template, modules] = await Promise.all([
  readFile(resolve(root, 'src/templates/index.template.html'), 'utf8'),
  readFile(resolve(root, 'src/assets/styles/app-modules.css'), 'utf8')
]);
const source = template + '\n' + modules;
const doc = await readFile(resolve(root, 'docs/changes/KDS_COZINHA.md'), 'utf8');

for (const token of [
  'data-commerce-page="kds"',
  'id="vf-kds-script"',
  'commerce-page-kds',
  'commerce_set_order_status',
  'KDS_POLL_MS = 20000',
  'vfKdsAdvance',
  'vf-kds-board',
  'vf-kds-page'
]) {
  if (!source.includes(token)) throw new Error('KDS incompleto: token ausente ' + token);
}

const script = template.match(/<script id="vf-kds-script">\s*([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('Script do KDS não encontrado.');
new Function(script);
if (!doc.includes('Cozinha (KDS)')) throw new Error('Documentação do KDS ausente.');
console.log('KDS validado: navegação, fila, atualização de status, atualização periódica e sintaxe do script.');

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const template = await readFile(resolve(root, 'index.template.html'), 'utf8');
const doc = await readFile(resolve(root, 'KDS_COZINHA.md'), 'utf8');

for (const token of [
  'data-commerce-page="kds"',
  'id="vf-kds-script"',
  'commerce-page-kds',
  'commerce_set_order_status',
  'KDS_POLL_MS = 20000',
  'vfKdsAdvance',
  'vf-kds-board',
  'vf-kds-styles'
]) {
  if (!template.includes(token)) throw new Error('KDS incompleto: token ausente ' + token);
}

const script = template.match(/<script id="vf-kds-script">\s*([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('Script do KDS não encontrado.');
new Function(script);
if (!doc.includes('Cozinha (KDS)')) throw new Error('Documentação do KDS ausente.');
console.log('KDS validado: navegação, fila, atualização de status, atualização periódica e sintaxe do script.');

import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.template.html'), 'utf8');
const pattern = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
let match;
let checked = 0;
while ((match = pattern.exec(html))) {
  const source = match[1].trim();
  if (!source) continue;
  try {
    new vm.Script(source, { filename: `index.template.html:inline-${checked + 1}.js` });
  } catch (error) {
    throw new Error(`Erro de sintaxe no script inline ${checked + 1}: ${error.message}`);
  }
  checked += 1;
}
if (!checked) throw new Error('Nenhum script inline foi localizado para validação.');
console.log(`Sintaxe validada: ${checked} scripts inline do painel.`);

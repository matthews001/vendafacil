import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const templates = [
  ['src/templates/index.template.html', 'painel'],
  ['src/templates/loja.template.html', 'vitrine']
];
const pattern = /<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/gi;
let checked = 0;

for (const [path, label] of templates) {
  const html = await readFile(resolve(root, path), 'utf8');
  let match;
  while ((match = pattern.exec(html))) {
    const source = match[1].trim();
    if (!source) continue;
    try {
      new vm.Script(source, { filename: `${label}:inline-${checked + 1}.js` });
    } catch (error) {
      throw new Error(`Erro de sintaxe no script inline ${label} ${checked + 1}: ${error.message}`);
    }
    checked += 1;
  }
  pattern.lastIndex = 0;
}
if (!checked) throw new Error('Nenhum script inline foi localizado para validação.');

for (const [path, label] of [
  ['src/assets/js/storefront.js', 'storefront.js'],
  ['src/assets/js/help-center.js', 'help-center.js']
]) {
  const source = await readFile(resolve(root, path), 'utf8');
  try {
    new vm.Script(source, { filename: label });
  } catch (error) {
    throw new Error(`Erro de sintaxe em ${label}: ${error.message}`);
  }
}

console.log(`Sintaxe validada: ${checked} scripts inline e scripts públicos.`);

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [template, foundation, modules] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'assets/styles/app-foundation.css'), 'utf8'),
  readFile(resolve(root, 'assets/styles/app-modules.css'), 'utf8')
]);
const app = template + '\n' + foundation + '\n' + modules;
const storeJs = await readFile(resolve(root, 'assets/storefront.js'), 'utf8');
const storeHtml = await readFile(resolve(root, 'loja.template.html'), 'utf8');
const appChecks = [
  ['categoria obrigatória no item', "Informe a categoria do item"],
  ['autocompletar categorias', 'commerce-product-category-list'],
  ['categoria como destino do complemento', 'target_categories'],
  ['validação de destino do complemento', 'Escolha pelo menos uma categoria onde este complemento deve aparecer.'],
  ['busca de categoria', 'vf-menu-category-search'],
  ['aplicação automática em novos itens', 'vfMenuApplyCategoryComplementsToSavedProduct'],
  ['ajuda para cadastrar item', 'Cadastro rápido'],
  ['ajuda para complementar por categoria', 'Como cadastrar um complemento'],
  ['guias nas páginas operacionais', 'Como despachar a entrega'],
  ['feedback de salvamento', 'Complemento salvo. Ele aparecerá em']
];
for (const [label, token] of appChecks) if (!app.includes(token)) throw new Error(`Falha: ${label}.`);
if(!storeJs.includes('Personalize antes de pedir')) throw new Error('Falha: cliente não vê que o item pode ser personalizado.');
if(!storeHtml.includes('As opções com * são obrigatórias.')) throw new Error('Falha: cliente não entende campos obrigatórios.');
console.log('Cardápio validado: categoria, complementos, validações, ajuda operacional e experiência do cliente presentes.');

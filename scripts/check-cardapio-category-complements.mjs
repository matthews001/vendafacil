import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = await readFile(resolve(root, 'index.template.html'), 'utf8');
const store = await readFile(resolve(root, 'assets/storefront.js'), 'utf8');
const checks = [
  ['categoria obrigatória no item', "Informe a categoria do item"],
  ['autocompletar categorias', 'commerce-product-category-list'],
  ['categoria como destino do complemento', 'target_categories'],
  ['validação de destino do complemento', 'Escolha pelo menos uma categoria onde este complemento deve aparecer.'],
  ['busca de categoria', 'vf-menu-category-search'],
  ['aplicação automática em novos itens', 'vfMenuApplyCategoryComplementsToSavedProduct'],
  ['ajuda para cadastrar item', 'Cadastro rápido'],
  ['ajuda para complementar por categoria', 'Como cadastrar um complemento'],
  ['guias nas páginas operacionais', 'Como despachar a entrega'],
  ['feedback de salvamento', 'Complemento salvo. Ele aparecerá em'],
  ['cliente vê personalização', 'Personalize antes de pedir'],
  ['cliente entende campos obrigatórios', 'As opções com * são obrigatórias.']
];
for (const [label, token] of checks) {
  const source = label.startsWith('cliente') ? store : app;
  if (!source.includes(token)) throw new Error(`Falha: ${label}.`);
}
console.log('Cardápio validado: categoria, complementos, validações, ajuda operacional e experiência do cliente presentes.');

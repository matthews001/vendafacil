import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = await readFile(resolve(root, 'index.template.html'), 'utf8');
const checks = [
  ['ponte global do cliente Supabase', 'window.vfGetSupabaseClient = () => sb;'],
  ['cliente do banco reutiliza a ponte global', 'window.vfGetSupabaseClient?.()'],
  ['aguarda conexão inicializar antes do salvamento', 'const waitForDb = async'],
  ['persistência aguarda cliente', 'const client=await waitForDb(), businessId=activeBusinessId();'],
  ['resolver único da loja ativa', 'const activeBusinessId = () =>'],
  ['fallback pela configuração da loja', 'current.commerceSettings?.business_id'],
  ['fallback pelos itens carregados', '.map(product => clean(product?.business_id))'],
  ['salvamento cria ou atualiza configurações', ".from('commerce_settings').upsert({"],
  ['conflito por loja na configuração', "{onConflict:'business_id'}"],
  ['produtos atualizados com a mesma loja ativa', 'async function updateProductsForGroup(group) {\n    const client=await waitForDb(), businessId=activeBusinessId();'],
  ['erro claro quando não houver contexto', 'A loja ativa não foi identificada. Feche e abra o painel da loja novamente.'],
  ['mensagem de sucesso após persistir e vincular', 'Complemento salvo. Ele aparecerá em']
];
for (const [label, token] of checks) {
  if (!app.includes(token)) throw new Error(`Fluxo de salvar complemento incompleto: ${label}.`);
}
const saveStart = app.indexOf('async function saveComplement()');
const persist = app.indexOf('await persistLibrary(next);', saveStart);
const link = app.indexOf('await updateProductsForGroup(group);', saveStart);
const success = app.indexOf('Complemento salvo. Ele aparecerá em', saveStart);
if (!(saveStart >= 0 && persist > saveStart && link > persist && success > link)) {
  throw new Error('A ordem do fluxo não está correta: salvar biblioteca → vincular itens → confirmar sucesso.');
}
console.log('Fluxo de salvar complemento validado: loja ativa, upsert, vínculo por categoria e confirmação.');

import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.template.html'), 'utf8');

function scriptById(id) {
  const match = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
  if (!match) throw new Error(`Script ${id} não foi encontrado.`);
  return match[1];
}

const bridge = scriptById('vf-pdv-state-bridge');
const step6 = scriptById('vf-pdv-step6-script');

const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext("let state = { business: { id: '11111111-1111-4111-8111-111111111111' } };", context);
vm.runInContext(bridge, context);

assert.equal(
  context.window.vfPdvGetBusinessId(),
  '11111111-1111-4111-8111-111111111111',
  'A ponte do PDV deve ler a loja atual do estado principal.'
);
assert.match(step6, /vfPdvGetBusinessId/, 'Mesas deve usar a ponte de business_id.');
assert.match(step6, /payload\.p_business_id = activeBusinessId/, 'RPC de mesas deve substituir business_id vazio pelo da loja ativa.');
assert.match(step6, /Não foi possível identificar a loja ativa/, 'Mesas deve interromper a operação antes de enviar UUID vazio.');

console.log('Passo 6 validado: mesas sempre usam o business_id da loja ativa e bloqueiam envio vazio.');

const subtotalFix = await readFile(new URL('../supabase/migrations/20260627_7_pdv_mesas_subtotal_amount_fix.sql', import.meta.url), 'utf8');
if (!subtotalFix.includes('subtotal_amount') || !subtotalFix.includes('v_subtotal')) {
  throw new Error('Correção de subtotal_amount do PDV não foi encontrada.');
}


import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'src/templates/index.template.html'), 'utf8');
const match = html.match(/<script id="vf-pdv-operation-print-script">([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Script de impressão unificada não encontrado.');

let printed = null;
let rpcPayload = null;
const windowMock = {
  vfPdvGetBusinessId: () => '11111111-1111-4111-8111-111111111111',
  vfPdv9PrintReceipt: data => { printed = data; },
  toast: message => { throw new Error(`Não era esperado erro: ${message}`); },
  setTimeout: fn => { fn(); },
};
const documentMock = {
  readyState: 'complete',
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ dataset: {}, className: '', innerHTML: '', addEventListener: () => {} }),
  addEventListener: () => {},
};
const context = vm.createContext({
  window: windowMock,
  document: documentMock,
  localStorage: { getItem: () => null },
  sb: { rpc: async (name, args) => {
    rpcPayload = { name, args };
    return { data: { id: 'order-1', public_code: 'VFTESTE', business_name: 'Loja Teste', commerce_order_items: [] }, error: null };
  } },
  console,
});
new vm.Script(match[1], { filename: 'vf-pdv-operation-print-script.js' }).runInContext(context);
await windowMock.vfPdv10PrintOrder('order-1');
assert.equal(rpcPayload.name, 'vf_pos_get_order_receipt');
assert.equal(rpcPayload.args.p_business_id, '11111111-1111-4111-8111-111111111111');
assert.equal(rpcPayload.args.p_order_id, 'order-1');
assert.equal(printed.id, 'order-1');
console.log('Impressão unificada validada: consulta o pedido real no banco e abre a prévia para qualquer origem.');

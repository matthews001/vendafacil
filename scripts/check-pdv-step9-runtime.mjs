import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'src/templates/index.template.html'), 'utf8');
const match = html.match(/<script id="vf-pdv-step9-script">([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Script do Passo 9 não encontrado para teste de execução.');

const storage = new Map();
const writes = [];
const documentMock = {
  readyState: 'complete',
  getElementById: () => null,
  addEventListener: () => {},
  body: { insertAdjacentHTML: () => {} }
};
const windowMock = {
  vfPdvGetAppState: () => ({
    business: { id: 'business-test', name: 'Loja Teste' },
    commerceProducts: [{ id: 'product-1', name: 'Hambúrguer Teste', price: 20 }]
  }),
  vfPdvGetBusinessId: () => 'business-test',
  toast: () => {},
  setTimeout: callback => { callback(); return 1; },
  open: () => ({
    document: { open: () => {}, write: value => writes.push(value), close: () => {} },
    focus: () => {}, print: () => {}
  })
};
const context = vm.createContext({
  window: windowMock,
  document: documentMock,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  Intl,
  JSON,
  Number,
  String,
  Array,
  Object,
  Math,
  Date,
  setTimeout: windowMock.setTimeout
});
new vm.Script(match[1], { filename: 'vf-pdv-step9-script.js' }).runInContext(context);
if (typeof windowMock.vfPdv9Remember !== 'function' || typeof windowMock.vfPdv9PrintReceipt !== 'function') {
  throw new Error('Funções públicas de cupom não foram registradas.');
}
const receipt = windowMock.vfPdv9Remember({
  public_code: 'VF-100', receipt_kind: 'Entrega', buyer_name: 'Cliente Teste',
  payment_method: 'cash', amount_received: 30, change_amount: 5,
  delivery_fee: 4, subtotal_amount: 21, total_amount: 25,
  delivery_address: { street: 'Rua Teste', number: '10', cep: '20000-000' },
  lines: [{ product_id: 'product-1', quantity: 1, selected_options: [], customer_note: 'Sem cebola' }]
});
if (receipt.total !== 25 || receipt.kind !== 'Entrega' || receipt.lines.length !== 1) {
  throw new Error('Normalização do cupom retornou dados incorretos.');
}
windowMock.vfPdv9PrintReceipt(receipt);
if (!writes.length || !writes[0].includes('COMPROVANTE NÃO FISCAL') || !writes[0].includes('Hambúrguer Teste') || !writes[0].includes('Rua Teste')) {
  throw new Error('HTML do cupom não contém os dados essenciais.');
}
console.log('Passo 9 runtime validado: memória, normalização e HTML do cupom funcionam em teste isolado.');

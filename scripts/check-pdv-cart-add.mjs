import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'src/templates/index.template.html'), 'utf8');

const extract = id => {
  const match = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`, 'i'));
  if (!match) throw new Error(`Script ${id} não encontrado.`);
  return match[1];
};

const step3 = extract('vf-pdv-step3-script');
const step4 = extract('vf-pdv-step4-script');
if (!step3.includes('data-vf-pdv-add') || !step3.includes('onclick="vfPdv4Add')) {
  throw new Error('O card do catálogo não está ligado diretamente à inclusão no carrinho.');
}
if (step3.includes('openProductModal(button.dataset.vfPdvProduct)')) {
  throw new Error('O antigo listener de detalhes do Passo 3 ainda disputa o clique do produto.');
}
if (!step4.includes("querySelectorAll('[data-vf-pdv-add]')")) {
  throw new Error('O Passo 4 não reconhece o botão atual de adicionar produto.');
}
if (step4.includes("closest('#vf-pdv-product-stage [data-vf-pdv-product]')")) {
  throw new Error('Ainda existe listener global antigo no clique do catálogo.');
}

const storage = new Map();
const cartBody = { innerHTML: '' };
const cartFoot = { innerHTML: '' };
const stage = { querySelectorAll: () => [] };
const documentMock = {
  readyState: 'complete',
  getElementById: id => id === 'vf-pdv-product-stage' ? stage : null,
  querySelector: selector => {
    if (selector === '#commerce-page-pos .vf-pdv-cart-body') return cartBody;
    if (selector === '#commerce-page-pos .vf-pdv-cart-foot') return cartFoot;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: { insertAdjacentHTML: () => {} }
};
const windowMock = {
  toast: () => {},
  setTimeout: callback => { callback(); return 1; },
  vfPdvSelectMode: () => {},
  vfPdvGetAppState: () => ({
    business: { id: 'business-test', name: 'Loja Teste' },
    commerceProducts: [{ id: 'product-1', name: 'Produto Teste', price: 19.9, active: true, stock_quantity: 20, option_groups: [], allow_customer_note: false }]
  })
};
const context = vm.createContext({
  window: windowMock,
  document: documentMock,
  state: windowMock.vfPdvGetAppState(),
  sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789000' },
  MutationObserver: class { constructor() {} observe() {} disconnect() {} },
  requestAnimationFrame: callback => { callback(); return 1; },
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
new vm.Script(step4, { filename: 'vf-pdv-step4-script.js' }).runInContext(context);
if (typeof windowMock.vfPdv4Add !== 'function' || typeof windowMock.vfPdv4ReadDraft !== 'function') {
  throw new Error('As funções públicas do carrinho não foram registradas.');
}
windowMock.vfPdv4Add('product-1');
const draft = windowMock.vfPdv4ReadDraft();
if (draft.lines.length !== 1 || draft.lines[0].product_id !== 'product-1' || Number(draft.lines[0].quantity) !== 1) {
  throw new Error('O clique simulado não adicionou o produto ao rascunho do carrinho.');
}
if (!cartBody.innerHTML.includes('Produto Teste') || !cartFoot.innerHTML.includes('R$')) {
  throw new Error('O carrinho não foi renderizado após adicionar o produto.');
}
console.log('Carrinho validado: botão único, inclusão no rascunho e renderização imediata.');

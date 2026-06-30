import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'src/templates/index.template.html'), 'utf8');
const match = html.match(/<script id="vf-pdv-print-preview-fix-script">([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Correção de prévia de impressão não encontrada.');

const storage = new Map();
const inserted = [];
let created = false;
const frame = { srcdoc: '', contentWindow: { focus: () => {}, print: () => { frame.printed = true; } } };
const modal = { classList: { add: () => {}, remove: () => {} }, setAttribute: () => {} };
const elements = new Map(Object.entries({
  'vf-pdv-print-preview-modal': modal,
  'vf-pdv-print-preview-title': { textContent: '' },
  'vf-pdv-print-preview-subtitle': { textContent: '' },
  'vf-pdv-print-preview-alert': { hidden: true, innerHTML: '' },
  'vf-pdv-print-preview-frame': frame
}));
const documentMock = {
  readyState: 'complete',
  getElementById: id => created ? (elements.get(id) || null) : null,
  addEventListener: () => {},
  body: { insertAdjacentHTML: (_where, value) => { inserted.push(value); created = true; } }
};
const windowMock = {
  vfPdvGetAppState: () => ({ business: { id: 'biz-1', name: 'Loja Teste' }, commerceProducts: [{ id: 'p1', name: 'Produto Teste', price: 12.5 }] }),
  vfPdvGetBusinessId: () => 'biz-1',
  vfPdv4ReadDraft: () => ({ mode: 'balcao', customer: 'Cliente Teste', lines: [{ product_id: 'p1', quantity: 2, selected_options: [], customer_note: 'Sem gelo' }], discount: { type: 'percent', value: 10 } }),
  vfPdv5Print: () => {},
  vfPdv5GetLastSale: () => null,
  toast: () => {},
};
const context = vm.createContext({
  window: windowMock,
  document: documentMock,
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  Intl, JSON, Number, String, Array, Object, Math, Date
});
new vm.Script(match[1], { filename: 'vf-pdv-print-preview-fix-script.js' }).runInContext(context);
if (typeof windowMock.vfPdv9PrintLast !== 'function') throw new Error('Ação de impressão do carrinho não foi registrada.');
windowMock.vfPdv9PrintLast();
if (!inserted.length || !created) throw new Error('A prévia não foi montada.');
if (!frame.srcdoc.includes('PRÉVIA') || !frame.srcdoc.includes('Produto Teste') || !frame.srcdoc.includes('R$')) {
  throw new Error('Prévia do rascunho não contém os dados esperados.');
}
windowMock.vfPdvPrintPreviewNative();
if (!frame.printed) throw new Error('Ação Imprimir / Salvar PDF não acionou a impressão do iframe.');
console.log('Prévia de impressão validada: rascunho abre, exibe itens e aciona impressão sem popup externo.');

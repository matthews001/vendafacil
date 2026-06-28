import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [storefront, template, build, sw] = await Promise.all([
  readFile(resolve(root, 'assets/storefront.js'), 'utf8'),
  readFile(resolve(root, 'loja.template.html'), 'utf8'),
  readFile(resolve(root, 'scripts/build.mjs'), 'utf8'),
  readFile(resolve(root, 'assets/sw.js'), 'utf8')
]);

const required = [
  'window.addToStoreCart=',
  'function addLine(line)',
  'window.confirmProductOptions=',
  'function renderCheckoutTotals()',
  'window.createPublicCommerceOrder='
];
for (const token of required) {
  if (!storefront.includes(token)) throw new Error(`Fluxo da vitrine incompleto: ausente ${token}`);
}
if (storefront.includes("rpc('vf_get_public_delivery_radius'")) {
  throw new Error('A vitrine não deve chamar a RPC opcional de raio enquanto ela não estiver garantida no banco.');
}
if (!template.includes('storefront.v11-core-flow.js') || !build.includes('storefront.v11-core-flow.js') || !sw.includes('storefront.v11-core-flow.js')) {
  throw new Error('Versão da vitrine não está sincronizada entre template, build e PWA.');
}
console.log('OK: carrinho, checkout por CEP e cache da vitrine estão sincronizados.');

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [store, manager, migration, template] = await Promise.all([
  readFile(resolve(root, 'assets/storefront.js'), 'utf8'),
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'supabase/20260628_21_hotfix_checkout_raio_rpc.sql'), 'utf8'),
  readFile(resolve(root, 'loja.template.html'), 'utf8')
]);

for (const token of [
  'PAYMENT_METHODS', 'function checkout()', 'renderCheckoutPaymentMethods',
  'renderOfflinePayment', 'selectStorePaymentMethod', 'paymentMethodFromOrder',
  'commerce_customer_create_order'
]) {
  if (!store.includes(token)) throw new Error('Vitrine sem fluxo de pagamento: ' + token);
}
for (const obsolete of [
  "rpc('vf_customer_create_order_with_payment'",
  "rpc('vf_customer_create_radius_order_with_payment'"
]) {
  if (store.includes(obsolete)) throw new Error('A vitrine ainda depende da RPC antiga: ' + obsolete);
}
for (const token of ['settings-payments', 'vfSavePaymentMethods', 'Formas de pagamento', 'payment_methods_config']) {
  if (!manager.includes(token)) throw new Error('Painel sem pagamentos: ' + token);
}
for (const token of [
  'vf_customer_create_order_with_payment', 'vf_customer_create_radius_order_with_payment',
  'vf_configure_delivery_radius', "notify pgrst, 'reload schema'", 'payment_details jsonb'
]) {
  if (!migration.includes(token)) throw new Error('Hotfix sem compatibilidade: ' + token);
}
for (const token of ['store-payment-method-card', 'store-payment-methods', 'store-cash-change-for']) {
  if (!template.includes(token)) throw new Error('Checkout sem escolha de pagamento: ' + token);
}
new Function(store);

const createStart = store.indexOf('window.createPublicCommerceOrder=async()=>');
const createEnd = store.indexOf('window.copyPixCode=', createStart);
const createBlock = store.slice(createStart, createEnd);
if (/wa\.me|window\.open\('about:blank'/.test(createBlock)) {
  throw new Error('Checkout abre WhatsApp antes da confirmação de Pix.');
}
if (!createBlock.includes("method==='pix'") || !createBlock.includes('renderOfflinePayment(created,method)')) {
  throw new Error('Checkout não separa Pix de maquininha/dinheiro.');
}
console.log('Pagamento validado: checkout atual sem RPC antiga e fallback SQL disponível.');

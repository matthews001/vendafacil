import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [store, manager, template, build, sw, vercel, recovery] = await Promise.all([
  readFile(resolve(root, 'assets/storefront.js'), 'utf8'),
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'loja.template.html'), 'utf8'),
  readFile(resolve(root, 'scripts/build.mjs'), 'utf8'),
  readFile(resolve(root, 'assets/sw.js'), 'utf8'),
  readFile(resolve(root, 'vercel.json'), 'utf8'),
  readFile(resolve(root, 'supabase/20260628_22_recuperacao_checkout_raio.sql'), 'utf8')
]);

for (const forbidden of ["rpc('vf_customer_create_order_with_payment'", "rpc('vf_customer_create_radius_order_with_payment'"]) {
  if (store.includes(forbidden)) throw new Error('Checkout atual depende de RPC removida: ' + forbidden);
}
if (manager.includes("sb.rpc('vf_configure_delivery_radius'")) throw new Error('Painel atual ainda chama a RPC de raio antiga.');
for (const token of ["String(zone?.vf_delivery_rule||'cep')!=='radius'", 'commerce_customer_create_order']) {
  if (!store.includes(token)) throw new Error('Vitrine não separa CEP de raio corretamente: ' + token);
}
for (const token of ['delivery_origin_cep:originCep||null', 'delivery_origin_number:originNumber||null', "vf_delivery_rule:'radius'", 'visibleCepZones']) {
  if (!manager.includes(token)) throw new Error('Painel não salva/filtra corretamente a entrega por raio: ' + token);
}
for (const token of ['storefront.v14-stable.css', 'storefront.v14-stable.js']) {
  if (![template, build, sw, vercel].every(content => content.includes(token))) throw new Error('Asset da vitrine inconsistente: ' + token);
}
if (!sw.includes("CACHE_NAME = 'vendafacil-pwa-v20-storefront-recovery'")) throw new Error('Service Worker não recebeu nova versão de cache.');
for (const token of ['vf_configure_delivery_radius', 'vf_customer_create_order_with_payment', 'vf_customer_create_radius_order_with_payment', "notify pgrst, 'reload schema'"]) {
  if (!recovery.includes(token)) throw new Error('Migration de recuperação incompleta: ' + token);
}
new Function(store);
console.log('Recuperação validada: assets versionados, checkout sem RPC antiga, raio separado do CEP e SQL de compatibilidade presente.');

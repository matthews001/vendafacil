import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sw = await readFile(resolve(root, 'src/pwa/sw.js'), 'utf8');
const store = await readFile(resolve(root, 'src/assets/js/storefront.js'), 'utf8');
const headers = await readFile(resolve(root, 'src/cloudflare/_headers'), 'utf8');
const redirects = await readFile(resolve(root, 'src/cloudflare/_redirects'), 'utf8');

for (const token of [
  "CACHE_NAME = 'fechai-pwa-v1-brand'",
  'storefront.v14-stable.js',
  'styles/mobile-responsive.css',
  'const responseForCache = response.clone();',
  'event.waitUntil(caches.open(CACHE_NAME)'
]) {
  if (!sw.includes(token)) throw new Error('Service Worker incompleto: ' + token);
}
for (const forbidden of [
  'theme-controls.js',
  'theme-contrast.css',
  'contrast-audit.css',
  "cache.put('/loja.html', response.clone())",
  'cache.put(request, response.clone())'
]) {
  if (sw.includes(forbidden)) throw new Error('Service Worker contém referência removida ou clone tardio: ' + forbidden);
}
if (store.includes("event.preventDefault(); show($('store-install-button'),true)")) {
  throw new Error('PWA ainda bloqueia o banner de instalação sem disparar prompt.');
}
for (const token of [
  '/assets/*',
  'no-cache, max-age=0, must-revalidate',
  '/sw.js',
  'no-cache, no-store, must-revalidate'
]) {
  if (!headers.includes(token)) throw new Error('Cloudflare Pages precisa preservar a atualização do PWA: ' + token);
}
for (const token of [
  '/funcionario/login /funcionario/login/index.html 200',
  '/entregador /entregador/index.html 200'
]) {
  if (!redirects.includes(token)) throw new Error('Redirecionamento Cloudflare ausente: ' + token);
}
console.log('PWA validado: cache seguro, rotas e cabeçalhos próprios do Cloudflare Pages preservados.');

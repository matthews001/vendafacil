import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sw = await readFile(resolve(root, 'src/pwa/sw.js'), 'utf8');
const store = await readFile(resolve(root, 'src/assets/js/storefront.js'), 'utf8');
const vercel = await readFile(resolve(root, 'vercel.json'), 'utf8');

for (const token of [
  "CACHE_NAME = 'vendafacil-pwa-v27-palette'",
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
  '"source": "/sw.js"',
  'no-cache, no-store, must-revalidate',
  '"source": "/assets/(.*)"',
  'no-cache, max-age=0, must-revalidate'
]) {
  if (!vercel.includes(token)) throw new Error('Vercel precisa impedir cache dos assets críticos: ' + token);
}
console.log('PWA validado: cache seguro, tema claro único e atualização de assets preservada.');

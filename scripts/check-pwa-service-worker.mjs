import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sw = await readFile(resolve(root, 'assets/sw.js'), 'utf8');
const vercel = await readFile(resolve(root, 'vercel.json'), 'utf8');

const checks = [
  ['cache atualizado', "CACHE_NAME = 'vendafacil-pwa-v13-complementos-db-bridge'"],
  ['clone criado antes do cache da rota', 'const responseForCache = response.clone();'],
  ['cache da rota espera durante o evento', 'event.waitUntil(caches.open(CACHE_NAME)'],
  ['clone tardio removido', "cache.put('/loja.html', response.clone())"],
  ['clone tardio de asset removido', 'cache.put(request, response.clone())']
];
for (const [label, token] of checks) {
  const present = sw.includes(token);
  if (label.includes('removido')) {
    if (present) throw new Error(`Service Worker inseguro: ${label}.`);
  } else if (!present) {
    throw new Error(`Service Worker incompleto: ${label}.`);
  }
}
if (!vercel.includes('\"source\": \"/sw.js\"') || !vercel.includes('no-cache, no-store, must-revalidate')) {
  throw new Error('Vercel precisa impedir cache do sw.js para entregar atualizações do PWA.');
}
console.log('PWA validado: cache seguro, clone antecipado e sw.js sem cache.');

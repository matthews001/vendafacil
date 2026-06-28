import { copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const mapboxPublicToken = process.env.MAPBOX_PUBLIC_TOKEN?.trim() || '';

if (!url || !key) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY antes de gerar o site.');
}

const injectEnvironment = template => template
  .replaceAll("'__SUPABASE_URL__'", JSON.stringify(url))
  .replaceAll("'__SUPABASE_PUBLISHABLE_KEY__'", JSON.stringify(key))
  .replaceAll("'__MAPBOX_PUBLIC_TOKEN__'", JSON.stringify(mapboxPublicToken));

const dist = resolve(root, 'dist');
// Evita arquivos antigos no deploy, principalmente versões anteriores da vitrine/PWA.
await rm(dist, { recursive: true, force: true });
await Promise.all([
  mkdir(resolve(dist, 'assets'), { recursive: true }),
  mkdir(resolve(dist, 'entregador'), { recursive: true }),
  mkdir(resolve(dist, 'funcionario', 'login'), { recursive: true })
]);

const [appTemplate, storeTemplate] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'loja.template.html'), 'utf8')
]);

const builtApp = injectEnvironment(appTemplate);
const builtStore = injectEnvironment(storeTemplate);

await Promise.all([
  writeFile(resolve(dist, 'index.html'), builtApp, 'utf8'),
  writeFile(resolve(dist, 'loja.html'), builtStore, 'utf8'),
  // Portais com URL própria: funcionam mesmo quando a plataforma ignora rewrite de SPA.
  writeFile(resolve(dist, 'entregador', 'index.html'), builtApp, 'utf8'),
  writeFile(resolve(dist, 'funcionario', 'login', 'index.html'), builtApp, 'utf8')
]);

const staticAssets = [
  ['assets/commerce-extension.js', 'assets/commerce-extension.js'],
  ['assets/storefront.js', 'assets/storefront.v11-core-flow.js'],
  ['assets/storefront.css', 'assets/storefront.v11-core-flow.css'],
  ['assets/pwa-icon-192.png', 'assets/pwa-icon-192.png'],
  ['assets/pwa-icon-512.png', 'assets/pwa-icon-512.png'],
  ['assets/apple-touch-icon.png', 'assets/apple-touch-icon.png'],
  ['assets/manifest.webmanifest', 'manifest.webmanifest'],
  ['assets/sw.js', 'sw.js']
];

for (const [source, destination] of staticAssets) {
  const target = resolve(dist, destination);
  await mkdir(resolve(target, '..'), { recursive: true });
  await copyFile(resolve(root, source), target);
}

console.log('Site gerado em dist: painel completo + vitrine pública leve.');

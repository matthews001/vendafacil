import { copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = resolve(root, 'src');
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
await rm(dist, { recursive: true, force: true });
await Promise.all([
  mkdir(resolve(dist, 'assets', 'styles'), { recursive: true }),
  mkdir(resolve(dist, 'entregador'), { recursive: true }),
  mkdir(resolve(dist, 'funcionario', 'login'), { recursive: true })
]);

const [appTemplate, storeTemplate] = await Promise.all([
  readFile(resolve(source, 'templates', 'index.template.html'), 'utf8'),
  readFile(resolve(source, 'templates', 'loja.template.html'), 'utf8')
]);

const builtApp = injectEnvironment(appTemplate);
const builtStore = injectEnvironment(storeTemplate);

await Promise.all([
  writeFile(resolve(dist, 'index.html'), builtApp, 'utf8'),
  writeFile(resolve(dist, 'loja.html'), builtStore, 'utf8'),
  writeFile(resolve(dist, 'entregador', 'index.html'), builtApp, 'utf8'),
  writeFile(resolve(dist, 'funcionario', 'login', 'index.html'), builtApp, 'utf8')
]);

const staticAssets = [
  ['assets/js/storefront.js', 'assets/storefront.v14-stable.js'],
  ['assets/js/help-center.js', 'assets/help-center.v20260630-2.js'],
  ['assets/styles/storefront.css', 'assets/storefront.v14-stable.css'],
  ['assets/styles/visual-refresh.v1.css', 'assets/visual-refresh.v1.css'],
  ['assets/styles/app-foundation.css', 'assets/styles/app-foundation.css'],
  ['assets/styles/app-modules.css', 'assets/styles/app-modules.css'],
  ['assets/styles/mobile-responsive.css', 'assets/styles/mobile-responsive.css'],
  ['assets/styles/store-modals.css', 'assets/styles/store-modals.css'],
  ['pwa/icons/pwa-icon-192.png', 'assets/pwa-icon-192.png'],
  ['pwa/icons/pwa-icon-512.png', 'assets/pwa-icon-512.png'],
  ['pwa/icons/apple-touch-icon.png', 'assets/apple-touch-icon.png'],
  ['pwa/manifest.webmanifest', 'manifest.webmanifest'],
  ['pwa/sw.js', 'sw.js'],
  ['cloudflare/_headers', '_headers'],
  ['cloudflare/_redirects', '_redirects']
];

for (const [relativeSource, destination] of staticAssets) {
  const target = resolve(dist, destination);
  await mkdir(resolve(target, '..'), { recursive: true });
  await copyFile(resolve(source, relativeSource), target);
}

console.log('Site gerado em dist: painel completo + vitrine pública leve.');

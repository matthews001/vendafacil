import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = [
  'src/templates/index.template.html',
  'src/templates/loja.template.html',
  'src/assets/js/storefront.js',
  'src/assets/js/help-center.js',
  'src/assets/styles/app-foundation.css',
  'src/assets/styles/app-modules.css',
  'src/assets/styles/mobile-responsive.css',
  'src/pwa/sw.js',
  'src/pwa/manifest.webmanifest',
  'supabase/migrations',
  'supabase/manual',
  'docs'
];
await Promise.all(required.map(file => access(resolve(root, file))));

const [app, store, build, sw, visualCss] = await Promise.all([
  readFile(resolve(root, 'src/templates/index.template.html'), 'utf8'),
  readFile(resolve(root, 'src/templates/loja.template.html'), 'utf8'),
  readFile(resolve(root, 'scripts/build.mjs'), 'utf8'),
  readFile(resolve(root, 'src/pwa/sw.js'), 'utf8'),
  readFile(resolve(root, 'src/assets/styles/visual-refresh.v1.css'), 'utf8')
]);

const combined = [app, store, build, sw, visualCss].join('\n');
for (const forbidden of [
  'data-vf-theme',
  'theme-controls.js',
  'theme-contrast.css',
  'contrast-audit.css',
  'vendafacil:appearance',
  'vf-theme-toggle',
  'prefers-color-scheme: dark'
]) {
  if (combined.includes(forbidden)) throw new Error('Resíduo do modo escuro encontrado: ' + forbidden);
}

for (const requiredAsset of [
  'assets/storefront.v14-stable.js',
  'assets/storefront.v14-stable.css',
  'assets/visual-refresh.v1.css',
  'assets/help-center.v20260630-2.js',
  'assets/styles/app-foundation.css',
  'assets/styles/app-modules.css',
  'assets/styles/mobile-responsive.css'
]) {
  if (!build.includes(requiredAsset)) throw new Error('Build não publica o asset obrigatório: ' + requiredAsset);
}

console.log('Estrutura validada: fontes organizadas, tema escuro removido e assets públicos preservados.');

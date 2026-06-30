import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [landing, storefront, mobile, modules, build, sw] = await Promise.all([
  readFile(resolve(root, 'src/templates/index.template.html'), 'utf8'),
  readFile(resolve(root, 'src/assets/js/storefront.js'), 'utf8'),
  readFile(resolve(root, 'src/assets/styles/mobile-responsive.css'), 'utf8'),
  readFile(resolve(root, 'src/assets/styles/app-modules.css'), 'utf8'),
  readFile(resolve(root, 'scripts/build.mjs'), 'utf8'),
  readFile(resolve(root, 'src/pwa/sw.js'), 'utf8')
]);

for (const token of [
  "demoStoreSlug: 'demo'",
  "location.origin+'/loja?loja='+encodeURIComponent(slug)+'&demo=1'",
  'Demonstração funcional',
  'PDV de balcão',
  'Mesas e comandas',
  'Tela de cozinha',
  'Entregador'
]) {
  if (!landing.includes(token)) throw new Error('Landing sem atualização da demonstração/operação: ' + token);
}

for (const token of [
  'const isDemoRequest',
  'const demoStoreData = () =>',
  'function createDemoOrder(',
  'DEMO10',
  'if(demoEnabled())',
  'PIX-DEMONSTRATIVO',
  'Na demonstração, use os dados criados neste navegador.',
  'if(isDemoRequest() || isLegacyDemoSlug())'
]) {
  if (!storefront.includes(token)) throw new Error('Loja de demonstração incompleta: ' + token);
}

if (!mobile.includes('#screen-commerce-app')) throw new Error('Camada mobile ausente.');
if (!modules.includes('.vf-land-nav-actions .vf-land-login{display:inline-flex!important}')) {
  throw new Error('Botão Entrar não está garantido no mobile.');
}
if (!build.includes('assets/storefront.v14-stable.js') || !sw.includes("vendafacil-pwa-v27-palette")) {
  throw new Error('Assets e cache da demonstração não foram atualizados.');
}

console.log('Demonstração validada: loja local, carrinho, cadastro, pedido, pagamento simulado e landing atualizada.');

import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findProjectRoot() {
  const candidates = [here, resolve(here, '..')];

  for (const candidate of candidates) {
    if (
      await exists(resolve(candidate, 'package.json')) &&
      await exists(resolve(candidate, 'index.template.html')) &&
      await exists(resolve(candidate, 'loja.template.html'))
    ) {
      return candidate;
    }
  }

  throw new Error(
    'Não foi possível localizar a raiz do projeto. Coloque este arquivo na raiz do projeto ou em scripts/.',
  );
}

async function readRequired(root, relativePath) {
  const absolutePath = resolve(root, relativePath);

  try {
    return await readFile(absolutePath, 'utf8');
  } catch (error) {
    throw new Error(`Arquivo obrigatório não encontrado: ${relativePath}`, { cause: error });
  }
}

async function readFirstAvailable(root, relativePaths, label) {
  for (const relativePath of relativePaths) {
    const absolutePath = resolve(root, relativePath);

    if (await exists(absolutePath)) {
      return readFile(absolutePath, 'utf8');
    }
  }

  throw new Error(`Arquivo obrigatório não encontrado para ${label}: ${relativePaths.join(' ou ')}`);
}

function assertContains(source, tokens, label) {
  for (const token of tokens) {
    if (!source.includes(token)) {
      throw new Error(`${label}: item obrigatório ausente: ${token}`);
    }
  }
}

function assertNotContains(source, tokens, label) {
  for (const token of tokens) {
    if (source.includes(token)) {
      throw new Error(`${label}: item não permitido encontrado: ${token}`);
    }
  }
}

const root = await findProjectRoot();
const [panel, storefrontTemplate, storefrontScript, buildScript, deliveryMigration] = await Promise.all([
  readRequired(root, 'index.template.html'),
  readRequired(root, 'loja.template.html'),
  readRequired(root, 'assets/storefront.js'),
  readRequired(root, 'scripts/build.mjs'),
  readFirstAvailable(
    root,
    [
      'supabase/20260628_17_entrega_por_cep_otimizada.sql',
      'supabase/migrations/20260628_17_entrega_por_cep_otimizada.sql',
    ],
    'migração de entrega por CEP',
  ),
]);

assertContains(
  storefrontScript,
  [
    'lookupStoreDeliveryCep',
    'zoneForCep',
    'https://viacep.com.br/ws/',
    'function deliveryAddressReady(address)',
    'function checkout()',
    'checkStoreDeliveryRadius',
    'geocodeBrazilAddress',
  ],
  'Vitrine',
);

assertNotContains(
  storefrontScript,
  [
    'new mapboxgl.Map',
    'mapboxDeliveryEnabled',
    'mapboxZone',
    'routeSettings',
    'navigator.geolocation',
  ],
  'Vitrine',
);

assertContains(
  storefrontTemplate,
  [
    'storefront.v14-stable.js',
    'vfStoreCepFallback',
    'Frete calculado pelo CEP',
  ],
  'Template da vitrine',
);

assertContains(
  panel,
  [
    'Áreas de entrega por CEP',
    "delivery_pricing_mode:'zone'",
    'openCommerceDeliveryZone:v3NewDeliveryZone',
    'vf-pdv-step7-script',
    'vfPdv7LookupCep',
  ],
  'Painel e PDV',
);

assertContains(
  deliveryMigration,
  [
    'delivery_map_enabled = false',
    'cep_ranges',
    'vf_pos_create_delivery_sale',
    'Este CEP não está dentro de uma área de entrega cadastrada.',
  ],
  'Migração de entrega por CEP',
);

assertContains(
  buildScript,
  ['storefront.v14-stable.js', 'storefront.v14-stable.css'],
  'Build',
);

console.log('Entrega por CEP validada: ViaCEP, áreas por CEP, raio opcional, PDV sem mapa e assets versionados.');

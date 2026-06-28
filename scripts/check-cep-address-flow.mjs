import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const app = await readFile(resolve(root, 'index.template.html'), 'utf8');
const store = await readFile(resolve(root, 'loja.template.html'), 'utf8');
const storefront = await readFile(resolve(root, 'assets/storefront.js'), 'utf8');

const appChecks = [
  ['CEP no primeiro cadastro', 'id="business-cep"'],
  ['consulta ViaCEP da loja', "https://viacep.com.br/ws/'+cep+'/json/"],
  ['endereço completo salvo no negócio', 'address_details:addressDetails||null'],
  ['origem da entrega preparada', 'vfSeedCommerceAddress'],
  ['geocodificação da origem com endereço completo', 'vfFindBusinessOriginCoordinates'],
  ['cadastro deixa de criar loja antes do endereço', 'async function createBusinessFromSignupMetadata(){ return null; }'],
  ['CEP também disponível em Entrega e frete', 'id="commerce-delivery-origin-cep"'],
  ['consulta CEP em Entrega e frete', 'lookupCommerceDeliveryOriginCep']
];
for (const [label, token] of appChecks) if (!app.includes(token)) throw new Error(`Fluxo CEP da loja incompleto: ${label}.`);

const storeChecks = [
  ['CEP no checkout', 'id="store-delivery-cep"'],
  ['cidade no checkout', 'id="store-delivery-city"'],
  ['UF no checkout', 'id="store-delivery-state"'],
  ['botão buscar CEP', 'lookupStoreDeliveryCep()']
];
for (const [label, token] of storeChecks) if (!store.includes(token)) throw new Error(`Checkout CEP incompleto: ${label}.`);

const jsChecks = [
  ['máscara de CEP', 'function formatCep(value)'],
  ['consulta ViaCEP do cliente', 'async function lookupStoreDeliveryCep'],
  ["endereço inclui cidade e UF", "city:text($('store-delivery-city')?.value),state:text($('store-delivery-state')?.value).toUpperCase()"],
  ['rota usa cidade e UF', 'address.neighborhood,address.city,address.state,address.cep'],
  ['validação impede rota ambígua', 'address.city.length>=2&&/^[A-Z]{2}$/.test(address.state)']
];
for (const [label, token] of jsChecks) if (!storefront.includes(token)) throw new Error(`Fluxo CEP do cliente incompleto: ${label}.`);

console.log('CEP validado: cadastro da loja, endereço de origem, ViaCEP no checkout e rota por endereço completo.');

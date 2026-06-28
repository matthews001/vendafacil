import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const html=await readFile(resolve(root,'index.template.html'),'utf8');
const store=await readFile(resolve(root,'loja.template.html'),'utf8');
const script=await readFile(resolve(root,'assets/storefront.js'),'utf8');

for(const token of ['screen-commerce-app','commerce-page-orders','commerce-page-pos','commerce-page-products','commerce-page-delivery','commerce-page-employees','vf-pdv-step7-script','commerce_customer_create_order']) if(!html.includes(token)) throw new Error('Painel incompleto: '+token);
for(const token of ['commerce-delivery-origin-cep','lookupCommerceDeliveryOriginCep','Áreas de entrega por CEP',"delivery_pricing_mode:'zone'",'commerceDeliveryZones = v3.zones']) if(!html.includes(token)) throw new Error('Configuração de entrega por CEP incompleta: '+token);
for(const forbidden of ['https://api.mapbox.com/search/geocode','https://api.mapbox.com/directions']) if(html.includes(forbidden)) throw new Error('Painel ainda chama serviço de mapa: '+forbidden);
for(const token of ['storefront.v7-cep-only.js','vfStoreCepFallback','store-delivery-cep','store-delivery-city','store-delivery-state','Frete calculado pelo CEP']) if(!store.includes(token)) throw new Error('Vitrine CEP incompleta: '+token);
for(const token of ['lookupStoreDeliveryCep','function zoneForCep(cep)','https://viacep.com.br/ws/','function deliveryAddressReady(address)','window.confirmStoreDeliveryCep']) if(!script.includes(token)) throw new Error('Fluxo público por CEP incompleto: '+token);
for(const forbidden of ['api.mapbox.com','new mapboxgl.Map','mapboxDeliveryEnabled','mapboxZone','routeSettings']) if(script.includes(forbidden)) throw new Error('Vitrine ainda contém caminho de mapa: '+forbidden);
await access(resolve(root,'supabase/migrations/20260628_17_entrega_por_cep_otimizada.sql'));
console.log('Template validado: painel, vitrine e entrega orientados por CEP, sem mapa embutido.');

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const html=await readFile(resolve(root,'index.template.html'),'utf8');
const store=await readFile(resolve(root,'loja.template.html'),'utf8');
const script=await readFile(resolve(root,'assets/storefront.js'),'utf8');
const build=await readFile(resolve(root,'scripts/build.mjs'),'utf8');

for(const token of ['screen-commerce-app','commerce-page-orders','commerce-page-pos','commerce-page-products','commerce-page-delivery','commerce-page-employees','vf-pdv-step7-script','commerce_customer_create_order']) if(!html.includes(token)) throw new Error('Painel incompleto: '+token);
for(const token of ['commerce-delivery-origin-cep','lookupCommerceDeliveryOriginCep','Áreas de entrega por CEP',"delivery_pricing_mode:'zone'",'commerceDeliveryZones = v3.zones','openCommerceDeliveryZone:v3NewDeliveryZone']) if(!html.includes(token)) throw new Error('Configuração de entrega por CEP incompleta: '+token);
if(html.includes('https://api.mapbox.com/directions')) throw new Error('Painel ainda chama cálculo de rota pago.');
if(!html.includes('vfConfirmStoreRadiusOriginByCep')) throw new Error('Origem do raio por CEP não foi configurada no painel.');
for(const token of ['storefront.v12-stable.js','vfStoreCepFallback','store-delivery-cep','store-delivery-city','store-delivery-state','Frete calculado pelo CEP']) if(!store.includes(token)) throw new Error('Vitrine CEP incompleta: '+token);
for(const token of ['lookupStoreDeliveryCep','function zoneForCep(cep)','https://viacep.com.br/ws/','function deliveryAddressReady(address)','function checkout()','continueStorePendingPayment','renderPixPayment']) if(!script.includes(token)) throw new Error('Fluxo público por CEP/Pix incompleto: '+token);
for(const forbidden of ['new mapboxgl.Map','mapboxDeliveryEnabled','mapboxZone','routeSettings','navigator.geolocation']) if(script.includes(forbidden)) throw new Error('Vitrine ainda contém localização do aparelho ou mapa embutido: '+forbidden);
if(!script.includes('geocodeBrazilAddress')) throw new Error('Vitrine não confirma raio pelo endereço.');
if(script.includes("popup.location.href=`https://wa.me/${targetNumber}")) throw new Error('Checkout ainda redireciona automaticamente para WhatsApp antes da confirmação de pagamento.');
for(const token of ['storefront.v12-stable.js','storefront.v12-stable.css']) if(!build.includes(token)) throw new Error('Build não publica os assets atuais da vitrine: '+token);
await access(resolve(root,'supabase/migrations/20260628_17_entrega_por_cep_otimizada.sql'));
console.log('Template validado: painel, vitrine, CEP, Pix pendente e entrega sem mapa embutido.');

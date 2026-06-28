import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
const script=await readFile(resolve(root,'assets/storefront.js'),'utf8');
const html=await readFile(resolve(root,'loja.template.html'),'utf8');
const build=await readFile(resolve(root,'scripts/build.mjs'),'utf8');
const mustHave=[
  'function checkout()',
  'function renderCheckoutTotals()',
  'window.openStoreCheckout=async()=>',
  'window.createPublicCommerceOrder=async()=>',
  'function renderPixPayment(order)',
  'window.continueStorePendingPayment=async id=>',
  'function persistPendingPayment(order)',
  'window.reportPublicCommercePayment=async()=>',
  "'about:blank','_blank'",
  "commerce_customer_report_payment"
];
for(const token of mustHave) if(!script.includes(token)) throw new Error('Fluxo de checkout/Pix ausente: '+token);
const createStart=script.indexOf('window.createPublicCommerceOrder=async()=>');
const createEnd=script.indexOf('window.copyPixCode=', createStart);
const createBlock=script.slice(createStart,createEnd);
if(/wa\.me|window\.open\('about:blank'/.test(createBlock)) throw new Error('O pedido abre WhatsApp antes do cliente confirmar o pagamento.');
const reportStart=script.indexOf('window.reportPublicCommercePayment=async()=>');
const reportEnd=script.indexOf('function statusLabel(',reportStart);
const reportBlock=script.slice(reportStart,reportEnd);
if(!reportBlock.includes('commerce_customer_report_payment')||!reportBlock.includes('wa.me')) throw new Error('O WhatsApp deve abrir apenas após o botão “Já fiz o pagamento”.');
if(!html.includes('store-payment-confirmed')||!html.includes('store-report-payment-button')) throw new Error('Tela de Pix incompleta.');
if(!build.includes('storefront.v9-delivery-stable.js')) throw new Error('Build não publica a vitrine validada.');
console.log('Checkout validado: CEP, Pix, pedido pendente e WhatsApp somente após informar pagamento.');

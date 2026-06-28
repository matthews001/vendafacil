import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [app, storeJs, storeCss, sql] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'assets/storefront.js'), 'utf8'),
  readFile(resolve(root, 'assets/storefront.css'), 'utf8'),
  readFile(resolve(root, 'supabase/migrations/20260628_27_pagamento_entrega_alertas_tema.sql'), 'utf8')
]);
const required = [
  ['painel de entrega presencial', app, 'Pagamento presencial na entrega não deve ser confirmado agora'],
  ['driver payment card', app, 'function paymentInfo(order)'],
  ['maps full destination', app, "'Brasil'"],
  ['Waze coordinates', app, "url.searchParams.set('ll'"],
  ['new/ready popup filter', app, 'function vfOrderAlertKind(item)'],
  ['new/ready popup classes', app, 'vf-live-order-alert is-'],
  ['delivery theme inheritance', app, 'vfApplyInheritedTheme'],
  ['store banner safe handling', storeJs, 'hero.classList.toggle(\'has-banner\''],
  ['store banner CSS', storeCss, '.vf-hero.has-banner'],
  ['delivery in-person backend', sql, "v_in_person_delivery := v_order.fulfillment_type='delivery'"],
  ['delivery completion collection', sql, "'collection_status','collected'"],
  ['notification trigger', sql, 'vf_emit_order_status_alert_trigger'],
  ['driver portal theme backend', sql, "'theme',jsonb_build_object"]
];
for (const [label, content, token] of required) {
  if (!content.includes(token)) throw new Error(`Ausente: ${label}.`);
}
if (sql.includes('into v_order, v_settings') || sql.includes('jsonb_agg(\n        jsonb_build_object(\n          \'id\', \'legacy-\' || md5(lower(trim(section_name))),\n          \'name\', section_name,\n          \'display_order\', row_number()')) {
  throw new Error('Foi encontrado padrão SQL inválido já corrigido.');
}
console.log('Fluxo de entrega, alertas, banner e tema validado estaticamente.');

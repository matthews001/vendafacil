import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [template, baseMigration, dispatchMigration, vercelText] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'supabase/20260628_15_painel_entregador.sql'), 'utf8'),
  readFile(resolve(root, 'supabase/migrations/20260628_26_fluxo_pagamento_dinheiro_despacho.sql'), 'utf8'),
  readFile(resolve(root, 'vercel.json'), 'utf8')
]);

const requiredTemplate = [
  'vf-delivery-driver-script',
  'driverRoute',
  "sb.rpc('vf_delivery_dispatch_drivers'",
  "sb.rpc('vf_delivery_dispatch_list'",
  "sb.rpc('vf_delivery_dispatch_order'",
  "vf_delivery_portal_start",
  'https://www.google.com/maps/dir/',
  'https://www.waze.com/ul',
  'vfCopyDeliveryPortalLink',
  'delivery-dispatch',
  'mapDestination(order)',
  'Confirmar entrega e pagamento'
];
const requiredBaseMigration = [
  'create table if not exists public.commerce_delivery_assignments',
  'vf_delivery_dispatch_drivers',
  'vf_delivery_portal_me',
  'delivery_dispatch',
  'delivery_portal'
];
const requiredDispatchMigration = [
  'vf_delivery_dispatch_list',
  'vf_delivery_dispatch_order',
  'vf_delivery_portal_orders',
  'vf_delivery_portal_start',
  'vf_delivery_portal_complete'
];
const missingTemplate = requiredTemplate.filter(item => !template.includes(item));
const missingBase = requiredBaseMigration.filter(item => !baseMigration.includes(item));
const missingDispatch = requiredDispatchMigration.filter(item => !dispatchMigration.includes(item));
if (missingTemplate.length || missingBase.length || missingDispatch.length || !vercelText.includes('/entregador/:path*')) {
  throw new Error([
    missingTemplate.length ? `Template sem: ${missingTemplate.join(', ')}` : '',
    missingBase.length ? `Base de entregas sem: ${missingBase.join(', ')}` : '',
    missingDispatch.length ? `Fluxo de despacho sem: ${missingDispatch.join(', ')}` : '',
    !vercelText.includes('/entregador/:path*') ? 'Rewrite /entregador ausente.' : ''
  ].filter(Boolean).join(' '));
}
console.log('Painel do entregador validado: despacho, portal, Maps/Waze, pagamento presencial e rota presentes.');

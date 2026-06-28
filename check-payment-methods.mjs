import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [template, migration, vercelText] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'supabase/20260628_15_painel_entregador.sql'), 'utf8'),
  readFile(resolve(root, 'vercel.json'), 'utf8')
]);

const requiredTemplate = [
  'vf-delivery-driver-script',
  'deliveryDriverRoute',
  "vf_delivery_dispatch_order",
  "vf_delivery_portal_start",
  "https://www.google.com/maps/dir/",
  "https://waze.com/ul",
  "vfCopyDeliveryPortalLink",
  "delivery-dispatch"
];
const requiredMigration = [
  'create table if not exists public.commerce_delivery_assignments',
  'vf_delivery_dispatch_drivers',
  'vf_delivery_dispatch_list',
  'vf_delivery_dispatch_order',
  'vf_delivery_portal_me',
  'vf_delivery_portal_orders',
  'vf_delivery_portal_start',
  'vf_delivery_portal_complete',
  'delivery_dispatch',
  'delivery_portal'
];
const missingTemplate = requiredTemplate.filter(item => !template.includes(item));
const missingMigration = requiredMigration.filter(item => !migration.includes(item));
if (missingTemplate.length || missingMigration.length || !vercelText.includes('/entregador/:path*')) {
  throw new Error([
    missingTemplate.length ? `Template sem: ${missingTemplate.join(', ')}` : '',
    missingMigration.length ? `Migration sem: ${missingMigration.join(', ')}` : '',
    !vercelText.includes('/entregador/:path*') ? 'Rewrite /entregador ausente.' : ''
  ].filter(Boolean).join(' '));
}
console.log('Painel do entregador validado: despacho, portal, Maps/Waze, migration e rota presentes.');

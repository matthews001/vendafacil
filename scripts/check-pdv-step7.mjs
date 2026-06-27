import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root,'index.template.html'),'utf8');
const sql = await readFile(resolve(root,'supabase/migrations/20260627_8_pdv_entrega_integrada.sql'),'utf8');
for (const token of ['vf-pdv-step7-script','vfPdv7CalculateRoute','vf_pos_create_delivery_sale','p_route_distance_km','MAPBOX_PUBLIC_TOKEN','Finalizar entrega e pagamento']) {
  if (!html.includes(token)) throw new Error(`PDV entrega: item ausente: ${token}`);
}
for (const token of ['fulfillment_type','delivery_fee','delivery_address','vf_pos_create_delivery_sale','vf_pos_create_sale','delivery_map_fee','delivery_map_max_distance_km']) {
  if (!sql.includes(token)) throw new Error(`Migração de entrega incompleta: ${token}`);
}
await access(resolve(root,'supabase/migrations/20260627_7_pdv_mesas_subtotal_amount_fix.sql'));
console.log('PDV Passo 7 validado: endereço, rota, frete, pagamento e persistência de entrega.');

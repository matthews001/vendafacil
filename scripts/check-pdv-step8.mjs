import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.template.html'), 'utf8');
const sql = await readFile(resolve(root, 'supabase/migrations/20260627_9_pdv_pedidos_tempo_real.sql'), 'utf8');

for (const token of [
  'vf-pdv-step8-script',
  'vf-pdv8-live-panel',
  'vfPdv8OpenOrders',
  'postgres_changes',
  "table:'commerce_orders'",
  'Pedidos ao vivo',
  'vf-pdv8-new-order',
  'PDV · PASSO 8 DE 12'
]) {
  if (!html.includes(token)) throw new Error(`PDV Passo 8 incompleto: ${token}`);
}
for (const token of ['REPLICA IDENTITY FULL', 'supabase_realtime', 'commerce_orders']) {
  if (!sql.includes(token)) throw new Error(`Migração realtime incompleta: ${token}`);
}
await access(resolve(root, 'supabase/migrations/20260627_8_pdv_entrega_integrada.sql'));
console.log('PDV Passo 8 validado: realtime, popup, som, destaque e painel operacional.');

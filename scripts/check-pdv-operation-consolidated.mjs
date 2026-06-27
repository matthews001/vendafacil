import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.template.html'), 'utf8');
const migration = await readFile(resolve(root, 'supabase/migrations/20260628_10_pdv_operacao_consolidada.sql'), 'utf8');

const requiredFrontend = [
  'vf-pdv-table-map',
  'persistLocalSnapshot',
  'snapshotKey',
  "window.addEventListener('pagehide'",
  "document.addEventListener('visibilitychange'",
  'vf_pos_save_table_tab',
  'vfPdv6ResumeTable',
  'Itens pendentes',
  'Mapa de mesas',
  'data-vf-pdv6-table-id',
  "document.addEventListener('click',handleMapClick)",
  'openingTableId'
];
for (const item of requiredFrontend) {
  if (!html.includes(item)) throw new Error(`Fluxo consolidado de mesas incompleto: ${item}`);
}
const requiredSql = [
  'vf_pos_table_draft_summary',
  'vf_pos_get_order_receipt',
  'section_name',
  'display_order',
  'vf_pos_list_tables'
];
for (const item of requiredSql) {
  if (!migration.includes(item)) throw new Error(`Migração de operação incompleta: ${item}`);
}
if (/drop\s+table\s+public\.commerce_table_tabs/i.test(migration) || /truncate\s+table/i.test(migration)) {
  throw new Error('A migração não pode apagar comandas existentes.');
}
console.log('Operação consolidada validada: mapa de mesas, seleção delegada, pendências e recuperação local/servidor presentes sem apagar comandas.');

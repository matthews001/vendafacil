import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [html, migration] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'supabase/migrations/20260628_24_status_mesas_comissao.sql'), 'utf8')
]);

const requiredHtml = [
  'vf-tables-operation-script',
  'vfTablesOpenPage',
  'vfTablesOpenManager',
  'vfTablesOpenStatus',
  'Criar Nova Área',
  'Múltiplas Mesas',
  'Comissão do Garçom',
  'Fazendo Pedido',
  'Adicionar Itens'
];
for (const token of requiredHtml) {
  if (!html.includes(token)) throw new Error(`Tela de mesas incompleta: não localizei ${token}.`);
}

const requiredSql = [
  'service_status',
  'vf_pos_list_table_setup',
  'vf_pos_set_table_service_status',
  'vf_pos_save_waiter_commission',
  'trg_vf_pos_sync_table_service_status',
  "'free','occupied','ordering','consuming','paying'"
];
for (const token of requiredSql) {
  if (!migration.includes(token)) throw new Error(`Migration de mesas incompleta: não localizei ${token}.`);
}

const match = html.match(/<script id="vf-tables-operation-script">\s*([\s\S]*?)<\/script>/);
if (!match) throw new Error('Script da tela de mesas não foi localizado.');
new vm.Script(match[1], { filename:'vf-tables-operation-script.js' });

console.log('Mesas validado: áreas, cadastro individual/múltiplo, status operacional, pedido rápido e comissão padrão.');

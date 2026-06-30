import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [template, storefront, migration] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'assets/storefront.js'), 'utf8'),
  readFile(resolve(root, 'supabase/migrations/20260628_26_fluxo_pagamento_dinheiro_despacho.sql'), 'utf8')
]);

const requireText = (source, text, label) => {
  if (!source.includes(text)) throw new Error(`Ausente: ${label}`);
};

requireText(storefront, "rpc('commerce_customer_create_order'", 'checkout cria o pedido sem depender de RPC antiga');
requireText(storefront, "rpc('vf_customer_apply_payment_method'", 'checkout persiste a forma de pagamento');
requireText(template, 'Pagamento presencial na entrega não deve ser confirmado agora', 'bloqueio visual de confirmação antecipada');
requireText(template, 'Pronto p/ despacho', 'KDS e pedidos usam despacho antes da rota');
requireText(template, 'vfPrepareDeliveryDispatch', 'abertura da atribuição de entregador');
requireText(template, 'Confirmar entrega e pagamento', 'confirmação do dinheiro pelo entregador');
requireText(migration, "v_cash_delivery and v_order.status in ('awaiting_payment', 'payment_reported')", 'dinheiro na entrega pode ir para preparo');
requireText(migration, "Direcione o entregador somente quando o pedido estiver pronto para despacho.", 'atribuição bloqueada antes de ficar pronto');
requireText(migration, "v_order.status not in ('ready_for_pickup', 'preparing')", 'entregador só inicia pedido pronto');
requireText(migration, "'collection_status','collected'", 'recebimento de dinheiro é registrado ao concluir');
requireText(migration, "raise exception 'Para sair para entrega, abra Entregas e atribua um entregador.", 'rota direta bloqueada');

console.log('Fluxo validado: dinheiro na entrega, despacho obrigatório e início pelo entregador.');

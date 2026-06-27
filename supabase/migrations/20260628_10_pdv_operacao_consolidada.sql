-- VendaFácil PDV — operação consolidada: mesas persistentes, mapa de mesas e cupom unificado.
-- Execute UMA VEZ depois das migrações 20260627_4 até 20260627_9.
-- Não apaga comandas abertas nem pedidos já existentes.

begin;

-- Organização visual do mapa de mesas. Os campos são opcionais para mesas antigas.
alter table public.commerce_tables
  add column if not exists section_name text not null default 'Salão principal',
  add column if not exists display_order integer not null default 0,
  add column if not exists map_x integer,
  add column if not exists map_y integer;

create index if not exists commerce_tables_business_section_order_idx
  on public.commerce_tables (business_id, active, section_name, display_order, label);

-- Mantém a data de alteração da comanda pronta para recuperação após fechar/reabrir o navegador.
create index if not exists commerce_table_tabs_business_open_updated_idx
  on public.commerce_table_tabs (business_id, status, updated_at desc);

-- Resume uma comanda com total parcial, quantidade de itens e desconto.
-- O valor é somente para visualização; o fechamento continua recalculando no servidor.
create or replace function public.vf_pos_table_draft_summary(
  p_business_id uuid,
  p_lines jsonb,
  p_discount_type text default 'none',
  p_discount_value numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_subtotal numeric(12,2) := 0;
  v_items integer := 0;
  v_discount numeric(12,2) := 0;
  v_type text := lower(trim(coalesce(p_discount_type, 'none')));
  v_value numeric(12,2) := greatest(0, coalesce(p_discount_value, 0));
begin
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    return jsonb_build_object('items_count', 0, 'subtotal_amount', 0, 'discount_amount', 0, 'total_amount', 0);
  end if;

  select
    coalesce(sum(
      greatest(0, coalesce(p.price, 0) + coalesce(opt.extra, 0))
      * greatest(0, coalesce((line.value->>'quantity')::integer, 0))
    ), 0),
    coalesce(sum(greatest(0, coalesce((line.value->>'quantity')::integer, 0))), 0)
  into v_subtotal, v_items
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as line(value)
  left join public.commerce_products p
    on p.id = nullif(line.value->>'product_id', '')::uuid
   and p.business_id = p_business_id
  left join lateral (
    select coalesce(sum(
      case
        when coalesce(option.value->>'price_adjustment', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (option.value->>'price_adjustment')::numeric
        else 0
      end
    ), 0) as extra
    from jsonb_array_elements(coalesce(line.value->'selected_options', '[]'::jsonb)) as grp(value)
    cross join lateral jsonb_array_elements(coalesce(grp.value->'options', '[]'::jsonb)) as option(value)
  ) opt on true;

  if v_type = 'percent' then
    v_discount := round(v_subtotal * least(100, v_value) / 100, 2);
  elsif v_type = 'amount' then
    v_discount := least(v_subtotal, v_value);
  else
    v_discount := 0;
  end if;

  return jsonb_build_object(
    'items_count', v_items,
    'subtotal_amount', round(v_subtotal, 2),
    'discount_amount', round(v_discount, 2),
    'total_amount', round(greatest(0, v_subtotal - v_discount), 2)
  );
end;
$$;

grant execute on function public.vf_pos_table_draft_summary(uuid, jsonb, text, numeric) to authenticated;

-- Amplia o payload usado pelo painel sem alterar comandas atuais.
create or replace function public.vf_pos_table_payload(p_tab public.commerce_table_tabs)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_tab.id,
    'business_id', p_tab.business_id,
    'table_id', p_tab.table_id,
    'public_code', p_tab.public_code,
    'status', p_tab.status,
    'customer_name', coalesce(p_tab.customer_name, ''),
    'customer_phone', coalesce(p_tab.customer_phone, ''),
    'notes', coalesce(p_tab.notes, ''),
    'draft_lines', coalesce(p_tab.draft_lines, '[]'::jsonb),
    'draft_summary', public.vf_pos_table_draft_summary(
      p_tab.business_id,
      coalesce(p_tab.draft_lines, '[]'::jsonb),
      p_tab.discount_type,
      p_tab.discount_value
    ),
    'discount_type', p_tab.discount_type,
    'discount_value', p_tab.discount_value,
    'opened_at', p_tab.opened_at,
    'updated_at', p_tab.updated_at
  );
$$;

grant execute on function public.vf_pos_table_payload(public.commerce_table_tabs) to authenticated;

-- Lista o mapa de mesas com status e resumo da comanda aberta.
create or replace function public.vf_pos_list_tables(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_business_id is null then
    raise exception 'A loja ativa não foi identificada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar as mesas desta loja.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'label', t.label,
      'capacity', t.capacity,
      'active', t.active,
      'section_name', t.section_name,
      'display_order', t.display_order,
      'map_x', t.map_x,
      'map_y', t.map_y,
      'tab', case when tab.id is null then null else public.vf_pos_table_payload(tab) end
    ) order by t.section_name, t.display_order, t.label
  ), '[]'::jsonb)
  into v_result
  from public.commerce_tables t
  left join lateral (
    select x.*
    from public.commerce_table_tabs x
    where x.table_id = t.id
      and x.status = 'open'
    order by x.updated_at desc
    limit 1
  ) tab on true
  where t.business_id = p_business_id
    and t.active = true;

  return v_result;
end;
$$;

grant execute on function public.vf_pos_list_tables(uuid) to authenticated;

-- Todos os pedidos, inclusive os criados na vitrine, passam a usar a mesma fonte de cupom.
create or replace function public.vf_pos_get_order_receipt(
  p_business_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_business_name text;
  v_table_label text;
  v_items jsonb;
  v_kind text;
begin
  if p_business_id is null or p_order_id is null then
    raise exception 'Pedido ou loja não informados para impressão.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para imprimir pedidos desta loja.';
  end if;

  select o.*
  into v_order
  from public.commerce_orders o
  where o.id = p_order_id
    and o.business_id = p_business_id;

  if not found then
    raise exception 'Pedido não encontrado nesta loja.';
  end if;

  select b.name, t.label
  into v_business_name, v_table_label
  from public.businesses b
  left join public.commerce_table_tabs tab on tab.id = v_order.table_tab_id
  left join public.commerce_tables t on t.id = tab.table_id
  where b.id = v_order.business_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'product_id', oi.product_id,
      'product_name', oi.product_name,
      'unit_price', oi.unit_price,
      'quantity', oi.quantity,
      'subtotal', oi.subtotal,
      'selected_options', coalesce(oi.selected_options, '[]'::jsonb),
      'customer_note', coalesce(oi.customer_note, '')
    ) order by oi.created_at, oi.id
  ), '[]'::jsonb)
  into v_items
  from public.commerce_order_items oi
  where oi.order_id = v_order.id;

  v_kind := case
    when v_order.table_tab_id is not null or v_order.fulfillment_type = 'table' then 'Mesa'
    when v_order.fulfillment_type = 'delivery' or v_order.order_source = 'pos_delivery' then 'Entrega'
    when v_order.order_source in ('pos', 'pos_table') then 'Balcão'
    else 'Vitrine'
  end;

  return jsonb_build_object(
    'id', v_order.id,
    'business_id', v_order.business_id,
    'business_name', coalesce(v_business_name, 'VendaFácil'),
    'public_code', v_order.public_code,
    'created_at', v_order.created_at,
    'status', v_order.status,
    'receipt_kind', v_kind,
    'buyer_name', v_order.buyer_name,
    'buyer_phone', v_order.buyer_phone,
    'notes', coalesce(v_order.notes, ''),
    'payment_method', coalesce(v_order.payment_method, 'pix'),
    'amount_received', v_order.amount_received,
    'change_amount', v_order.change_amount,
    'subtotal_amount', coalesce(v_order.subtotal_amount, 0),
    'discount_amount', coalesce(v_order.discount_amount, 0),
    'discount_type', coalesce(v_order.discount_type, 'none'),
    'discount_value', coalesce(v_order.discount_value, 0),
    'delivery_fee', coalesce(v_order.delivery_fee, 0),
    'delivery_address', coalesce(v_order.delivery_address, '{}'::jsonb),
    'delivery_route_distance_km', v_order.delivery_route_distance_km,
    'delivery_route_duration_minutes', v_order.delivery_route_duration_minutes,
    'total_amount', v_order.total_amount,
    'table_label', coalesce(v_table_label, ''),
    'commerce_order_items', v_items
  );
end;
$$;

grant execute on function public.vf_pos_get_order_receipt(uuid, uuid) to authenticated;

commit;

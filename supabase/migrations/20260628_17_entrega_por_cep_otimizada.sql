-- VendaFácil — Entrega econômica por CEP (sem Mapbox no checkout e no PDV).
-- Execute uma única vez no SQL Editor depois de atualizar o projeto na Vercel.
-- Não remove pedidos, produtos, clientes ou áreas já cadastradas.

begin;

-- O checkout passa a usar as faixas de CEP das áreas de entrega.
-- As zonas técnicas antigas do Mapbox continuam no banco, mas não são usadas.
update public.commerce_settings
set delivery_map_enabled = false,
    delivery_map_mode = false,
    delivery_pricing_mode = 'zone',
    updated_at = now()
where coalesce(delivery_enabled, false) = true;

create or replace function public.vf_pos_create_delivery_sale(
  p_business_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_notes text,
  p_items jsonb,
  p_payment_method text,
  p_mark_paid boolean default true,
  p_amount_received numeric default null,
  p_discount_type text default 'none',
  p_discount_value numeric default 0,
  p_delivery_address jsonb default '{}'::jsonb,
  p_route_distance_km numeric default null,
  p_route_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.commerce_settings%rowtype;
  v_zone public.commerce_delivery_zones%rowtype;
  v_sale jsonb;
  v_order public.commerce_orders%rowtype;
  v_order_id uuid;
  v_fee numeric(12,2) := 0;
  v_final_total numeric(12,2);
  v_amount_received numeric(12,2);
  v_change numeric(12,2) := 0;
  v_phone text;
  v_cep text;
  v_street text;
  v_number text;
  v_payment_method text;
  v_mark_paid boolean := coalesce(p_mark_paid, true);
  v_duration integer;
begin
  if p_business_id is null then
    raise exception 'A loja ativa não foi identificada. Atualize a Frente de Caixa e tente novamente.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para operar o PDV desta loja.';
  end if;
  if jsonb_typeof(coalesce(p_delivery_address, '{}'::jsonb)) <> 'object' then
    raise exception 'O endereço de entrega está inválido.';
  end if;

  v_phone := regexp_replace(coalesce(p_buyer_phone, ''), '\D', '', 'g');
  v_cep := regexp_replace(coalesce(p_delivery_address->>'cep', ''), '\D', '', 'g');
  v_street := nullif(trim(coalesce(p_delivery_address->>'street', '')), '');
  v_number := nullif(trim(coalesce(p_delivery_address->>'number', '')), '');
  if nullif(trim(coalesce(p_buyer_name, '')), '') is null then
    raise exception 'Informe o nome do cliente para a entrega.';
  end if;
  if char_length(v_phone) < 10 then
    raise exception 'Informe um WhatsApp válido para a entrega.';
  end if;
  if char_length(v_cep) <> 8 or v_street is null or char_length(v_street) < 3 or v_number is null then
    raise exception 'Informe CEP, rua e número para a entrega.';
  end if;

  select * into v_settings
  from public.commerce_settings
  where business_id = p_business_id
  for update;
  if not found or coalesce(v_settings.delivery_enabled, false) = false then
    raise exception 'A entrega não está habilitada para esta loja.';
  end if;

  select z.* into v_zone
  from public.commerce_delivery_zones z
  where z.business_id = p_business_id
    and coalesce(z.active, false) = true
    and coalesce(z.is_mapbox_default, false) = false
    and exists (
      select 1
      from jsonb_array_elements(coalesce(z.cep_ranges, '[]'::jsonb)) range_item
      where nullif(regexp_replace(coalesce(range_item->>'from', ''), '\D', '', 'g'), '') is not null
        and nullif(regexp_replace(coalesce(range_item->>'to', range_item->>'from', ''), '\D', '', 'g'), '') is not null
        and regexp_replace(coalesce(range_item->>'from', ''), '\D', '', 'g') <= v_cep
        and regexp_replace(coalesce(range_item->>'to', range_item->>'from', ''), '\D', '', 'g') >= v_cep
    )
  order by z.created_at nulls last, z.name
  limit 1;

  if not found then
    raise exception 'Este CEP não está dentro de uma área de entrega cadastrada.';
  end if;

  v_payment_method := lower(trim(coalesce(p_payment_method, 'pix')));
  if v_payment_method not in ('cash','pix','debit_card','credit_card','other','pending') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  v_sale := public.vf_pos_create_sale(
    p_business_id, p_buyer_name, v_phone, p_notes, p_items,
    v_payment_method, v_mark_paid, p_amount_received, p_discount_type, p_discount_value
  );

  v_order_id := (v_sale->>'id')::uuid;
  select * into v_order from public.commerce_orders where id = v_order_id for update;

  if coalesce(v_zone.minimum_order, 0) > 0 and coalesce(v_order.subtotal_amount, 0) < v_zone.minimum_order then
    raise exception 'O pedido mínimo para esta área é R$ %.', to_char(v_zone.minimum_order, 'FM999G999G990D00');
  end if;
  if coalesce(v_settings.delivery_minimum_order, 0) > 0 and coalesce(v_order.subtotal_amount, 0) < v_settings.delivery_minimum_order then
    raise exception 'O pedido mínimo geral para entrega é R$ %.', to_char(v_settings.delivery_minimum_order, 'FM999G999G990D00');
  end if;

  if coalesce(v_settings.delivery_free_above, 0) > 0 and coalesce(v_order.subtotal_amount, 0) >= v_settings.delivery_free_above then
    v_fee := 0;
  else
    v_fee := greatest(0, coalesce(v_zone.fee, 0));
  end if;
  v_final_total := greatest(0, coalesce(v_order.total_amount, 0) + v_fee);

  if v_mark_paid and v_payment_method = 'cash' then
    v_amount_received := coalesce(p_amount_received, 0);
    if v_amount_received < v_final_total then
      raise exception 'O valor recebido em dinheiro é menor que o total da entrega.';
    end if;
    v_change := v_amount_received - v_final_total;
  elsif v_mark_paid then
    v_amount_received := v_final_total;
  else
    v_amount_received := null;
  end if;

  v_duration := coalesce(nullif(p_route_duration_minutes, 0), v_zone.estimated_minutes);
  update public.commerce_orders
  set fulfillment_type = 'delivery',
      order_source = 'pos_delivery',
      delivery_fee = v_fee,
      delivery_address = jsonb_build_object(
        'cep', v_cep,
        'street', v_street,
        'number', v_number,
        'complement', nullif(trim(coalesce(p_delivery_address->>'complement', '')), ''),
        'neighborhood', nullif(trim(coalesce(p_delivery_address->>'neighborhood', '')), ''),
        'city', nullif(trim(coalesce(p_delivery_address->>'city', '')), ''),
        'state', nullif(trim(coalesce(p_delivery_address->>'state', '')), ''),
        'reference', nullif(trim(coalesce(p_delivery_address->>'reference', '')), ''),
        'delivery_zone_id', v_zone.id,
        'delivery_zone_name', v_zone.name
      ),
      delivery_route_distance_km = null,
      delivery_route_duration_minutes = v_duration,
      total_amount = v_final_total,
      amount_received = v_amount_received,
      change_amount = v_change,
      updated_at = now()
  where id = v_order_id;

  return v_sale || jsonb_build_object(
    'fulfillment_type', 'delivery',
    'delivery_fee', v_fee,
    'delivery_zone_id', v_zone.id,
    'delivery_zone_name', v_zone.name,
    'delivery_route_distance_km', null,
    'delivery_route_duration_minutes', v_duration,
    'total_amount', v_final_total,
    'amount_received', v_amount_received,
    'change_amount', v_change
  );
end;
$$;

grant execute on function public.vf_pos_create_delivery_sale(uuid, text, text, text, jsonb, text, boolean, numeric, text, numeric, jsonb, numeric, integer) to authenticated;

commit;

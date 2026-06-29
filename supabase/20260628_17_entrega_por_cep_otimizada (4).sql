-- VendaFácil PDV — Passo 7: entrega integrada ao PDV.
-- Execute depois de 20260627_7_pdv_mesas_subtotal_amount_fix.sql.
-- O servidor continua calculando produtos, desconto, estoque e taxa configurada da loja.

begin;

alter table public.commerce_orders
  add column if not exists fulfillment_type text not null default 'pickup',
  add column if not exists delivery_fee numeric(12,2) not null default 0,
  add column if not exists delivery_address jsonb not null default '{}'::jsonb,
  add column if not exists delivery_route_distance_km numeric(10,2),
  add column if not exists delivery_route_duration_minutes integer;

alter table public.commerce_orders
  drop constraint if exists commerce_orders_fulfillment_type_check,
  drop constraint if exists commerce_orders_delivery_fee_check,
  drop constraint if exists commerce_orders_delivery_distance_check,
  drop constraint if exists commerce_orders_delivery_duration_check;

alter table public.commerce_orders
  add constraint commerce_orders_fulfillment_type_check check (fulfillment_type in ('pickup','delivery','table')),
  add constraint commerce_orders_delivery_fee_check check (delivery_fee >= 0),
  add constraint commerce_orders_delivery_distance_check check (delivery_route_distance_km is null or delivery_route_distance_km > 0),
  add constraint commerce_orders_delivery_duration_check check (delivery_route_duration_minutes is null or delivery_route_duration_minutes > 0);

create index if not exists commerce_orders_business_fulfillment_created_idx
  on public.commerce_orders (business_id, fulfillment_type, created_at desc);

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
  if coalesce(p_route_distance_km, 0) <= 0 or coalesce(p_route_duration_minutes, 0) <= 0 then
    raise exception 'Calcule a rota antes de finalizar a entrega.';
  end if;

  select * into v_settings
  from public.commerce_settings
  where business_id = p_business_id
  for update;
  if not found or coalesce(v_settings.delivery_enabled, false) = false then
    raise exception 'A entrega não está habilitada para esta loja.';
  end if;
  if coalesce(v_settings.delivery_map_enabled, true) = false then
    raise exception 'O cálculo de entrega por mapa não está habilitado para esta loja.';
  end if;
  if v_settings.delivery_origin_lat is null or v_settings.delivery_origin_lng is null then
    raise exception 'Cadastre o endereço de saída da loja antes de usar entrega pelo PDV.';
  end if;
  if coalesce(v_settings.delivery_map_max_distance_km, 0) > 0
     and p_route_distance_km > v_settings.delivery_map_max_distance_km then
    raise exception 'Este endereço está fora do raio máximo de entrega da loja.';
  end if;

  v_payment_method := lower(trim(coalesce(p_payment_method, 'pix')));
  if v_payment_method not in ('cash','pix','debit_card','credit_card','other','pending') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  v_sale := public.vf_pos_create_sale(
    p_business_id,
    p_buyer_name,
    v_phone,
    p_notes,
    p_items,
    v_payment_method,
    v_mark_paid,
    p_amount_received,
    p_discount_type,
    p_discount_value
  );

  v_order_id := (v_sale->>'id')::uuid;
  select * into v_order from public.commerce_orders where id = v_order_id for update;

  if coalesce(v_settings.delivery_free_above, 0) > 0
     and coalesce(v_order.subtotal_amount, 0) >= v_settings.delivery_free_above then
    v_fee := 0;
  else
    v_fee := greatest(0, coalesce(v_settings.delivery_map_fee, 0));
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
    v_change := 0;
  else
    v_amount_received := null;
    v_change := 0;
  end if;

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
        'reference', nullif(trim(coalesce(p_delivery_address->>'reference', '')), '')
      ),
      delivery_route_distance_km = round(p_route_distance_km::numeric, 2),
      delivery_route_duration_minutes = p_route_duration_minutes,
      total_amount = v_final_total,
      amount_received = v_amount_received,
      change_amount = v_change,
      updated_at = now()
  where id = v_order_id;

  return v_sale || jsonb_build_object(
    'fulfillment_type', 'delivery',
    'delivery_fee', v_fee,
    'delivery_route_distance_km', round(p_route_distance_km::numeric, 2),
    'delivery_route_duration_minutes', p_route_duration_minutes,
    'total_amount', v_final_total,
    'amount_received', v_amount_received,
    'change_amount', v_change
  );
end;
$$;

grant execute on function public.vf_pos_create_delivery_sale(uuid, text, text, text, jsonb, text, boolean, numeric, text, numeric, jsonb, numeric, integer) to authenticated;

commit;

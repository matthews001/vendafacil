-- VendaFácil — Formas de pagamento: Pix, dinheiro e maquininha.
-- Execute uma única vez no SQL Editor do Supabase.
-- Não muda pedidos existentes. Apenas adiciona configuração por loja e registra a escolha do cliente.

begin;

alter table public.commerce_settings
  add column if not exists payment_methods_config jsonb not null default jsonb_build_object(
    'pix', jsonb_build_object('enabled', true, 'pickup', true, 'delivery', true),
    'cash', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true, 'cash_change_enabled', true),
    'debit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'credit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'meal_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'food_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true)
  );

alter table public.commerce_orders
  add column if not exists payment_details jsonb not null default '{}'::jsonb;

-- Mantém a vitrine pública atual e expõe somente as opções que a própria loja ativou.
create or replace function public.get_public_store_data(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_settings public.commerce_settings%rowtype;
begin
  select * into v_business
  from public.businesses
  where lower(slug) = lower(trim(p_slug))
  limit 1;
  if not found then
    raise exception 'Loja não encontrada.';
  end if;

  select * into v_settings
  from public.commerce_settings
  where business_id = v_business.id;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_business.name,
      'slug', v_business.slug,
      'whatsapp', v_business.whatsapp
    ),
    'settings', coalesce(to_jsonb(v_settings) - 'business_id', '{}'::jsonb)
      || jsonb_build_object(
        'pix_receiver_name', coalesce(v_settings.pix_receiver_name, v_business.name),
        'pix_city', coalesce(v_settings.pix_city, 'BRASIL'),
        'contact_whatsapp', coalesce(v_settings.contact_whatsapp, v_business.whatsapp),
        'payment_methods_config', coalesce(v_settings.payment_methods_config, jsonb_build_object(
          'pix', jsonb_build_object('enabled', true, 'pickup', true, 'delivery', true),
          'cash', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true, 'cash_change_enabled', true),
          'debit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
          'credit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
          'meal_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
          'food_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true)
        ))
      ),
    'products', coalesce((
      select jsonb_agg(to_jsonb(p) - 'business_id' order by coalesce(p.category, ''), p.name)
      from public.commerce_products p
      where p.business_id = v_business.id
        and p.active = true
        and (p.stock_quantity is null or p.stock_quantity > 0)
    ), '[]'::jsonb),
    'delivery_zones', coalesce((
      select jsonb_agg(to_jsonb(z) - 'business_id' order by z.name)
      from public.commerce_delivery_zones z
      where z.business_id = v_business.id and z.active = true
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_public_store_data(text) to anon, authenticated;

create or replace function public.vf_save_commerce_payment_methods(
  p_business_id uuid,
  p_payment_methods_config jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb := coalesce(p_payment_methods_config, '{}'::jsonb);
  v_key text;
  v_item jsonb;
begin
  if p_business_id is null then
    raise exception 'A loja ativa não foi identificada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para alterar os pagamentos desta loja.';
  end if;

  foreach v_key in array array['pix','cash','debit_card','credit_card','meal_voucher','food_voucher']
  loop
    v_item := coalesce(v_config -> v_key, '{}'::jsonb);
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Configuração inválida para %.', v_key;
    end if;
  end loop;

  insert into public.commerce_settings (business_id, payment_methods_config)
  values (p_business_id, v_config)
  on conflict (business_id) do update
    set payment_methods_config = excluded.payment_methods_config,
        updated_at = now();

  return jsonb_build_object('payment_methods_config', v_config);
end;
$$;

grant execute on function public.vf_save_commerce_payment_methods(uuid, jsonb) to authenticated;

create or replace function public.vf_customer_apply_payment_method(
  p_slug text,
  p_session_token text,
  p_order_id uuid,
  p_payment_method text,
  p_cash_change_for numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_settings public.commerce_settings%rowtype;
  v_customer_id uuid;
  v_profile_phone text;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_mode text;
  v_config jsonb;
  v_item jsonb;
  v_enabled boolean;
  v_allowed boolean;
  v_label text;
  v_change numeric(12,2);
begin
  if v_method not in ('pix','cash','debit_card','credit_card','meal_voucher','food_voucher') then
    raise exception 'Escolha uma forma de pagamento válida.';
  end if;

  select s.customer_id, cp.phone
    into v_customer_id, v_profile_phone
  from public.commerce_customer_sessions s
  join public.commerce_customer_profiles cp on cp.id = s.customer_id
  where s.token_hash = encode(digest(coalesce(p_session_token,''), 'sha256'), 'hex')
    and s.expires_at > now()
  order by s.last_seen_at desc
  limit 1;

  if v_customer_id is null then
    raise exception 'Sua sessão expirou. Entre novamente para continuar.';
  end if;

  select o, cs into v_order, v_settings
  from public.commerce_orders o
  join public.businesses b on b.id = o.business_id
  left join public.commerce_settings cs on cs.business_id = o.business_id
  where o.id = p_order_id
    and lower(b.slug) = lower(trim(p_slug))
  for update of o;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if regexp_replace(coalesce(v_profile_phone,''), '\D', '', 'g') <> regexp_replace(coalesce(v_order.buyer_phone,''), '\D', '', 'g') then
    raise exception 'Você não tem permissão para alterar o pagamento deste pedido.';
  end if;
  if v_order.status not in ('awaiting_payment','payment_reported') then
    raise exception 'Este pedido não aceita mais alteração de pagamento.';
  end if;

  v_mode := case when v_order.fulfillment_type = 'delivery' then 'delivery' else 'pickup' end;
  v_config := coalesce(v_settings.payment_methods_config, jsonb_build_object(
    'pix', jsonb_build_object('enabled', true, 'pickup', true, 'delivery', true),
    'cash', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true, 'cash_change_enabled', true),
    'debit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'credit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'meal_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'food_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true)
  ));
  v_item := coalesce(v_config -> v_method, '{}'::jsonb);
  v_enabled := coalesce((v_item ->> 'enabled')::boolean, v_method = 'pix');
  v_allowed := coalesce((v_item ->> v_mode)::boolean, true);
  if not v_enabled or not v_allowed then
    raise exception 'Esta forma de pagamento não está disponível para este pedido.';
  end if;
  if v_method = 'pix' and nullif(trim(coalesce(v_settings.pix_key,'')), '') is null then
    raise exception 'A loja ainda não configurou a chave Pix.';
  end if;

  v_change := null;
  if v_method = 'cash' and p_cash_change_for is not null then
    v_change := round(p_cash_change_for, 2);
    if v_change < v_order.total_amount then
      raise exception 'O valor para troco deve ser igual ou maior que o total do pedido.';
    end if;
  end if;

  v_label := case v_method
    when 'pix' then 'Pix'
    when 'cash' then 'Dinheiro'
    when 'debit_card' then 'Cartão de débito'
    when 'credit_card' then 'Cartão de crédito'
    when 'meal_voucher' then 'Vale-refeição'
    when 'food_voucher' then 'Vale-alimentação'
  end;

  update public.commerce_orders
     set payment_method = v_method,
         payment_details = jsonb_build_object(
           'label', v_label,
           'collection', case when v_method = 'pix' then 'online' else 'card_machine_or_cash' end,
           'timing', case when v_method = 'pix' then 'now' when v_mode = 'delivery' then 'delivery' else 'pickup' end,
           'cash_change_for', v_change
         ),
         updated_at = now()
   where id = v_order.id;

  return jsonb_build_object(
    'id', v_order.id,
    'public_code', v_order.public_code,
    'total_amount', v_order.total_amount,
    'status', v_order.status,
    'payment_method', v_method,
    'payment_details', jsonb_build_object('label', v_label, 'cash_change_for', v_change)
  );
end;
$$;

grant execute on function public.vf_customer_apply_payment_method(text, text, uuid, text, numeric) to anon, authenticated;

create or replace function public.vf_customer_create_order_with_payment(
  p_slug text,
  p_session_token text,
  p_notes text,
  p_items jsonb,
  p_fulfillment_type text,
  p_delivery_zone_id uuid,
  p_delivery_address jsonb,
  p_coupon_code text,
  p_scheduled_for timestamptz,
  p_schedule_mode text,
  p_payment_method text,
  p_cash_change_for numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order jsonb;
begin
  v_order := public.commerce_customer_create_order(
    p_slug, p_session_token, p_notes, p_items, p_fulfillment_type,
    p_delivery_zone_id, p_delivery_address, p_coupon_code, p_scheduled_for, p_schedule_mode
  );
  return v_order || public.vf_customer_apply_payment_method(
    p_slug, p_session_token, nullif(v_order->>'id','')::uuid, p_payment_method, p_cash_change_for
  );
end;
$$;

grant execute on function public.vf_customer_create_order_with_payment(text, text, text, jsonb, text, uuid, jsonb, text, timestamptz, text, text, numeric) to anon, authenticated;

create or replace function public.vf_customer_create_radius_order_with_payment(
  p_slug text,
  p_session_token text,
  p_notes text,
  p_items jsonb,
  p_delivery_address jsonb,
  p_coupon_code text,
  p_scheduled_for timestamptz,
  p_schedule_mode text,
  p_client_lat double precision,
  p_client_lng double precision,
  p_payment_method text,
  p_cash_change_for numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order jsonb;
begin
  v_order := public.vf_customer_create_radius_order(
    p_slug, p_session_token, p_notes, p_items, p_delivery_address,
    p_coupon_code, p_scheduled_for, p_schedule_mode, p_client_lat, p_client_lng
  );
  return v_order || public.vf_customer_apply_payment_method(
    p_slug, p_session_token, nullif(v_order->>'id','')::uuid, p_payment_method, p_cash_change_for
  );
end;
$$;

grant execute on function public.vf_customer_create_radius_order_with_payment(text, text, text, jsonb, jsonb, text, timestamptz, text, double precision, double precision, text, numeric) to anon, authenticated;

commit;

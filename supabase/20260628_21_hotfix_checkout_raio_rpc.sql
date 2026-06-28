-- VendaFácil — HOTFIX definitivo: checkout + raio de entrega + compatibilidade de RPC.
-- Execute UMA vez no SQL Editor do Supabase, depois de atualizar o projeto na Vercel.
-- Este script é seguro para reaplicar: cria/atualiza apenas funções e colunas necessárias.

begin;

create extension if not exists pgcrypto;

alter table public.commerce_settings
  add column if not exists delivery_origin_cep text,
  add column if not exists delivery_origin_number text,
  add column if not exists delivery_origin_address text,
  add column if not exists delivery_origin_lat double precision,
  add column if not exists delivery_origin_lng double precision,
  add column if not exists delivery_radius_enabled boolean not null default false,
  add column if not exists delivery_radius_km numeric(8,2),
  add column if not exists delivery_radius_fee numeric(12,2),
  add column if not exists delivery_radius_minimum_order numeric(12,2),
  add column if not exists delivery_radius_eta_minutes integer,
  add column if not exists delivery_radius_zone_id uuid,
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

-- A vitrine recebe a configuração atual, inclusive CEP/raio e formas de pagamento.
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
      where z.business_id = v_business.id
        and z.active = true
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_public_store_data(text) to anon, authenticated;

-- Mantém o painel novo independente desta RPC e elimina o 404 para navegadores
-- que ainda tenham a versão anterior aberta/cacheada.
create or replace function public.vf_configure_delivery_radius(
  p_business_id uuid,
  p_enabled boolean,
  p_max_distance_km numeric,
  p_fee numeric,
  p_minimum_order numeric,
  p_eta_minutes integer,
  p_origin_lat double precision,
  p_origin_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_id uuid;
  v_radius numeric(8,2);
  v_fee numeric(12,2);
  v_minimum numeric(12,2);
  v_eta integer;
begin
  if p_business_id is null then
    raise exception 'A loja ativa não foi identificada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para alterar a entrega desta loja.';
  end if;

  if not coalesce(p_enabled, false) then
    insert into public.commerce_settings (
      business_id, delivery_radius_enabled, delivery_radius_km, delivery_radius_fee,
      delivery_radius_minimum_order, delivery_radius_eta_minutes, delivery_radius_zone_id, updated_at
    ) values (
      p_business_id, false, null, null, null, null, null, now()
    )
    on conflict (business_id) do update set
      delivery_radius_enabled = false,
      delivery_radius_km = null,
      delivery_radius_fee = null,
      delivery_radius_minimum_order = null,
      delivery_radius_eta_minutes = null,
      delivery_radius_zone_id = null,
      updated_at = now();

    return jsonb_build_object('enabled', false);
  end if;

  v_radius := round(coalesce(p_max_distance_km, 0), 2);
  v_fee := round(greatest(0, coalesce(p_fee, 0)), 2);
  v_minimum := round(greatest(0, coalesce(p_minimum_order, 0)), 2);
  v_eta := nullif(p_eta_minutes, 0);

  if v_radius < 0.3 or v_radius > 100 then
    raise exception 'Informe um raio entre 0,3 km e 100 km.';
  end if;
  if v_eta is not null and (v_eta < 1 or v_eta > 360) then
    raise exception 'Informe um prazo por raio entre 1 e 360 minutos.';
  end if;
  if p_origin_lat is null or p_origin_lng is null
     or p_origin_lat not between -90 and 90
     or p_origin_lng not between -180 and 180 then
    raise exception 'Confirme a localização da loja pelo CEP e número antes de salvar o raio.';
  end if;

  select s.delivery_radius_zone_id
    into v_zone_id
  from public.commerce_settings s
  where s.business_id = p_business_id;

  if v_zone_id is not null and not exists (
    select 1 from public.commerce_delivery_zones z
    where z.id = v_zone_id and z.business_id = p_business_id
  ) then
    v_zone_id := null;
  end if;

  if v_zone_id is null then
    select z.id into v_zone_id
    from public.commerce_delivery_zones z
    where z.business_id = p_business_id
      and z.name = 'Entrega por raio (CEP)'
    order by z.created_at nulls last, z.id
    limit 1;
  end if;

  if v_zone_id is null then
    insert into public.commerce_delivery_zones (
      business_id, name, neighborhoods, cep_ranges, fee, minimum_order,
      estimated_minutes, active, updated_at
    ) values (
      p_business_id, 'Entrega por raio (CEP)', '[]'::jsonb, '[]'::jsonb,
      v_fee, v_minimum, v_eta, true, now()
    )
    returning id into v_zone_id;
  else
    update public.commerce_delivery_zones
    set name = 'Entrega por raio (CEP)',
        neighborhoods = '[]'::jsonb,
        cep_ranges = '[]'::jsonb,
        fee = v_fee,
        minimum_order = v_minimum,
        estimated_minutes = v_eta,
        active = true,
        updated_at = now()
    where id = v_zone_id;
  end if;

  insert into public.commerce_settings (
    business_id, delivery_origin_lat, delivery_origin_lng,
    delivery_radius_enabled, delivery_radius_km, delivery_radius_fee,
    delivery_radius_minimum_order, delivery_radius_eta_minutes,
    delivery_radius_zone_id, updated_at
  ) values (
    p_business_id, p_origin_lat, p_origin_lng,
    true, v_radius, v_fee, v_minimum, v_eta, v_zone_id, now()
  )
  on conflict (business_id) do update set
    delivery_origin_lat = excluded.delivery_origin_lat,
    delivery_origin_lng = excluded.delivery_origin_lng,
    delivery_radius_enabled = true,
    delivery_radius_km = excluded.delivery_radius_km,
    delivery_radius_fee = excluded.delivery_radius_fee,
    delivery_radius_minimum_order = excluded.delivery_radius_minimum_order,
    delivery_radius_eta_minutes = excluded.delivery_radius_eta_minutes,
    delivery_radius_zone_id = excluded.delivery_radius_zone_id,
    updated_at = now();

  return jsonb_build_object(
    'enabled', true,
    'zone_id', v_zone_id,
    'max_distance_km', v_radius,
    'fee', v_fee,
    'minimum_order', v_minimum,
    'eta_minutes', v_eta,
    'origin_lat', p_origin_lat,
    'origin_lng', p_origin_lng
  );
end;
$$;

grant execute on function public.vf_configure_delivery_radius(uuid, boolean, numeric, numeric, numeric, integer, double precision, double precision) to authenticated;

-- Compatibilidade para checkout de versões anteriores da vitrine.
-- A vitrine atual usa commerce_customer_create_order diretamente e não depende desta RPC.
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
  if p_order_id is null then
    raise exception 'Pedido inválido para atualizar o pagamento.';
  end if;
  if v_method not in ('pix','cash','debit_card','credit_card','meal_voucher','food_voucher') then
    raise exception 'Escolha uma forma de pagamento válida.';
  end if;

  select s.customer_id, cp.phone
    into v_customer_id, v_profile_phone
  from public.commerce_customer_sessions s
  join public.commerce_customer_profiles cp on cp.id = s.customer_id
  where s.token_hash = encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
    and s.expires_at > now()
  order by s.last_seen_at desc
  limit 1;

  if v_customer_id is null then
    raise exception 'Sua sessão expirou. Entre novamente para continuar.';
  end if;

  select o.* into v_order
  from public.commerce_orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id
    and lower(b.slug) = lower(trim(p_slug))
  for update of o;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if regexp_replace(coalesce(v_profile_phone, ''), '\D', '', 'g')
     <> regexp_replace(coalesce(v_order.buyer_phone, ''), '\D', '', 'g') then
    raise exception 'Você não tem permissão para alterar o pagamento deste pedido.';
  end if;
  if v_order.status not in ('awaiting_payment','payment_reported') then
    raise exception 'Este pedido não aceita mais alteração de pagamento.';
  end if;

  select * into v_settings
  from public.commerce_settings
  where business_id = v_order.business_id;

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
  if v_method = 'pix' and nullif(trim(coalesce(v_settings.pix_key, '')), '') is null then
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
    p_slug, p_session_token, nullif(v_order ->> 'id', '')::uuid,
    p_payment_method, p_cash_change_for
  );
end;
$$;

grant execute on function public.vf_customer_create_order_with_payment(text, text, text, jsonb, text, uuid, jsonb, text, timestamptz, text, text, numeric) to anon, authenticated;

-- Compatibilidade do checkout antigo de raio. A função atualizada não depende dela,
-- mas ela evita falha se uma aba antiga ainda estiver aberta durante a atualização.
create or replace function public.vf_customer_create_radius_order(
  p_slug text,
  p_session_token text,
  p_notes text,
  p_items jsonb,
  p_delivery_address jsonb,
  p_coupon_code text,
  p_scheduled_for timestamptz,
  p_schedule_mode text,
  p_client_lat double precision,
  p_client_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_settings public.commerce_settings%rowtype;
  v_zone public.commerce_delivery_zones%rowtype;
  v_distance numeric(10,2);
  v_address jsonb;
  v_result jsonb;
  v_cosine double precision;
begin
  if jsonb_typeof(coalesce(p_delivery_address, '{}'::jsonb)) <> 'object' then
    raise exception 'O endereço de entrega está inválido.';
  end if;
  if p_client_lat is null or p_client_lng is null
     or p_client_lat not between -90 and 90
     or p_client_lng not between -180 and 180 then
    raise exception 'Não foi possível validar a localização do endereço.';
  end if;

  select b.id, s into v_business_id, v_settings
  from public.businesses b
  join public.commerce_settings s on s.business_id = b.id
  where lower(b.slug) = lower(trim(p_slug))
  limit 1;

  if v_business_id is null then
    raise exception 'Loja não encontrada.';
  end if;
  if not coalesce(v_settings.delivery_radius_enabled, false)
     or v_settings.delivery_radius_zone_id is null
     or v_settings.delivery_origin_lat is null
     or v_settings.delivery_origin_lng is null
     or coalesce(v_settings.delivery_radius_km, 0) <= 0 then
    raise exception 'A entrega por raio não está disponível nesta loja.';
  end if;

  v_cosine := cos(radians(v_settings.delivery_origin_lat)) * cos(radians(p_client_lat))
              * cos(radians(p_client_lng) - radians(v_settings.delivery_origin_lng))
              + sin(radians(v_settings.delivery_origin_lat)) * sin(radians(p_client_lat));
  v_distance := round((6371 * acos(least(1::double precision, greatest(-1::double precision, v_cosine))))::numeric, 2);

  if v_distance > v_settings.delivery_radius_km then
    raise exception 'Seu endereço está a % km da loja. O raio máximo é % km.', v_distance, v_settings.delivery_radius_km;
  end if;

  select * into v_zone
  from public.commerce_delivery_zones
  where id = v_settings.delivery_radius_zone_id
    and business_id = v_business_id
    and active = true;

  if not found then
    raise exception 'A área de entrega por raio precisa ser salva novamente.';
  end if;

  v_address := coalesce(p_delivery_address, '{}'::jsonb)
    || jsonb_build_object(
      'delivery_method', 'radius',
      'delivery_radius_km', v_distance,
      'client_lat', round(p_client_lat::numeric, 6),
      'client_lng', round(p_client_lng::numeric, 6)
    );

  v_result := public.commerce_customer_create_order(
    p_slug, p_session_token, p_notes, p_items, 'delivery', v_zone.id,
    v_address, p_coupon_code, p_scheduled_for, p_schedule_mode
  );

  return v_result || jsonb_build_object('delivery_radius_km', v_distance);
end;
$$;

grant execute on function public.vf_customer_create_radius_order(text, text, text, jsonb, jsonb, text, timestamptz, text, double precision, double precision) to anon, authenticated;

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
    p_slug, p_session_token, nullif(v_order ->> 'id', '')::uuid,
    p_payment_method, p_cash_change_for
  );
end;
$$;

grant execute on function public.vf_customer_create_radius_order_with_payment(text, text, text, jsonb, jsonb, text, timestamptz, text, double precision, double precision, text, numeric) to anon, authenticated;

-- Atualiza imediatamente o catálogo de funções da API REST/PostgREST.
notify pgrst, 'reload schema';

commit;

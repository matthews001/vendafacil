-- VendaFácil — recuperação final de checkout e entrega por raio.
-- Execute uma única vez no Supabase > SQL Editor antes de testar a nova publicação.
-- É idempotente: não apaga pedidos, produtos, clientes, CEPs ou configurações existentes.

begin;

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

alter table public.commerce_delivery_zones
  add column if not exists vf_delivery_rule text not null default 'cep';

create index if not exists commerce_delivery_zones_vf_delivery_rule_idx
  on public.commerce_delivery_zones (business_id, vf_delivery_rule);

-- Mantém zonas de raio antigas fora da identificação por faixa de CEP.
update public.commerce_delivery_zones z
   set vf_delivery_rule = 'radius'
  from public.commerce_settings s
 where s.delivery_radius_zone_id = z.id
   and coalesce(z.vf_delivery_rule, 'cep') <> 'radius';

-- A vitrine nova usa commerce_customer_create_order diretamente. Esta RPC continua
-- disponível apenas para abas/cache antigos não gerarem 404 durante a atualização.
create or replace function public.vf_delivery_haversine_km(
  p_lat_a double precision,
  p_lng_a double precision,
  p_lat_b double precision,
  p_lng_b double precision
)
returns numeric
language sql
immutable
as $$
  select round((
    6371.0088 * 2 * asin(sqrt(
      power(sin(radians((p_lat_b - p_lat_a) / 2)), 2) +
      cos(radians(p_lat_a)) * cos(radians(p_lat_b)) *
      power(sin(radians((p_lng_b - p_lng_a) / 2)), 2)
    ))
  )::numeric, 2)
$$;

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
  select *
    into v_business
    from public.businesses
   where lower(slug) = lower(trim(p_slug))
   limit 1;

  if not found then
    raise exception 'Loja não encontrada.';
  end if;

  select *
    into v_settings
    from public.commerce_settings
   where business_id = v_business.id
   limit 1;

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

-- Compatibilidade para o painel antigo. O painel desta versão salva diretamente
-- em commerce_settings/commercer_delivery_zones e não depende desta RPC.
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
  v_enabled boolean := coalesce(p_enabled, false);
  v_max_distance numeric(8,2) := coalesce(p_max_distance_km, 0);
  v_fee numeric(12,2) := greatest(0, coalesce(p_fee, 0));
  v_minimum numeric(12,2) := greatest(0, coalesce(p_minimum_order, 0));
  v_eta integer := nullif(greatest(0, coalesce(p_eta_minutes, 0)), 0);
begin
  if p_business_id is null then
    raise exception 'A loja ativa não foi identificada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para configurar entrega desta loja.';
  end if;

  if v_enabled then
    if v_max_distance < 0.3 or v_max_distance > 100 then
      raise exception 'Informe um raio entre 0,3 km e 100 km.';
    end if;
    if p_origin_lat is null or p_origin_lng is null
       or p_origin_lat not between -90 and 90
       or p_origin_lng not between -180 and 180 then
      raise exception 'Confirme a origem da loja pelo CEP e número antes de ativar o raio.';
    end if;
  end if;

  insert into public.commerce_settings (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  select id
    into v_zone_id
    from public.commerce_delivery_zones
   where business_id = p_business_id
     and vf_delivery_rule = 'radius'
   order by created_at nulls last
   limit 1;

  if v_zone_id is null then
    insert into public.commerce_delivery_zones (
      business_id, name, neighborhoods, cep_ranges, fee, minimum_order,
      estimated_minutes, active, vf_delivery_rule
    ) values (
      p_business_id, 'Entrega por raio (CEP)', '[]'::jsonb, '[]'::jsonb,
      v_fee, v_minimum, v_eta, v_enabled, 'radius'
    ) returning id into v_zone_id;
  else
    update public.commerce_delivery_zones
       set name = 'Entrega por raio (CEP)',
           neighborhoods = '[]'::jsonb,
           cep_ranges = '[]'::jsonb,
           fee = v_fee,
           minimum_order = v_minimum,
           estimated_minutes = v_eta,
           active = v_enabled,
           vf_delivery_rule = 'radius',
           updated_at = now()
     where id = v_zone_id;
  end if;

  update public.commerce_settings
     set delivery_radius_enabled = v_enabled,
         delivery_radius_km = case when v_enabled then v_max_distance else null end,
         delivery_radius_fee = case when v_enabled then v_fee else null end,
         delivery_radius_minimum_order = case when v_enabled then v_minimum else null end,
         delivery_radius_eta_minutes = case when v_enabled then v_eta else null end,
         delivery_radius_zone_id = v_zone_id,
         delivery_origin_lat = case when v_enabled then p_origin_lat else delivery_origin_lat end,
         delivery_origin_lng = case when v_enabled then p_origin_lng else delivery_origin_lng end,
         updated_at = now()
   where business_id = p_business_id;

  return jsonb_build_object(
    'enabled', v_enabled,
    'zone_id', v_zone_id,
    'max_distance_km', case when v_enabled then v_max_distance else null end,
    'fee', case when v_enabled then v_fee else null end,
    'minimum_order', case when v_enabled then v_minimum else null end,
    'eta_minutes', case when v_enabled then v_eta else null end,
    'origin_lat', case when v_enabled then p_origin_lat else null end,
    'origin_lng', case when v_enabled then p_origin_lng else null end
  );
end;
$$;

grant execute on function public.vf_configure_delivery_radius(uuid, boolean, numeric, numeric, numeric, integer, double precision, double precision) to authenticated;

-- Compatibilidade de checkout para JavaScript antigo. A vitrine atual não chama
-- esta função, mas ela elimina o 404 de clientes que estejam com uma aba anterior aberta.
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
  v_method text := lower(trim(coalesce(p_payment_method, 'pix')));
  v_notes text;
  v_order jsonb;
begin
  if v_method not in ('pix', 'cash', 'debit_card', 'credit_card', 'meal_voucher', 'food_voucher') then
    raise exception 'Escolha uma forma de pagamento válida.';
  end if;
  if p_cash_change_for is not null and p_cash_change_for < 0 then
    raise exception 'O valor de troco não pode ser negativo.';
  end if;

  v_notes := concat_ws(E'\n',
    nullif(trim(coalesce(p_notes, '')), ''),
    '[[VF_PAYMENT:' || v_method || ']]',
    case when v_method = 'cash' and p_cash_change_for is not null
      then '[[VF_CHANGE_FOR:' || round(p_cash_change_for, 2)::text || ']]'
      else null
    end
  );

  v_order := public.commerce_customer_create_order(
    p_slug,
    p_session_token,
    v_notes,
    p_items,
    p_fulfillment_type,
    p_delivery_zone_id,
    p_delivery_address,
    p_coupon_code,
    p_scheduled_for,
    p_schedule_mode
  );

  return coalesce(v_order, '{}'::jsonb) || jsonb_build_object(
    'payment_method', v_method,
    'payment_details', jsonb_build_object('cash_change_for', p_cash_change_for)
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
  v_business_id uuid;
  v_settings public.commerce_settings%rowtype;
  v_distance numeric(8,2);
  v_address jsonb;
  v_order jsonb;
begin
  if p_client_lat is null or p_client_lng is null
     or p_client_lat not between -90 and 90
     or p_client_lng not between -180 and 180 then
    raise exception 'Não foi possível validar o endereço para entrega por raio.';
  end if;

  select id
    into v_business_id
    from public.businesses
   where lower(slug) = lower(trim(p_slug))
   limit 1;

  if v_business_id is null then
    raise exception 'Loja não encontrada.';
  end if;

  select *
    into v_settings
    from public.commerce_settings
   where business_id = v_business_id
   limit 1;

  if not found
     or not coalesce(v_settings.delivery_enabled, false)
     or not coalesce(v_settings.delivery_radius_enabled, false)
     or v_settings.delivery_radius_zone_id is null
     or v_settings.delivery_origin_lat is null
     or v_settings.delivery_origin_lng is null
     or coalesce(v_settings.delivery_radius_km, 0) <= 0 then
    raise exception 'A entrega por raio não está disponível nesta loja.';
  end if;

  v_distance := public.vf_delivery_haversine_km(
    v_settings.delivery_origin_lat,
    v_settings.delivery_origin_lng,
    p_client_lat,
    p_client_lng
  );

  if v_distance > v_settings.delivery_radius_km then
    raise exception 'Seu endereço está a % km da loja. O raio máximo é % km.', v_distance, v_settings.delivery_radius_km;
  end if;

  v_address := coalesce(p_delivery_address, '{}'::jsonb) || jsonb_build_object(
    'delivery_method', 'radius',
    'delivery_radius_km', v_distance,
    'client_lat', round(p_client_lat::numeric, 6),
    'client_lng', round(p_client_lng::numeric, 6)
  );

  v_order := public.vf_customer_create_order_with_payment(
    p_slug,
    p_session_token,
    p_notes,
    p_items,
    'delivery',
    v_settings.delivery_radius_zone_id,
    v_address,
    p_coupon_code,
    p_scheduled_for,
    p_schedule_mode,
    p_payment_method,
    p_cash_change_for
  );

  return coalesce(v_order, '{}'::jsonb) || jsonb_build_object('delivery_radius_km', v_distance);
end;
$$;

grant execute on function public.vf_customer_create_radius_order_with_payment(text, text, text, jsonb, jsonb, text, timestamptz, text, double precision, double precision, text, numeric) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- FechAí — Entrega por CEP + raio, sem mapa e sem rota paga.
-- Execute uma única vez no SQL Editor do Supabase.
-- Mantém as áreas atuais por CEP. O raio entra como segunda opção, usando localização do navegador.

begin;

alter table public.commerce_settings
  add column if not exists delivery_radius_enabled boolean not null default false,
  add column if not exists delivery_radius_km numeric(8,2),
  add column if not exists delivery_radius_fee numeric(12,2),
  add column if not exists delivery_radius_minimum_order numeric(12,2),
  add column if not exists delivery_radius_eta_minutes integer,
  add column if not exists delivery_radius_zone_id uuid,
  add column if not exists delivery_origin_lat double precision,
  add column if not exists delivery_origin_lng double precision;

alter table public.commerce_delivery_zones
  add column if not exists vf_delivery_rule text not null default 'cep';

create index if not exists commerce_delivery_zones_radius_rule_idx
  on public.commerce_delivery_zones (business_id, vf_delivery_rule);

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
  if coalesce(p_enabled, false) then
    if v_max_distance < 0.3 or v_max_distance > 100 then
      raise exception 'Informe um raio entre 0,3 km e 100 km.';
    end if;
    if p_origin_lat is null or p_origin_lng is null or p_origin_lat not between -90 and 90 or p_origin_lng not between -180 and 180 then
      raise exception 'Use a localização atual da loja antes de ativar entrega por raio.';
    end if;
  end if;

  insert into public.commerce_settings (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;

  select id into v_zone_id
  from public.commerce_delivery_zones
  where business_id = p_business_id
    and vf_delivery_rule = 'radius'
  order by created_at nulls last
  limit 1;

  if v_zone_id is null then
    insert into public.commerce_delivery_zones (
      business_id, name, neighborhoods, cep_ranges, fee, minimum_order,
      estimated_minutes, active, is_mapbox_default, vf_delivery_rule
    ) values (
      p_business_id, '__vf_raio_de_entrega__', '[]'::jsonb,
      '[{"from":"00000000","to":"99999999"}]'::jsonb,
      v_fee, v_minimum, v_eta, coalesce(p_enabled, false), true, 'radius'
    ) returning id into v_zone_id;
  else
    update public.commerce_delivery_zones
       set name = '__vf_raio_de_entrega__',
           neighborhoods = '[]'::jsonb,
           cep_ranges = '[{"from":"00000000","to":"99999999"}]'::jsonb,
           fee = v_fee,
           minimum_order = v_minimum,
           estimated_minutes = v_eta,
           active = coalesce(p_enabled, false),
           is_mapbox_default = true,
           vf_delivery_rule = 'radius',
           updated_at = now()
     where id = v_zone_id;
  end if;

  update public.commerce_settings
     set delivery_radius_enabled = coalesce(p_enabled, false),
         delivery_radius_km = case when coalesce(p_enabled, false) then v_max_distance else null end,
         delivery_radius_fee = case when coalesce(p_enabled, false) then v_fee else null end,
         delivery_radius_minimum_order = case when coalesce(p_enabled, false) then v_minimum else null end,
         delivery_radius_eta_minutes = case when coalesce(p_enabled, false) then v_eta else null end,
         delivery_radius_zone_id = v_zone_id,
         delivery_origin_lat = case when coalesce(p_enabled, false) then p_origin_lat else delivery_origin_lat end,
         delivery_origin_lng = case when coalesce(p_enabled, false) then p_origin_lng else delivery_origin_lng end,
         updated_at = now()
   where business_id = p_business_id;

  return jsonb_build_object(
    'enabled', coalesce(p_enabled, false),
    'zone_id', v_zone_id,
    'max_distance_km', case when coalesce(p_enabled, false) then v_max_distance else null end,
    'fee', case when coalesce(p_enabled, false) then v_fee else null end,
    'minimum_order', case when coalesce(p_enabled, false) then v_minimum else null end,
    'eta_minutes', case when coalesce(p_enabled, false) then v_eta else null end
  );
end;
$$;

create or replace function public.vf_get_public_delivery_radius(p_slug text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_build_object(
    'enabled', coalesce(s.delivery_radius_enabled, false),
    'zone_id', s.delivery_radius_zone_id,
    'max_distance_km', s.delivery_radius_km,
    'fee', coalesce(s.delivery_radius_fee, 0),
    'minimum_order', coalesce(s.delivery_radius_minimum_order, 0),
    'eta_minutes', s.delivery_radius_eta_minutes,
    'origin_lat', s.delivery_origin_lat,
    'origin_lng', s.delivery_origin_lng
  ), '{}'::jsonb)
  from public.businesses b
  left join public.commerce_settings s on s.business_id = b.id
  where lower(b.slug) = lower(trim(p_slug))
  limit 1;
$$;

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
  v_zone_id uuid;
  v_distance numeric(8,2);
  v_address jsonb;
  v_result jsonb;
begin
  select b.id into v_business_id
  from public.businesses b
  where lower(b.slug) = lower(trim(p_slug))
  limit 1;
  if v_business_id is null then
    raise exception 'Loja não encontrada.';
  end if;
  select * into v_settings
  from public.commerce_settings
  where business_id = v_business_id;
  if not found or coalesce(v_settings.delivery_enabled, false) = false then
    raise exception 'A entrega não está disponível nesta loja.';
  end if;
  if coalesce(v_settings.delivery_radius_enabled, false) = false then
    raise exception 'A entrega por raio não está ativa nesta loja.';
  end if;
  if p_client_lat is null or p_client_lng is null or p_client_lat not between -90 and 90 or p_client_lng not between -180 and 180 then
    raise exception 'Não foi possível validar sua localização para entrega por raio.';
  end if;
  if v_settings.delivery_origin_lat is null or v_settings.delivery_origin_lng is null then
    raise exception 'A loja ainda não configurou a localização para entrega por raio.';
  end if;

  v_distance := public.vf_delivery_haversine_km(v_settings.delivery_origin_lat, v_settings.delivery_origin_lng, p_client_lat, p_client_lng);
  if v_distance > coalesce(v_settings.delivery_radius_km, 0) then
    raise exception 'Seu endereço está a % km da loja. O raio máximo é % km.', v_distance, v_settings.delivery_radius_km;
  end if;

  select id into v_zone_id
  from public.commerce_delivery_zones
  where id = v_settings.delivery_radius_zone_id
    and business_id = v_business_id
    and vf_delivery_rule = 'radius'
    and coalesce(active, false) = true
  limit 1;
  if v_zone_id is null then
    raise exception 'A área de entrega por raio ainda não está pronta. Tente novamente em alguns instantes.';
  end if;

  v_address := coalesce(p_delivery_address, '{}'::jsonb) || jsonb_build_object(
    'delivery_method', 'radius',
    'delivery_radius_km', v_distance,
    'client_lat', round(p_client_lat::numeric, 6),
    'client_lng', round(p_client_lng::numeric, 6)
  );

  v_result := public.commerce_customer_create_order(
    p_slug, p_session_token, p_notes, p_items, 'delivery', v_zone_id,
    v_address, p_coupon_code, p_scheduled_for, p_schedule_mode
  );

  update public.commerce_orders
     set delivery_route_distance_km = v_distance,
         delivery_route_duration_minutes = coalesce(v_settings.delivery_radius_eta_minutes, delivery_route_duration_minutes),
         delivery_address = coalesce(delivery_address, '{}'::jsonb) || jsonb_build_object(
           'delivery_method', 'radius',
           'delivery_radius_km', v_distance
         ),
         updated_at = now()
   where id = nullif(v_result->>'id','')::uuid;

  return v_result || jsonb_build_object('delivery_radius_km', v_distance);
end;
$$;

grant execute on function public.vf_get_public_delivery_radius(text) to anon, authenticated;
grant execute on function public.vf_customer_create_radius_order(text, text, text, jsonb, jsonb, text, timestamptz, text, double precision, double precision) to anon, authenticated;
grant execute on function public.vf_configure_delivery_radius(uuid, boolean, numeric, numeric, numeric, integer, double precision, double precision) to authenticated;

commit;

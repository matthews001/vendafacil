-- VendaFácil — rota de entrega com Mapbox (mapa, distância e tempo).
-- Execute depois das migrações já existentes do comércio.

alter table public.commerce_settings
  add column if not exists delivery_origin_address text,
  add column if not exists delivery_origin_lat double precision,
  add column if not exists delivery_origin_lng double precision,
  add column if not exists delivery_map_enabled boolean not null default true;

alter table public.commerce_settings
  drop constraint if exists commerce_settings_delivery_origin_lat_range,
  drop constraint if exists commerce_settings_delivery_origin_lng_range;

alter table public.commerce_settings
  add constraint commerce_settings_delivery_origin_lat_range
    check (delivery_origin_lat is null or delivery_origin_lat between -90 and 90),
  add constraint commerce_settings_delivery_origin_lng_range
    check (delivery_origin_lng is null or delivery_origin_lng between -180 and 180);

-- A vitrine recebe somente os dados públicos necessários para o checkout.
-- to_jsonb preserva configurações de versões anteriores do VendaFácil.
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
  select * into v_business from public.businesses where slug = p_slug limit 1;
  if not found then raise exception 'Loja não encontrada.'; end if;
  select * into v_settings from public.commerce_settings where business_id = v_business.id;

  return jsonb_build_object(
    'business', jsonb_build_object('name', v_business.name, 'slug', v_business.slug, 'whatsapp', v_business.whatsapp),
    'settings', coalesce(to_jsonb(v_settings) - 'business_id', '{}'::jsonb)
      || jsonb_build_object(
        'pix_receiver_name', coalesce(v_settings.pix_receiver_name, v_business.name),
        'pix_city', coalesce(v_settings.pix_city, 'BRASIL'),
        'contact_whatsapp', coalesce(v_settings.contact_whatsapp, v_business.whatsapp),
        'delivery_map_enabled', coalesce(v_settings.delivery_map_enabled, true)
      ),
    'products', coalesce((
      select jsonb_agg(to_jsonb(p) - 'business_id' order by coalesce(p.category, ''), p.name)
      from public.commerce_products p
      where p.business_id = v_business.id and p.active = true
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

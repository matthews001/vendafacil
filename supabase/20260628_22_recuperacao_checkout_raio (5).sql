-- VendaFácil — modo automático de entrega pelo Mapbox.
-- Execute depois de 20260626_delivery_mapbox_route.sql.

alter table public.commerce_settings
  add column if not exists delivery_map_mode boolean not null default false,
  add column if not exists delivery_pricing_mode text not null default 'zone',
  add column if not exists delivery_map_fee numeric(12,2) not null default 0,
  add column if not exists delivery_map_max_distance_km numeric(10,2);

alter table public.commerce_settings
  drop constraint if exists commerce_settings_delivery_pricing_mode_check,
  drop constraint if exists commerce_settings_delivery_map_fee_check,
  drop constraint if exists commerce_settings_delivery_map_max_distance_check;

alter table public.commerce_settings
  add constraint commerce_settings_delivery_pricing_mode_check check (delivery_pricing_mode in ('zone','mapbox')),
  add constraint commerce_settings_delivery_map_fee_check check (delivery_map_fee >= 0),
  add constraint commerce_settings_delivery_map_max_distance_check check (delivery_map_max_distance_km is null or delivery_map_max_distance_km > 0);

alter table public.commerce_delivery_zones
  add column if not exists is_mapbox_default boolean not null default false;

create unique index if not exists commerce_delivery_zones_one_mapbox_default_per_business
  on public.commerce_delivery_zones (business_id)
  where is_mapbox_default;

create or replace function public.vf_sync_mapbox_delivery_zone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_id uuid;
begin
  if coalesce(new.delivery_map_mode, false) or coalesce(new.delivery_pricing_mode, 'zone') = 'mapbox' then
    select id into v_zone_id
      from public.commerce_delivery_zones
      where business_id = new.business_id and is_mapbox_default = true
      limit 1;

    if v_zone_id is null then
      insert into public.commerce_delivery_zones (
        business_id, name, neighborhoods, cep_ranges, fee, minimum_order,
        estimated_minutes, active, is_mapbox_default, updated_at
      ) values (
        new.business_id, 'Entrega calculada pelo mapa', '[]'::jsonb, '[]'::jsonb,
        coalesce(new.delivery_map_fee, 0), 0, null, true, true, now()
      );
    else
      update public.commerce_delivery_zones
        set fee = coalesce(new.delivery_map_fee, 0),
            active = true,
            name = 'Entrega calculada pelo mapa',
            updated_at = now()
        where id = v_zone_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vf_sync_mapbox_delivery_zone_trigger on public.commerce_settings;
create trigger vf_sync_mapbox_delivery_zone_trigger
after insert or update of delivery_map_mode, delivery_pricing_mode, delivery_map_fee
on public.commerce_settings
for each row execute function public.vf_sync_mapbox_delivery_zone();

-- Keep existing stores unchanged until their owner saves the Mapbox configuration.
update public.commerce_settings
set delivery_map_mode = false,
    delivery_pricing_mode = coalesce(nullif(delivery_pricing_mode, ''), 'zone')
where delivery_pricing_mode is null or delivery_map_mode is null;

-- Public store data already uses to_jsonb(settings), so the new fields are available to the storefront.
grant execute on function public.get_public_store_data(text) to anon, authenticated;

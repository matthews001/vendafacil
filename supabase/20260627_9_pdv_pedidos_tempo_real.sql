-- VendaFácil — Mapbox pelo endereço digitado no checkout.
-- Execute depois de 20260626_delivery_mapbox_route.sql e 20260627_mapbox_automatic_delivery.sql.

-- Entrega passa a usar o Mapbox para todas as lojas que já possuem endereço
-- de saída configurado. Assim não depende mais do antigo dropdown de bairros.
update public.commerce_settings
set delivery_map_enabled = true,
    delivery_map_mode = true,
    delivery_pricing_mode = 'mapbox',
    updated_at = now()
where coalesce(delivery_enabled, false) = true
  and delivery_origin_lat is not null
  and delivery_origin_lng is not null;

-- Garante uma zona técnica para o backend registrar o frete calculado pelo mapa.
-- Essa zona não é exibida nem escolhida pelo cliente.
insert into public.commerce_delivery_zones (
  business_id, name, neighborhoods, cep_ranges, fee, minimum_order,
  estimated_minutes, active, is_mapbox_default, updated_at
)
select
  s.business_id,
  'Entrega calculada pelo mapa',
  '[]'::jsonb,
  '[]'::jsonb,
  coalesce(s.delivery_map_fee, 0),
  0,
  null,
  true,
  true,
  now()
from public.commerce_settings s
where coalesce(s.delivery_enabled, false) = true
  and coalesce(s.delivery_map_mode, false) = true
  and not exists (
    select 1
    from public.commerce_delivery_zones z
    where z.business_id = s.business_id
      and z.is_mapbox_default = true
  );

-- Mantém a taxa técnica sincronizada quando a configuração da loja já existir.
update public.commerce_delivery_zones z
set fee = coalesce(s.delivery_map_fee, 0),
    active = true,
    name = 'Entrega calculada pelo mapa',
    updated_at = now()
from public.commerce_settings s
where z.business_id = s.business_id
  and z.is_mapbox_default = true;

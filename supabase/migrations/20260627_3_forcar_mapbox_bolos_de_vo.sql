-- VendaFácil — ativa definitivamente o cálculo de entrega por endereço para Bolos de Vó.
-- Execute após as migrações anteriores de Mapbox.

update public.commerce_settings as settings
set
  delivery_map_enabled = true,
  delivery_map_mode = true,
  delivery_pricing_mode = 'mapbox',
  updated_at = now()
from public.businesses as business
where business.id = settings.business_id
  and business.slug = 'bolos-de-vo-2368';

-- O trigger vf_sync_mapbox_delivery_zone, criado na migração anterior,
-- cria ou atualiza a zona técnica "Entrega calculada pelo mapa".
-- Ela não aparece no checkout e serve somente para registrar o frete no pedido.

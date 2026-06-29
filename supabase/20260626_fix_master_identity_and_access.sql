-- VendaFácil — estabilização: raio por CEP + checkout sem RPC nova.
-- Execute uma única vez no SQL Editor do Supabase.
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
  select * into v_business from public.businesses where lower(slug)=lower(trim(p_slug)) limit 1;
  if not found then raise exception 'Loja não encontrada.'; end if;
  select * into v_settings from public.commerce_settings where business_id=v_business.id;
  return jsonb_build_object(
    'business', jsonb_build_object('name',v_business.name,'slug',v_business.slug,'whatsapp',v_business.whatsapp),
    'settings', coalesce(to_jsonb(v_settings)-'business_id','{}'::jsonb)
      || jsonb_build_object('pix_receiver_name',coalesce(v_settings.pix_receiver_name,v_business.name),'pix_city',coalesce(v_settings.pix_city,'BRASIL'),'contact_whatsapp',coalesce(v_settings.contact_whatsapp,v_business.whatsapp)),
    'products', coalesce((select jsonb_agg(to_jsonb(p)-'business_id' order by coalesce(p.category,''),p.name) from public.commerce_products p where p.business_id=v_business.id and p.active=true and (p.stock_quantity is null or p.stock_quantity>0)),'[]'::jsonb),
    'delivery_zones', coalesce((select jsonb_agg(to_jsonb(z)-'business_id' order by z.name) from public.commerce_delivery_zones z where z.business_id=v_business.id and z.active=true),'[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_public_store_data(text) to anon, authenticated;

create or replace function public.vf_save_commerce_payment_methods(p_business_id uuid,p_payment_methods_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business_id is null then raise exception 'A loja ativa não foi identificada.'; end if;
  if not public.vf_pos_can_manage_business(p_business_id) then raise exception 'Sem permissão para alterar os pagamentos desta loja.'; end if;
  insert into public.commerce_settings (business_id,payment_methods_config) values (p_business_id,coalesce(p_payment_methods_config,'{}'::jsonb))
  on conflict (business_id) do update set payment_methods_config=excluded.payment_methods_config,updated_at=now();
  return jsonb_build_object('payment_methods_config',coalesce(p_payment_methods_config,'{}'::jsonb));
end;
$$;
grant execute on function public.vf_save_commerce_payment_methods(uuid,jsonb) to authenticated;
commit;

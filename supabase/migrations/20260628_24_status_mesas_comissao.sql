-- VendaFácil Delivery — status operacional das mesas e comissão padrão do garçom.
-- Execute depois de 20260628_23_cadastro_mesas_areas.sql.
-- Não apaga mesas, comandas ou pedidos existentes.

begin;

alter table public.commerce_settings
  add column if not exists waiter_commission_enabled boolean not null default false,
  add column if not exists waiter_commission_percent numeric(5,2) not null default 0;

alter table public.commerce_tables
  add column if not exists service_status text not null default 'free';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'commerce_tables_service_status_check'
       and conrelid = 'public.commerce_tables'::regclass
  ) then
    alter table public.commerce_tables
      add constraint commerce_tables_service_status_check
      check (service_status in ('free','occupied','ordering','consuming','paying'));
  end if;
end;
$$;

create index if not exists commerce_tables_business_service_status_idx
  on public.commerce_tables (business_id, active, service_status, section_name, display_order, label);

create or replace function public.vf_pos_sync_table_service_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'open' then
    update public.commerce_tables
       set service_status = case when service_status = 'free' then 'occupied' else service_status end,
           updated_at = now()
     where id = new.table_id;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'open' and new.status = 'open' then
      update public.commerce_tables
         set service_status = case when service_status = 'free' then 'occupied' else service_status end,
             updated_at = now()
       where id = new.table_id;
    elsif old.status = 'open' and new.status in ('closed', 'cancelled') then
      update public.commerce_tables
         set service_status = 'free', updated_at = now()
       where id = old.table_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vf_pos_sync_table_service_status on public.commerce_table_tabs;
create trigger trg_vf_pos_sync_table_service_status
  after insert or update of status on public.commerce_table_tabs
  for each row execute function public.vf_pos_sync_table_service_status();

-- Payload do mapa ampliado com status operacional manual.
create or replace function public.vf_pos_list_tables(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_business_id is null then
    raise exception 'A loja ativa não foi identificada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar as mesas desta loja.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'label', t.label,
      'capacity', t.capacity,
      'active', t.active,
      'section_name', coalesce(nullif(trim(t.section_name), ''), 'Salão principal'),
      'display_order', coalesce(t.display_order, 0),
      'map_x', t.map_x,
      'map_y', t.map_y,
      'service_status', coalesce(t.service_status, 'free'),
      'tab', case when tab.id is null then null else public.vf_pos_table_payload(tab) end
    ) order by coalesce(nullif(trim(t.section_name), ''), 'Salão principal'), coalesce(t.display_order, 0), t.label
  ), '[]'::jsonb)
  into v_result
  from public.commerce_tables t
  left join lateral (
    select x.*
      from public.commerce_table_tabs x
     where x.table_id = t.id
       and x.status = 'open'
     order by x.updated_at desc
     limit 1
  ) tab on true
  where t.business_id = p_business_id
    and t.active = true;

  return v_result;
end;
$$;

grant execute on function public.vf_pos_list_tables(uuid) to authenticated;

-- Adaptador para a tela de gerenciamento unificada.
create or replace function public.vf_pos_list_table_setup(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_enabled boolean := false;
  v_percent numeric(5,2) := 0;
begin
  if p_business_id is null then
    raise exception 'Loja não informada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar o cadastro de mesas desta loja.';
  end if;

  perform public.vf_pos_ensure_settings_row(p_business_id);
  select coalesce(waiter_commission_enabled, false), coalesce(waiter_commission_percent, 0)
    into v_enabled, v_percent
  from public.commerce_settings
  where business_id = p_business_id;

  v_base := public.vf_pos_list_area_setup(p_business_id);
  return coalesce(v_base, '{}'::jsonb) || jsonb_build_object(
    'waiter_commission_enabled', v_enabled,
    'waiter_commission_percent', v_percent
  );
end;
$$;

grant execute on function public.vf_pos_list_table_setup(uuid) to authenticated;

create or replace function public.vf_pos_save_table_areas(
  p_business_id uuid,
  p_areas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.vf_pos_save_area_setup(p_business_id, p_areas);
  return public.vf_pos_list_table_setup(p_business_id);
end;
$$;

grant execute on function public.vf_pos_save_table_areas(uuid, jsonb) to authenticated;

create or replace function public.vf_pos_set_table_service_status(
  p_business_id uuid,
  p_table_id uuid,
  p_service_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.commerce_tables%rowtype;
  v_status text := lower(trim(coalesce(p_service_status, '')));
begin
  if p_business_id is null or p_table_id is null then
    raise exception 'Loja ou mesa não informada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para alterar o status desta mesa.';
  end if;
  if v_status not in ('free','occupied','ordering','consuming','paying') then
    raise exception 'Status de mesa inválido.';
  end if;

  update public.commerce_tables
     set service_status = v_status, updated_at = now()
   where id = p_table_id and business_id = p_business_id
   returning * into v_table;

  if not found then
    raise exception 'Mesa não encontrada nesta loja.';
  end if;

  return jsonb_build_object('id', v_table.id, 'service_status', v_table.service_status);
end;
$$;

grant execute on function public.vf_pos_set_table_service_status(uuid, uuid, text) to authenticated;

create or replace function public.vf_pos_save_waiter_commission(
  p_business_id uuid,
  p_enabled boolean,
  p_percent numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_percent numeric(5,2) := round(greatest(0, least(100, coalesce(p_percent, 0))), 2);
begin
  if p_business_id is null then
    raise exception 'Loja não informada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para alterar a comissão desta loja.';
  end if;

  perform public.vf_pos_ensure_settings_row(p_business_id);
  update public.commerce_settings
     set waiter_commission_enabled = coalesce(p_enabled, false),
         waiter_commission_percent = v_percent,
         updated_at = now()
   where business_id = p_business_id;

  return jsonb_build_object('enabled', coalesce(p_enabled, false), 'percent', v_percent);
end;
$$;

grant execute on function public.vf_pos_save_waiter_commission(uuid, boolean, numeric) to authenticated;

notify pgrst, 'reload schema';

commit;

-- VendaFácil PDV — Passo 6: mesas e comandas.
-- Execute depois de 20260627_4_pdv_balcao_pagamento.sql.
-- Mantém a comanda aberta sem baixar estoque. A baixa só ocorre ao fechar e confirmar o pagamento.

create extension if not exists pgcrypto;

create table if not exists public.commerce_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 60),
  capacity integer not null default 4 check (capacity between 1 and 99),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, label)
);

create index if not exists commerce_tables_business_active_idx
  on public.commerce_tables (business_id, active, label);

create table if not exists public.commerce_table_tabs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  table_id uuid not null references public.commerce_tables(id) on delete restrict,
  public_code text not null unique,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  customer_name text,
  customer_phone text,
  notes text,
  draft_lines jsonb not null default '[]'::jsonb,
  discount_type text not null default 'none' check (discount_type in ('none','percent','amount')),
  discount_value numeric(12,2) not null default 0 check (discount_value >= 0),
  order_id uuid references public.commerce_orders(id) on delete set null,
  opened_by uuid references auth.users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commerce_table_tabs_one_open_per_table_idx
  on public.commerce_table_tabs (table_id)
  where status = 'open';

create index if not exists commerce_table_tabs_business_status_idx
  on public.commerce_table_tabs (business_id, status, opened_at desc);

alter table public.commerce_orders
  add column if not exists table_tab_id uuid references public.commerce_table_tabs(id) on delete set null;

create index if not exists commerce_orders_table_tab_idx
  on public.commerce_orders (table_tab_id)
  where table_tab_id is not null;

alter table public.commerce_tables enable row level security;
alter table public.commerce_table_tabs enable row level security;

-- O acesso é feito pelas funções abaixo, que também atendem administradores Master.
create or replace function public.vf_pos_table_payload(p_tab public.commerce_table_tabs)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_tab.id,
    'business_id', p_tab.business_id,
    'table_id', p_tab.table_id,
    'public_code', p_tab.public_code,
    'status', p_tab.status,
    'customer_name', coalesce(p_tab.customer_name, ''),
    'customer_phone', coalesce(p_tab.customer_phone, ''),
    'notes', coalesce(p_tab.notes, ''),
    'draft_lines', coalesce(p_tab.draft_lines, '[]'::jsonb),
    'discount_type', p_tab.discount_type,
    'discount_value', p_tab.discount_value,
    'opened_at', p_tab.opened_at,
    'updated_at', p_tab.updated_at
  );
$$;

grant execute on function public.vf_pos_table_payload(public.commerce_table_tabs) to authenticated;

create or replace function public.vf_pos_list_tables(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar as mesas desta loja.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'label', t.label,
      'capacity', t.capacity,
      'active', t.active,
      'tab', case when tab.id is null then null else public.vf_pos_table_payload(tab) end
    ) order by t.label
  ), '[]'::jsonb)
  into v_result
  from public.commerce_tables t
  left join lateral (
    select x.* from public.commerce_table_tabs x
    where x.table_id = t.id and x.status = 'open'
    order by x.opened_at desc
    limit 1
  ) tab on true
  where t.business_id = p_business_id
    and t.active = true;

  return v_result;
end;
$$;

grant execute on function public.vf_pos_list_tables(uuid) to authenticated;

create or replace function public.vf_pos_create_table(
  p_business_id uuid,
  p_label text,
  p_capacity integer default 4
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.commerce_tables%rowtype;
  v_label text := nullif(trim(coalesce(p_label, '')), '');
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para criar mesa nesta loja.';
  end if;
  if v_label is null then
    raise exception 'Informe o nome ou número da mesa.';
  end if;
  if char_length(v_label) > 60 then
    raise exception 'O nome da mesa pode ter no máximo 60 caracteres.';
  end if;

  insert into public.commerce_tables (business_id, label, capacity)
  values (p_business_id, v_label, greatest(1, least(99, coalesce(p_capacity, 4))))
  returning * into v_table;

  return jsonb_build_object('id', v_table.id, 'label', v_table.label, 'capacity', v_table.capacity, 'active', v_table.active, 'tab', null);
exception
  when unique_violation then
    raise exception 'Já existe uma mesa com esse nome.';
end;
$$;

grant execute on function public.vf_pos_create_table(uuid, text, integer) to authenticated;

create or replace function public.vf_pos_open_table_tab(
  p_business_id uuid,
  p_table_id uuid,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.commerce_tables%rowtype;
  v_tab public.commerce_table_tabs%rowtype;
  v_code text;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para abrir comanda nesta loja.';
  end if;

  select * into v_table
  from public.commerce_tables
  where id = p_table_id and business_id = p_business_id and active = true
  for update;
  if not found then
    raise exception 'Mesa não encontrada ou inativa.';
  end if;

  select * into v_tab
  from public.commerce_table_tabs
  where table_id = p_table_id and status = 'open'
  for update;
  if found then
    return public.vf_pos_table_payload(v_tab);
  end if;

  loop
    v_code := 'CMD' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    exit when not exists (select 1 from public.commerce_table_tabs where public_code = v_code);
  end loop;

  insert into public.commerce_table_tabs (
    business_id, table_id, public_code, customer_name, customer_phone, notes, opened_by
  ) values (
    p_business_id, p_table_id, v_code,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning * into v_tab;

  return public.vf_pos_table_payload(v_tab);
end;
$$;

grant execute on function public.vf_pos_open_table_tab(uuid, uuid, text, text, text) to authenticated;

create or replace function public.vf_pos_save_table_tab(
  p_business_id uuid,
  p_tab_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes text,
  p_lines jsonb,
  p_discount_type text default 'none',
  p_discount_value numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.commerce_table_tabs%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_discount_type text := lower(trim(coalesce(p_discount_type, 'none')));
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para atualizar esta comanda.';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Os itens da comanda estão inválidos.';
  end if;
  if jsonb_array_length(p_lines) > 80 then
    raise exception 'A comanda possui itens demais.';
  end if;
  if v_discount_type not in ('none','percent','amount') then
    raise exception 'Tipo de desconto inválido.';
  end if;

  select * into v_tab
  from public.commerce_table_tabs
  where id = p_tab_id and business_id = p_business_id and status = 'open'
  for update;
  if not found then
    raise exception 'Esta comanda não está mais aberta.';
  end if;

  for v_item in select value from jsonb_array_elements(p_lines)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Há um item inválido na comanda.';
    end;
    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'A quantidade de cada item deve ficar entre 1 e 99.';
    end if;
    if not exists (
      select 1 from public.commerce_products p
      where p.id = v_product_id and p.business_id = p_business_id and p.active = true
    ) then
      raise exception 'Um dos produtos não está mais disponível.';
    end if;
  end loop;

  update public.commerce_table_tabs
  set customer_name = nullif(trim(coalesce(p_customer_name, '')), ''),
      customer_phone = nullif(trim(coalesce(p_customer_phone, '')), ''),
      notes = nullif(trim(coalesce(p_notes, '')), ''),
      draft_lines = p_lines,
      discount_type = v_discount_type,
      discount_value = greatest(0, coalesce(p_discount_value, 0)),
      updated_at = now()
  where id = v_tab.id
  returning * into v_tab;

  return public.vf_pos_table_payload(v_tab);
end;
$$;

grant execute on function public.vf_pos_save_table_tab(uuid, uuid, text, text, text, jsonb, text, numeric) to authenticated;

create or replace function public.vf_pos_transfer_table_tab(
  p_business_id uuid,
  p_tab_id uuid,
  p_target_table_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.commerce_table_tabs%rowtype;
  v_target public.commerce_tables%rowtype;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para transferir esta comanda.';
  end if;

  select * into v_tab
  from public.commerce_table_tabs
  where id = p_tab_id and business_id = p_business_id and status = 'open'
  for update;
  if not found then raise exception 'Comanda não encontrada ou já encerrada.'; end if;

  select * into v_target
  from public.commerce_tables
  where id = p_target_table_id and business_id = p_business_id and active = true
  for update;
  if not found then raise exception 'Mesa de destino não encontrada.'; end if;
  if v_target.id = v_tab.table_id then return public.vf_pos_table_payload(v_tab); end if;
  if exists (select 1 from public.commerce_table_tabs where table_id = v_target.id and status = 'open') then
    raise exception 'A mesa de destino já possui uma comanda aberta.';
  end if;

  update public.commerce_table_tabs
  set table_id = v_target.id, updated_at = now()
  where id = v_tab.id
  returning * into v_tab;

  return public.vf_pos_table_payload(v_tab);
end;
$$;

grant execute on function public.vf_pos_transfer_table_tab(uuid, uuid, uuid) to authenticated;

create or replace function public.vf_pos_split_table_tab(
  p_business_id uuid,
  p_source_tab_id uuid,
  p_target_table_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.commerce_table_tabs%rowtype;
  v_target_table public.commerce_tables%rowtype;
  v_target public.commerce_table_tabs%rowtype;
  v_line jsonb;
  v_pick jsonb;
  v_selected_qty integer;
  v_original_qty integer;
  v_new_source jsonb := '[]'::jsonb;
  v_target_lines jsonb := '[]'::jsonb;
  v_code text;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para dividir esta comanda.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecione ao menos um item para dividir.';
  end if;

  select * into v_source
  from public.commerce_table_tabs
  where id = p_source_tab_id and business_id = p_business_id and status = 'open'
  for update;
  if not found then raise exception 'Comanda de origem não encontrada.'; end if;

  select * into v_target_table
  from public.commerce_tables
  where id = p_target_table_id and business_id = p_business_id and active = true
  for update;
  if not found then raise exception 'Mesa de destino não encontrada.'; end if;
  if v_target_table.id = v_source.table_id then raise exception 'Escolha outra mesa para dividir a conta.'; end if;
  if exists (select 1 from public.commerce_table_tabs where table_id = v_target_table.id and status = 'open') then
    raise exception 'A mesa de destino já possui uma comanda aberta.';
  end if;

  for v_line in select value from jsonb_array_elements(v_source.draft_lines)
  loop
    select value into v_pick
    from jsonb_array_elements(p_items)
    where value->>'line_id' = v_line->>'line_id'
    limit 1;

    v_original_qty := greatest(0, coalesce((v_line->>'quantity')::integer, 0));
    v_selected_qty := greatest(0, coalesce((v_pick->>'quantity')::integer, 0));
    if v_selected_qty > v_original_qty then
      raise exception 'A quantidade selecionada é maior que a da comanda.';
    end if;

    if v_selected_qty > 0 then
      v_target_lines := v_target_lines || jsonb_build_array(
        jsonb_set(v_line, '{quantity}', to_jsonb(v_selected_qty), true)
      );
    end if;
    if v_original_qty - v_selected_qty > 0 then
      v_new_source := v_new_source || jsonb_build_array(
        jsonb_set(v_line, '{quantity}', to_jsonb(v_original_qty - v_selected_qty), true)
      );
    end if;
  end loop;

  if jsonb_array_length(v_target_lines) = 0 then
    raise exception 'Nenhum item válido foi selecionado para dividir.';
  end if;

  loop
    v_code := 'CMD' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    exit when not exists (select 1 from public.commerce_table_tabs where public_code = v_code);
  end loop;

  update public.commerce_table_tabs
  set draft_lines = v_new_source, updated_at = now()
  where id = v_source.id
  returning * into v_source;

  insert into public.commerce_table_tabs (
    business_id, table_id, public_code, customer_name, customer_phone, notes,
    draft_lines, discount_type, discount_value, opened_by
  ) values (
    p_business_id, v_target_table.id, v_code, v_source.customer_name, v_source.customer_phone,
    v_source.notes, v_target_lines, 'none', 0, auth.uid()
  ) returning * into v_target;

  return jsonb_build_object(
    'source_tab', public.vf_pos_table_payload(v_source),
    'target_tab', public.vf_pos_table_payload(v_target)
  );
end;
$$;

grant execute on function public.vf_pos_split_table_tab(uuid, uuid, uuid, jsonb) to authenticated;

create or replace function public.vf_pos_close_table_tab(
  p_business_id uuid,
  p_tab_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_notes text,
  p_payment_method text,
  p_amount_received numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tab public.commerce_table_tabs%rowtype;
  v_sale jsonb;
  v_order_id uuid;
  v_final_notes text;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para fechar esta comanda.';
  end if;

  select * into v_tab
  from public.commerce_table_tabs
  where id = p_tab_id and business_id = p_business_id and status = 'open'
  for update;
  if not found then raise exception 'Esta comanda não está mais aberta.'; end if;
  if jsonb_typeof(v_tab.draft_lines) <> 'array' or jsonb_array_length(v_tab.draft_lines) = 0 then
    raise exception 'Adicione ao menos um produto antes de fechar a comanda.';
  end if;

  v_final_notes := nullif(trim(concat_ws(E'\n', nullif(trim(coalesce(v_tab.notes, '')), ''), nullif(trim(coalesce(p_notes, '')), ''))), '');

  v_sale := public.vf_pos_create_sale(
    p_business_id,
    coalesce(nullif(trim(coalesce(p_buyer_name, '')), ''), v_tab.customer_name, 'Consumidor final'),
    coalesce(nullif(trim(coalesce(p_buyer_phone, '')), ''), v_tab.customer_phone),
    v_final_notes,
    v_tab.draft_lines,
    p_payment_method,
    true,
    p_amount_received,
    v_tab.discount_type,
    v_tab.discount_value
  );

  v_order_id := (v_sale->>'id')::uuid;
  update public.commerce_orders
  set table_tab_id = v_tab.id,
      order_source = 'pos_table',
      updated_at = now()
  where id = v_order_id;

  update public.commerce_table_tabs
  set status = 'closed', order_id = v_order_id, closed_at = now(), updated_at = now()
  where id = v_tab.id;

  return v_sale || jsonb_build_object('table_tab_id', v_tab.id, 'table_id', v_tab.table_id, 'source', 'pos_table');
end;
$$;

grant execute on function public.vf_pos_close_table_tab(uuid, uuid, text, text, text, text, numeric) to authenticated;

begin;

alter table public.commerce_settings
  add column if not exists dining_areas jsonb not null default '[]'::jsonb;

create or replace function public.vf_pos_ensure_settings_row(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_business_id is null then
    raise exception 'Loja não informada.';
  end if;

  insert into public.commerce_settings (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;
end;
$$;

grant execute on function public.vf_pos_ensure_settings_row(uuid) to authenticated;

create or replace function public.vf_pos_list_area_setup(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_areas jsonb := '[]'::jsonb;
  v_tables jsonb := '[]'::jsonb;
begin
  if p_business_id is null then
    raise exception 'Loja não informada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar o cadastro de mesas desta loja.';
  end if;

  perform public.vf_pos_ensure_settings_row(p_business_id);

  select coalesce(cs.dining_areas, '[]'::jsonb)
    into v_areas
  from public.commerce_settings cs
  where cs.business_id = p_business_id;

  if jsonb_typeof(v_areas) <> 'array' then
    v_areas := '[]'::jsonb;
  end if;

  if jsonb_array_length(v_areas) = 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', 'legacy-' || md5(lower(trim(section_name))),
          'name', section_name,
          'display_order', row_number() over (order by min_order, section_name) - 1
        )
        order by min_order, section_name
      ),
      '[]'::jsonb
    )
    into v_areas
    from (
      select trim(section_name) as section_name, min(coalesce(display_order, 0)) as min_order
      from public.commerce_tables
      where business_id = p_business_id
        and active = true
        and nullif(trim(section_name), '') is not null
      group by trim(section_name)
    ) sections;
  end if;

  if jsonb_array_length(v_areas) = 0 then
    v_areas := jsonb_build_array(
      jsonb_build_object('id', 'default-salao', 'name', 'Salão principal', 'display_order', 0)
    );
  end if;

  select public.vf_pos_list_tables(p_business_id)
    into v_tables;

  return jsonb_build_object(
    'areas', v_areas,
    'tables', coalesce(v_tables, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.vf_pos_list_area_setup(uuid) to authenticated;

create or replace function public.vf_pos_save_area_setup(
  p_business_id uuid,
  p_areas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_name text;
  v_prev text;
  v_order integer;
  v_list jsonb := '[]'::jsonb;
  v_lower_names text[] := '{}'::text[];
  v_first_name text;
begin
  if p_business_id is null then
    raise exception 'Loja não informada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para salvar áreas desta loja.';
  end if;
  if jsonb_typeof(coalesce(p_areas, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de áreas inválida.';
  end if;

  perform public.vf_pos_ensure_settings_row(p_business_id);

  for v_item in select value from jsonb_array_elements(coalesce(p_areas, '[]'::jsonb)) loop
    v_name := nullif(trim(coalesce(v_item->>'name', '')), '');
    if v_name is null then
      continue;
    end if;
    if char_length(v_name) > 60 then
      raise exception 'O nome da área pode ter no máximo 60 caracteres.';
    end if;
    if lower(v_name) = any(v_lower_names) then
      raise exception 'Existem áreas com nomes repetidos.';
    end if;
    v_lower_names := array_append(v_lower_names, lower(v_name));
    v_prev := nullif(trim(coalesce(v_item->>'previous_name', '')), '');
    v_order := greatest(0, coalesce(nullif(v_item->>'display_order', '')::integer, jsonb_array_length(v_list)));
    v_list := v_list || jsonb_build_array(
      jsonb_build_object(
        'id', coalesce(nullif(v_item->>'id', ''), 'area-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
        'name', v_name,
        'previous_name', coalesce(v_prev, v_name),
        'display_order', v_order
      )
    );
  end loop;

  if jsonb_array_length(v_list) = 0 then
    v_list := jsonb_build_array(
      jsonb_build_object('id', 'default-salao', 'name', 'Salão principal', 'previous_name', 'Salão principal', 'display_order', 0)
    );
  end if;

  v_first_name := v_list->0->>'name';

  for v_item in select value from jsonb_array_elements(v_list) loop
    if lower(trim(coalesce(v_item->>'previous_name', ''))) <> lower(trim(coalesce(v_item->>'name', ''))) then
      update public.commerce_tables
         set section_name = v_item->>'name',
             updated_at = now()
       where business_id = p_business_id
         and lower(trim(coalesce(section_name, ''))) = lower(trim(coalesce(v_item->>'previous_name', '')));
    end if;
  end loop;

  update public.commerce_tables t
     set section_name = v_first_name,
         updated_at = now()
   where t.business_id = p_business_id
     and t.active = true
     and not exists (
       select 1
       from jsonb_array_elements(v_list) area(value)
       where lower(trim(coalesce(t.section_name, ''))) = lower(trim(coalesce(area.value->>'name', '')))
     );

  update public.commerce_settings
     set dining_areas = (
       select coalesce(jsonb_agg(
         jsonb_build_object(
           'id', value->>'id',
           'name', value->>'name',
           'display_order', coalesce(nullif(value->>'display_order', '')::integer, 0)
         )
         order by coalesce(nullif(value->>'display_order', '')::integer, 0), value->>'name'
       ), '[]'::jsonb)
       from jsonb_array_elements(v_list) saved(value)
     ),
     updated_at = now()
   where business_id = p_business_id;

  return public.vf_pos_list_area_setup(p_business_id);
end;
$$;

grant execute on function public.vf_pos_save_area_setup(uuid, jsonb) to authenticated;

create or replace function public.vf_pos_create_table_v2(
  p_business_id uuid,
  p_label text,
  p_capacity integer default 4,
  p_section_name text default null,
  p_display_order integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.commerce_tables%rowtype;
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_section text := nullif(trim(coalesce(p_section_name, '')), '');
begin
  if p_business_id is null then
    raise exception 'Loja não informada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para criar mesa nesta loja.';
  end if;
  if v_label is null then
    raise exception 'Informe o nome ou número da mesa.';
  end if;
  if char_length(v_label) > 60 then
    raise exception 'O nome da mesa pode ter no máximo 60 caracteres.';
  end if;

  perform public.vf_pos_ensure_settings_row(p_business_id);

  if v_section is null then
    select coalesce(dining_areas->0->>'name', 'Salão principal')
      into v_section
    from public.commerce_settings
    where business_id = p_business_id;
  end if;

  insert into public.commerce_tables (
    business_id, label, capacity, section_name, display_order
  ) values (
    p_business_id,
    v_label,
    greatest(1, least(99, coalesce(p_capacity, 4))),
    coalesce(v_section, 'Salão principal'),
    greatest(0, coalesce(p_display_order, 0))
  )
  returning * into v_table;

  return jsonb_build_object(
    'id', v_table.id,
    'label', v_table.label,
    'capacity', v_table.capacity,
    'active', v_table.active,
    'section_name', v_table.section_name,
    'display_order', v_table.display_order,
    'tab', null
  );
exception
  when unique_violation then
    raise exception 'Já existe uma mesa com esse nome.';
end;
$$;

grant execute on function public.vf_pos_create_table_v2(uuid, text, integer, text, integer) to authenticated;

create or replace function public.vf_pos_update_table_setup(
  p_business_id uuid,
  p_table_id uuid,
  p_label text default null,
  p_capacity integer default null,
  p_section_name text default null,
  p_display_order integer default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table public.commerce_tables%rowtype;
  v_tab public.commerce_table_tabs%rowtype;
  v_label text;
  v_section text;
  v_capacity integer;
  v_display integer;
  v_active boolean;
begin
  if p_business_id is null or p_table_id is null then
    raise exception 'Loja ou mesa não informada.';
  end if;
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para alterar mesa nesta loja.';
  end if;

  select *
    into v_table
  from public.commerce_tables
  where id = p_table_id
    and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Mesa não encontrada nesta loja.';
  end if;

  select *
    into v_tab
  from public.commerce_table_tabs
  where table_id = p_table_id
    and status = 'open'
  order by updated_at desc
  limit 1;

  v_label := coalesce(nullif(trim(coalesce(p_label, '')), ''), v_table.label);
  v_section := coalesce(nullif(trim(coalesce(p_section_name, '')), ''), v_table.section_name, 'Salão principal');
  v_capacity := greatest(1, least(99, coalesce(p_capacity, v_table.capacity, 4)));
  v_display := greatest(0, coalesce(p_display_order, v_table.display_order, 0));
  v_active := coalesce(p_active, v_table.active);

  if char_length(v_label) > 60 then
    raise exception 'O nome da mesa pode ter no máximo 60 caracteres.';
  end if;
  if not v_active and v_tab.id is not null then
    raise exception 'Não é possível desativar uma mesa com comanda aberta.';
  end if;

  update public.commerce_tables
     set label = v_label,
         capacity = v_capacity,
         section_name = v_section,
         display_order = v_display,
         active = v_active,
         updated_at = now()
   where id = p_table_id
   returning * into v_table;

  return jsonb_build_object(
    'id', v_table.id,
    'label', v_table.label,
    'capacity', v_table.capacity,
    'active', v_table.active,
    'section_name', v_table.section_name,
    'display_order', v_table.display_order,
    'tab', case when v_tab.id is null then null else public.vf_pos_table_payload(v_tab) end
  );
exception
  when unique_violation then
    raise exception 'Já existe uma mesa com esse nome.';
end;
$$;

grant execute on function public.vf_pos_update_table_setup(uuid, uuid, text, integer, text, integer, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;

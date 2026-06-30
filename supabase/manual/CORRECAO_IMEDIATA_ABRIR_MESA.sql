-- Correção: evita window function dentro de jsonb_agg ao abrir/gerenciar mesas.
-- Pode ser executado com segurança mesmo após a migração de Mesas, Áreas e Status.

begin;

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

  -- A numeração é calculada em uma subconsulta antes de montar o JSON.
  -- PostgreSQL não aceita window function dentro do argumento de jsonb_agg.
  if jsonb_array_length(v_areas) = 0 then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', 'legacy-' || md5(lower(sections.section_name)),
          'name', sections.section_name,
          'display_order', sections.display_order
        )
        order by sections.min_order, sections.section_name
      ),
      '[]'::jsonb
    )
    into v_areas
    from (
      select grouped.section_name,
             grouped.min_order,
             row_number() over (order by grouped.min_order, grouped.section_name) - 1 as display_order
      from (
        select trim(section_name) as section_name,
               min(coalesce(display_order, 0)) as min_order
        from public.commerce_tables
        where business_id = p_business_id
          and active = true
          and nullif(trim(section_name), '') is not null
        group by trim(section_name)
      ) grouped
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

notify pgrst, 'reload schema';

commit;

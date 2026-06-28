-- VendaFácil PDV — proteção adicional de mesas.
-- Execute depois de 20260627_5_pdv_mesas_comandas.sql.
-- Esta migração não altera mesas existentes. Apenas impede que cache antigo gere erro de NOT NULL pouco claro.

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
  if p_business_id is null then
    raise exception 'A loja ativa não foi identificada. Atualize a Frente de Caixa e tente novamente.';
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

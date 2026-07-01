-- FechAí — usuário único por loja
-- Permite que o mesmo usuário (ex.: "matheus") exista em lojas diferentes.
-- Não altera pedidos, produtos, clientes, estoque ou PINs.

begin;

-- Segurança: não troca a regra caso já existam dois acessos com o mesmo usuário
-- dentro da MESMA loja. Corrija esses casos antes de executar novamente.
do $$
declare
  v_examples text;
begin
  select string_agg(format('%s / %s', username, business_id), ', ')
    into v_examples
  from (
    select lower(trim(username)) as username, business_id
    from public.employees
    where nullif(trim(username), '') is not null
    group by lower(trim(username)), business_id
    having count(*) > 1
    order by lower(trim(username))
    limit 10
  ) duplicates;

  if v_examples is not null then
    raise exception 'Existem usuários repetidos na mesma loja: %. Ajuste-os antes de aplicar esta atualização.', v_examples;
  end if;
end $$;

-- Remove apenas a restrição antiga que exigia username único em todo o sistema.
-- A busca é dinâmica para funcionar mesmo se o nome da constraint for diferente.
do $$
declare
  v_constraint_name text;
begin
  for v_constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'employees'
      and c.contype = 'u'
      and cardinality(c.conkey) = 1
      and exists (
        select 1
        from pg_attribute a
        where a.attrelid = t.oid
          and a.attnum = c.conkey[1]
          and a.attname = 'username'
          and not a.attisdropped
      )
  loop
    execute format('alter table public.employees drop constraint if exists %I', v_constraint_name);
  end loop;
end $$;

-- Índice composto: o mesmo usuário pode existir em lojas diferentes,
-- mas não pode se repetir na mesma loja, mesmo variando maiúsculas/minúsculas.
drop index if exists public.employees_business_username_unique_idx;
create unique index employees_business_username_unique_idx
  on public.employees (business_id, lower(trim(username)))
  where nullif(trim(username), '') is not null;

commit;

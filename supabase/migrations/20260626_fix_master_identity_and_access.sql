-- VendaFácil V14 — correção da identidade Master e do acesso ao gerenciador.
-- Execute no SQL Editor do Supabase APÓS as migrações anteriores.
-- A conta Master oficial desta plataforma é:
-- MATHEUS JESUS DE ARAUJO · matheuzaraujo17@gmail.com

create table if not exists public.vf_platform_master_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);

alter table public.vf_platform_master_users enable row level security;

-- Nenhuma conta do frontend pode listar ou alterar administradores da plataforma.
drop policy if exists vf_platform_master_users_no_direct_access on public.vf_platform_master_users;
create policy vf_platform_master_users_no_direct_access
  on public.vf_platform_master_users
  for all to authenticated
  using (false)
  with check (false);

-- A função usada pelos módulos Master passa a consultar uma lista explícita,
-- em vez de considerar a primeira loja criada como conta administradora.
create or replace function public.vf_is_platform_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vf_platform_master_users master_user
    where master_user.user_id = auth.uid()
  );
$$;

grant execute on function public.vf_is_platform_master() to authenticated;

-- Define somente a conta correta como Master. A conta precisa existir em
-- Authentication > Users antes de rodar este script.
do $$
declare
  v_master_user_id uuid;
begin
  select id
    into v_master_user_id
  from auth.users
  where lower(email) = lower('matheuzaraujo17@gmail.com')
  limit 1;

  if v_master_user_id is null then
    raise exception 'A conta Master matheuzaraujo17@gmail.com não foi encontrada em Authentication > Users. Crie ou confirme essa conta antes de executar esta migração.';
  end if;

  delete from public.vf_platform_master_users
  where user_id <> v_master_user_id;

  insert into public.vf_platform_master_users (user_id, note)
  values (v_master_user_id, 'Administrador oficial da plataforma VendaFácil')
  on conflict (user_id) do update
    set note = excluded.note;
end;
$$;

-- Força o PostgREST/Supabase a recarregar o schema e as funções RPC.
notify pgrst, 'reload schema';

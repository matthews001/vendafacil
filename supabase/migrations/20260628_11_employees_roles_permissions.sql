-- FechAí - Migração para Gestão de Acessos e Funcionários
-- Cria tabelas para funcionários, perfis (roles) e permissões.

begin;

-- Tabela de perfis (roles) para funcionários
create table if not exists public.employee_roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

alter table public.employee_roles enable row level security;

create policy "Business owners can manage employee roles" on public.employee_roles
  for all using (public.is_commerce_business_owner(business_id));

-- Tabela de funcionários
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null, -- Link opcional para auth.users
  role_id uuid not null references public.employee_roles(id) on delete restrict,
  name text not null check (char_length(trim(name)) >= 2),
  username text unique check (char_length(trim(username)) >= 3), -- Usuário para login interno
  pin text check (char_length(trim(pin)) = 4), -- PIN de 4 dígitos para acesso rápido
  email text,
  phone text,
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees enable row level security;

create policy "Business owners can manage employees" on public.employees
  for all using (public.is_commerce_business_owner(business_id));

-- Tabela de permissões disponíveis
create table if not exists public.permissions (
  id text primary key, -- Ex: 'dashboard_view', 'orders_manage'
  description text not null
);

-- Inserir permissões padrão (se não existirem)
insert into public.permissions (id, description) values
  ('dashboard_view', 'Visualizar Dashboard'),
  ('orders_manage', 'Gerenciar Pedidos'),
  ('kds_view', 'Visualizar KDS / Display de Cozinha'),
  ('cashier_access', 'Acesso ao Caixa'),
  ('pdv_access', 'Acesso ao PDV / Balcão'),
  ('tables_manage', 'Gerenciar Mesas'),
  ('store_open_close', 'Abrir e Fechar Loja'),
  ('orders_delete', 'Excluir Pedidos'),
  ('menu_edit', 'Editar Cardápio'),
  ('reports_view', 'Visualizar Relatórios'),
  ('orders_history_view', 'Visualizar Histórico de Pedidos'),
  ('customers_view', 'Visualizar Clientes'),
  ('reviews_manage', 'Gerenciar Avaliações'),
  ('marketing_manage', 'Gerenciar Marketing'),
  ('stock_manage', 'Gerenciar Estoque'),
  ('settings_manage', 'Gerenciar Configurações da Loja'),
  ('coupons_manage', 'Gerenciar Cupons'),
  ('loyalty_manage', 'Gerenciar Programa de Fidelidade')
on conflict (id) do nothing;

-- Tabela de relacionamento entre perfis e permissões
create table if not exists public.role_permissions (
  role_id uuid not null references public.employee_roles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

alter table public.role_permissions enable row level security;

create policy "Business owners can manage role permissions" on public.role_permissions
  for all using (exists (select 1 from public.employee_roles r where r.id = role_id and public.is_commerce_business_owner(r.business_id)));

-- Função para verificar permissão de um usuário/funcionário
create or replace function public.has_permission(p_permission_id text, p_user_id uuid default auth.uid())
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_employee_role_id uuid;
begin
  -- Obter o business_id do usuário logado
  select business_id into v_business_id from public.businesses where owner_id = p_user_id limit 1;

  -- Se o usuário for um funcionário, obter o role_id
  select role_id into v_employee_role_id from public.employees where user_id = p_user_id and business_id = v_business_id limit 1;

  -- Verificar se o perfil do funcionário tem a permissão
  if v_employee_role_id is not null then
    return exists (
      select 1 from public.role_permissions
      where role_id = v_employee_role_id
        and permission_id = p_permission_id
    );
  end if;

  -- Para o owner, todas as permissões são concedidas
  if v_business_id is not null and exists (select 1 from public.businesses where id = v_business_id and owner_id = p_user_id) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.has_permission(text, uuid) to authenticated;

commit;

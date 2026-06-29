-- VendaFácil — Painel de Entregador e Despacho de Entregas
-- Atualização isolada: não recria pedidos, estoque, PIX, cardápio ou assinaturas.
-- Execute uma única vez no SQL Editor do Supabase, depois da migration de Acessos.

begin;

create extension if not exists pgcrypto;

-- Garante as estruturas usadas pelo módulo de Acessos, sem alterar funcionários existentes.
alter table public.employees
  add column if not exists profile_key text,
  add column if not exists auth_login_email text,
  add column if not exists pin_changed_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create table if not exists public.employee_permission_overrides (
  employee_id uuid not null references public.employees(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (employee_id, permission_id)
);

alter table public.employee_permission_overrides enable row level security;

drop policy if exists "Business owners can manage employee permission overrides" on public.employee_permission_overrides;
create policy "Business owners can manage employee permission overrides"
  on public.employee_permission_overrides
  for all
  to authenticated
  using (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and public.is_commerce_business_owner(e.business_id)
    )
  )
  with check (
    exists (
      select 1 from public.employees e
      where e.id = employee_id
        and public.is_commerce_business_owner(e.business_id)
    )
  );

-- Permissões novas, separando o despacho feito pela loja do portal do entregador.
insert into public.permissions (id, description) values
  ('delivery_dispatch', 'Direcionar pedidos para entregadores e acompanhar rotas'),
  ('delivery_portal', 'Acessar somente o portal de entregas designadas')
on conflict (id) do update set description = excluded.description;

-- Aplica as permissões aos perfis já existentes em todas as lojas.
insert into public.role_permissions (role_id, permission_id)
select r.id, rules.permission_id
from public.employee_roles r
join (values
  ('Gerente'::text, 'delivery_dispatch'::text),
  ('Entregador'::text, 'delivery_portal'::text)
) as rules(role_name, permission_id)
  on lower(r.name) = lower(rules.role_name)
on conflict (role_id, permission_id) do nothing;

-- Novas lojas passam a receber os mesmos perfis completos.
create or replace function public.vf_employee_ensure_default_roles(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
  v_permission_ids jsonb;
  v_role_id uuid;
  v_roles jsonb := jsonb_build_object(
    'Gerente', jsonb_build_array(
      'dashboard_view','orders_manage','kds_view','cashier_access','pdv_access','tables_manage',
      'store_open_close','orders_delete','menu_edit','reports_view','orders_history_view','customers_view',
      'reviews_manage','marketing_manage','loyalty_manage','coupons_manage','stock_manage','settings_manage',
      'whatsapp_manage','business_hours_manage','delivery_zones_manage','appointments_manage',
      'payment_methods_manage','integrations_manage','qr_codes_manage','links_view','delivery_dispatch'
    ),
    'Caixa', jsonb_build_array('dashboard_view','orders_manage','cashier_access','pdv_access','tables_manage','customers_view','orders_history_view'),
    'Cozinha', jsonb_build_array('orders_manage','kds_view'),
    'Garçom', jsonb_build_array('dashboard_view','orders_manage','pdv_access','tables_manage','customers_view'),
    'Entregador', jsonb_build_array('delivery_portal'),
    'Funcionário', jsonb_build_array('orders_manage')
  );
begin
  if not public.is_commerce_business_owner(p_business_id) then
    raise exception 'Sem permissão para configurar acessos desta loja.';
  end if;

  for v_role_name, v_permission_ids in
    select key, value from jsonb_each(v_roles)
  loop
    insert into public.employee_roles (business_id, name, description, is_default)
    values (
      p_business_id,
      v_role_name,
      case v_role_name
        when 'Gerente' then 'Acesso amplo à operação e despacho de entregas.'
        when 'Caixa' then 'Recebimentos, pedidos e vendas de balcão.'
        when 'Cozinha' then 'Acompanhamento e preparo dos pedidos.'
        when 'Garçom' then 'Pedidos, mesas e atendimento no salão.'
        when 'Entregador' then 'Visualiza apenas as entregas que forem direcionadas para ele.'
        else 'Acesso básico aos pedidos liberados.'
      end,
      true
    )
    on conflict (business_id, name) do update
      set description = excluded.description,
          is_default = true,
          updated_at = now();

    select id into v_role_id
    from public.employee_roles
    where business_id = p_business_id and name = v_role_name;

    insert into public.role_permissions (role_id, permission_id)
    select v_role_id, value
    from jsonb_array_elements_text(v_permission_ids)
    on conflict (role_id, permission_id) do nothing;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.vf_employee_ensure_default_roles(uuid) from public;
grant execute on function public.vf_employee_ensure_default_roles(uuid) to authenticated;

-- Uma entrega tem no máximo um entregador direcionado por vez. O histórico do pedido
-- continua em commerce_order_status_history; esta tabela guarda o responsável e as etapas da rota.
create table if not exists public.commerce_delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null unique references public.commerce_orders(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned', 'out_for_delivery', 'delivered', 'cancelled')),
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists commerce_delivery_assignments_business_status_idx
  on public.commerce_delivery_assignments (business_id, status, assigned_at desc);
create index if not exists commerce_delivery_assignments_employee_status_idx
  on public.commerce_delivery_assignments (employee_id, status, assigned_at desc);

alter table public.commerce_delivery_assignments enable row level security;

drop policy if exists "Business owners can view delivery assignments" on public.commerce_delivery_assignments;
create policy "Business owners can view delivery assignments"
  on public.commerce_delivery_assignments
  for select
  to authenticated
  using (public.is_commerce_business_owner(business_id));

-- Funções internas usadas pelas RPCs abaixo.
create or replace function public.vf_delivery_can_dispatch(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_commerce_business_owner(p_business_id)
  or exists (
    select 1
    from public.employees e
    where e.user_id = auth.uid()
      and e.business_id = p_business_id
      and e.is_active = true
      and (
        exists (
          select 1 from public.employee_permission_overrides o
          where o.employee_id = e.id
            and o.permission_id = 'delivery_dispatch'
            and o.allowed = true
        )
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = e.role_id
            and rp.permission_id = 'delivery_dispatch'
        )
      )
  );
$$;

create or replace function public.vf_delivery_employee_is_driver(
  p_employee_id uuid,
  p_business_id uuid
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.employees e
    left join public.employee_roles r on r.id = e.role_id
    where e.id = p_employee_id
      and e.business_id = p_business_id
      and e.is_active = true
      and (
        lower(coalesce(e.profile_key, '')) = 'entregador'
        or lower(coalesce(r.name, '')) = 'entregador'
        or exists (
          select 1 from public.employee_permission_overrides o
          where o.employee_id = e.id
            and o.permission_id = 'delivery_portal'
            and o.allowed = true
        )
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = e.role_id
            and rp.permission_id = 'delivery_portal'
        )
      )
  );
$$;

revoke all on function public.vf_delivery_can_dispatch(uuid) from public;
revoke all on function public.vf_delivery_employee_is_driver(uuid, uuid) from public;

-- Lista apenas entregadores ativos da loja para o despacho administrativo.
create or replace function public.vf_delivery_dispatch_drivers(p_business_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.vf_delivery_can_dispatch(p_business_id) then
    raise exception 'Sem permissão para gerenciar entregas desta loja.';
  end if;

  select coalesce(jsonb_agg(row_data order by lower(row_data->>'name')), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'username', e.username,
      'phone', e.phone,
      'profile', coalesce(e.profile_key, r.name, 'Entregador')
    ) as row_data
    from public.employees e
    left join public.employee_roles r on r.id = e.role_id
    where e.business_id = p_business_id
      and public.vf_delivery_employee_is_driver(e.id, p_business_id)
  ) drivers;

  return v_result;
end;
$$;

-- Mostra somente pedidos de entrega que precisam ser despachados ou já estão em rota.
create or replace function public.vf_delivery_dispatch_list(
  p_business_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
begin
  if not public.vf_delivery_can_dispatch(p_business_id) then
    raise exception 'Sem permissão para gerenciar entregas desta loja.';
  end if;

  select coalesce(jsonb_agg(row_data order by
    case row_data->>'status' when 'out_for_delivery' then 0 else 1 end,
    (row_data->>'created_at')::timestamptz asc
  ), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', o.id,
      'public_code', o.public_code,
      'buyer_name', o.buyer_name,
      'buyer_phone', o.buyer_phone,
      'status', o.status,
      'total_amount', o.total_amount,
      'payment_method', o.payment_method,
      'delivery_address', o.delivery_address,
      'created_at', o.created_at,
      'employee_id', a.employee_id,
      'driver_name', e.name,
      'assignment_status', a.status,
      'assigned_at', a.assigned_at,
      'started_at', a.started_at
    ) as row_data
    from public.commerce_orders o
    left join public.commerce_delivery_assignments a on a.order_id = o.id
    left join public.employees e on e.id = a.employee_id
    where o.business_id = p_business_id
      and o.fulfillment_type = 'delivery'
      and o.status in ('preparing', 'out_for_delivery')
    order by case o.status when 'out_for_delivery' then 0 else 1 end, o.created_at asc
    limit v_limit
  ) rows;

  return v_result;
end;
$$;

-- Direciona, ou troca, o entregador antes da saída da rota.
create or replace function public.vf_delivery_dispatch_order(
  p_order_id uuid,
  p_employee_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_driver public.employees%rowtype;
  v_assignment_id uuid;
begin
  select * into v_order
  from public.commerce_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if not public.vf_delivery_can_dispatch(v_order.business_id) then
    raise exception 'Sem permissão para direcionar entregas desta loja.';
  end if;
  if v_order.fulfillment_type <> 'delivery' then
    raise exception 'Este pedido não é de entrega.';
  end if;
  if v_order.status <> 'preparing' then
    raise exception 'Direcione a entrega somente quando o pedido estiver em preparo.';
  end if;
  if not public.vf_delivery_employee_is_driver(p_employee_id, v_order.business_id) then
    raise exception 'O usuário selecionado não é um entregador ativo desta loja.';
  end if;

  select * into v_driver
  from public.employees
  where id = p_employee_id
    and business_id = v_order.business_id
    and is_active = true;

  insert into public.commerce_delivery_assignments (
    business_id, order_id, employee_id, assigned_by, status, assigned_at, started_at, delivered_at, updated_at
  ) values (
    v_order.business_id, v_order.id, v_driver.id, auth.uid(), 'assigned', now(), null, null, now()
  )
  on conflict (order_id) do update
    set employee_id = excluded.employee_id,
        assigned_by = excluded.assigned_by,
        status = 'assigned',
        assigned_at = now(),
        started_at = null,
        delivered_at = null,
        updated_at = now()
  returning id into v_assignment_id;

  return jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'order_id', v_order.id,
    'order_code', v_order.public_code,
    'driver_name', v_driver.name
  );
end;
$$;

-- Mantém a atribuição sincronizada se o gestor alterar o status por outro ponto do painel.
create or replace function public.vf_delivery_sync_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fulfillment_type = 'delivery' and new.status is distinct from old.status then
    update public.commerce_delivery_assignments
    set status = case
          when new.status = 'out_for_delivery' then 'out_for_delivery'
          when new.status = 'fulfilled' then 'delivered'
          when new.status = 'cancelled' then 'cancelled'
          else status
        end,
        started_at = case
          when new.status = 'out_for_delivery' then coalesce(started_at, now())
          else started_at
        end,
        delivered_at = case
          when new.status = 'fulfilled' then coalesce(delivered_at, now())
          else delivered_at
        end,
        updated_at = now()
    where order_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists vf_delivery_sync_order_status on public.commerce_orders;
create trigger vf_delivery_sync_order_status
  after update of status on public.commerce_orders
  for each row
  execute function public.vf_delivery_sync_order_status();

-- Contexto do portal. O entregador só entra se tiver o perfil/permissão corretos.
create or replace function public.vf_delivery_portal_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_business public.businesses%rowtype;
begin
  select * into v_employee
  from public.employees
  where user_id = auth.uid()
    and is_active = true
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'Acesso de funcionário não encontrado ou inativo.';
  end if;
  if not public.vf_delivery_employee_is_driver(v_employee.id, v_employee.business_id) then
    raise exception 'Este acesso não está habilitado como entregador.';
  end if;

  select * into v_business
  from public.businesses
  where id = v_employee.business_id
    and active = true;

  if not found then
    raise exception 'A loja deste acesso está indisponível.';
  end if;

  if v_employee.last_login_at is null or v_employee.last_login_at < now() - interval '15 minutes' then
    update public.employees
      set last_login_at = now(), updated_at = now()
    where id = v_employee.id;
  end if;

  return jsonb_build_object(
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'name', v_employee.name,
      'username', v_employee.username,
      'profile', coalesce(v_employee.profile_key, 'Entregador')
    ),
    'business', jsonb_build_object(
      'id', v_business.id,
      'name', v_business.name,
      'slug', v_business.slug
    )
  );
end;
$$;

-- Retorna apenas pedidos que foram direcionados ao entregador autenticado.
create or replace function public.vf_delivery_portal_orders(p_limit integer default 80)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_result jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 80), 150));
begin
  select * into v_employee
  from public.employees
  where user_id = auth.uid()
    and is_active = true
  order by created_at asc
  limit 1;

  if not found or not public.vf_delivery_employee_is_driver(v_employee.id, v_employee.business_id) then
    raise exception 'Acesso de entregador não encontrado ou inativo.';
  end if;

  select coalesce(jsonb_agg(row_data order by
    case row_data->>'assignment_status' when 'out_for_delivery' then 0 else 1 end,
    (row_data->>'assigned_at')::timestamptz asc
  ), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', o.id,
      'public_code', o.public_code,
      'buyer_name', o.buyer_name,
      'buyer_phone', o.buyer_phone,
      'status', o.status,
      'total_amount', o.total_amount,
      'payment_method', o.payment_method,
      'delivery_address', o.delivery_address,
      'notes', o.notes,
      'created_at', o.created_at,
      'assignment_status', a.status,
      'assigned_at', a.assigned_at,
      'started_at', a.started_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_name', oi.product_name,
          'quantity', oi.quantity,
          'customer_note', oi.customer_note
        ) order by oi.created_at)
        from public.commerce_order_items oi
        where oi.order_id = o.id
      ), '[]'::jsonb)
    ) as row_data
    from public.commerce_delivery_assignments a
    join public.commerce_orders o on o.id = a.order_id
    where a.employee_id = v_employee.id
      and a.business_id = v_employee.business_id
      and a.status in ('assigned', 'out_for_delivery')
      and o.status in ('preparing', 'out_for_delivery')
    order by case a.status when 'out_for_delivery' then 0 else 1 end, a.assigned_at asc
    limit v_limit
  ) rows;

  return v_result;
end;
$$;

-- O entregador confirma a saída. Isso atualiza o status visível ao cliente para "A caminho".
create or replace function public.vf_delivery_portal_start(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_assignment public.commerce_delivery_assignments%rowtype;
  v_order public.commerce_orders%rowtype;
begin
  select * into v_employee
  from public.employees
  where user_id = auth.uid() and is_active = true
  order by created_at asc
  limit 1;

  if not found or not public.vf_delivery_employee_is_driver(v_employee.id, v_employee.business_id) then
    raise exception 'Acesso de entregador não encontrado ou inativo.';
  end if;

  select * into v_assignment
  from public.commerce_delivery_assignments
  where order_id = p_order_id
    and employee_id = v_employee.id
    and business_id = v_employee.business_id
  for update;

  if not found then
    raise exception 'Esta entrega não está direcionada para o seu acesso.';
  end if;
  if v_assignment.status <> 'assigned' then
    raise exception 'Esta entrega já foi iniciada ou finalizada.';
  end if;

  select * into v_order
  from public.commerce_orders
  where id = p_order_id
    and business_id = v_employee.business_id
  for update;

  if not found or v_order.fulfillment_type <> 'delivery' then
    raise exception 'Pedido de entrega não encontrado.';
  end if;
  if v_order.status <> 'preparing' then
    raise exception 'A loja precisa deixar o pedido em preparo antes da saída.';
  end if;

  update public.commerce_orders
  set status = 'out_for_delivery', updated_at = now()
  where id = v_order.id;

  return true;
end;
$$;

-- O entregador conclui apenas uma entrega que está no nome dele e em rota.
create or replace function public.vf_delivery_portal_complete(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_assignment public.commerce_delivery_assignments%rowtype;
  v_order public.commerce_orders%rowtype;
begin
  select * into v_employee
  from public.employees
  where user_id = auth.uid() and is_active = true
  order by created_at asc
  limit 1;

  if not found or not public.vf_delivery_employee_is_driver(v_employee.id, v_employee.business_id) then
    raise exception 'Acesso de entregador não encontrado ou inativo.';
  end if;

  select * into v_assignment
  from public.commerce_delivery_assignments
  where order_id = p_order_id
    and employee_id = v_employee.id
    and business_id = v_employee.business_id
  for update;

  if not found then
    raise exception 'Esta entrega não está direcionada para o seu acesso.';
  end if;
  if v_assignment.status <> 'out_for_delivery' then
    raise exception 'Inicie a rota antes de concluir a entrega.';
  end if;

  select * into v_order
  from public.commerce_orders
  where id = p_order_id
    and business_id = v_employee.business_id
  for update;

  if not found or v_order.status <> 'out_for_delivery' then
    raise exception 'O pedido não está em rota.';
  end if;

  update public.commerce_orders
  set status = 'fulfilled', updated_at = now()
  where id = v_order.id;

  return true;
end;
$$;

revoke all on function public.vf_delivery_dispatch_drivers(uuid) from public;
revoke all on function public.vf_delivery_dispatch_list(uuid, integer) from public;
revoke all on function public.vf_delivery_dispatch_order(uuid, uuid) from public;
revoke all on function public.vf_delivery_portal_me() from public;
revoke all on function public.vf_delivery_portal_orders(integer) from public;
revoke all on function public.vf_delivery_portal_start(uuid) from public;
revoke all on function public.vf_delivery_portal_complete(uuid) from public;

grant execute on function public.vf_delivery_dispatch_drivers(uuid) to authenticated;
grant execute on function public.vf_delivery_dispatch_list(uuid, integer) to authenticated;
grant execute on function public.vf_delivery_dispatch_order(uuid, uuid) to authenticated;
grant execute on function public.vf_delivery_portal_me() to authenticated;
grant execute on function public.vf_delivery_portal_orders(integer) to authenticated;
grant execute on function public.vf_delivery_portal_start(uuid) to authenticated;
grant execute on function public.vf_delivery_portal_complete(uuid) to authenticated;

commit;

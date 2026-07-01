-- FechAí — Acessos de Funcionários (atualização isolada e segura)
-- Execute somente depois de fazer backup. Esta migration NÃO recria pedidos, estoque,
-- clientes, planos ou outras funções existentes do sistema.

begin;

create extension if not exists pgcrypto;

-- Mantém a tabela employees atual, sem apagar registros. Novas credenciais passam
-- a ficar apenas no Supabase Auth; o campo antigo "pin" é limpo quando o acesso é salvo.
alter table public.employees
  add column if not exists profile_key text,
  add column if not exists auth_login_email text,
  add column if not exists pin_changed_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

create index if not exists employees_business_username_idx
  on public.employees (business_id, lower(username));

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
      select 1
      from public.employees e
      where e.id = employee_id
        and public.is_commerce_business_owner(e.business_id)
    )
  )
  with check (
    exists (
      select 1
      from public.employees e
      where e.id = employee_id
        and public.is_commerce_business_owner(e.business_id)
    )
  );

create table if not exists public.employee_login_audit (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  event text not null check (event in ('login', 'logout', 'access_denied')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists employee_login_audit_employee_created_idx
  on public.employee_login_audit (employee_id, created_at desc);

alter table public.employee_login_audit enable row level security;

drop policy if exists "Business owners can view employee login audit" on public.employee_login_audit;
create policy "Business owners can view employee login audit"
  on public.employee_login_audit
  for select
  to authenticated
  using (public.is_commerce_business_owner(business_id));

-- Catálogo de permissões. IDs antigos foram preservados; novos IDs apenas completam
-- os recursos exibidos na tela de Acessos.
insert into public.permissions (id, description) values
  ('dashboard_view', 'Visualizar painel inicial'),
  ('orders_manage', 'Ver e gerenciar pedidos'),
  ('kds_view', 'Usar o display de cozinha'),
  ('cashier_access', 'Confirmar pagamentos e operar caixa'),
  ('pdv_access', 'Usar o PDV / balcão'),
  ('tables_manage', 'Gerenciar mesas e comandas'),
  ('store_open_close', 'Abrir e fechar loja'),
  ('orders_delete', 'Cancelar ou excluir pedidos'),
  ('menu_edit', 'Editar cardápio e produtos'),
  ('reports_view', 'Ver relatórios'),
  ('orders_history_view', 'Ver histórico de pedidos'),
  ('customers_view', 'Ver clientes'),
  ('reviews_manage', 'Gerenciar avaliações'),
  ('marketing_manage', 'Gerenciar marketing'),
  ('loyalty_manage', 'Gerenciar fidelidade'),
  ('coupons_manage', 'Gerenciar cupons'),
  ('stock_manage', 'Gerenciar estoque'),
  ('settings_manage', 'Gerenciar configurações gerais'),
  ('whatsapp_manage', 'Gerenciar WhatsApp e mensagens'),
  ('business_hours_manage', 'Gerenciar horários'),
  ('delivery_zones_manage', 'Gerenciar áreas de entrega'),
  ('appointments_manage', 'Gerenciar agendamentos'),
  ('payment_methods_manage', 'Gerenciar formas de pagamento'),
  ('integrations_manage', 'Gerenciar integrações'),
  ('qr_codes_manage', 'Gerenciar QR Codes'),
  ('links_view', 'Ver e compartilhar links da loja')
on conflict (id) do update
  set description = excluded.description;

-- Cria os perfis padrão de cada loja somente quando a tela de Acessos é aberta.
-- Permissões individuais ficam em employee_permission_overrides e não alteram o
-- perfil de outros funcionários.
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
      'payment_methods_manage','integrations_manage','qr_codes_manage','links_view'
    ),
    'Caixa', jsonb_build_array('dashboard_view','orders_manage','cashier_access','pdv_access','tables_manage','customers_view','orders_history_view'),
    'Cozinha', jsonb_build_array('orders_manage','kds_view'),
    'Garçom', jsonb_build_array('dashboard_view','orders_manage','pdv_access','tables_manage','customers_view'),
    'Entregador', jsonb_build_array('orders_manage'),
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
        when 'Gerente' then 'Acesso amplo à operação da loja.'
        when 'Caixa' then 'Recebimentos, pedidos e vendas de balcão.'
        when 'Cozinha' then 'Acompanhamento e preparo dos pedidos.'
        when 'Garçom' then 'Pedidos, mesas e atendimento no salão.'
        when 'Entregador' then 'Pedidos destinados a entrega.'
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

-- Corrige a leitura de permissões para dono e funcionário autenticado. Um override
-- individual sempre vence a permissão do perfil.
create or replace function public.has_permission(
  p_permission_id text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_override boolean;
begin
  if p_user_id is null or nullif(trim(coalesce(p_permission_id, '')), '') is null then
    return false;
  end if;

  if exists (
    select 1 from public.businesses b
    where b.owner_id = p_user_id
  ) then
    return true;
  end if;

  select * into v_employee
  from public.employees e
  where e.user_id = p_user_id
    and e.is_active = true
  order by e.created_at asc
  limit 1;

  if not found then
    return false;
  end if;

  select o.allowed into v_override
  from public.employee_permission_overrides o
  where o.employee_id = v_employee.id
    and o.permission_id = p_permission_id;

  if found then
    return coalesce(v_override, false);
  end if;

  return exists (
    select 1
    from public.role_permissions rp
    where rp.role_id = v_employee.role_id
      and rp.permission_id = p_permission_id
  );
end;
$$;

revoke all on function public.has_permission(text, uuid) from public;
grant execute on function public.has_permission(text, uuid) to authenticated;

-- Retorna o identificador interno de login somente para uma loja/usuário ativos.
-- A senha/PIN nunca é retornada nem armazenada na tabela employees.
create or replace function public.vf_employee_login_identifier(
  p_business_slug text,
  p_username text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_employee public.employees%rowtype;
begin
  select * into v_business
  from public.businesses
  where slug = lower(trim(coalesce(p_business_slug, '')))
    and active = true
  limit 1;

  if not found then
    raise exception 'Credenciais inválidas.';
  end if;

  select * into v_employee
  from public.employees
  where business_id = v_business.id
    and lower(username) = lower(trim(coalesce(p_username, '')))
    and is_active = true
    and auth_login_email is not null
  limit 1;

  if not found then
    raise exception 'Credenciais inválidas.';
  end if;

  return jsonb_build_object(
    'login_email', v_employee.auth_login_email,
    'business_name', v_business.name,
    'business_slug', v_business.slug
  );
end;
$$;

revoke all on function public.vf_employee_login_identifier(text, text) from public;
grant execute on function public.vf_employee_login_identifier(text, text) to anon, authenticated;

-- Contexto privado do portal do funcionário. Também atualiza o último acesso e
-- cria auditoria de login sem expor dados de outros membros.
create or replace function public.vf_employee_portal_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_business public.businesses%rowtype;
  v_permissions jsonb;
begin
  select e.* into v_employee
  from public.employees e
  where e.user_id = auth.uid()
    and e.is_active = true
  order by e.created_at asc
  limit 1;

  if not found then
    raise exception 'Acesso de funcionário não encontrado ou inativo.';
  end if;

  select * into v_business
  from public.businesses b
  where b.id = v_employee.business_id
    and b.active = true;

  if not found then
    raise exception 'A loja deste acesso está indisponível.';
  end if;

  select coalesce(jsonb_agg(p.id order by p.id), '[]'::jsonb)
  into v_permissions
  from public.permissions p
  where coalesce(
    (
      select o.allowed
      from public.employee_permission_overrides o
      where o.employee_id = v_employee.id
        and o.permission_id = p.id
    ),
    exists (
      select 1
      from public.role_permissions rp
      where rp.role_id = v_employee.role_id
        and rp.permission_id = p.id
    )
  );

  if v_employee.last_login_at is null or v_employee.last_login_at < now() - interval '15 minutes' then
    update public.employees
      set last_login_at = now(), updated_at = now()
    where id = v_employee.id;

    insert into public.employee_login_audit (employee_id, business_id, event)
    values (v_employee.id, v_employee.business_id, 'login');
  end if;

  return jsonb_build_object(
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'name', v_employee.name,
      'username', v_employee.username,
      'profile', coalesce(v_employee.profile_key, 'Funcionário')
    ),
    'business', jsonb_build_object(
      'id', v_business.id,
      'name', v_business.name,
      'slug', v_business.slug
    ),
    'permissions', v_permissions
  );
end;
$$;

revoke all on function public.vf_employee_portal_me() from public;
grant execute on function public.vf_employee_portal_me() to authenticated;

create or replace function public.vf_employee_portal_orders(p_limit integer default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_result jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 60), 150));
begin
  select * into v_employee
  from public.employees e
  where e.user_id = auth.uid()
    and e.is_active = true
  order by e.created_at asc
  limit 1;

  if not found then
    raise exception 'Acesso de funcionário não encontrado ou inativo.';
  end if;

  if not (
    public.has_permission('orders_manage')
    or public.has_permission('kds_view')
    or public.has_permission('cashier_access')
  ) then
    raise exception 'Sem permissão para visualizar pedidos.';
  end if;

  select coalesce(jsonb_agg(row_data order by (row_data->>'created_at') desc), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'id', o.id,
      'public_code', o.public_code,
      'buyer_name', o.buyer_name,
      'buyer_phone', o.buyer_phone,
      'status', o.status,
      'fulfillment_type', o.fulfillment_type,
      'total_amount', o.total_amount,
      'payment_method', o.payment_method,
      'delivery_address', o.delivery_address,
      'created_at', o.created_at,
      'scheduled_for', o.scheduled_for,
      'notes', o.notes,
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
    from public.commerce_orders o
    where o.business_id = v_employee.business_id
    order by o.created_at desc
    limit v_limit
  ) rows;

  return v_result;
end;
$$;

revoke all on function public.vf_employee_portal_orders(integer) from public;
grant execute on function public.vf_employee_portal_orders(integer) to authenticated;

-- Atualização de pedido pelo portal de equipe. Mantém as mesmas regras de transição
-- e de baixa de estoque da função administrativa, mas valida a permissão específica.
create or replace function public.vf_employee_portal_set_order_status(
  p_order_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_order public.commerce_orders%rowtype;
  v_product public.commerce_products%rowtype;
  v_item record;
  v_next text := lower(trim(coalesce(p_status, '')));
begin
  select * into v_employee
  from public.employees e
  where e.user_id = auth.uid()
    and e.is_active = true
  order by e.created_at asc
  limit 1;

  if not found then
    raise exception 'Acesso de funcionário não encontrado ou inativo.';
  end if;

  if v_next not in ('paid', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'fulfilled', 'cancelled') then
    raise exception 'Status inválido.';
  end if;

  if v_next = 'paid' and not (public.has_permission('cashier_access') or public.has_permission('orders_manage')) then
    raise exception 'Sem permissão para confirmar pagamento.';
  end if;
  if v_next in ('preparing', 'ready_for_pickup') and not (public.has_permission('kds_view') or public.has_permission('orders_manage')) then
    raise exception 'Sem permissão para atualizar o preparo.';
  end if;
  if v_next in ('out_for_delivery', 'fulfilled', 'cancelled') and not public.has_permission('orders_manage') then
    raise exception 'Sem permissão para atualizar esta etapa.';
  end if;

  select * into v_order
  from public.commerce_orders
  where id = p_order_id
    and business_id = v_employee.business_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_order.status in ('fulfilled', 'cancelled') then
    raise exception 'Este pedido já foi finalizado.';
  end if;

  if v_next = 'cancelled' then
    if v_order.status in ('paid', 'preparing', 'ready_for_pickup', 'out_for_delivery') then
      raise exception 'Não cancele pedido já pago por este acesso.';
    end if;
    update public.commerce_orders set status = 'cancelled', updated_at = now() where id = v_order.id;
    return true;
  end if;

  if v_next = 'paid' then
    if v_order.status not in ('awaiting_payment', 'payment_reported') then
      raise exception 'Primeiro confirme o pagamento corretamente.';
    end if;

    for v_item in
      select product_id, quantity, product_name
      from public.commerce_order_items
      where order_id = v_order.id
    loop
      if v_item.product_id is null then
        raise exception 'O produto % não está disponível para baixa de estoque.', v_item.product_name;
      end if;

      select * into v_product
      from public.commerce_products
      where id = v_item.product_id
      for update;

      if not found then
        raise exception 'Produto % não encontrado.', v_item.product_name;
      end if;
      if v_product.stock_quantity is not null then
        if v_product.stock_quantity < v_item.quantity then
          raise exception 'Estoque insuficiente para confirmar %.', v_item.product_name;
        end if;

        update public.commerce_products
          set stock_quantity = stock_quantity - v_item.quantity,
              updated_at = now()
        where id = v_product.id;

        insert into public.commerce_stock_movements (
          business_id, product_id, order_id, movement_type,
          quantity, quantity_change, balance_after, note
        ) values (
          v_order.business_id, v_product.id, v_order.id, 'sale',
          -v_item.quantity, -v_item.quantity,
          v_product.stock_quantity - v_item.quantity,
          'Venda confirmada pelo funcionário: ' || v_order.public_code
        );
      end if;
    end loop;

    update public.commerce_orders
      set status = 'paid',
          paid_at = coalesce(paid_at, now()),
          updated_at = now()
    where id = v_order.id;
    return true;
  end if;

  if v_next = 'preparing' and v_order.status = 'paid' then
    update public.commerce_orders set status = 'preparing', updated_at = now() where id = v_order.id;
    return true;
  end if;

  if v_next = 'ready_for_pickup' and v_order.status = 'preparing' and v_order.fulfillment_type = 'pickup' then
    update public.commerce_orders set status = 'ready_for_pickup', updated_at = now() where id = v_order.id;
    return true;
  end if;

  if v_next = 'out_for_delivery' and v_order.status = 'preparing' and v_order.fulfillment_type = 'delivery' then
    update public.commerce_orders set status = 'out_for_delivery', updated_at = now() where id = v_order.id;
    return true;
  end if;

  if v_next = 'fulfilled' and v_order.status in ('ready_for_pickup', 'out_for_delivery') then
    update public.commerce_orders set status = 'fulfilled', updated_at = now() where id = v_order.id;
    return true;
  end if;

  raise exception 'Essa etapa não pode ser aplicada ao status atual do pedido.';
end;
$$;

revoke all on function public.vf_employee_portal_set_order_status(uuid, text) from public;
grant execute on function public.vf_employee_portal_set_order_status(uuid, text) to authenticated;

commit;

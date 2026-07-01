-- FechAí — correção do fluxo de dinheiro na entrega e despacho obrigatório.
-- Fluxo final:
-- 1. Dinheiro na entrega entra em preparo sem confirmação de pagamento.
-- 2. Cozinha marca o pedido como pronto para despacho.
-- 3. Gestor escolhe o entregador na tela Entregas.
-- 4. Entregador inicia a rota.
-- 5. Entregador confirma entrega e recebimento do dinheiro.

begin;

create extension if not exists pgcrypto;

alter table public.commerce_orders
  add column if not exists payment_method text,
  add column if not exists payment_details jsonb not null default '{}'::jsonb,
  add column if not exists amount_received numeric(12,2),
  add column if not exists change_amount numeric(12,2) not null default 0;

alter table public.commerce_orders
  drop constraint if exists commerce_orders_status_check;

alter table public.commerce_orders
  add constraint commerce_orders_status_check
  check (status in (
    'awaiting_payment', 'payment_reported', 'paid', 'preparing',
    'ready_for_pickup', 'out_for_delivery', 'fulfilled', 'cancelled'
  ));

-- Garante que a escolha feita na vitrine seja gravada no pedido, em vez de ficar
-- somente dentro da observação técnica do pedido.
create or replace function public.vf_customer_apply_payment_method(
  p_slug text,
  p_session_token text,
  p_order_id uuid,
  p_payment_method text,
  p_cash_change_for numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_payment_methods_config jsonb;
  v_pix_key text;
  v_customer_id uuid;
  v_profile_phone text;
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_mode text;
  v_config jsonb;
  v_item jsonb;
  v_enabled boolean;
  v_allowed boolean;
  v_label text;
  v_change numeric(12,2);
begin
  if v_method not in ('pix','cash','debit_card','credit_card','meal_voucher','food_voucher') then
    raise exception 'Escolha uma forma de pagamento válida.';
  end if;

  select s.customer_id, cp.phone
    into v_customer_id, v_profile_phone
  from public.commerce_customer_sessions s
  join public.commerce_customer_profiles cp on cp.id = s.customer_id
  where s.token_hash = encode(digest(coalesce(p_session_token,''), 'sha256'), 'hex')
    and s.expires_at > now()
  order by s.last_seen_at desc
  limit 1;

  if v_customer_id is null then
    raise exception 'Sua sessão expirou. Entre novamente para continuar.';
  end if;

  select o.*
    into v_order
  from public.commerce_orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id
    and lower(b.slug) = lower(trim(p_slug))
  for update of o;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;

  select cs.payment_methods_config, cs.pix_key
    into v_payment_methods_config, v_pix_key
  from public.commerce_settings cs
  where cs.business_id = v_order.business_id;
  if regexp_replace(coalesce(v_profile_phone,''), '\D', '', 'g') <> regexp_replace(coalesce(v_order.buyer_phone,''), '\D', '', 'g') then
    raise exception 'Você não tem permissão para alterar o pagamento deste pedido.';
  end if;
  if v_order.status not in ('awaiting_payment','payment_reported') then
    raise exception 'Este pedido não aceita mais alteração de pagamento.';
  end if;

  v_mode := case when v_order.fulfillment_type = 'delivery' then 'delivery' else 'pickup' end;
  v_config := coalesce(v_payment_methods_config, jsonb_build_object(
    'pix', jsonb_build_object('enabled', true, 'pickup', true, 'delivery', true),
    'cash', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true, 'cash_change_enabled', true),
    'debit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'credit_card', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'meal_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true),
    'food_voucher', jsonb_build_object('enabled', false, 'pickup', true, 'delivery', true)
  ));
  v_item := coalesce(v_config -> v_method, '{}'::jsonb);
  v_enabled := coalesce((v_item ->> 'enabled')::boolean, v_method = 'pix');
  v_allowed := coalesce((v_item ->> v_mode)::boolean, true);
  if not v_enabled or not v_allowed then
    raise exception 'Esta forma de pagamento não está disponível para este pedido.';
  end if;
  if v_method = 'pix' and nullif(trim(coalesce(v_pix_key,'')), '') is null then
    raise exception 'A loja ainda não configurou a chave Pix.';
  end if;

  v_change := null;
  if v_method = 'cash' and p_cash_change_for is not null then
    v_change := round(p_cash_change_for, 2);
    if v_change < v_order.total_amount then
      raise exception 'O valor para troco deve ser igual ou maior que o total do pedido.';
    end if;
  end if;

  v_label := case v_method
    when 'pix' then 'Pix'
    when 'cash' then 'Dinheiro'
    when 'debit_card' then 'Cartão de débito'
    when 'credit_card' then 'Cartão de crédito'
    when 'meal_voucher' then 'Vale-refeição'
    when 'food_voucher' then 'Vale-alimentação'
  end;

  update public.commerce_orders
     set payment_method = v_method,
         payment_details = jsonb_build_object(
           'label', v_label,
           'collection', case when v_method = 'pix' then 'online' else 'card_machine_or_cash' end,
           'timing', case when v_method = 'pix' then 'now' when v_mode = 'delivery' then 'delivery' else 'pickup' end,
           'cash_change_for', v_change,
           'collection_status', case when v_method = 'cash' and v_mode = 'delivery' then 'pending_delivery' else 'pending' end
         ),
         updated_at = now()
   where id = v_order.id;

  return jsonb_build_object(
    'id', v_order.id,
    'public_code', v_order.public_code,
    'total_amount', v_order.total_amount,
    'status', v_order.status,
    'payment_method', v_method,
    'payment_details', jsonb_build_object('label', v_label, 'cash_change_for', v_change)
  );
end;
$$;

grant execute on function public.vf_customer_apply_payment_method(text, text, uuid, text, numeric) to anon, authenticated;

create or replace function public.vf_customer_create_order_with_payment(
  p_slug text,
  p_session_token text,
  p_notes text,
  p_items jsonb,
  p_fulfillment_type text,
  p_delivery_zone_id uuid,
  p_delivery_address jsonb,
  p_coupon_code text,
  p_scheduled_for timestamptz,
  p_schedule_mode text,
  p_payment_method text,
  p_cash_change_for numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order jsonb;
  v_payment jsonb;
begin
  v_order := public.commerce_customer_create_order(
    p_slug,
    p_session_token,
    p_notes,
    p_items,
    p_fulfillment_type,
    p_delivery_zone_id,
    p_delivery_address,
    p_coupon_code,
    p_scheduled_for,
    p_schedule_mode
  );

  v_payment := public.vf_customer_apply_payment_method(
    p_slug,
    p_session_token,
    nullif(v_order->>'id','')::uuid,
    p_payment_method,
    p_cash_change_for
  );

  return coalesce(v_order, '{}'::jsonb) || coalesce(v_payment, '{}'::jsonb);
end;
$$;

grant execute on function public.vf_customer_create_order_with_payment(text, text, text, jsonb, text, uuid, jsonb, text, timestamptz, text, text, numeric) to anon, authenticated;

-- Atualização de status usada no painel administrativo.
-- Dinheiro na entrega nunca passa por "Pagamento confirmado" antes da rota.
create or replace function public.commerce_set_order_status(p_order_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_product public.commerce_products%rowtype;
  v_item record;
  v_next text := lower(trim(coalesce(p_status, '')));
  v_method text;
  v_cash_delivery boolean := false;
  v_change_for numeric(12,2) := null;
  v_received numeric(12,2);
begin
  if v_next not in ('paid', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'fulfilled', 'cancelled') then
    raise exception 'Status inválido.';
  end if;

  select * into v_order
  from public.commerce_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if not public.vf_pos_can_manage_business(v_order.business_id) then
    raise exception 'Sem permissão para alterar este pedido.';
  end if;
  if v_order.status in ('fulfilled', 'cancelled') then
    raise exception 'Este pedido já está finalizado.';
  end if;

  v_method := lower(coalesce(
    nullif(trim(v_order.payment_method), ''),
    nullif(substring(coalesce(v_order.notes, '') from '\[\[VF_PAYMENT:([A-Za-z_]+)\]\]'), ''),
    'pix'
  ));
  v_cash_delivery := v_order.fulfillment_type = 'delivery' and v_method = 'cash';

  if v_next = 'cancelled' then
    if v_order.status in ('paid', 'preparing', 'ready_for_pickup', 'out_for_delivery') then
      raise exception 'Não cancele pedido que já entrou em produção ou rota por esta tela.';
    end if;
    update public.commerce_orders
       set status = 'cancelled', updated_at = now()
     where id = v_order.id;
    return true;
  end if;

  if v_next = 'paid' then
    if v_cash_delivery then
      raise exception 'Dinheiro na entrega é confirmado somente quando o entregador concluir a entrega.';
    end if;
    if v_order.status not in ('awaiting_payment', 'payment_reported') then
      raise exception 'Este pedido não está aguardando confirmação de pagamento.';
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
          'Pagamento confirmado: ' || v_order.public_code
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

  if v_next = 'preparing' then
    if v_order.status = 'paid' then
      update public.commerce_orders set status = 'preparing', updated_at = now() where id = v_order.id;
      return true;
    end if;

    if v_cash_delivery and v_order.status in ('awaiting_payment', 'payment_reported') then
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
            raise exception 'Estoque insuficiente para preparar %.', v_item.product_name;
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
            'Pedido em dinheiro enviado ao preparo: ' || v_order.public_code
          );
        end if;
      end loop;
      update public.commerce_orders
         set status = 'preparing', updated_at = now()
       where id = v_order.id;
      return true;
    end if;

    raise exception 'Confirme o pagamento antes de enviar este pedido ao preparo.';
  end if;

  if v_next = 'ready_for_pickup' and v_order.status = 'preparing' then
    update public.commerce_orders
       set status = 'ready_for_pickup', updated_at = now()
     where id = v_order.id;
    return true;
  end if;

  if v_next = 'out_for_delivery' then
    raise exception 'Para sair para entrega, abra Entregas e atribua um entregador. O próprio entregador inicia a rota.';
  end if;

  if v_next = 'fulfilled' then
    if v_order.fulfillment_type = 'delivery' and v_order.status <> 'out_for_delivery' then
      raise exception 'A entrega deve ser iniciada pelo entregador antes da conclusão.';
    end if;
    if v_order.fulfillment_type <> 'delivery' and v_order.status <> 'ready_for_pickup' then
      raise exception 'O pedido precisa estar pronto para retirada antes da conclusão.';
    end if;

    if v_cash_delivery then
      if coalesce(v_order.payment_details->>'cash_change_for', '') ~ '^[0-9]+([.][0-9]+)?$' then
        v_change_for := (v_order.payment_details->>'cash_change_for')::numeric;
      end if;
      v_received := greatest(v_order.total_amount, coalesce(v_change_for, v_order.total_amount));
      update public.commerce_orders
         set status = 'fulfilled',
             paid_at = coalesce(paid_at, now()),
             amount_received = coalesce(amount_received, v_received),
             change_amount = case when amount_received is null then greatest(0, v_received - v_order.total_amount) else change_amount end,
             payment_details = coalesce(payment_details, '{}'::jsonb) || jsonb_build_object('collection_status','collected','collected_at',now()),
             updated_at = now()
       where id = v_order.id;
    else
      update public.commerce_orders
         set status = 'fulfilled', updated_at = now()
       where id = v_order.id;
    end if;
    return true;
  end if;

  raise exception 'Essa etapa não pode ser aplicada ao status atual do pedido.';
end;
$$;

grant execute on function public.commerce_set_order_status(uuid, text) to authenticated;

-- A fila de despacho recebe pedidos prontos; atribuir entregador não inicia rota.
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
    case row_data->>'status' when 'out_for_delivery' then 0 when 'ready_for_pickup' then 1 else 2 end,
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
      'payment_details', o.payment_details,
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
      and o.status in ('preparing', 'ready_for_pickup', 'out_for_delivery')
    order by case o.status when 'out_for_delivery' then 0 when 'ready_for_pickup' then 1 else 2 end, o.created_at asc
    limit v_limit
  ) rows;

  return v_result;
end;
$$;

-- O pedido só pode ser atribuído antes da rota. A saída é feita pelo entregador.
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

  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.vf_delivery_can_dispatch(v_order.business_id) then raise exception 'Sem permissão para direcionar entregas desta loja.'; end if;
  if v_order.fulfillment_type <> 'delivery' then raise exception 'Este pedido não é de entrega.'; end if;
  if v_order.status not in ('ready_for_pickup', 'preparing') then raise exception 'Direcione o entregador somente quando o pedido estiver pronto para despacho.'; end if;
  if not public.vf_delivery_employee_is_driver(p_employee_id, v_order.business_id) then raise exception 'O usuário selecionado não é um entregador ativo desta loja.'; end if;

  select * into v_driver
  from public.employees
  where id = p_employee_id and business_id = v_order.business_id and is_active = true;

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

  return jsonb_build_object('ok', true, 'assignment_id', v_assignment_id, 'order_id', v_order.id, 'order_code', v_order.public_code, 'driver_name', v_driver.name);
end;
$$;

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
  where user_id = auth.uid() and is_active = true
  order by created_at asc limit 1;

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
      'payment_details', o.payment_details,
      'delivery_address', o.delivery_address,
      'notes', o.notes,
      'created_at', o.created_at,
      'assignment_status', a.status,
      'assigned_at', a.assigned_at,
      'started_at', a.started_at,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('product_name', oi.product_name, 'quantity', oi.quantity, 'customer_note', oi.customer_note) order by oi.created_at)
        from public.commerce_order_items oi where oi.order_id = o.id
      ), '[]'::jsonb)
    ) as row_data
    from public.commerce_delivery_assignments a
    join public.commerce_orders o on o.id = a.order_id
    where a.employee_id = v_employee.id
      and a.business_id = v_employee.business_id
      and a.status in ('assigned', 'out_for_delivery')
      and o.status in ('preparing', 'ready_for_pickup', 'out_for_delivery')
    order by case a.status when 'out_for_delivery' then 0 else 1 end, a.assigned_at asc
    limit v_limit
  ) rows;
  return v_result;
end;
$$;

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
  select * into v_employee from public.employees where user_id = auth.uid() and is_active = true order by created_at asc limit 1;
  if not found or not public.vf_delivery_employee_is_driver(v_employee.id, v_employee.business_id) then raise exception 'Acesso de entregador não encontrado ou inativo.'; end if;

  select * into v_assignment from public.commerce_delivery_assignments
  where order_id = p_order_id and employee_id = v_employee.id and business_id = v_employee.business_id
  for update;
  if not found then raise exception 'Esta entrega não está direcionada para o seu acesso.'; end if;
  if v_assignment.status <> 'assigned' then raise exception 'Esta entrega já foi iniciada ou finalizada.'; end if;

  select * into v_order from public.commerce_orders where id = p_order_id and business_id = v_employee.business_id for update;
  if not found or v_order.fulfillment_type <> 'delivery' then raise exception 'Pedido de entrega não encontrado.'; end if;
  if v_order.status not in ('ready_for_pickup', 'preparing') then raise exception 'A loja precisa deixar o pedido pronto para despacho antes da saída.'; end if;

  update public.commerce_orders set status = 'out_for_delivery', updated_at = now() where id = v_order.id;
  return true;
end;
$$;

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
  v_method text;
  v_change_for numeric(12,2) := null;
  v_received numeric(12,2);
begin
  select * into v_employee from public.employees where user_id = auth.uid() and is_active = true order by created_at asc limit 1;
  if not found or not public.vf_delivery_employee_is_driver(v_employee.id, v_employee.business_id) then raise exception 'Acesso de entregador não encontrado ou inativo.'; end if;

  select * into v_assignment from public.commerce_delivery_assignments
  where order_id = p_order_id and employee_id = v_employee.id and business_id = v_employee.business_id
  for update;
  if not found then raise exception 'Esta entrega não está direcionada para o seu acesso.'; end if;
  if v_assignment.status <> 'out_for_delivery' then raise exception 'Inicie a rota antes de concluir a entrega.'; end if;

  select * into v_order from public.commerce_orders where id = p_order_id and business_id = v_employee.business_id for update;
  if not found or v_order.status <> 'out_for_delivery' then raise exception 'O pedido não está em rota.'; end if;

  v_method := lower(coalesce(nullif(trim(v_order.payment_method), ''), nullif(substring(coalesce(v_order.notes, '') from '\[\[VF_PAYMENT:([A-Za-z_]+)\]\]'), ''), 'pix'));
  if coalesce(v_order.payment_details->>'cash_change_for', '') ~ '^[0-9]+([.][0-9]+)?$' then
    v_change_for := (v_order.payment_details->>'cash_change_for')::numeric;
  end if;
  v_received := greatest(v_order.total_amount, coalesce(v_change_for, v_order.total_amount));

  update public.commerce_orders
     set status = 'fulfilled',
         paid_at = case when v_method = 'cash' then coalesce(paid_at, now()) else paid_at end,
         amount_received = case when v_method = 'cash' then coalesce(amount_received, v_received) else amount_received end,
         change_amount = case when v_method = 'cash' and amount_received is null then greatest(0, v_received - v_order.total_amount) else change_amount end,
         payment_details = case when v_method = 'cash'
           then coalesce(payment_details, '{}'::jsonb) || jsonb_build_object('collection_status','collected','collected_at',now(),'collected_by_employee_id',v_employee.id)
           else payment_details end,
         updated_at = now()
   where id = v_order.id;

  return true;
end;
$$;

revoke all on function public.vf_delivery_dispatch_list(uuid, integer) from public;
revoke all on function public.vf_delivery_dispatch_order(uuid, uuid) from public;
revoke all on function public.vf_delivery_portal_orders(integer) from public;
revoke all on function public.vf_delivery_portal_start(uuid) from public;
revoke all on function public.vf_delivery_portal_complete(uuid) from public;

grant execute on function public.vf_delivery_dispatch_list(uuid, integer) to authenticated;
grant execute on function public.vf_delivery_dispatch_order(uuid, uuid) to authenticated;
grant execute on function public.vf_delivery_portal_orders(integer) to authenticated;
grant execute on function public.vf_delivery_portal_start(uuid) to authenticated;
grant execute on function public.vf_delivery_portal_complete(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

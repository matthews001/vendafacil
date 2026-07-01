-- FechAí - Migração para RPCs do Dashboard de Relatórios
-- Cria funções para agregar dados para o dashboard.

begin;

-- Função para obter métricas gerais do dashboard
create or replace function public.vf_dashboard_get_metrics(
  p_business_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_revenue numeric(12,2);
  v_total_orders integer;
  v_cancelled_orders integer;
  v_avg_ticket numeric(12,2);
  v_active_customers integer;
  v_active_products integer;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar os relatórios desta loja.';
  end if;

  -- Receita Total e Total de Pedidos
  select
    coalesce(sum(total_amount), 0),
    coalesce(count(id), 0)
  into v_total_revenue, v_total_orders
  from public.commerce_orders
  where business_id = p_business_id
    and status = 'paid'
    and paid_at between p_start_date and p_end_date;

  -- Pedidos Cancelados
  select coalesce(count(id), 0)
  into v_cancelled_orders
  from public.commerce_orders
  where business_id = p_business_id
    and status = 'cancelled'
    and created_at between p_start_date and p_end_date;

  -- Ticket Médio
  if v_total_orders > 0 then
    v_avg_ticket := v_total_revenue / v_total_orders;
  else
    v_avg_ticket := 0;
  end if;

  -- Clientes Ativos (contagem distinta de telefones de compradores)
  select coalesce(count(distinct buyer_phone), 0)
  into v_active_customers
  from public.commerce_orders
  where business_id = p_business_id
    and created_at between p_start_date and p_end_date;

  -- Produtos Ativos (contagem de produtos ativos no catálogo)
  select coalesce(count(id), 0)
  into v_active_products
  from public.commerce_products
  where business_id = p_business_id
    and active = true;

  return jsonb_build_object(
    'total_revenue', round(v_total_revenue, 2),
    'total_orders', v_total_orders,
    'cancelled_orders', v_cancelled_orders,
    'avg_ticket', round(v_avg_ticket, 2),
    'active_customers', v_active_customers,
    'active_products', v_active_products
  );
end;
$$;

grant execute on function public.vf_dashboard_get_metrics(uuid, timestamptz, timestamptz) to authenticated;

-- Função para obter pedidos por modalidade
create or replace function public.vf_dashboard_orders_by_modality(
  p_business_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar os relatórios desta loja.';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_result
  from (
    select
      order_source as modality,
      count(id) as order_count,
      sum(total_amount) as total_amount
    from public.commerce_orders
    where business_id = p_business_id
      and created_at between p_start_date and p_end_date
    group by order_source
    order by order_count desc
  ) t;

  return v_result;
end;
$$;

grant execute on function public.vf_dashboard_orders_by_modality(uuid, timestamptz, timestamptz) to authenticated;

-- Função para obter pedidos por forma de pagamento
create or replace function public.vf_dashboard_orders_by_payment_method(
  p_business_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar os relatórios desta loja.';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_result
  from (
    select
      payment_method,
      count(id) as order_count,
      sum(total_amount) as total_amount
    from public.commerce_orders
    where business_id = p_business_id
      and paid_at between p_start_date and p_end_date
    group by payment_method
    order by order_count desc
  ) t;

  return v_result;
end;
$$;

grant execute on function public.vf_dashboard_orders_by_payment_method(uuid, timestamptz, timestamptz) to authenticated;

-- Função para obter produtos mais vendidos
create or replace function public.vf_dashboard_top_selling_products(
  p_business_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar os relatórios desta loja.';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_result
  from (
    select
      coalesce(oi.product_name, p.name) as product_name,
      sum(oi.quantity) as total_quantity_sold,
      sum(oi.subtotal) as total_revenue
    from public.commerce_order_items oi
    join public.commerce_orders o on oi.order_id = o.id
    left join public.commerce_products p on oi.product_id = p.id
    where o.business_id = p_business_id
      and o.status = 'paid'
      and o.paid_at between p_start_date and p_end_date
    group by coalesce(oi.product_name, p.name)
    order by total_quantity_sold desc
    limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function public.vf_dashboard_top_selling_products(uuid, timestamptz, timestamptz, integer) to authenticated;

-- Função para obter clientes que mais compraram
create or replace function public.vf_dashboard_top_customers(
  p_business_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar os relatórios desta loja.';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_result
  from (
    select
      buyer_name,
      buyer_phone,
      count(id) as total_orders,
      sum(total_amount) as total_spent
    from public.commerce_orders
    where business_id = p_business_id
      and status = 'paid'
      and paid_at between p_start_date and p_end_date
    group by buyer_name, buyer_phone
    order by total_spent desc
    limit p_limit
  ) t;

  return v_result;
end;
$$;

grant execute on function public.vf_dashboard_top_customers(uuid, timestamptz, timestamptz, integer) to authenticated;

-- Função para obter pedidos por hora do dia
create or replace function public.vf_dashboard_orders_by_hour(
  p_business_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para acessar os relatórios desta loja.';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  into v_result
  from (
    select
      extract(hour from paid_at) as hour_of_day,
      count(id) as order_count,
      sum(total_amount) as total_revenue
    from public.commerce_orders
    where business_id = p_business_id
      and status = 'paid'
      and paid_at between p_start_date and p_end_date
    group by extract(hour from paid_at)
    order by hour_of_day asc
  ) t;

  return v_result;
end;
$$;

grant execute on function public.vf_dashboard_orders_by_hour(uuid, timestamptz, timestamptz) to authenticated;

commit;

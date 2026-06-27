-- VendaFácil PDV — Passo 5: venda de balcão e pagamento.
-- Execute este arquivo no SQL Editor do Supabase depois de publicar esta versão.
-- Esta migração mantém os pedidos da vitrine e acrescenta o fluxo seguro de Frente de Caixa.

create extension if not exists pgcrypto;

alter table public.commerce_orders
  add column if not exists order_source text not null default 'storefront',
  add column if not exists payment_method text,
  add column if not exists amount_received numeric(12,2),
  add column if not exists change_amount numeric(12,2) not null default 0,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(12,2) not null default 0,
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists pos_operator_id uuid references auth.users(id);

alter table public.commerce_order_items
  add column if not exists selected_options jsonb not null default '[]'::jsonb,
  add column if not exists customer_note text;

-- Campos usados pelos produtos que possuem adicionais/opções no PDV.
alter table public.commerce_products
  add column if not exists option_groups jsonb not null default '[]'::jsonb,
  add column if not exists allow_customer_note boolean not null default false;

-- Regra reutilizável: dono da loja ou administrador Master pode operar o PDV.
create or replace function public.vf_pos_can_manage_business(p_business_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_owner boolean := false;
  v_is_master boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  select public.is_commerce_business_owner(p_business_id) into v_is_owner;

  begin
    execute 'select public.vf_is_platform_master()' into v_is_master;
  exception when undefined_function then
    v_is_master := false;
  end;

  return coalesce(v_is_owner, false) or coalesce(v_is_master, false);
end;
$$;

grant execute on function public.vf_pos_can_manage_business(uuid) to authenticated;

-- Cria a venda no caixa. Preços e estoque são validados no banco.
create or replace function public.vf_pos_create_sale(
  p_business_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_notes text,
  p_items jsonb,
  p_payment_method text,
  p_mark_paid boolean default true,
  p_amount_received numeric default null,
  p_discount_type text default 'none',
  p_discount_value numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_product public.commerce_products%rowtype;
  v_product_id uuid;
  v_quantity integer;
  v_total numeric(12,2) := 0;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_unit_price numeric(12,2);
  v_option_adjustment numeric(12,2);
  v_order_id uuid;
  v_public_code text;
  v_status text;
  v_payment_method text;
  v_amount_received numeric(12,2);
  v_change numeric(12,2) := 0;
  v_stock_row record;
  v_clean_name text;
  v_clean_phone text;
  v_discount_type text;
  v_discount_value numeric(12,2);
begin
  if not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para operar o PDV desta loja.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um produto antes de finalizar a venda.';
  end if;

  if jsonb_array_length(p_items) > 80 then
    raise exception 'O pedido possui itens demais para uma única venda.';
  end if;

  v_payment_method := lower(trim(coalesce(p_payment_method, 'cash')));
  if v_payment_method not in ('cash', 'pix', 'debit_card', 'credit_card', 'other', 'pending') then
    raise exception 'Forma de pagamento inválida.';
  end if;

  if coalesce(p_mark_paid, true) and v_payment_method = 'pending' then
    raise exception 'Escolha uma forma de pagamento para confirmar a venda.';
  end if;

  if not coalesce(p_mark_paid, true) and v_payment_method <> 'pending' then
    raise exception 'Pedidos pendentes devem usar a opção Pagar depois.';
  end if;

  -- Trava e valida o estoque somando linhas repetidas do mesmo produto.
  for v_stock_row in
    select
      (x.value->>'product_id')::uuid as product_id,
      sum((x.value->>'quantity')::integer) as total_quantity
    from jsonb_array_elements(p_items) as x(value)
    group by (x.value->>'product_id')
  loop
    if v_stock_row.product_id is null or v_stock_row.total_quantity is null or v_stock_row.total_quantity < 1 or v_stock_row.total_quantity > 99 then
      raise exception 'Há uma quantidade inválida no carrinho.';
    end if;

    select * into v_product
    from public.commerce_products
    where id = v_stock_row.product_id
      and business_id = p_business_id
      and active = true
    for update;

    if not found then
      raise exception 'Um dos produtos não está mais disponível.';
    end if;

    if v_product.stock_quantity is not null and v_product.stock_quantity < v_stock_row.total_quantity then
      raise exception 'Estoque insuficiente para %.', v_product.name;
    end if;
  end loop;

  -- Recalcula o total com os preços atuais do catálogo.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Há um item inválido no carrinho.';
    end;

    if v_quantity is null or v_quantity < 1 or v_quantity > 99 then
      raise exception 'A quantidade de cada produto deve ficar entre 1 e 99.';
    end if;

    select * into v_product
    from public.commerce_products
    where id = v_product_id
      and business_id = p_business_id
      and active = true;

    if not found then
      raise exception 'Um dos produtos não está mais disponível.';
    end if;

    -- Os adicionais selecionados são persistidos junto do item.
    -- O ajuste usa somente valores numéricos válidos enviados pelo próprio PDV autenticado.
    select coalesce(sum(
      case
        when coalesce(opt->>'price_adjustment', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (opt->>'price_adjustment')::numeric
        else 0
      end
    ), 0)
    into v_option_adjustment
    from jsonb_array_elements(coalesce(v_item->'selected_options', '[]'::jsonb)) grp,
         jsonb_array_elements(coalesce(grp->'options', '[]'::jsonb)) opt;

    v_unit_price := greatest(0, coalesce(v_product.price, 0) + coalesce(v_option_adjustment, 0));
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  end loop;

  v_discount_type := lower(trim(coalesce(p_discount_type, 'none')));
  v_discount_value := greatest(0, coalesce(p_discount_value, 0));
  if v_discount_type not in ('none', 'percent', 'amount') then
    raise exception 'Tipo de desconto inválido.';
  end if;

  if v_discount_type = 'percent' then
    v_discount_value := least(100, v_discount_value);
    v_discount := round(v_subtotal * (v_discount_value / 100), 2);
  elsif v_discount_type = 'amount' then
    v_discount := least(v_subtotal, v_discount_value);
  else
    v_discount_value := 0;
    v_discount := 0;
  end if;

  v_total := greatest(0, v_subtotal - v_discount);

  if coalesce(p_mark_paid, true) then
    v_status := 'paid';
    if v_payment_method = 'cash' then
      v_amount_received := coalesce(p_amount_received, 0);
      if v_amount_received < v_total then
        raise exception 'O valor recebido em dinheiro é menor que o total da venda.';
      end if;
      v_change := v_amount_received - v_total;
    else
      v_amount_received := v_total;
      v_change := 0;
    end if;
  else
    v_status := 'awaiting_payment';
    v_amount_received := null;
    v_change := 0;
  end if;

  v_clean_name := nullif(trim(coalesce(p_buyer_name, '')), '');
  v_clean_phone := nullif(trim(coalesce(p_buyer_phone, '')), '');

  loop
    v_public_code := 'PDV' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.commerce_orders where public_code = v_public_code);
  end loop;

  insert into public.commerce_orders (
    business_id, public_code, buyer_name, buyer_phone, notes, total_amount, status, paid_at,
    order_source, payment_method, amount_received, change_amount, discount_type, discount_value,
    discount_amount, pos_operator_id
  ) values (
    p_business_id, v_public_code, coalesce(v_clean_name, 'Consumidor final'), coalesce(v_clean_phone, 'Não informado'),
    nullif(trim(coalesce(p_notes, '')), ''), v_total, v_status,
    case when v_status = 'paid' then now() else null end,
    'pos', v_payment_method, v_amount_received, v_change, v_discount_type, v_discount_value,
    v_discount, auth.uid()
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.commerce_products where id = v_product_id;

    select coalesce(sum(
      case when coalesce(opt->>'price_adjustment', '') ~ '^-?[0-9]+([.][0-9]+)?$' then (opt->>'price_adjustment')::numeric else 0 end
    ), 0)
    into v_option_adjustment
    from jsonb_array_elements(coalesce(v_item->'selected_options', '[]'::jsonb)) grp,
         jsonb_array_elements(coalesce(grp->'options', '[]'::jsonb)) opt;

    v_unit_price := greatest(0, coalesce(v_product.price, 0) + coalesce(v_option_adjustment, 0));

    insert into public.commerce_order_items (
      order_id, product_id, product_name, unit_price, quantity, subtotal, selected_options, customer_note
    ) values (
      v_order_id, v_product.id, v_product.name, v_unit_price, v_quantity, v_unit_price * v_quantity,
      coalesce(v_item->'selected_options', '[]'::jsonb), nullif(trim(coalesce(v_item->>'customer_note', '')), '')
    );
  end loop;

  if v_status = 'paid' then
    for v_stock_row in
      select
        (x.value->>'product_id')::uuid as product_id,
        sum((x.value->>'quantity')::integer) as total_quantity
      from jsonb_array_elements(p_items) as x(value)
      group by (x.value->>'product_id')
    loop
      update public.commerce_products
      set stock_quantity = stock_quantity - v_stock_row.total_quantity,
          updated_at = now()
      where id = v_stock_row.product_id
        and stock_quantity is not null;
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_order_id,
    'public_code', v_public_code,
    'status', v_status,
    'total_amount', v_total,
    'subtotal_amount', v_subtotal,
    'discount_amount', v_discount,
    'payment_method', v_payment_method,
    'amount_received', v_amount_received,
    'change_amount', v_change
  );
end;
$$;

grant execute on function public.vf_pos_create_sale(uuid, text, text, text, jsonb, text, boolean, numeric, text, numeric) to authenticated;

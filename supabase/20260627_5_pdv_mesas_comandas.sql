-- VendaFácil Comércio — tabelas, segurança e funções públicas do MVP.
-- Execute este arquivo no SQL Editor do Supabase depois de publicar a versão do frontend.

create extension if not exists pgcrypto;

create table if not exists public.commerce_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  pix_key text,
  pix_receiver_name text,
  pix_city text default 'RIO DE JANEIRO',
  contact_whatsapp text,
  public_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commerce_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  description text,
  category text,
  price numeric(12,2) not null check (price >= 0),
  stock_quantity integer check (stock_quantity is null or stock_quantity >= 0),
  image_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commerce_products_business_active_idx on public.commerce_products (business_id, active, category, name);

create table if not exists public.commerce_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  public_code text not null unique,
  buyer_name text not null,
  buyer_phone text not null,
  notes text,
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','payment_reported','paid','fulfilled','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commerce_orders_business_created_idx on public.commerce_orders (business_id, created_at desc);
create index if not exists commerce_orders_business_status_idx on public.commerce_orders (business_id, status);

create table if not exists public.commerce_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  product_id uuid references public.commerce_products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists commerce_order_items_order_idx on public.commerce_order_items (order_id);

-- A função é usada pelas políticas e pelas rotinas de pedido.
create or replace function public.is_commerce_business_owner(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid()
  );
$$;

grant execute on function public.is_commerce_business_owner(uuid) to authenticated;

alter table public.commerce_settings enable row level security;
alter table public.commerce_products enable row level security;
alter table public.commerce_orders enable row level security;
alter table public.commerce_order_items enable row level security;

drop policy if exists commerce_settings_owner on public.commerce_settings;
create policy commerce_settings_owner on public.commerce_settings
  for all to authenticated
  using (public.is_commerce_business_owner(business_id))
  with check (public.is_commerce_business_owner(business_id));

drop policy if exists commerce_products_owner on public.commerce_products;
create policy commerce_products_owner on public.commerce_products
  for all to authenticated
  using (public.is_commerce_business_owner(business_id))
  with check (public.is_commerce_business_owner(business_id));

drop policy if exists commerce_orders_owner on public.commerce_orders;
create policy commerce_orders_owner on public.commerce_orders
  for select to authenticated
  using (public.is_commerce_business_owner(business_id));

drop policy if exists commerce_order_items_owner on public.commerce_order_items;
create policy commerce_order_items_owner on public.commerce_order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.commerce_orders o
      where o.id = order_id and public.is_commerce_business_owner(o.business_id)
    )
  );

-- Bucket público para as imagens da vitrine. A gravação fica limitada à pasta do usuário autenticado.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists commerce_product_images_upload on storage.objects;
create policy commerce_product_images_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists commerce_product_images_update on storage.objects;
create policy commerce_product_images_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists commerce_product_images_delete on storage.objects;
create policy commerce_product_images_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Dados que a vitrine pode consultar sem autenticação. Não expõe pedidos nem dados internos.
create or replace function public.get_public_store_data(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_settings public.commerce_settings%rowtype;
begin
  select * into v_business
  from public.businesses
  where slug = p_slug
  limit 1;

  if not found then
    raise exception 'Loja não encontrada.';
  end if;

  select * into v_settings
  from public.commerce_settings
  where business_id = v_business.id;

  return jsonb_build_object(
    'business', jsonb_build_object(
      'name', v_business.name,
      'slug', v_business.slug,
      'whatsapp', v_business.whatsapp
    ),
    'settings', jsonb_build_object(
      'pix_key', v_settings.pix_key,
      'pix_receiver_name', coalesce(v_settings.pix_receiver_name, v_business.name),
      'pix_city', coalesce(v_settings.pix_city, 'BRASIL'),
      'contact_whatsapp', coalesce(v_settings.contact_whatsapp, v_business.whatsapp),
      'public_description', v_settings.public_description
    ),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'description', p.description,
        'category', p.category,
        'price', p.price,
        'stock_quantity', p.stock_quantity,
        'image_url', p.image_url
      ) order by coalesce(p.category, ''), p.name)
      from public.commerce_products p
      where p.business_id = v_business.id
        and p.active = true
        and (p.stock_quantity is null or p.stock_quantity > 0)
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_public_store_data(text) to anon, authenticated;

-- Cria pedido pelo link público. O preço sempre é recalculado no banco, nunca aceito do navegador.
create or replace function public.create_public_commerce_order(
  p_slug text,
  p_buyer_name text,
  p_buyer_phone text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business public.businesses%rowtype;
  v_order_id uuid;
  v_public_code text;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_product public.commerce_products%rowtype;
  v_product_id uuid;
  v_quantity integer;
begin
  if char_length(trim(coalesce(p_buyer_name, ''))) < 2 then
    raise exception 'Informe o nome do cliente.';
  end if;
  if char_length(regexp_replace(coalesce(p_buyer_phone, ''), '\D', '', 'g')) < 10 then
    raise exception 'Informe um WhatsApp válido com DDD.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'O carrinho está vazio.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as x(value)
    group by x.value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'Cada produto deve aparecer apenas uma vez no carrinho.';
  end if;

  select * into v_business from public.businesses where slug = p_slug limit 1;
  if not found then
    raise exception 'Loja não encontrada.';
  end if;

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
    where id = v_product_id and business_id = v_business.id and active = true
    for share;

    if not found then
      raise exception 'Um dos produtos não está mais disponível.';
    end if;
    if v_product.stock_quantity is not null and v_product.stock_quantity < v_quantity then
      raise exception 'Estoque insuficiente para %.', v_product.name;
    end if;
    v_total := v_total + (v_product.price * v_quantity);
  end loop;

  v_public_code := 'VF' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.commerce_orders (business_id, public_code, buyer_name, buyer_phone, notes, total_amount)
  values (v_business.id, v_public_code, trim(p_buyer_name), trim(p_buyer_phone), nullif(trim(p_notes), ''), v_total)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.commerce_products where id = v_product_id;
    insert into public.commerce_order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_quantity, v_product.price * v_quantity);
  end loop;

  return jsonb_build_object('id', v_order_id, 'public_code', v_public_code, 'total_amount', v_total);
end;
$$;

grant execute on function public.create_public_commerce_order(text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.report_public_commerce_payment(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.commerce_orders
  set status = case when status = 'awaiting_payment' then 'payment_reported' else status end,
      updated_at = now()
  where id = p_order_id
    and status in ('awaiting_payment', 'payment_reported');

  if not found then
    raise exception 'Pedido não encontrado ou já finalizado.';
  end if;
  return true;
end;
$$;

grant execute on function public.report_public_commerce_payment(uuid) to anon, authenticated;

-- Apenas o dono do negócio pode confirmar/cancelar. A baixa do estoque acontece na confirmação manual do pagamento.
create or replace function public.commerce_set_order_status(p_order_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.commerce_orders%rowtype;
  v_item record;
  v_stock integer;
begin
  if p_status not in ('paid', 'fulfilled', 'cancelled') then
    raise exception 'Status inválido.';
  end if;

  select * into v_order from public.commerce_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.';
  end if;
  if not public.is_commerce_business_owner(v_order.business_id) then
    raise exception 'Sem permissão para alterar este pedido.';
  end if;
  if v_order.status in ('fulfilled', 'cancelled') then
    raise exception 'Este pedido já está finalizado.';
  end if;

  if p_status = 'paid' and v_order.status not in ('paid', 'fulfilled') then
    for v_item in
      select oi.product_id, oi.quantity, oi.product_name
      from public.commerce_order_items oi
      where oi.order_id = v_order.id
    loop
      select stock_quantity into v_stock from public.commerce_products where id = v_item.product_id for update;
      if v_stock is not null then
        if v_stock < v_item.quantity then
          raise exception 'Estoque insuficiente para confirmar o pagamento de %.', v_item.product_name;
        end if;
        update public.commerce_products
        set stock_quantity = stock_quantity - v_item.quantity,
            updated_at = now()
        where id = v_item.product_id;
      end if;
    end loop;

    update public.commerce_orders
    set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now()
    where id = v_order.id;
  elsif p_status = 'fulfilled' then
    if v_order.status <> 'paid' then
      raise exception 'Confirme o pagamento antes de marcar como entregue.';
    end if;
    update public.commerce_orders set status = 'fulfilled', updated_at = now() where id = v_order.id;
  elsif p_status = 'cancelled' then
    if v_order.status = 'paid' then
      raise exception 'Não cancele um pedido pago por esta tela. Faça o estorno e ajuste o estoque conscientemente.';
    end if;
    update public.commerce_orders set status = 'cancelled', updated_at = now() where id = v_order.id;
  end if;

  return true;
end;
$$;

grant execute on function public.commerce_set_order_status(uuid, text) to authenticated;

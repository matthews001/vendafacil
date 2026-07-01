-- FechAí — pagamento presencial na entrega, alertas úteis e tema compartilhado.
-- Execute depois das migrations de Entregas, Mesas e Status.
-- Não remove pedidos, mesas, entregadores nem histórico.

begin;

create extension if not exists pgcrypto;

alter table public.commerce_orders
  add column if not exists payment_method text,
  add column if not exists payment_details jsonb not null default '{}'::jsonb,
  add column if not exists amount_received numeric(12,2),
  add column if not exists change_amount numeric(12,2) not null default 0;

-- Central de alertas: guarda somente os avisos que geram popup (novo ou pronto).
create table if not exists public.commerce_order_notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid not null references public.commerce_orders(id) on delete cascade,
  order_public_code text,
  buyer_name text,
  total_amount numeric(12,2),
  title text not null,
  message text,
  alert_kind text not null default 'new' check (alert_kind in ('new','ready')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.commerce_order_notifications
  add column if not exists alert_kind text not null default 'new';

create index if not exists commerce_order_notifications_business_created_idx
  on public.commerce_order_notifications (business_id, created_at desc);

alter table public.commerce_order_notifications enable row level security;

drop policy if exists vf_order_notifications_business_access on public.commerce_order_notifications;
create policy vf_order_notifications_business_access
on public.commerce_order_notifications
for all
to authenticated
using (public.vf_pos_can_manage_business(business_id))
with check (public.vf_pos_can_manage_business(business_id));

-- Para instalações que já possuíam algum gatilho antigo: rejeita alertas de qualquer
-- outro status antes de entrarem na central/bell/popup.
create or replace function public.vf_filter_order_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text := lower(trim(coalesce(new.alert_kind, '')));
  v_text text := lower(coalesce(new.title, '') || ' ' || coalesce(new.message, ''));
begin
  if v_kind in ('new','ready') then
    return new;
  end if;
  if v_text ~ '(novo[[:space:]]+pedido|pedido[[:space:]]+recebido)' then
    new.alert_kind := 'new';
    return new;
  end if;
  if v_text ~ '(pedido[[:space:]]+pronto|pronto[[:space:]]+para[[:space:]]+(despacho|retirada|entrega))' then
    new.alert_kind := 'ready';
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists vf_filter_order_notification_trigger on public.commerce_order_notifications;
create trigger vf_filter_order_notification_trigger
before insert on public.commerce_order_notifications
for each row execute function public.vf_filter_order_notification();

create or replace function public.vf_emit_order_status_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_title text;
  v_message text;
begin
  if tg_op = 'INSERT' then
    v_kind := 'new';
    v_title := 'Novo pedido recebido';
    v_message := coalesce(new.public_code, 'Pedido') || ' · ' || coalesce(new.buyer_name, 'Cliente') || ' · ' || to_char(coalesce(new.total_amount, 0), 'FM999G999G990D00');
  elsif new.status = 'ready_for_pickup' and coalesce(old.status, '') <> 'ready_for_pickup' then
    v_kind := 'ready';
    v_title := case when new.fulfillment_type = 'delivery' then 'Pedido pronto para despacho' else 'Pedido pronto para retirada' end;
    v_message := coalesce(new.public_code, 'Pedido') || ' · ' || coalesce(new.buyer_name, 'Cliente') || case when new.fulfillment_type = 'delivery' then ' · Direcione um entregador.' else ' · Avise o cliente.' end;
  else
    return new;
  end if;

  insert into public.commerce_order_notifications (
    business_id, order_id, order_public_code, buyer_name, total_amount, title, message, alert_kind
  ) values (
    new.business_id, new.id, new.public_code, new.buyer_name, new.total_amount, v_title, v_message, v_kind
  );
  return new;
end;
$$;

drop trigger if exists vf_emit_order_status_alert_trigger on public.commerce_orders;
create trigger vf_emit_order_status_alert_trigger
after insert or update of status on public.commerce_orders
for each row execute function public.vf_emit_order_status_alert();

-- A vitrine registra corretamente se a cobrança será online (Pix) ou presencial.
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
  v_change_for numeric(12,2);
  v_in_person boolean;
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

  select o.* into v_order
  from public.commerce_orders o
  join public.businesses b on b.id = o.business_id
  where o.id = p_order_id and lower(b.slug) = lower(trim(p_slug))
  for update of o;

  if not found then raise exception 'Pedido não encontrado.'; end if;

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
  if not v_enabled or not v_allowed then raise exception 'Esta forma de pagamento não está disponível para este pedido.'; end if;
  if v_method = 'pix' and nullif(trim(coalesce(v_pix_key,'')), '') is null then raise exception 'A loja ainda não configurou a chave Pix.'; end if;

  v_change_for := null;
  if v_method = 'cash' and p_cash_change_for is not null then
    v_change_for := round(p_cash_change_for, 2);
    if v_change_for < v_order.total_amount then raise exception 'O valor para troco deve ser igual ou maior que o total do pedido.'; end if;
  end if;

  v_in_person := v_mode = 'delivery' and v_method <> 'pix';
  v_label := case v_method when 'pix' then 'Pix' when 'cash' then 'Dinheiro' when 'debit_card' then 'Cartão de débito' when 'credit_card' then 'Cartão de crédito' when 'meal_voucher' then 'Vale-refeição' when 'food_voucher' then 'Vale-alimentação' end;

  update public.commerce_orders
     set payment_method = v_method,
         payment_details = jsonb_build_object(
           'label', v_label,
           'collection', case when v_method = 'pix' then 'online' else 'in_person' end,
           'timing', case when v_method = 'pix' then 'now' when v_mode = 'delivery' then 'delivery' else 'pickup' end,
           'cash_change_for', v_change_for,
           'collection_status', case when v_method = 'pix' then 'pending' when v_in_person then 'pending_delivery' else 'pending_pickup' end
         ),
         updated_at = now()
   where id = v_order.id;

  return jsonb_build_object('id',v_order.id,'public_code',v_order.public_code,'total_amount',v_order.total_amount,'status',v_order.status,'payment_method',v_method,'payment_details',jsonb_build_object('label',v_label,'cash_change_for',v_change_for));
end;
$$;

grant execute on function public.vf_customer_apply_payment_method(text, text, uuid, text, numeric) to anon, authenticated;

-- Pedidos de delivery em dinheiro, cartão, vale ou maquininha ficam pendentes para cobrança no destino.
create or replace function public.vf_pos_create_delivery_sale(
  p_business_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_notes text,
  p_items jsonb,
  p_payment_method text,
  p_mark_paid boolean default true,
  p_amount_received numeric default null,
  p_discount_type text default 'none',
  p_discount_value numeric default 0,
  p_delivery_address jsonb default '{}'::jsonb,
  p_route_distance_km numeric default null,
  p_route_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.commerce_settings%rowtype;
  v_zone public.commerce_delivery_zones%rowtype;
  v_sale jsonb;
  v_order public.commerce_orders%rowtype;
  v_order_id uuid;
  v_fee numeric(12,2) := 0;
  v_final_total numeric(12,2);
  v_phone text;
  v_cep text;
  v_street text;
  v_number text;
  v_method text := lower(trim(coalesce(p_payment_method, 'pix')));
  v_in_person boolean;
  v_change_for numeric(12,2) := null;
  v_duration integer;
  v_label text;
begin
  if p_business_id is null then raise exception 'A loja ativa não foi identificada. Atualize a Frente de Caixa e tente novamente.'; end if;
  if not public.vf_pos_can_manage_business(p_business_id) then raise exception 'Sem permissão para operar o PDV desta loja.'; end if;
  if jsonb_typeof(coalesce(p_delivery_address, '{}'::jsonb)) <> 'object' then raise exception 'O endereço de entrega está inválido.'; end if;

  v_phone := regexp_replace(coalesce(p_buyer_phone, ''), '\D', '', 'g');
  v_cep := regexp_replace(coalesce(p_delivery_address->>'cep', ''), '\D', '', 'g');
  v_street := nullif(trim(coalesce(p_delivery_address->>'street', '')), '');
  v_number := nullif(trim(coalesce(p_delivery_address->>'number', '')), '');
  if nullif(trim(coalesce(p_buyer_name, '')), '') is null then raise exception 'Informe o nome do cliente para a entrega.'; end if;
  if char_length(v_phone) < 10 then raise exception 'Informe um WhatsApp válido para a entrega.'; end if;
  if char_length(v_cep) <> 8 or v_street is null or char_length(v_street) < 3 or v_number is null then raise exception 'Informe CEP, rua e número para a entrega.'; end if;

  select * into v_settings from public.commerce_settings where business_id = p_business_id for update;
  if not found or coalesce(v_settings.delivery_enabled, false) = false then raise exception 'A entrega não está habilitada para esta loja.'; end if;

  select z.* into v_zone
  from public.commerce_delivery_zones z
  where z.business_id = p_business_id and coalesce(z.active,false)=true and coalesce(z.is_mapbox_default,false)=false
    and exists (select 1 from jsonb_array_elements(coalesce(z.cep_ranges,'[]'::jsonb)) range_item where nullif(regexp_replace(coalesce(range_item->>'from',''),'\D','','g'),'') is not null and nullif(regexp_replace(coalesce(range_item->>'to',range_item->>'from',''),'\D','','g'),'') is not null and regexp_replace(coalesce(range_item->>'from',''),'\D','','g') <= v_cep and regexp_replace(coalesce(range_item->>'to',range_item->>'from',''),'\D','','g') >= v_cep)
  order by z.created_at nulls last, z.name limit 1;
  if not found then raise exception 'Este CEP não está dentro de uma área de entrega cadastrada.'; end if;

  if v_method not in ('cash','pix','debit_card','credit_card','meal_voucher','food_voucher','other','pending') then raise exception 'Forma de pagamento inválida.'; end if;
  v_in_person := v_method <> 'pix';
  if v_method='cash' and p_amount_received is not null then
    v_change_for := round(p_amount_received,2);
  end if;

  -- A função genérica só aceita pagamento pendente quando o método é pending.
  -- Para cobrança presencial, cria como pending e grava a forma correta logo em seguida.
  if v_in_person then
    v_sale := public.vf_pos_create_sale(p_business_id,p_buyer_name,v_phone,p_notes,p_items,'pending',false,null,p_discount_type,p_discount_value);
  else
    v_sale := public.vf_pos_create_sale(p_business_id,p_buyer_name,v_phone,p_notes,p_items,'pix',coalesce(p_mark_paid,true),null,p_discount_type,p_discount_value);
  end if;

  v_order_id := nullif(v_sale->>'id','')::uuid;
  select * into v_order from public.commerce_orders where id=v_order_id for update;
  if not found then raise exception 'Pedido de entrega não foi criado.'; end if;

  if coalesce(v_zone.minimum_order,0)>0 and coalesce(v_order.subtotal_amount,0)<v_zone.minimum_order then raise exception 'O pedido mínimo para esta área não foi atingido.'; end if;
  if coalesce(v_settings.delivery_minimum_order,0)>0 and coalesce(v_order.subtotal_amount,0)<v_settings.delivery_minimum_order then raise exception 'O pedido mínimo geral para entrega não foi atingido.'; end if;

  if coalesce(v_settings.delivery_free_above,0)>0 and coalesce(v_order.subtotal_amount,0)>=v_settings.delivery_free_above then v_fee:=0; else v_fee:=greatest(0,coalesce(v_zone.fee,0)); end if;
  v_final_total := greatest(0,coalesce(v_order.total_amount,0)+v_fee);
  if v_change_for is not null and v_change_for < v_final_total then raise exception 'O valor para troco deve ser igual ou maior que o total da entrega.'; end if;
  v_duration := coalesce(nullif(p_route_duration_minutes,0),v_zone.estimated_minutes);
  v_label := case v_method when 'pix' then 'Pix' when 'cash' then 'Dinheiro' when 'debit_card' then 'Cartão de débito' when 'credit_card' then 'Cartão de crédito' when 'meal_voucher' then 'Vale-refeição' when 'food_voucher' then 'Vale-alimentação' else 'Pagamento presencial' end;

  update public.commerce_orders
     set fulfillment_type='delivery',order_source='pos_delivery',delivery_fee=v_fee,
         delivery_address=jsonb_build_object('cep',v_cep,'street',v_street,'number',v_number,'complement',nullif(trim(coalesce(p_delivery_address->>'complement','')),''),'neighborhood',nullif(trim(coalesce(p_delivery_address->>'neighborhood','')),''),'city',nullif(trim(coalesce(p_delivery_address->>'city','')),''),'state',nullif(trim(coalesce(p_delivery_address->>'state','')),''),'reference',nullif(trim(coalesce(p_delivery_address->>'reference','')),''),'delivery_zone_id',v_zone.id,'delivery_zone_name',v_zone.name),
         delivery_route_distance_km=null,delivery_route_duration_minutes=v_duration,total_amount=v_final_total,
         payment_method=v_method,
         payment_details=jsonb_build_object('label',v_label,'collection',case when v_in_person then 'in_person' else 'online' end,'timing',case when v_in_person then 'delivery' else 'now' end,'cash_change_for',v_change_for,'collection_status',case when v_in_person then 'pending_delivery' when coalesce(p_mark_paid,true) then 'paid' else 'pending' end),
         paid_at=case when v_in_person then null when coalesce(p_mark_paid,true) then coalesce(v_order.paid_at,now()) else null end,
         amount_received=case when v_in_person then null when coalesce(p_mark_paid,true) then v_final_total else null end,
         change_amount=0, updated_at=now()
   where id=v_order_id;

  return v_sale || jsonb_build_object('fulfillment_type','delivery','delivery_fee',v_fee,'delivery_zone_id',v_zone.id,'delivery_zone_name',v_zone.name,'delivery_route_distance_km',null,'delivery_route_duration_minutes',v_duration,'total_amount',v_final_total,'payment_method',v_method,'amount_received',case when v_in_person then null else v_final_total end,'change_amount',0);
end;
$$;

grant execute on function public.vf_pos_create_delivery_sale(uuid, text, text, text, jsonb, text, boolean, numeric, text, numeric, jsonb, numeric, integer) to authenticated;

-- Painel: pagamento presencial em delivery não pode ser confirmado antes da rota.
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
  v_in_person_delivery boolean := false;
  v_change_for numeric(12,2) := null;
  v_received numeric(12,2);
begin
  if v_next not in ('paid','preparing','ready_for_pickup','out_for_delivery','fulfilled','cancelled') then raise exception 'Status inválido.'; end if;
  select * into v_order from public.commerce_orders where id=p_order_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.vf_pos_can_manage_business(v_order.business_id) then raise exception 'Sem permissão para alterar este pedido.'; end if;
  if v_order.status in ('fulfilled','cancelled') then raise exception 'Este pedido já está finalizado.'; end if;

  v_method := lower(coalesce(nullif(trim(v_order.payment_method),''),nullif(substring(coalesce(v_order.notes,'') from '\[\[VF_PAYMENT:([A-Za-z_]+)\]\]'),''),'pix'));
  v_in_person_delivery := v_order.fulfillment_type='delivery' and v_method in ('cash','debit_card','credit_card','meal_voucher','food_voucher','other','pending');

  if v_next='cancelled' then
    if v_order.status in ('paid','preparing','ready_for_pickup','out_for_delivery') then raise exception 'Não cancele pedido que já entrou em produção ou rota por esta tela.'; end if;
    update public.commerce_orders set status='cancelled',updated_at=now() where id=v_order.id;
    return true;
  end if;

  if v_next='paid' then
    if v_in_person_delivery then raise exception 'Pagamento presencial na entrega é confirmado somente quando o entregador concluir a entrega.'; end if;
    if v_order.status not in ('awaiting_payment','payment_reported') then raise exception 'Este pedido não está aguardando confirmação de pagamento.'; end if;
    for v_item in select product_id,quantity,product_name from public.commerce_order_items where order_id=v_order.id loop
      if v_item.product_id is null then raise exception 'O produto % não está disponível para baixa de estoque.',v_item.product_name; end if;
      select * into v_product from public.commerce_products where id=v_item.product_id for update;
      if not found then raise exception 'Produto % não encontrado.',v_item.product_name; end if;
      if v_product.stock_quantity is not null then
        if v_product.stock_quantity<v_item.quantity then raise exception 'Estoque insuficiente para confirmar %.',v_item.product_name; end if;
        update public.commerce_products set stock_quantity=stock_quantity-v_item.quantity,updated_at=now() where id=v_product.id;
        insert into public.commerce_stock_movements(business_id,product_id,order_id,movement_type,quantity,quantity_change,balance_after,note) values(v_order.business_id,v_product.id,v_order.id,'sale',-v_item.quantity,-v_item.quantity,v_product.stock_quantity-v_item.quantity,'Pagamento confirmado: '||v_order.public_code);
      end if;
    end loop;
    update public.commerce_orders set status='paid',paid_at=coalesce(paid_at,now()),payment_details=coalesce(payment_details,'{}'::jsonb)||jsonb_build_object('collection_status','paid'),updated_at=now() where id=v_order.id;
    return true;
  end if;

  if v_next='preparing' then
    if v_order.status='paid' then update public.commerce_orders set status='preparing',updated_at=now() where id=v_order.id; return true; end if;
    if v_in_person_delivery and v_order.status in ('awaiting_payment','payment_reported') then
      for v_item in select product_id,quantity,product_name from public.commerce_order_items where order_id=v_order.id loop
        if v_item.product_id is null then raise exception 'O produto % não está disponível para baixa de estoque.',v_item.product_name; end if;
        select * into v_product from public.commerce_products where id=v_item.product_id for update;
        if not found then raise exception 'Produto % não encontrado.',v_item.product_name; end if;
        if v_product.stock_quantity is not null then
          if v_product.stock_quantity<v_item.quantity then raise exception 'Estoque insuficiente para preparar %.',v_item.product_name; end if;
          update public.commerce_products set stock_quantity=stock_quantity-v_item.quantity,updated_at=now() where id=v_product.id;
          insert into public.commerce_stock_movements(business_id,product_id,order_id,movement_type,quantity,quantity_change,balance_after,note) values(v_order.business_id,v_product.id,v_order.id,'sale',-v_item.quantity,-v_item.quantity,v_product.stock_quantity-v_item.quantity,'Pedido com pagamento presencial enviado ao preparo: '||v_order.public_code);
        end if;
      end loop;
      update public.commerce_orders set status='preparing',updated_at=now() where id=v_order.id;
      return true;
    end if;
    raise exception 'Confirme o pagamento antes de enviar este pedido ao preparo.';
  end if;

  if v_next='ready_for_pickup' and v_order.status='preparing' then update public.commerce_orders set status='ready_for_pickup',updated_at=now() where id=v_order.id; return true; end if;
  if v_next='out_for_delivery' then raise exception 'Para sair para entrega, abra Entregas e atribua um entregador. O próprio entregador inicia a rota.'; end if;

  if v_next='fulfilled' then
    if v_order.fulfillment_type='delivery' and v_order.status<>'out_for_delivery' then raise exception 'A entrega deve ser iniciada pelo entregador antes da conclusão.'; end if;
    if v_order.fulfillment_type<>'delivery' and v_order.status<>'ready_for_pickup' then raise exception 'O pedido precisa estar pronto para retirada antes da conclusão.'; end if;
    if v_in_person_delivery then
      if coalesce(v_order.payment_details->>'cash_change_for','') ~ '^[0-9]+([.][0-9]+)?$' then v_change_for := (v_order.payment_details->>'cash_change_for')::numeric; end if;
      v_received := greatest(v_order.total_amount,coalesce(v_change_for,v_order.total_amount));
      update public.commerce_orders set status='fulfilled',paid_at=coalesce(paid_at,now()),amount_received=case when v_method='cash' then coalesce(amount_received,v_received) else coalesce(amount_received,v_order.total_amount) end,change_amount=case when v_method='cash' then greatest(0,v_received-v_order.total_amount) else 0 end,payment_details=coalesce(payment_details,'{}'::jsonb)||jsonb_build_object('collection_status','collected','collected_at',now()),updated_at=now() where id=v_order.id;
    else
      update public.commerce_orders set status='fulfilled',updated_at=now() where id=v_order.id;
    end if;
    return true;
  end if;
  raise exception 'Essa etapa não pode ser aplicada ao status atual do pedido.';
end;
$$;

grant execute on function public.commerce_set_order_status(uuid, text) to authenticated;

-- O entregador recebe tema, forma de pagamento e finaliza cobrança presencial no destino.
create or replace function public.vf_delivery_portal_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_business public.businesses%rowtype;
  v_primary_color text;
  v_logo text;
begin
  select * into v_employee from public.employees where user_id=auth.uid() and is_active=true order by created_at asc limit 1;
  if not found then raise exception 'Acesso de funcionário não encontrado ou inativo.'; end if;
  if not public.vf_delivery_employee_is_driver(v_employee.id,v_employee.business_id) then raise exception 'Este acesso não está habilitado como entregador.'; end if;
  select * into v_business from public.businesses where id=v_employee.business_id and active=true;
  if not found then raise exception 'A loja deste acesso está indisponível.'; end if;
  select brand_primary_color,store_logo_url into v_primary_color,v_logo from public.commerce_settings where business_id=v_business.id;
  update public.employees set last_login_at=now(),updated_at=now() where id=v_employee.id and (last_login_at is null or last_login_at<now()-interval '15 minutes');
  return jsonb_build_object('employee',jsonb_build_object('id',v_employee.id,'name',v_employee.name,'username',v_employee.username,'profile',coalesce(v_employee.profile_key,'Entregador')),'business',jsonb_build_object('id',v_business.id,'name',v_business.name,'slug',v_business.slug),'theme',jsonb_build_object('brand_primary_color',coalesce(v_primary_color,'#1d9e75'),'store_logo_url',v_logo));
end;
$$;

grant execute on function public.vf_delivery_portal_me() to authenticated;

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
  v_in_person boolean;
  v_change_for numeric(12,2) := null;
  v_received numeric(12,2);
begin
  select * into v_employee from public.employees where user_id=auth.uid() and is_active=true order by created_at asc limit 1;
  if not found or not public.vf_delivery_employee_is_driver(v_employee.id,v_employee.business_id) then raise exception 'Acesso de entregador não encontrado ou inativo.'; end if;
  select * into v_assignment from public.commerce_delivery_assignments where order_id=p_order_id and employee_id=v_employee.id and business_id=v_employee.business_id for update;
  if not found then raise exception 'Esta entrega não está direcionada para o seu acesso.'; end if;
  if v_assignment.status<>'out_for_delivery' then raise exception 'Inicie a rota antes de concluir a entrega.'; end if;
  select * into v_order from public.commerce_orders where id=p_order_id and business_id=v_employee.business_id for update;
  if not found or v_order.status<>'out_for_delivery' then raise exception 'O pedido não está em rota.'; end if;
  v_method:=lower(coalesce(nullif(trim(v_order.payment_method),''),'pix'));
  v_in_person:=v_method in ('cash','debit_card','credit_card','meal_voucher','food_voucher','other','pending');
  if coalesce(v_order.payment_details->>'cash_change_for','') ~ '^[0-9]+([.][0-9]+)?$' then v_change_for:=(v_order.payment_details->>'cash_change_for')::numeric; end if;
  v_received:=greatest(v_order.total_amount,coalesce(v_change_for,v_order.total_amount));
  update public.commerce_orders
     set status='fulfilled',
         paid_at=case when v_in_person then coalesce(paid_at,now()) else paid_at end,
         amount_received=case when v_in_person and v_method='cash' then coalesce(amount_received,v_received) when v_in_person then coalesce(amount_received,v_order.total_amount) else amount_received end,
         change_amount=case when v_in_person and v_method='cash' then greatest(0,v_received-v_order.total_amount) when v_in_person then 0 else change_amount end,
         payment_details=case when v_in_person then coalesce(payment_details,'{}'::jsonb)||jsonb_build_object('collection_status','collected','collected_at',now(),'collected_by_employee_id',v_employee.id) else payment_details end,
         updated_at=now()
   where id=v_order.id;
  return true;
end;
$$;

grant execute on function public.vf_delivery_portal_complete(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;

-- FechAí — limpeza Delivery-only após publicar o frontend limpo
-- EXECUTE APENAS DEPOIS de publicar a versão Delivery-only e testar:
-- vitrine, painel, pedidos, estoque, PDV/mesas, entregas, funcionários e Master.
--
-- Esta migration:
-- 1) cria cópia arquivada das estruturas removidas no schema vf_archive;
-- 2) consolida a assinatura V1 ausente na V2;
-- 3) mantém V2 como fonte oficial de planos, assinatura, pagamento e configuração Master;
-- 4) remove o legado de barbearia e as tabelas vazias negocios/negocio_dados;
-- 5) recria a exportação para usar apenas estruturas Delivery.
--
-- NÃO remove permissions, employee_roles, role_permissions, employees, pedidos, produtos,
-- estoque, mesas, comandas, entregas ou imagens.

begin;

-- Segurança: a limpeza não deve acontecer sem a estrutura V2 oficial.
do $$
begin
  if to_regclass('public.vf_business_subscriptions_v2') is null
     or to_regclass('public.vf_subscription_plans_v2') is null
     or to_regclass('public.vf_platform_settings_v2') is null then
    raise exception 'Estrutura V2 de assinaturas não foi encontrada. Interrompido por segurança.';
  end if;
end
$$;

create schema if not exists vf_archive;

-- Arquivos históricos: cria uma cópia somente na primeira execução.
do $$
declare
  source_table text;
  archive_table text;
begin
  foreach source_table in array array[
    'appointments','business_hours','customers','expenses','professionals','schedule_blocks','services',
    'negocios','negocio_dados',
    'vf_business_subscriptions','vf_subscription_payments','vf_subscription_plans','vf_platform_settings',
    'vf_subscription_plans_v2'
  ]
  loop
    if to_regclass('public.' || source_table) is not null then
      archive_table := source_table || '_20260701';
      if to_regclass('vf_archive.' || archive_table) is null then
        execute format('create table vf_archive.%I as table public.%I', archive_table, source_table);
      end if;
    end if;
  end loop;
end
$$;

-- V2 é a fonte oficial. Copia somente negócios que existem exclusivamente na V1.
-- O plano é associado por nome quando houver equivalente V2; nos registros atuais sem plano,
-- o valor permanece nulo até o Master escolher um plano.
do $$
begin
  if to_regclass('public.vf_business_subscriptions') is not null then
    insert into public.vf_business_subscriptions_v2 (
      business_id, module, plan_id, status, trial_ends_at, current_period_ends_at
    )
    select
      v1.business_id,
      'comercio',
      (
        select p2.id
        from public.vf_subscription_plans p1
        join public.vf_subscription_plans_v2 p2
          on lower(trim(p2.name)) = lower(trim(p1.name))
         and p2.module = 'comercio'
        where p1.id = v1.plan_id
        limit 1
      ),
      coalesce(v1.status, 'trial'),
      v1.trial_ends_at,
      v1.current_period_ends_at
    from public.vf_business_subscriptions v1
    where not exists (
      select 1
      from public.vf_business_subscriptions_v2 v2
      where v2.business_id = v1.business_id
    )
    on conflict (business_id) do nothing;
  end if;
end
$$;

-- Preserva os dados de cobrança da V1 quando a V2 ainda estiver em branco.
do $$
begin
  if to_regclass('public.vf_platform_settings') is not null then
    insert into public.vf_platform_settings_v2 (
      singleton, pix_key, pix_receiver_name, pix_city, support_whatsapp, payment_instructions
    )
    select
      singleton, pix_key, pix_receiver_name, pix_city, support_whatsapp, payment_instructions
    from public.vf_platform_settings
    on conflict (singleton) do update
      set pix_key = coalesce(public.vf_platform_settings_v2.pix_key, excluded.pix_key),
          pix_receiver_name = coalesce(public.vf_platform_settings_v2.pix_receiver_name, excluded.pix_receiver_name),
          pix_city = coalesce(public.vf_platform_settings_v2.pix_city, excluded.pix_city),
          support_whatsapp = coalesce(public.vf_platform_settings_v2.support_whatsapp, excluded.support_whatsapp),
          payment_instructions = coalesce(public.vf_platform_settings_v2.payment_instructions, excluded.payment_instructions);
  end if;
end
$$;

-- Novos deliveries não podem mais receber horário de barbearia ou assinatura V1.
drop trigger if exists trg_business_hours_created on public.businesses;
drop trigger if exists trg_business_subscription_created on public.businesses;


-- Mantém o trigger atual trg_business_created/handle_new_business, que não depende
-- do legado. Só os gatilhos que criavam horário de barbearia e assinatura V1 foram removidos.

-- Elimina o plano de barbearia remanescente da V2. Antes disso, ele já foi copiado
-- para vf_archive.vf_subscription_plans_v2_20260701 junto com os demais planos V2.
do $$
begin
  update public.vf_subscription_payments_v2 pay
  set plan_id = null
  where exists (
    select 1 from public.vf_subscription_plans_v2 plan
    where plan.id = pay.plan_id
      and plan.module <> 'comercio'
  );

  update public.vf_business_subscriptions_v2 sub
  set plan_id = null
  where exists (
    select 1 from public.vf_subscription_plans_v2 plan
    where plan.id = sub.plan_id
      and plan.module <> 'comercio'
  );

  delete from public.vf_subscription_plans_v2
  where module <> 'comercio';
end
$$;

alter table public.vf_subscription_plans_v2
  drop constraint if exists vf_subscription_plans_v2_module_check;
alter table public.vf_subscription_plans_v2
  add constraint vf_subscription_plans_v2_module_check check (module = 'comercio');

alter table public.vf_business_subscriptions_v2
  drop constraint if exists vf_business_subscriptions_v2_module_check;
alter table public.vf_business_subscriptions_v2
  add constraint vf_business_subscriptions_v2_module_check check (module = 'comercio');

-- Mantém avisos antigos, mas converte qualquer alvo de barbearia para Delivery.
update public.platform_notices
set target_scope = 'comercio',
    updated_at = now()
where target_scope = 'barbearia';

alter table public.platform_notices
  drop constraint if exists platform_notices_target_scope_check;
alter table public.platform_notices
  add constraint platform_notices_target_scope_check
  check (target_scope = any (array['all'::text, 'comercio'::text, 'specific'::text]));

create or replace function public.vf_seed_delivery_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.commerce_settings (business_id)
  values (new.id)
  on conflict (business_id) do nothing;

  insert into public.vf_business_subscriptions_v2 (business_id, module, status)
  values (new.id, 'comercio', 'trial')
  on conflict (business_id) do nothing;

  return new;
end;
$$;

drop trigger if exists vf_seed_delivery_defaults_trigger on public.businesses;
create trigger vf_seed_delivery_defaults_trigger
  after insert on public.businesses
  for each row
  execute function public.vf_seed_delivery_defaults();

revoke all on function public.vf_seed_delivery_defaults() from public;

-- Remove funções exclusivas de agenda/barbearia e da camada V1 obsoleta.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'complete_appointment',
        'create_internal_booking',
        'create_public_booking',
        'get_public_available_slots',
        'get_public_booking_data',
        'is_slot_available',
        'is_within_business_hours',
        'lookup_public_customer',
        'refresh_customer_totals_from_appointments',
        'set_appointment_status',
        'set_customer_phone_normalized',
        'handle_new_business_hours',
        'handle_new_subscription',
        'get_my_subscription',
        'platform_dashboard',
        'platform_get_settings',
        'platform_mark_pix_received',
        'platform_save_settings',
        'platform_set_subscription',
        'report_my_pix_payment'
      ])
  loop
    execute 'drop function if exists ' || fn.signature || ' cascade';
  end loop;
end
$$;

-- Exportação Delivery-only. Não consulta mais nenhuma tabela legada.
create or replace function public.vf_export_business_data(
  p_business_id uuid,
  p_dataset text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dataset text := lower(trim(coalesce(p_dataset, '')));
  v_rows jsonb := '[]'::jsonb;
begin
  if p_business_id is null or not public.vf_pos_can_manage_business(p_business_id) then
    raise exception 'Sem permissão para exportar os dados desta loja.';
  end if;

  case v_dataset
    when 'commerce_products' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.category, x.name), '[]'::jsonb)
        into v_rows
      from (
        select id, name, description, category, price, stock_quantity, active, image_url,
               option_groups, allow_customer_note, created_at, updated_at
        from public.commerce_products
        where business_id = p_business_id
      ) x;

    when 'commerce_orders' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
        into v_rows
      from (
        select id, public_code, buyer_name, buyer_phone, fulfillment_type, status,
               payment_method, subtotal_amount, delivery_fee, discount_amount, total_amount,
               scheduled_for, created_at, paid_at
        from public.commerce_orders
        where business_id = p_business_id
      ) x;

    when 'commerce_customers' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.full_name), '[]'::jsonb)
        into v_rows
      from (
        select c.id, c.full_name, c.phone, c.created_at,
               count(o.id) as total_orders,
               coalesce(sum(o.total_amount) filter (where o.status in ('paid','preparing','ready_for_pickup','out_for_delivery','fulfilled')), 0) as total_spent
        from public.commerce_store_customers c
        left join public.commerce_orders o on o.customer_account_id = c.id
        where c.business_id = p_business_id
        group by c.id, c.full_name, c.phone, c.created_at
      ) x;

    when 'commerce_stock_movements' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
        into v_rows
      from (
        select m.id, m.created_at, m.movement_type, m.quantity_change, m.balance_after, m.note,
               p.name as product_name, o.public_code as order_code
        from public.commerce_stock_movements m
        left join public.commerce_products p on p.id = m.product_id
        left join public.commerce_orders o on o.id = m.order_id
        where m.business_id = p_business_id
      ) x;

    when 'full_backup' then
      return jsonb_build_object(
        'generated_at', now(),
        'business', (select to_jsonb(b) from public.businesses b where b.id = p_business_id),
        'settings', (select to_jsonb(s) from public.commerce_settings s where s.business_id = p_business_id),
        'products', coalesce((select jsonb_agg(to_jsonb(p)) from public.commerce_products p where p.business_id = p_business_id), '[]'::jsonb),
        'orders', coalesce((select jsonb_agg(to_jsonb(o)) from public.commerce_orders o where o.business_id = p_business_id), '[]'::jsonb),
        'order_items', coalesce((select jsonb_agg(to_jsonb(i)) from public.commerce_order_items i join public.commerce_orders o on o.id = i.order_id where o.business_id = p_business_id), '[]'::jsonb),
        'customers', coalesce((select jsonb_agg(to_jsonb(c)) from public.commerce_store_customers c where c.business_id = p_business_id), '[]'::jsonb),
        'stock_movements', coalesce((select jsonb_agg(to_jsonb(m)) from public.commerce_stock_movements m where m.business_id = p_business_id), '[]'::jsonb),
        'delivery_zones', coalesce((select jsonb_agg(to_jsonb(z)) from public.commerce_delivery_zones z where z.business_id = p_business_id), '[]'::jsonb)
      );

    when 'full_backup_csv' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.dataset, x.created_at desc nulls last), '[]'::jsonb)
        into v_rows
      from (
        select 'products'::text as dataset, p.created_at, to_jsonb(p) - 'business_id' as data
          from public.commerce_products p where p.business_id = p_business_id
        union all
        select 'orders', o.created_at, to_jsonb(o) - 'business_id'
          from public.commerce_orders o where o.business_id = p_business_id
        union all
        select 'stock_movements', m.created_at, to_jsonb(m) - 'business_id'
          from public.commerce_stock_movements m where m.business_id = p_business_id
        union all
        select 'customers', c.created_at, to_jsonb(c) - 'business_id'
          from public.commerce_store_customers c where c.business_id = p_business_id
      ) x;

    else
      raise exception 'Tipo de exportação inválido.';
  end case;

  return jsonb_build_object('rows', v_rows);
end;
$$;

revoke all on function public.vf_export_business_data(uuid, text) from public;
grant execute on function public.vf_export_business_data(uuid, text) to authenticated;

-- Tabelas removidas. A cópia foi mantida em vf_archive para recuperação controlada.
drop table if exists public.appointments cascade;
drop table if exists public.schedule_blocks cascade;
drop table if exists public.expenses cascade;
drop table if exists public.business_hours cascade;
drop table if exists public.customers cascade;
drop table if exists public.professionals cascade;
drop table if exists public.services cascade;
drop table if exists public.negocio_dados cascade;
drop table if exists public.negocios cascade;

-- Versão V1 de assinatura: arquivada e substituída pela V2.
drop table if exists public.vf_subscription_payments cascade;
drop table if exists public.vf_business_subscriptions cascade;
drop table if exists public.vf_subscription_plans cascade;
drop table if exists public.vf_platform_settings cascade;

-- Mantém permissions e a estrutura de funcionários; apenas renomeia descrições que ainda falavam em agenda.
update public.permissions
set description = case id
  when 'business_hours_manage' then 'Gerenciar horários de funcionamento da loja'
  when 'appointments_manage' then 'Gerenciar pedidos agendados'
  else description
end
where id in ('business_hours_manage', 'appointments_manage');

commit;

-- VERIFICAÇÃO PÓS-EXECUÇÃO (consulta; não altera dados)
select
  to_regclass('public.appointments') is null as legado_agenda_removido,
  to_regclass('public.business_hours') is null as horarios_legados_removidos,
  to_regclass('public.negocios') is null as tabelas_antigas_removidas,
  to_regclass('public.vf_business_subscriptions') is null as assinatura_v1_removida,
  to_regclass('public.vf_business_subscriptions_v2') is not null as assinatura_v2_ativa,
  to_regclass('vf_archive.business_hours_20260701') is not null as arquivo_historico_criado,
  to_regclass('vf_archive.vf_subscription_plans_v2_20260701') is not null as plano_v2_arquivado,
  exists (select 1 from public.vf_business_subscriptions_v2) as assinaturas_v2_preservadas,
  not exists (select 1 from public.vf_subscription_plans_v2 where module <> 'comercio') as somente_planos_delivery;

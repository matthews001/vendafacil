-- VendaFácil — Central de avisos do Painel Master e histórico enxuto.
-- Esta migração depende da função de autorização Master já existente no projeto:
-- public.vf_is_platform_master().

create extension if not exists pgcrypto;

-- Usa a mesma regra de acesso Master que já protege o restante do painel.
-- Caso a função principal não exista, o acesso é negado por segurança.
create or replace function public.vf_notice_is_platform_master()
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_master boolean := false;
begin
  begin
    execute 'select public.vf_is_platform_master()' into v_is_master;
  exception
    when undefined_function then
      return false;
  end;
  return coalesce(v_is_master, false);
end;
$$;

create or replace function public.vf_notice_can_access_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.vf_notice_is_platform_master()
      or exists (
        select 1
        from public.businesses b
        where b.id = p_business_id
          and b.owner_id = auth.uid()
      );
$$;

create table if not exists public.platform_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 120),
  message text not null check (char_length(trim(message)) between 3 and 2000),
  target_scope text not null default 'all' check (target_scope in ('all', 'comercio', 'barbearia', 'specific')),
  target_business_ids uuid[] not null default '{}'::uuid[],
  priority text not null default 'normal' check (priority in ('normal', 'important')),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_scope = 'specific' and cardinality(target_business_ids) > 0)
    or (target_scope <> 'specific' and cardinality(target_business_ids) = 0)
  )
);

create index if not exists platform_notices_active_expires_idx
  on public.platform_notices (is_active, expires_at desc, created_at desc);

create table if not exists public.platform_activity_history (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  action text not null check (action in (
    'business_created',
    'business_blocked',
    'business_unblocked',
    'subscription_paid',
    'support_ticket_opened',
    'support_ticket_answered',
    'master_manager_access',
    'export_generated',
    'backup_generated'
  )),
  actor_type text not null check (actor_type in ('master', 'owner', 'system')),
  actor_id uuid,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_activity_history_created_idx
  on public.platform_activity_history (created_at desc);
create index if not exists platform_activity_history_business_created_idx
  on public.platform_activity_history (business_id, created_at desc);

alter table public.platform_notices enable row level security;
alter table public.platform_activity_history enable row level security;

-- Não há políticas de leitura direta: toda consulta passa por funções que validam o perfil.

create or replace function public.vf_cleanup_platform_activity_history()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.platform_activity_history
  where created_at < now() - interval '90 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Também tenta agendar limpeza diária quando pg_cron estiver disponível no projeto.
-- Se o recurso não estiver habilitado, a limpeza ainda ocorre automaticamente nas consultas do Painel Master.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $cron$
        select cron.schedule(
          'vendafacil-cleanup-platform-history',
          '17 3 * * *',
          'select public.vf_cleanup_platform_activity_history();'
        )
      $cron$;
    exception when others then
      raise notice 'Agendamento automático de histórico não criado: %', sqlerrm;
    end;
  end if;
end;
$$;

create or replace function public.vf_master_save_platform_notice(
  p_id uuid,
  p_title text,
  p_message text,
  p_target_scope text,
  p_target_business_ids uuid[],
  p_priority text,
  p_expires_at timestamptz,
  p_is_active boolean default true
)
returns public.platform_notices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope text := coalesce(nullif(trim(p_target_scope), ''), 'all');
  v_priority text := coalesce(nullif(trim(p_priority), ''), 'normal');
  v_ids uuid[] := '{}'::uuid[];
  v_notice public.platform_notices%rowtype;
  v_missing_count integer := 0;
begin
  if not public.vf_notice_is_platform_master() then
    raise exception 'Sem permissão para gerenciar avisos.';
  end if;

  if char_length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'Informe um título com pelo menos 3 caracteres.';
  end if;
  if char_length(trim(coalesce(p_message, ''))) < 3 then
    raise exception 'Informe a mensagem do aviso.';
  end if;
  if v_scope not in ('all', 'comercio', 'barbearia', 'specific') then
    raise exception 'Público do aviso inválido.';
  end if;
  if v_priority not in ('normal', 'important') then
    raise exception 'Prioridade inválida.';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'A data de expiração precisa ser futura.';
  end if;

  select coalesce(array_agg(distinct x), '{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_target_business_ids, '{}'::uuid[])) as t(x);

  if v_scope <> 'specific' then
    v_ids := '{}'::uuid[];
  elsif cardinality(v_ids) = 0 then
    raise exception 'Selecione ao menos uma loja específica.';
  else
    select count(*) into v_missing_count
    from unnest(v_ids) as wanted(id)
    where not exists (select 1 from public.businesses b where b.id = wanted.id);
    if v_missing_count > 0 then
      raise exception 'Uma ou mais lojas selecionadas não existem mais.';
    end if;
  end if;

  if p_id is null then
    insert into public.platform_notices (
      title, message, target_scope, target_business_ids, priority,
      expires_at, is_active, created_by
    ) values (
      trim(p_title), trim(p_message), v_scope, v_ids, v_priority,
      p_expires_at, coalesce(p_is_active, true), auth.uid()
    ) returning * into v_notice;
  else
    update public.platform_notices
    set title = trim(p_title),
        message = trim(p_message),
        target_scope = v_scope,
        target_business_ids = v_ids,
        priority = v_priority,
        expires_at = p_expires_at,
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where id = p_id
    returning * into v_notice;

    if not found then
      raise exception 'Aviso não encontrado.';
    end if;
  end if;

  return v_notice;
end;
$$;

create or replace function public.vf_master_set_platform_notice_active(
  p_id uuid,
  p_is_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.vf_notice_is_platform_master() then
    raise exception 'Sem permissão para alterar avisos.';
  end if;

  update public.platform_notices
  set is_active = coalesce(p_is_active, false), updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'Aviso não encontrado.';
  end if;
  return true;
end;
$$;

create or replace function public.vf_master_list_platform_notices()
returns table (
  id uuid,
  title text,
  message text,
  target_scope text,
  target_business_ids uuid[],
  target_count integer,
  target_names text,
  priority text,
  expires_at timestamptz,
  is_active boolean,
  is_expired boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.vf_notice_is_platform_master() then
    raise exception 'Sem permissão para consultar avisos.';
  end if;

  return query
  select
    n.id,
    n.title,
    n.message,
    n.target_scope,
    n.target_business_ids,
    case
      when n.target_scope = 'all' then (select count(*)::integer from public.businesses)
      when n.target_scope = 'comercio' then (select count(*)::integer from public.commerce_settings)
      when n.target_scope = 'barbearia' then (
        select count(*)::integer
        from public.businesses b
        where not exists (select 1 from public.commerce_settings c where c.business_id = b.id)
      )
      else cardinality(n.target_business_ids)
    end as target_count,
    case when n.target_scope = 'specific' then (
      select string_agg(b.name, ', ' order by b.name)
      from public.businesses b
      where b.id = any(n.target_business_ids)
    ) else null end as target_names,
    n.priority,
    n.expires_at,
    n.is_active,
    (n.expires_at is not null and n.expires_at <= now()) as is_expired,
    n.created_at,
    n.updated_at
  from public.platform_notices n
  order by n.is_active desc,
           (n.expires_at is null or n.expires_at > now()) desc,
           n.created_at desc;
end;
$$;

create or replace function public.vf_owner_list_active_platform_notices(
  p_business_id uuid
)
returns table (
  id uuid,
  title text,
  message text,
  priority text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_commerce boolean := false;
begin
  if not public.vf_notice_can_access_business(p_business_id) then
    raise exception 'Sem permissão para consultar os avisos desta loja.';
  end if;

  select exists (
    select 1
    from public.commerce_settings c
    where c.business_id = p_business_id
  ) into v_is_commerce;

  return query
  select n.id, n.title, n.message, n.priority, n.expires_at, n.created_at
  from public.platform_notices n
  where n.is_active = true
    and (n.expires_at is null or n.expires_at > now())
    and (
      n.target_scope = 'all'
      or (n.target_scope = 'comercio' and v_is_commerce)
      or (n.target_scope = 'barbearia' and not v_is_commerce)
      or (n.target_scope = 'specific' and p_business_id = any(n.target_business_ids))
    )
  order by case when n.priority = 'important' then 0 else 1 end,
           n.created_at desc;
end;
$$;

create or replace function public.vf_log_master_platform_activity(
  p_business_id uuid,
  p_action text,
  p_summary text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.vf_notice_is_platform_master() then
    raise exception 'Sem permissão para registrar atividade Master.';
  end if;
  if p_action not in (
    'business_created', 'business_blocked', 'business_unblocked',
    'subscription_paid', 'support_ticket_answered',
    'master_manager_access', 'export_generated', 'backup_generated'
  ) then
    raise exception 'Ação não permitida no histórico Master.';
  end if;
  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'Negócio não encontrado.';
  end if;

  perform public.vf_cleanup_platform_activity_history();

  insert into public.platform_activity_history (business_id, action, actor_type, actor_id, summary)
  values (p_business_id, p_action, 'master', auth.uid(), nullif(trim(coalesce(p_summary, '')), ''));
  return true;
end;
$$;

create or replace function public.vf_log_owner_platform_activity(
  p_business_id uuid,
  p_action text,
  p_summary text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = auth.uid()
  ) then
    raise exception 'Sem permissão para registrar atividade desta loja.';
  end if;
  if p_action not in ('support_ticket_opened', 'export_generated', 'backup_generated') then
    raise exception 'Ação não permitida no histórico do cliente.';
  end if;

  perform public.vf_cleanup_platform_activity_history();

  insert into public.platform_activity_history (business_id, action, actor_type, actor_id, summary)
  values (p_business_id, p_action, 'owner', auth.uid(), nullif(trim(coalesce(p_summary, '')), ''));
  return true;
end;
$$;

create or replace function public.vf_master_list_platform_activity(
  p_limit integer default 120
)
returns table (
  id uuid,
  business_id uuid,
  business_name text,
  action text,
  actor_type text,
  summary text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.vf_notice_is_platform_master() then
    raise exception 'Sem permissão para consultar o histórico.';
  end if;

  perform public.vf_cleanup_platform_activity_history();

  return query
  select h.id, h.business_id, b.name, h.action, h.actor_type, h.summary, h.created_at
  from public.platform_activity_history h
  join public.businesses b on b.id = h.business_id
  where h.created_at >= now() - interval '90 days'
  order by h.created_at desc
  limit greatest(1, least(coalesce(p_limit, 120), 250));
end;
$$;

grant execute on function public.vf_master_save_platform_notice(uuid, text, text, text, uuid[], text, timestamptz, boolean) to authenticated;
grant execute on function public.vf_master_set_platform_notice_active(uuid, boolean) to authenticated;
grant execute on function public.vf_master_list_platform_notices() to authenticated;
grant execute on function public.vf_owner_list_active_platform_notices(uuid) to authenticated;
grant execute on function public.vf_log_master_platform_activity(uuid, text, text) to authenticated;
grant execute on function public.vf_log_owner_platform_activity(uuid, text, text) to authenticated;
grant execute on function public.vf_master_list_platform_activity(integer) to authenticated;

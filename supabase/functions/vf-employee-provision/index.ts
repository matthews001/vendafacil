import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type EmployeePayload = {
  employee_id?: string;
  business_id: string;
  name: string;
  username: string;
  pin?: string;
  role_id: string;
  profile_key?: string;
  email?: string | null;
  phone?: string | null;
  is_active: boolean;
  permissions: string[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });

const normalizeUsername = (value: unknown) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9._-]/g, '');

const isPin = (value: unknown) => /^\d{6}$/.test(String(value || ''));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Edge Function sem SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  const authorization = req.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Sessão inválida.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const actorId = userData?.user?.id;
  if (userError || !actorId) return json({ error: 'Sessão inválida.' }, 401);

  let payload: EmployeePayload;
  try {
    payload = await req.json();
  } catch (_) {
    return json({ error: 'Dados inválidos.' }, 400);
  }

  const businessId = String(payload.business_id || '').trim();
  const name = String(payload.name || '').trim();
  const username = normalizeUsername(payload.username);
  const roleId = String(payload.role_id || '').trim();
  const employeeId = String(payload.employee_id || '').trim();
  const pin = String(payload.pin || '').trim();
  const permissions = Array.from(new Set(Array.isArray(payload.permissions) ? payload.permissions.map(String) : []));
  const isActive = payload.is_active !== false;

  if (!businessId || name.length < 2 || username.length < 3 || !roleId) {
    return json({ error: 'Preencha nome, usuário e perfil corretamente.' }, 400);
  }
  if (pin && !isPin(pin)) {
    return json({ error: 'O PIN deve ter 6 dígitos numéricos.' }, 400);
  }

  // O Master pode administrar os acessos de qualquer loja. O dono continua
  // limitado à própria loja. Esta checagem usa a lista oficial de Master,
  // em vez de inferir o perfil pela primeira loja criada.
  const { data: masterUser, error: masterError } = await admin
    .from('vf_platform_master_users')
    .select('user_id')
    .eq('user_id', actorId)
    .maybeSingle();
  const isMaster = !masterError && !!masterUser;

  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id, owner_id, name')
    .eq('id', businessId)
    .maybeSingle();
  if (businessError || !business) return json({ error: 'Loja não encontrada.' }, 404);

  const isOwner = business.owner_id === actorId;
  if (!isOwner && !isMaster) {
    return json({ error: 'Você não tem permissão para administrar os acessos desta loja.' }, 403);
  }

  const { data: role, error: roleError } = await admin
    .from('employee_roles')
    .select('id, name')
    .eq('id', roleId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (roleError || !role) return json({ error: 'Perfil de acesso inválido.' }, 400);

  const { data: permissionRows, error: permissionsError } = await admin
    .from('permissions')
    .select('id');
  if (permissionsError) return json({ error: 'Não foi possível validar as permissões.' }, 500);

  const validPermissionIds = new Set((permissionRows || []).map((row) => row.id));
  if (permissions.some((id) => !validPermissionIds.has(id))) {
    return json({ error: 'Uma das permissões selecionadas é inválida.' }, 400);
  }

  let employee: { id: string; user_id: string | null; auth_login_email: string | null } | null = null;
  if (employeeId) {
    const { data, error } = await admin
      .from('employees')
      .select('id, user_id, auth_login_email')
      .eq('id', employeeId)
      .eq('business_id', businessId)
      .maybeSingle();
    if (error || !data) return json({ error: 'Acesso não encontrado.' }, 404);
    employee = data;
  }

  let userId = employee?.user_id || null;
  let loginEmail = employee?.auth_login_email || null;
  let createdUserId: string | null = null;

  try {
    // Migra acessos antigos que tinham user_id, mas ainda não tinham o identificador interno.
    // Nesse caso o administrador precisa informar um novo PIN uma única vez.
    if (userId && !loginEmail) {
      const { data: legacyAuth, error: legacyAuthError } = await admin.auth.admin.getUserById(userId);
      if (!legacyAuthError && legacyAuth?.user?.email) loginEmail = legacyAuth.user.email;
      else userId = null;
    }

    const credentialNeedsSetup = !userId || !loginEmail;
    if (credentialNeedsSetup && !isPin(pin)) {
      return json({ error: 'Defina um novo PIN de 6 dígitos para ativar este acesso.' }, 400);
    }

    if (!userId) {
      loginEmail = `staff-${crypto.randomUUID().replaceAll('-', '')}@login.vendafacil.local`;
      const { data: created, error: createAuthError } = await admin.auth.admin.createUser({
        email: loginEmail,
        password: pin,
        email_confirm: true,
        user_metadata: { account_type: 'commerce_employee', business_id: businessId, username, full_name: name },
        app_metadata: { account_type: 'commerce_employee', business_id: businessId },
      });
      if (createAuthError || !created?.user) throw new Error(createAuthError?.message || 'Não foi possível criar a credencial segura.');
      userId = created.user.id;
      createdUserId = userId;
    } else {
      const attributes: any = {
        user_metadata: { account_type: 'commerce_employee', business_id: businessId, username, full_name: name },
        app_metadata: { account_type: 'commerce_employee', business_id: businessId },
      };
      if (pin) attributes.password = pin;
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(userId, attributes);
      if (updateAuthError) throw new Error(updateAuthError.message || 'Não foi possível atualizar a credencial segura.');
    }

    const employeePayload = {
      business_id: businessId,
      user_id: userId,
      role_id: roleId,
      name,
      username,
      pin: null,
      email: String(payload.email || '').trim() || null,
      phone: String(payload.phone || '').trim() || null,
      is_active: isActive,
      profile_key: String(payload.profile_key || role.name || 'Funcionário').trim() || 'Funcionário',
      auth_login_email: loginEmail,
      pin_changed_at: pin ? new Date().toISOString() : undefined,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    };

    let savedEmployeeId = employee?.id;
    if (savedEmployeeId) {
      const { error: updateEmployeeError } = await admin
        .from('employees')
        .update(employeePayload)
        .eq('id', savedEmployeeId)
        .eq('business_id', businessId);
      if (updateEmployeeError) throw new Error(updateEmployeeError.message || 'Não foi possível atualizar o acesso.');
    } else {
      const { data: inserted, error: insertEmployeeError } = await admin
        .from('employees')
        .insert(employeePayload)
        .select('id')
        .single();
      if (insertEmployeeError || !inserted) throw new Error(insertEmployeeError?.message || 'Não foi possível salvar o acesso.');
      savedEmployeeId = inserted.id;
    }

    const allOverrides = (permissionRows || []).map((row) => ({
      employee_id: savedEmployeeId,
      permission_id: row.id,
      allowed: permissions.includes(row.id),
      updated_at: new Date().toISOString(),
    }));

    const { error: clearOverridesError } = await admin
      .from('employee_permission_overrides')
      .delete()
      .eq('employee_id', savedEmployeeId);
    if (clearOverridesError) throw new Error(clearOverridesError.message || 'Não foi possível atualizar as permissões.');

    if (allOverrides.length) {
      const { error: insertOverridesError } = await admin
        .from('employee_permission_overrides')
        .insert(allOverrides);
      if (insertOverridesError) throw new Error(insertOverridesError.message || 'Não foi possível salvar as permissões.');
    }

    // Auditoria leve para ações realizadas pelo Master. Não interrompe o
    // salvamento caso o log esteja indisponível.
    if (isMaster) {
      await admin
        .from('vf_master_access_logs')
        .insert({
          master_user_id: actorId,
          business_id: businessId,
          action: savedEmployeeId === employee?.id ? 'employee_access_updated' : 'employee_access_created',
          metadata: {
            employee_id: savedEmployeeId,
            employee_name: name,
            username,
            role_id: roleId,
            business_name: business.name,
          },
        })
        .then(() => undefined)
        .catch(() => undefined);
    }

    return json({ ok: true, employee_id: savedEmployeeId, actor: isMaster ? 'master' : 'owner' });
  } catch (error) {
    if (createdUserId) {
      await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    return json({ error: error instanceof Error ? error.message : 'Não foi possível salvar o acesso.' }, 400);
  }
});

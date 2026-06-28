import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [template, migration, edge] = await Promise.all([
  readFile(resolve(root, 'index.template.html'), 'utf8'),
  readFile(resolve(root, 'supabase/20260628_13_acessos_funcionarios_seguro.sql'), 'utf8'),
  readFile(resolve(root, 'supabase/functions/vf-employee-provision/index.ts'), 'utf8')
]);
const requirements = [
  ['tela de permissões', template, 'employee-permissions-grid'],
  ['portal do funcionário', template, 'vfEmployeePortalBoot'],
  ['login usuário + PIN', template, 'vf_employee_login_identifier'],
  ['migration segura', migration, 'employee_permission_overrides'],
  ['portal de pedidos', migration, 'vf_employee_portal_set_order_status'],
  ['função segura de provisionamento', edge, 'auth.admin.createUser']
];
for (const [label, content, token] of requirements) {
  if (!content.includes(token)) throw new Error(`Falha no módulo de Acessos: ${label}.`);
}
console.log('Acessos validado: tela, permissões, portal, migration e Edge Function presentes.');

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.template.html'), 'utf8');

if (!html.includes('screen-commerce-app') || !html.includes('screen-store')) throw new Error('Telas do Comércio não foram encontradas.');
if (!html.includes('onclick="openManualOrderModal()"')) throw new Error('Botão de pedido manual não foi encontrado.');
if (!html.includes('Object.assign(window, {\n    openManualOrderModal,')) throw new Error('Funções do pedido manual não foram expostas no navegador.');
if (!html.includes('p_items: selectedItems')) throw new Error('Itens do pedido manual devem ser enviados como lista JSON.');
if (html.includes('<script src="assets/commerce-extension.js"></script>')) throw new Error('A extensão legada não deve ser carregada, pois substitui o tema e o banner atuais.');
if (!html.includes('store_banner_url') || !html.includes('v7ApplyCommerceTheme')) throw new Error('Configurações atuais de tema e banner não foram encontradas.');
if (!html.includes("paid: 'Pagamento aprovado'")) throw new Error('Pagamento aprovado precisa ter um rótulo próprio.');
if (!html.includes('const paymentStage = order.status')) throw new Error('A linha do tempo precisa consolidar a etapa de pagamento.');
if (!html.includes('vf-store-hero-media') || !html.includes('applyStorefrontBanner')) throw new Error('A proteção visual do banner não foi encontrada.');
if (!html.includes('commerce-page-customers') || !html.includes('commerce_admin_list_customers')) throw new Error('Gerenciamento de clientes do Comércio não foi encontrado.');
if (!html.includes('commerce_admin_reset_customer_password') || !html.includes('Nova senha (opcional)')) throw new Error('Redefinição segura de senha do cliente não foi encontrada.');
if (!html.includes('commerce_preview_coupon') || !html.includes('commerce_customer_create_order')) throw new Error('Fluxo protegido de cupom e pedido do cliente não foi encontrado.');
if (!html.includes('commerce-coupons-table') || !html.includes('store-coupon-box')) throw new Error('Tela de cupons e campo de cupom do checkout não foram encontrados.');
if (!html.includes('store_opening_hours') || !html.includes('commerce-hours-card')) throw new Error('Configuração de horário da loja não foi encontrada.');
if (!html.includes('vf-store-hours-notice') || !html.includes('createCommerceOrderWithFeatures')) throw new Error('Aviso de horário e confirmação pelo WhatsApp não foram encontrados.');
if (!html.includes('commerce-product-options') || !html.includes('option_groups')) throw new Error('Configuração de opções e adicionais por produto não foi encontrada.');
if (!html.includes('commerce-scheduling-card') || !html.includes('store-schedule-box')) throw new Error('Configuração e escolha de pedido agendado não foram encontradas.');
if (!html.includes('commerce_customer_create_order') || !html.includes('p_scheduled_for')) throw new Error('Pedido com opções e agendamento não está sendo enviado ao Supabase.');
if (!html.includes('vf_master_open_business_manager') || !html.includes('vfMasterEnterBusinessManager')) throw new Error('Acesso do Master ao gerenciador do cliente não foi encontrado.');
if (!html.includes('vf-master-manager-banner') || !html.includes('vfMasterReturnToDashboard')) throw new Error('Aviso e retorno do acesso Master não foram encontrados.');
if (!html.includes('Administrador da plataforma') || !html.includes('data-vf-internal')) throw new Error('Tratamento do Master sem plano, valor e vencimento não foi encontrado.');
console.log('Template validado: tema, banner, cupons, horário, delivery, clientes, opções, agendamento e acesso master protegidos.');

if (!html.includes('VendaFácil V9') || !html.includes('vf_master_create_business')) throw new Error('Cadastro guiado de nova loja não foi encontrado.');
if (!html.includes('v9-master-quick-summary') || !html.includes('commerce_revenue_month')) throw new Error('Dashboard e resumo por loja não foram encontrados.');
if (!html.includes('vf_master_set_access_controls') || !html.includes('Pedidos bloqueados')) throw new Error('Bloqueios separados de pedidos e gerenciador não foram encontrados.');
if (!html.includes('vf_master_update_support_ticket') || !html.includes('Central de suporte')) throw new Error('Central de suporte não foi encontrada.');
if (!html.includes('vf_export_business_data') || !html.includes('Backup CSV')) throw new Error('Exportação de dados do cliente não foi encontrada.');
if (!html.includes('vf_get_public_commerce_access') || !html.includes('Pedidos pausados')) throw new Error('Bloqueio público de novos pedidos não foi encontrado.');
console.log('Template validado: Painel Master operacional, suporte, bloqueios, cobrança, atividade e exportação incluídos.');

if (!html.includes('VendaFácil V10') || !html.includes('v10ExportCommerceReportCsv')) throw new Error('Exportação CSV/PDF nos relatórios não foi encontrada.');
if (!html.includes('v10OpenMasterExport') || !html.includes('Backup CSV')) throw new Error('Backup CSV do cliente pelo Painel Master não foi encontrado.');
console.log('Template validado: exportações visíveis em CSV/PDF e backup do cliente pelo Master incluídos.');
if (!html.includes('VendaFácil V11') || !html.includes('Suporte e dados')) throw new Error('Menu visível de suporte e dados não foi encontrado.');
if (!html.includes('v11-owner-hub-modal') || !html.includes('v11SubmitOwnerTicket')) throw new Error('Central visível de chamados do cliente não foi encontrada.');
if (!html.includes('v11ExportOwnerData') || !html.includes('Backup CSV')) throw new Error('Exportações do cliente não foram expostas na central visível.');
console.log('Template validado: menu visível de suporte, chamados e exportações do cliente incluídos.');
await access(resolve(root, 'supabase/migrations/20260626_master_notices_and_history.sql'));
if (!html.includes('Central de avisos') || !html.includes('vf_master_save_platform_notice')) throw new Error('Central de avisos do Painel Master não foi encontrada.');
if (!html.includes('vf_master_list_platform_activity') || !html.includes('últimos 90 dias')) throw new Error('Histórico enxuto de 90 dias não foi encontrado.');
console.log('Template validado: central de avisos e histórico enxuto de 90 dias incluídos.');

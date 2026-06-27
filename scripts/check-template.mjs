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
if (!html.includes("matheuzaraujo17@gmail.com") || !html.includes('vfIsInternalMasterBusiness')) throw new Error('A identidade correta da conta Master não foi configurada.');
if (!html.includes('withMasterTimeout') || html.includes("master-access-' + String(args[0]")) throw new Error('A proteção contra travamento do acesso Master não foi aplicada.');
if (!html.includes('commerce-delivery-origin-address') || !html.includes('MAPBOX_PUBLIC_TOKEN')) throw new Error('Configuração de origem e token do Mapbox não foi encontrada.');

const lightStore = await readFile(resolve(root, 'loja.template.html'), 'utf8');
if (!lightStore.includes('assets/storefront.v5-mapbox-address.js') || !lightStore.includes('store-products')) throw new Error('Vitrine pública leve não foi encontrada.');
await access(resolve(root, 'assets/storefront.js'));
await access(resolve(root, 'assets/storefront.css'));
if (!lightStore.includes('store-delivery-route-card') || !lightStore.includes('calculateStoreDeliveryRoute')) throw new Error('Mapa e cálculo de rota não foram encontrados na vitrine pública.');
if (!lightStore.includes('Bairro <span class="vf-muted">(opcional)</span>')) throw new Error('Bairro deve ser opcional no checkout por Mapbox.');
const storefront = await readFile(resolve(root, 'assets/storefront.js'), 'utf8');
if (!storefront.includes('A rota será calculada a partir do endereço digitado.') || !storefront.includes("routeAddressReady(address){ return address.cep.length===8&&address.street.length>=3&&address.number.length>0; }")) throw new Error('Checkout Mapbox precisa calcular rota por CEP, rua e número.');
if (!html.includes("location.replace('/loja?' + params.toString())")) throw new Error('Links públicos precisam redirecionar para a vitrine leve.');
await access(resolve(root, 'supabase/migrations/20260626_delivery_mapbox_route.sql'));
console.log('Template validado: vitrine pública leve, rota, distância e tempo de entrega incluídos.');

if (!html.includes('commerce-page-pos') || !html.includes('Frente de caixa') || !html.includes('vfOpenPos')) throw new Error('Entrada do PDV não foi encontrada.');
if (!(html.includes('PDV · PASSO 7 DE 12') || html.includes('PDV · PASSO 8 DE 12')) || !html.includes('vf-pdv-console') || !html.includes('vf-pdv-workspace')) throw new Error('Layout operacional do PDV não foi encontrado.');
if (!html.includes('vfPdvSearch') || !html.includes('vf-pdv-product-modal') || !html.includes('vf-pdv-step4-script')) throw new Error('Catálogo e carrinho do PDV não foram encontrados.');
if (!html.includes('vf-pdv-step5-script') || !html.includes('vf_pos_create_sale') || !html.includes('Finalizar venda e pagamento')) throw new Error('Venda de balcão e pagamento do PDV não foram encontrados.');
const posStep3 = html.indexOf('id="vf-pdv-step3-script"');
const posStep4 = html.indexOf('id="vf-pdv-step4-script"');
const posStep5 = html.indexOf('id="vf-pdv-step5-script"');
if (posStep3 < 0 || posStep4 <= posStep3 || posStep5 <= posStep4) throw new Error('Os scripts do PDV foram inseridos fora da ordem correta.');
console.log('Template validado: PDV até o Passo 5, com carrinho e pagamento sem vazamento de código na tela.');
if (!html.includes('vf-pdv-focus-layout-styles') || !html.includes('vfPdvExitFocus') || !html.includes('vf-pdv-focus')) throw new Error('O PDV precisa abrir em modo de foco, ocupando a área operacional.');
console.log('Template validado: PDV em modo de foco, sem mini tela dentro do painel.');
if (!html.includes('vfToggleManagedBanner') || !html.includes('vf-master-manager-collapse') || !html.includes('#screen-commerce-app.vf-pdv-focus .main > #v12-owner-notices')) throw new Error('O contexto Master precisa ficar flutuante e os avisos gerais ocultos durante o PDV.');
console.log('Template validado: contexto Master flutuante e avisos gerais fora da área operacional do PDV.');


await access(resolve(root, 'supabase/migrations/20260627_5_pdv_mesas_comandas.sql'));
if (!html.includes('vf-pdv-step6-script') || !html.includes('vf_pos_open_table_tab') || !html.includes('vf_pos_close_table_tab')) throw new Error('Mesas e comandas do PDV não foram encontradas.');
if (!html.includes('vfPdv6Transfer') || !html.includes('vfPdv6Split') || !html.includes('Fechar comanda e pagar')) throw new Error('Transferência, divisão e fechamento de comanda precisam estar disponíveis.');
const posStep6 = html.indexOf('id="vf-pdv-step6-script"');
if (posStep6 <= posStep5) throw new Error('O script de mesas/comandas precisa carregar após o pagamento do PDV.');
console.log('Template validado: PDV Passo 6 com mesas, comandas, transferência, divisão e fechamento de conta incluídos.');
if (!html.includes('vf-pdv-state-bridge') || !html.includes('vfPdvGetBusinessId') || !html.includes('payload.p_business_id = activeBusinessId')) throw new Error('Mesas precisa usar a loja ativa e nunca enviar business_id vazio.');
console.log('Template validado: Passo 6 protegido contra business_id vazio.');

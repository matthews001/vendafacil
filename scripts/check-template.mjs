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
await access(resolve(root, 'supabase/migrations/20260625_storefront_branding_fix.sql'));
await access(resolve(root, 'supabase/migrations/20260626_commerce_growth_features.sql'));
if (!html.includes('commerce_preview_coupon') || !html.includes('commerce_customer_create_order')) throw new Error('Fluxo protegido de cupom e pedido do cliente não foi encontrado.');
if (!html.includes('commerce-coupons-table') || !html.includes('store-coupon-box')) throw new Error('Tela de cupons e campo de cupom do checkout não foram encontrados.');
if (!html.includes('store_opening_hours') || !html.includes('commerce-hours-card')) throw new Error('Configuração de horário da loja não foi encontrada.');
if (!html.includes('vf-store-hours-notice') || !html.includes('createCommerceOrderWithFeatures')) throw new Error('Aviso de horário e confirmação pelo WhatsApp não foram encontrados.');
console.log('Template validado: tema, banner, cupons, horário, delivery e pedidos protegidos.');

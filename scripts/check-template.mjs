import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'index.template.html'), 'utf8');

if (!html.includes('screen-commerce-app') || !html.includes('screen-store')) throw new Error('Telas do Comércio não foram encontradas.');
if (!html.includes('onclick="openManualOrderModal()"')) throw new Error('Botão de pedido manual não foi encontrado.');
if (!html.includes('Object.assign(window, {\n    openManualOrderModal,')) throw new Error('Funções do pedido manual não foram expostas no navegador.');
if (!html.includes('p_items: selectedItems')) throw new Error('Itens do pedido manual devem ser enviados como lista JSON.');
if (html.includes('<script src="assets/commerce-extension.js"></script>')) throw new Error('A extensão legada não deve ser carregada, pois substitui o tema e o banner atuais.');
if (!html.includes('store_banner_url') || !html.includes('v7ApplyCommerceTheme')) throw new Error('Configurações atuais de tema e banner não foram encontradas.');
console.log('Template validado: tema/banner preservados e pedido manual isolado.');

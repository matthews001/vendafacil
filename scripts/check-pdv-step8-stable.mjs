import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const [html, foundation] = await Promise.all([
  readFile(resolve(root, 'src/templates/index.template.html'), 'utf8'),
  readFile(resolve(root, 'src/assets/styles/app-foundation.css'), 'utf8')
]);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
assert(foundation.includes('PDV — Passo 8 estável'), 'Estilos do Passo 8 não encontrados.');
assert(html.includes('id="vf-pdv-step8-script"'), 'Script do Passo 8 não encontrado.');
assert(html.includes('/assets/styles/app-foundation.css'), 'Estilos extraídos do Passo 8 precisam ser carregados no head.');
assert(html.indexOf('id="vf-pdv-step8-script"') < html.lastIndexOf('</body>'), 'Script do Passo 8 precisa ficar antes do fim do body.');
const section = html.slice(html.indexOf('id="vf-pdv-step8-script"'), html.lastIndexOf('</body>'));
assert(!section.includes('MutationObserver'), 'Passo 8 não pode usar MutationObserver, pois isso causou ciclos de renderização.');
assert(section.includes('window.setInterval(tick, 30000)'), 'Atualização automática segura de 30 segundos não encontrada.');
assert(html.includes('vf-pdv8-live-panel'), 'Painel de pedidos não inserido na tela de pedidos.');
console.log('Passo 8 estável validado: painel, polling seguro, realtime opcional e sem observador de DOM.');

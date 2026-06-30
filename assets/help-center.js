/* VendaFácil — ajuda em janela modal autônoma.
   Os estilos ficam dentro deste arquivo para a janela não depender de CSS externo ou cache antigo. */
(() => {
  'use strict';

  if (window.VendaFacilHelp) return;

  const guides = Object.freeze({
    home: {
      pageId: 'commerce-page-home',
      title: 'Primeiros passos da sua loja',
      copy: 'Antes de divulgar sua vitrine, confira os dados principais e faça um pedido de teste.',
      steps: ['Cadastre produtos com nome, preço e categoria.', 'Configure PIX, horários e formas de entrega.', 'Abra a vitrine pelo celular e faça um pedido de teste.', 'Divulgue o link ou QR Code para seus clientes.']
    },
    products: {
      pageId: 'commerce-page-products',
      title: 'Como cadastrar um produto',
      copy: 'Cadastre o item aqui e use Estoque para controlar entradas, saídas e inventários.',
      steps: ['Informe nome, categoria e preço.', 'Adicione foto e descrição quando tiver.', 'Ative a vitrine somente quando o item estiver disponível.', 'Controle o saldo na aba Estoque.']
    },
    stock: {
      pageId: 'commerce-page-stock',
      title: 'Como controlar o estoque',
      copy: 'O estoque serve para evitar vendas de produtos sem saldo disponível.',
      steps: ['Localize o produto que deseja controlar.', 'Informe o saldo inicial ou registre uma entrada.', 'Use saída e inventário sempre que houver movimentação.', 'Revise os produtos com saldo baixo antes de divulgar.']
    },
    orders: {
      pageId: 'commerce-page-orders',
      title: 'Como atender um pedido',
      copy: 'Atualize o andamento para o cliente acompanhar cada etapa pela vitrine.',
      steps: ['Confirme o pagamento quando necessário.', 'Altere o pedido para Em preparo.', 'Marque Pronto para retirada ou A caminho.', 'Finalize como Entregue depois da conclusão.']
    },
    delivery: {
      pageId: 'commerce-page-delivery',
      title: 'Como configurar entrega e frete',
      copy: 'A vitrine usa suas faixas de CEP para identificar a região e cobrar a taxa correta.',
      steps: ['Defina se aceita retirada e entrega.', 'Informe o CEP e o endereço da loja.', 'Cadastre as faixas de CEP atendidas com taxa e prazo.', 'Salve e teste um CEP de cada região.']
    },
    reports: {
      pageId: 'commerce-page-reports',
      title: 'Como usar os relatórios',
      copy: 'Use os indicadores para acompanhar vendas concluídas e a operação do período selecionado.',
      steps: ['Escolha o período de consulta.', 'Confira vendas, ticket médio e produtos mais pedidos.', 'Use CSV para trabalhar no Excel.', 'Use PDF para imprimir ou salvar um resumo.']
    },
    settings: {
      pageId: 'commerce-page-settings',
      title: 'Como configurar a loja',
      copy: 'Conclua as informações da loja antes de divulgar a vitrine para os clientes.',
      steps: ['Preencha nome, contato e aparência da vitrine.', 'Informe a chave PIX e confira a descrição exibida.', 'Configure horários e o aviso de loja aberta ou fechada.', 'Salve e revise a vitrine pública.']
    },
    pos: {
      pageId: 'commerce-page-pos',
      title: 'Como usar a frente de caixa',
      copy: 'O PDV registra a venda no balcão sem alterar os pedidos da vitrine.',
      steps: ['Escolha o tipo de atendimento: balcão, mesa, retirada ou entrega.', 'Adicione os produtos e ajuste quantidade, adicionais ou observação.', 'Confira cliente, desconto e pagamento.', 'Finalize somente depois de revisar o total e a forma de pagamento.']
    }
  });

  const STYLE_ID = 'vf-help-center-inline-style';
  const DIALOG_ID = 'vf-help-center';
  let lastTrigger = null;
  let observer = null;

  const byId = id => document.getElementById(id);
  const isElement = value => value instanceof HTMLElement;

  function injectStyles() {
    if (byId(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      /* Janela de ajuda independente do CSS principal. */
      #${DIALOG_ID}{position:fixed!important;inset:0!important;z-index:2147483647!important;display:none!important;align-items:center!important;justify-content:center!important;box-sizing:border-box!important;padding:clamp(12px,3vw,28px)!important;background:rgba(8,20,15,.58)!important;backdrop-filter:blur(4px)!important;-webkit-backdrop-filter:blur(4px)!important}
      #${DIALOG_ID}.is-open{display:flex!important}
      #${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box!important}
      #${DIALOG_ID} .vf-help-center__panel{position:relative!important;display:block!important;width:min(560px,100%)!important;max-height:min(680px,calc(100dvh - 24px))!important;overflow:auto!important;margin:0!important;padding:28px!important;border:1px solid #d7e7de!important;border-radius:20px!important;background:#ffffff!important;color:#16362a!important;box-shadow:0 28px 72px rgba(4,18,12,.34)!important;font-family:inherit!important}
      #${DIALOG_ID} .vf-help-center__close{position:absolute!important;top:14px!important;right:14px!important;display:inline-grid!important;place-items:center!important;width:36px!important;height:36px!important;margin:0!important;padding:0!important;border:1px solid #d7e7de!important;border-radius:10px!important;background:#f7fbf8!important;color:#244c3a!important;font:700 24px/1 Arial,sans-serif!important;cursor:pointer!important}
      #${DIALOG_ID} .vf-help-center__close:hover{background:#eaf7ef!important;color:#086c47!important}
      #${DIALOG_ID} .vf-help-center__symbol{display:grid!important;place-items:center!important;width:50px!important;height:50px!important;margin:0 0 15px!important;border:0!important;border-radius:16px!important;background:linear-gradient(135deg,#16885d,#0d6848)!important;color:#fff!important;font:800 28px/1 Arial,sans-serif!important;box-shadow:0 9px 22px rgba(15,125,87,.22)!important}
      #${DIALOG_ID} .vf-help-center__eyebrow{display:block!important;margin:0 46px 6px 0!important;color:#0b7a52!important;font:800 11px/1.2 inherit!important;letter-spacing:.1em!important;text-transform:uppercase!important}
      #${DIALOG_ID} .vf-help-center__title{display:block!important;margin:0!important;color:#16362a!important;font:800 clamp(21px,4vw,26px)/1.22 inherit!important;letter-spacing:-.025em!important}
      #${DIALOG_ID} .vf-help-center__copy{display:block!important;margin:10px 0 0!important;color:#506c5e!important;font:400 14px/1.55 inherit!important}
      #${DIALOG_ID} .vf-help-center__steps{display:grid!important;gap:9px!important;margin:20px 0!important}
      #${DIALOG_ID} .vf-help-center__step{display:grid!important;grid-template-columns:30px minmax(0,1fr)!important;gap:10px!important;align-items:start!important;margin:0!important;padding:11px 12px!important;border:1px solid #dcebe3!important;border-radius:12px!important;background:#f8fcf9!important;color:#294f3d!important;font:500 13px/1.45 inherit!important;text-align:left!important}
      #${DIALOG_ID} .vf-help-center__step b{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;margin:0!important;border-radius:50%!important;background:#dff4e8!important;color:#08724c!important;font:800 12px/1 Arial,sans-serif!important}
      #${DIALOG_ID} .vf-help-center__step span{display:block!important;padding-top:4px!important}
      #${DIALOG_ID} .vf-help-center__done{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;width:100%!important;min-height:44px!important;margin:0!important;padding:10px 16px!important;border:1px solid #0d7c54!important;border-radius:11px!important;background:#0f8158!important;color:#fff!important;font:800 14px/1 inherit!important;cursor:pointer!important}
      #${DIALOG_ID} .vf-help-center__done:hover{background:#086c47!important}
      .vf-help-center-trigger{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;flex:0 0 auto!important;min-height:36px!important;margin:0 0 0 12px!important;padding:7px 11px!important;border:1px solid #b9dfca!important;border-radius:10px!important;background:#f0faf4!important;color:#0c6d49!important;font:800 12px/1 inherit!important;white-space:nowrap!important;cursor:pointer!important;box-shadow:0 3px 10px rgba(15,104,72,.08)!important}
      .vf-help-center-trigger:hover{border-color:#79c69d!important;background:#e2f6ea!important;transform:translateY(-1px)!important}
      .vf-help-center-trigger__mark{display:inline-grid!important;place-items:center!important;width:18px!important;height:18px!important;border-radius:50%!important;background:#0f8158!important;color:#fff!important;font:800 12px/1 Arial,sans-serif!important}
      #${DIALOG_ID} .vf-help-center__close:focus-visible,#${DIALOG_ID} .vf-help-center__done:focus-visible,.vf-help-center-trigger:focus-visible{outline:3px solid rgba(13,124,84,.36)!important;outline-offset:2px!important}
      html.vf-help-center-open,body.vf-help-center-open{overflow:hidden!important}
      @media(max-width:620px){#${DIALOG_ID}{padding:12px!important}#${DIALOG_ID} .vf-help-center__panel{max-height:calc(100dvh - 24px)!important;padding:22px 18px 18px!important;border-radius:16px!important}#${DIALOG_ID} .vf-help-center__close{top:10px!important;right:10px!important}.vf-help-center-trigger{min-height:34px!important;margin-left:8px!important;padding:6px 9px!important}.vf-help-center-trigger__label{display:none!important}}
      @media(prefers-color-scheme:dark){html[data-vf-theme="dark"] #${DIALOG_ID}{background:rgba(0,7,4,.72)!important}html[data-vf-theme="dark"] #${DIALOG_ID} .vf-help-center__panel{background:#15261f!important;border-color:#365749!important;color:#eefbf3!important}html[data-vf-theme="dark"] #${DIALOG_ID} .vf-help-center__title{color:#f1fff6!important}html[data-vf-theme="dark"] #${DIALOG_ID} .vf-help-center__copy{color:#bfd4c7!important}html[data-vf-theme="dark"] #${DIALOG_ID} .vf-help-center__step{background:#112119!important;border-color:#365749!important;color:#d8eadf!important}html[data-vf-theme="dark"] #${DIALOG_ID} .vf-help-center__close{background:#112119!important;border-color:#365749!important;color:#e0f2e7!important}}
    `;
    document.head.append(style);
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function ensureDialog() {
    injectStyles();
    let dialog = byId(DIALOG_ID);
    if (dialog) return dialog;

    dialog = createElement('div', 'vf-help-center');
    dialog.id = DIALOG_ID;
    dialog.setAttribute('aria-hidden', 'true');

    const panel = createElement('section', 'vf-help-center__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'vf-help-center-title');

    const closeButton = createElement('button', 'vf-help-center__close', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Fechar ajuda');
    closeButton.addEventListener('click', close);

    const symbol = createElement('div', 'vf-help-center__symbol', '?');
    symbol.setAttribute('aria-hidden', 'true');
    const eyebrow = createElement('span', 'vf-help-center__eyebrow', 'Guia rápido');
    const title = createElement('h2', 'vf-help-center__title');
    title.id = 'vf-help-center-title';
    const copy = createElement('p', 'vf-help-center__copy');
    copy.id = 'vf-help-center-copy';
    const steps = createElement('div', 'vf-help-center__steps');
    steps.id = 'vf-help-center-steps';
    const done = createElement('button', 'vf-help-center__done', 'Entendi');
    done.type = 'button';
    done.addEventListener('click', close);

    panel.append(closeButton, symbol, eyebrow, title, copy, steps, done);
    dialog.append(panel);
    dialog.addEventListener('click', event => {
      if (event.target === dialog) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && dialog.classList.contains('is-open')) {
        event.preventDefault();
        close();
      }
    });
    document.body.append(dialog);
    return dialog;
  }

  function renderGuide(guide) {
    const dialog = ensureDialog();
    byId('vf-help-center-title').textContent = guide.title;
    byId('vf-help-center-copy').textContent = guide.copy;
    const steps = byId('vf-help-center-steps');
    steps.replaceChildren();
    guide.steps.forEach((step, index) => {
      const item = createElement('div', 'vf-help-center__step');
      const number = createElement('b', '', String(index + 1));
      const text = createElement('span', '', step);
      item.append(number, text);
      steps.append(item);
    });
    return dialog;
  }

  function open(key, sourceButton = null) {
    const guide = guides[key];
    if (!guide) return false;
    lastTrigger = sourceButton || (isElement(document.activeElement) ? document.activeElement : null);
    const dialog = renderGuide(guide);
    dialog.classList.add('is-open');
    dialog.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('vf-help-center-open');
    document.body.classList.add('vf-help-center-open');
    if (sourceButton) sourceButton.setAttribute('aria-expanded', 'true');
    window.setTimeout(() => dialog.querySelector('.vf-help-center__close')?.focus(), 0);
    return true;
  }

  function close() {
    const dialog = byId(DIALOG_ID);
    if (!dialog || !dialog.classList.contains('is-open')) return;
    dialog.classList.remove('is-open');
    dialog.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('vf-help-center-open');
    document.body.classList.remove('vf-help-center-open');
    if (lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.setAttribute?.('aria-expanded', 'false');
      lastTrigger.focus?.({ preventScroll: true });
    }
    lastTrigger = null;
  }

  function attachTrigger(key, guide) {
    const page = byId(guide.pageId);
    const head = page?.querySelector(':scope > .page-head');
    if (!page || !head || head.querySelector(`[data-vf-help-center-trigger="${key}"]`)) return;

    const button = createElement('button', 'vf-help-center-trigger');
    button.type = 'button';
    button.dataset.vfHelpCenterTrigger = key;
    button.setAttribute('aria-label', `Abrir ajuda: ${guide.title}`);
    button.setAttribute('aria-expanded', 'false');
    button.title = 'Ajuda desta tela';
    button.innerHTML = '<span class="vf-help-center-trigger__mark" aria-hidden="true">?</span><span class="vf-help-center-trigger__label">Ajuda</span>';
    button.addEventListener('click', event => {
      event.preventDefault();
      open(key, button);
    });
    head.append(button);
  }

  function install() {
    injectStyles();
    Object.entries(guides).forEach(([key, guide]) => { if (key !== 'pos') attachTrigger(key, guide); });
    if (!observer && document.body) {
      observer = new MutationObserver(() => {
        Object.entries(guides).forEach(([key, guide]) => { if (key !== 'pos') attachTrigger(key, guide); });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.VendaFacilHelp = Object.freeze({ open, close, install, guides });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

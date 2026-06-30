/* VendaFácil — Central de ajuda explícita e sem balões posicionados no layout. */
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

  let lastTrigger = null;
  let observer = null;

  const byId = id => document.getElementById(id);

  /* O guia não pode depender de stylesheet externo: ele precisa continuar como
     janela mesmo se o navegador mantiver um CSS antigo em cache. */
  function ensureStyles() {
    if (byId('vf-help-center-runtime-style')) return;
    const style = document.createElement('style');
    style.id = 'vf-help-center-runtime-style';
    style.textContent = `
      #vf-help-center.vf-help-center{position:fixed!important;inset:0!important;z-index:2147483000!important;display:none!important;align-items:center!important;justify-content:center!important;padding:16px!important;background:rgba(7,24,17,.62)!important;box-sizing:border-box!important}
      #vf-help-center.vf-help-center.is-open{display:flex!important}
      #vf-help-center .vf-help-center__panel{position:relative!important;width:min(560px,calc(100vw - 32px))!important;max-height:calc(100vh - 32px)!important;max-height:calc(100dvh - 32px)!important;overflow:auto!important;box-sizing:border-box!important;border:1px solid #d8e9df!important;border-radius:20px!important;background:#fff!important;color:#21382d!important;box-shadow:0 28px 72px rgba(4,18,12,.30)!important;padding:24px!important;font-family:inherit!important}
      #vf-help-center .vf-help-center__close{position:absolute!important;top:12px!important;right:12px!important;display:grid!important;place-items:center!important;width:38px!important;height:38px!important;padding:0!important;border:1px solid #d6e6dd!important;border-radius:10px!important;background:#f8fcf9!important;color:#305343!important;font:inherit!important;cursor:pointer!important}
      #vf-help-center .vf-help-center__icon{display:grid!important;place-items:center!important;width:48px!important;height:48px!important;margin:0 0 13px!important;border-radius:14px!important;background:#e9f8ef!important;color:#108158!important;font-size:24px!important}
      #vf-help-center .vf-help-center__eyebrow{display:block!important;margin:0 48px 5px 0!important;color:#15845c!important;font-size:11px!important;font-weight:900!important;letter-spacing:.08em!important;text-transform:uppercase!important}
      #vf-help-center .vf-help-center__title{margin:0!important;color:#16362a!important;font-size:22px!important;line-height:1.2!important;letter-spacing:-.025em!important}
      #vf-help-center .vf-help-center__copy{margin:10px 0 0!important;color:#587064!important;font-size:14px!important;line-height:1.55!important}
      #vf-help-center .vf-help-center__steps{display:grid!important;gap:9px!important;margin:18px 0!important}
      #vf-help-center .vf-help-center__step{display:grid!important;grid-template-columns:28px minmax(0,1fr)!important;gap:10px!important;align-items:start!important;padding:10px 11px!important;border:1px solid #dcebe2!important;border-radius:12px!important;background:#f8fcf9!important;color:#315644!important;font-size:13px!important;line-height:1.45!important}
      #vf-help-center .vf-help-center__step b{display:grid!important;place-items:center!important;width:28px!important;height:28px!important;border-radius:50%!important;background:#dff4e8!important;color:#0c724d!important;font-size:12px!important}
      #vf-help-center .vf-help-center__step span{padding-top:4px!important}
      #vf-help-center .vf-help-center__done{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;width:100%!important;min-height:44px!important;border:1px solid #16845b!important;border-radius:11px!important;background:#16845b!important;color:#fff!important;font:inherit!important;font-weight:850!important;cursor:pointer!important}
      html.vf-help-center-open,body.vf-help-center-open{overflow:hidden!important}
      @media(max-width:560px){#vf-help-center.vf-help-center{padding:8px!important}#vf-help-center .vf-help-center__panel{width:calc(100vw - 16px)!important;max-height:calc(100vh - 16px)!important;max-height:calc(100dvh - 16px)!important;border-radius:16px!important;padding:18px!important}#vf-help-center .vf-help-center__title{font-size:20px!important}#vf-help-center .vf-help-center__copy{font-size:13px!important}}
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
    ensureStyles();
    let dialog = byId('vf-help-center');
    if (dialog) return dialog;

    dialog = createElement('div', 'vf-help-center');
    dialog.id = 'vf-help-center';
    dialog.setAttribute('aria-hidden', 'true');

    const panel = createElement('section', 'vf-help-center__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'vf-help-center-title');

    const closeButton = createElement('button', 'vf-help-center__close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Fechar ajuda');
    closeButton.innerHTML = '<i class="ti ti-x"></i>';
    closeButton.addEventListener('click', close);

    const icon = createElement('div', 'vf-help-center__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<i class="ti ti-bulb"></i>';

    const eyebrow = createElement('span', 'vf-help-center__eyebrow', 'Guia rápido');
    const title = createElement('h2', 'vf-help-center__title');
    title.id = 'vf-help-center-title';
    const copy = createElement('p', 'vf-help-center__copy');
    copy.id = 'vf-help-center-copy';
    const steps = createElement('div', 'vf-help-center__steps');
    steps.id = 'vf-help-center-steps';
    const done = createElement('button', 'vf-help-center__done', 'Entendi');
    done.type = 'button';
    done.innerHTML = '<i class="ti ti-check"></i><span>Entendi</span>';
    done.addEventListener('click', close);

    panel.append(closeButton, icon, eyebrow, title, copy, steps, done);
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
    const title = byId('vf-help-center-title');
    const copy = byId('vf-help-center-copy');
    const steps = byId('vf-help-center-steps');
    title.textContent = guide.title;
    copy.textContent = guide.copy;
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
    lastTrigger = sourceButton || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
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
    const dialog = byId('vf-help-center');
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
    const title = head?.querySelector('h1');
    if (!page || !head || !title) return;

    const selector = `[data-vf-help-center-trigger="${key}"]`;
    if (head.querySelector(selector)) return;

    const button = createElement('button', 'vf-help-center-trigger');
    button.type = 'button';
    button.dataset.vfHelpCenterTrigger = key;
    button.setAttribute('aria-label', `Abrir ajuda: ${guide.title}`);
    button.setAttribute('aria-expanded', 'false');
    button.title = 'Ajuda';
    button.innerHTML = '<i class="ti ti-help-circle"></i>';
    button.addEventListener('click', event => {
      event.preventDefault();
      open(key, button);
    });
    title.append(button);
  }

  function install() {
    Object.entries(guides).forEach(([key, guide]) => { if (key !== 'pos') attachTrigger(key, guide); });
    if (!observer && document.body) {
      observer = new MutationObserver(() => {
        Object.entries(guides).forEach(([key, guide]) => { if (key !== 'pos') attachTrigger(key, guide); });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.VendaFacilHelp = Object.freeze({ open, close, install, guides });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();

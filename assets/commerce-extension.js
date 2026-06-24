/* VendaFácil Comércio — painel de produtos, estoque, pedidos, relatórios e acompanhamento público. */
(() => {
  const commerceStatusLabels = {
    awaiting_payment: 'Aguardando PIX',
    payment_reported: 'Pagamento informado',
    paid: 'Pagamento confirmado',
    preparing: 'Em preparo',
    ready_for_pickup: 'Pronto para retirada',
    out_for_delivery: 'Saiu para entrega',
    fulfilled: 'Entregue',
    cancelled: 'Cancelado'
  };
  const commerceStatusDetails = {
    awaiting_payment: ['Aguardando pagamento', 'Faça o PIX para a loja poder confirmar o pedido.', 'ti ti-qrcode'],
    payment_reported: ['Pagamento informado', 'A loja está conferindo o pagamento no banco.', 'ti ti-clock-check'],
    paid: ['Pagamento confirmado', 'A loja recebeu o Pix e vai iniciar a preparação.', 'ti ti-circle-check'],
    preparing: ['Em preparo', 'Seu pedido está sendo separado ou preparado.', 'ti ti-package-export'],
    ready_for_pickup: ['Pronto para retirada', 'Seu pedido está pronto. Combine a retirada com a loja.', 'ti ti-shopping-bag-check'],
    out_for_delivery: ['Saiu para entrega', 'Seu pedido já saiu para entrega.', 'ti ti-truck-delivery'],
    fulfilled: ['Pedido entregue', 'Pedido finalizado. Obrigado pela compra!', 'ti ti-circle-check'],
    cancelled: ['Pedido cancelado', 'Este pedido foi cancelado. Fale com a loja se precisar de ajuda.', 'ti ti-circle-x']
  };
  const timelineOrder = ['awaiting_payment', 'payment_reported', 'paid', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'fulfilled'];
  const revenueStatuses = new Set(['paid', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'fulfilled']);
  const activeFulfillmentStatuses = new Set(['paid', 'preparing', 'ready_for_pickup', 'out_for_delivery']);

  const orderItems = (order) => Array.isArray(order?.commerce_order_items) ? order.commerce_order_items : [];
  const orderHistory = (order) => Array.isArray(order?.commerce_order_status_history) ? order.commerce_order_status_history : (Array.isArray(order?.timeline) ? order.timeline : []);
  const commerceStatusBadge = (status) => '<span class="commerce-status '+safe(status)+'">'+safe(commerceStatusLabels[status] || status || '—')+'</span>';
  const stockText = (product) => product.stock_quantity === null || product.stock_quantity === undefined ? 'Sem controle' : Number(product.stock_quantity) + ' un.';
  const storeLink = () => location.origin + location.pathname + '?loja=' + encodeURIComponent(state.business.slug) + '&modo=comercio';
  const orderTotal = (order) => Number(order?.total_amount || 0);
  const isoDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const monthStart = () => isoDate().slice(0, 8) + '01';
  const orderTrackingLink = (publicCode, slug) => location.origin + location.pathname + '?loja=' + encodeURIComponent(slug || state.business?.slug || '') + '&modo=comercio&pedido=' + encodeURIComponent(publicCode || '');

  async function openCommerceWorkspace() {
    if (!state.business) return;
    showOnly('screen-commerce-app');
    await refreshCommerceData();
  }

  async function refreshCommerceData() {
    if (!state.business || !sb) return;
    const businessId = state.business.id;
    const [productsResult, ordersResult, settingsResult, movementsResult] = await Promise.all([
      sb.from('commerce_products').select('*').eq('business_id', businessId).order('category').order('name'),
      sb.from('commerce_orders').select('*,commerce_order_items(*),commerce_order_status_history(*)').eq('business_id', businessId).order('created_at', { ascending: false }),
      sb.from('commerce_settings').select('*').eq('business_id', businessId).maybeSingle(),
      sb.from('commerce_stock_movements').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(300)
    ]);
    const firstError = [productsResult, ordersResult, settingsResult, movementsResult].map(result => result.error).find(Boolean);
    if (firstError) {
      toast('O Comércio precisa da atualização do banco V2: ' + apiError(firstError));
      return;
    }
    state.commerceProducts = productsResult.data || [];
    state.commerceOrders = ordersResult.data || [];
    state.commerceSettings = settingsResult.data || null;
    state.commerceStockMovements = movementsResult.data || [];
    renderCommerceAll();
  }

  function renderCommerceAll() {
    if (!$('commerce-metrics')) return;
    const business = state.business || {};
    $('commerce-sidebar-business').innerHTML = '<strong>'+safe(business.name || 'Meu negócio')+'</strong><span>Modo Comércio</span>';
    renderCommerceHome();
    renderCommerceProducts();
    renderCommerceStock();
    renderCommerceOrders();
    renderCommerceReports();
    renderCommerceSettings();
  }

  function renderCommerceHome() {
    const orders = state.commerceOrders || [];
    const products = state.commerceProducts || [];
    const confirmed = orders.filter(order => revenueStatuses.has(order.status));
    const pending = orders.filter(order => ['awaiting_payment', 'payment_reported'].includes(order.status));
    const inProgress = orders.filter(order => activeFulfillmentStatuses.has(order.status));
    const revenue = confirmed.reduce((sum, order) => sum + orderTotal(order), 0);
    const ticket = confirmed.length ? revenue / confirmed.length : 0;
    $('commerce-metrics').innerHTML = [
      ['ti ti-credit-card', 'Aguardando PIX', pending.length],
      ['ti ti-package-export', 'Em andamento', inProgress.length],
      ['ti ti-currency-real', 'Vendas confirmadas', money(revenue)],
      ['ti ti-receipt', 'Ticket médio', money(ticket)]
    ].map(item => '<div class="metric"><div class="icon"><i class="'+item[0]+'"></i></div><label>'+item[1]+'</label><strong>'+item[2]+'</strong></div>').join('');

    $('commerce-store-link').textContent = storeLink();
    const recent = orders.slice(0, 6);
    $('commerce-recent-orders').innerHTML = recent.length ? recent.map(order => {
      const firstName = String(order.buyer_name || 'Cliente').split(' ')[0];
      return '<div class="row"><div><strong>'+safe(order.public_code || 'Pedido')+' · '+safe(firstName)+'</strong><small>'+fmtDate(order.created_at)+' · '+orderItems(order).reduce((sum, item) => sum + Number(item.quantity || 0), 0)+' item(ns)</small></div><div style="text-align:right"><strong>'+money(orderTotal(order))+'</strong><small>'+safe(commerceStatusLabels[order.status] || order.status)+'</small></div></div>';
    }).join('') : '<div class="empty"><i class="ti ti-shopping-cart-off"></i>Os pedidos da vitrine aparecerão aqui.</div>';

    const controlled = products.filter(product => product.stock_quantity !== null && product.stock_quantity !== undefined);
    const critical = controlled.filter(product => Number(product.stock_quantity) <= 3).sort((a, b) => Number(a.stock_quantity) - Number(b.stock_quantity));
    $('commerce-stock-overview').innerHTML = controlled.length ? (critical.length ? critical.slice(0, 5).map(product => '<div class="row"><div><strong>'+safe(product.name)+'</strong><small>Saldo baixo · '+stockText(product)+'</small></div><button class="btn sm" onclick="openCommerceStock(\''+product.id+'\')">Ajustar</button></div>').join('') : '<div class="empty"><i class="ti ti-circle-check"></i>Nenhum produto controlado está com saldo baixo.</div>') : '<div class="empty">Ative o controle de saldo na aba Estoque quando quiser acompanhar as quantidades.</div>';
  }

  function goCommercePage(page, trigger) {
    document.querySelectorAll('.commerce-section').forEach(section => section.classList.toggle('active', section.id === 'commerce-page-' + page));
    document.querySelectorAll('[data-commerce-page]').forEach(button => button.classList.toggle('active', button === trigger || button.dataset.commercePage === page));
    if (page === 'home') renderCommerceHome();
    if (page === 'products') renderCommerceProducts();
    if (page === 'stock') renderCommerceStock();
    if (page === 'orders') renderCommerceOrders();
    if (page === 'reports') renderCommerceReports();
    if (page === 'settings') renderCommerceSettings();
  }

  function renderCommerceProducts() {
    const products = state.commerceProducts || [];
    $('commerce-products-table').innerHTML = products.length ? products.map(product => {
      const image = product.image_url ? '<img class="product-thumb" src="'+safe(product.image_url)+'" alt="'+safe(product.name)+'">' : '<div class="product-thumb empty-thumb"><i class="ti ti-photo"></i></div>';
      const displayBadge = product.active ? '<span class="commerce-status paid">Disponível</span>' : '<span class="commerce-status cancelled">Oculto</span>';
      return '<tr><td>'+image+'</td><td><strong>'+safe(product.name)+'</strong><br><span class="muted">'+safe(product.description || 'Sem descrição')+'</span></td><td>'+safe(product.category || '—')+'</td><td>'+money(product.price)+'</td><td>'+displayBadge+'</td><td><div class="actions"><button class="btn sm" onclick="editCommerceProduct(\''+product.id+'\')">Editar</button><button class="btn sm '+(product.active ? 'danger' : 'primary')+'" onclick="toggleCommerceProduct(\''+product.id+'\','+(product.active ? 'false' : 'true')+')">'+(product.active ? 'Ocultar' : 'Publicar')+'</button></div></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty"><i class="ti ti-package-off"></i>Nenhum produto cadastrado.</div></td></tr>';
  }

  function latestStockMovement(productId) {
    return (state.commerceStockMovements || []).find(move => move.product_id === productId) || null;
  }

  function renderCommerceStock() {
    const products = state.commerceProducts || [];
    const controlled = products.filter(product => product.stock_quantity !== null && product.stock_quantity !== undefined);
    const noControl = products.length - controlled.length;
    const low = controlled.filter(product => Number(product.stock_quantity) <= 3).length;
    $('commerce-stock-summary').innerHTML = [
      '<span><i class="ti ti-box-seam"></i> '+controlled.length+' controlado(s)</span>',
      '<span><i class="ti ti-alert-triangle"></i> '+low+' com saldo baixo</span>',
      '<span><i class="ti ti-toggle-left"></i> '+noControl+' sem controle</span>'
    ].join('');
    $('commerce-stock-table').innerHTML = products.length ? products.map(product => {
      const movement = latestStockMovement(product.id);
      const tracked = product.stock_quantity !== null && product.stock_quantity !== undefined;
      const movementText = movement ? safe(movement.movement_type === 'sale' ? 'Venda confirmada' : movement.note || movement.movement_type) + '<br><span class="muted">'+fmtDate(movement.created_at)+'</span>' : '<span class="muted">Sem movimentações</span>';
      const status = !tracked ? '<span class="stock-untracked">Sem controle</span>' : Number(product.stock_quantity) <= 0 ? '<span class="commerce-status cancelled">Indisponível</span>' : Number(product.stock_quantity) <= 3 ? '<span class="commerce-status payment_reported">Saldo baixo</span>' : '<span class="commerce-status paid">Em estoque</span>';
      const balance = tracked ? '<span class="stock-quantity">'+Number(product.stock_quantity)+' un.</span>' : '<span class="stock-untracked">Não controlado</span>';
      return '<tr><td><strong>'+safe(product.name)+'</strong><br><span class="muted">'+safe(product.category || 'Sem categoria')+'</span></td><td>'+balance+'</td><td>'+movementText+'</td><td>'+status+'</td><td><div class="actions"><button class="btn sm primary" onclick="openCommerceStock(\''+product.id+'\')">'+(tracked ? 'Ajustar' : 'Ativar controle')+'</button>'+ (tracked ? '<button class="btn sm" onclick="disableCommerceStockControl(\''+product.id+'\')">Parar controle</button>' : '') +'</div></td></tr>';
    }).join('') : '<tr><td colspan="5"><div class="empty"><i class="ti ti-box-off"></i>Cadastre produtos para começar a controlar o estoque.</div></td></tr>';
  }

  function newCommerceProduct() {
    $('commerce-product-title').textContent = 'Novo produto';
    $('commerce-product-id').value = '';
    $('commerce-product-name').value = '';
    $('commerce-product-description').value = '';
    $('commerce-product-category').value = '';
    $('commerce-product-price').value = '';
    $('commerce-product-image').value = '';
    $('commerce-product-image-url').value = '';
    $('commerce-product-current-image').value = '';
    $('commerce-product-active').checked = true;
    $('commerce-product-preview').innerHTML = '<div class="image-placeholder"><i class="ti ti-photo-plus"></i><span>A imagem aparecerá aqui</span></div>';
    openModal('modal-commerce-product');
  }

  function editCommerceProduct(id) {
    const product = (state.commerceProducts || []).find(item => item.id === id);
    if (!product) return;
    $('commerce-product-title').textContent = 'Editar produto';
    $('commerce-product-id').value = product.id;
    $('commerce-product-name').value = product.name || '';
    $('commerce-product-description').value = product.description || '';
    $('commerce-product-category').value = product.category || '';
    $('commerce-product-price').value = Number(product.price || 0).toFixed(2);
    $('commerce-product-image').value = '';
    $('commerce-product-image-url').value = product.image_url || '';
    $('commerce-product-current-image').value = product.image_url || '';
    $('commerce-product-active').checked = !!product.active;
    previewCommerceImage(product.image_url || '');
    openModal('modal-commerce-product');
  }

  function previewCommerceImage(url) {
    const cleanUrl = String(url || '').trim();
    $('commerce-product-preview').innerHTML = cleanUrl ? '<img src="'+safe(cleanUrl)+'" alt="Prévia do produto">' : '<div class="image-placeholder"><i class="ti ti-photo-plus"></i><span>A imagem aparecerá aqui</span></div>';
  }

  function previewSelectedCommerceImage() {
    const file = $('commerce-product-image').files?.[0];
    if (!file) return;
    previewCommerceImage(URL.createObjectURL(file));
  }

  async function uploadCommerceProductImage(file) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem válido.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem deve ter no máximo 5 MB.');
    const extension = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
    const path = state.user.id + '/' + state.business.id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + extension;
    const { error } = await sb.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = sb.storage.from('product-images').getPublicUrl(path);
    return data?.publicUrl || null;
  }

  async function saveCommerceProduct() {
    const id = $('commerce-product-id').value;
    const name = $('commerce-product-name').value.trim();
    const description = $('commerce-product-description').value.trim();
    const category = $('commerce-product-category').value.trim();
    const price = Number(String($('commerce-product-price').value).replace(',', '.'));
    const active = $('commerce-product-active').checked;
    let imageUrl = $('commerce-product-image-url').value.trim() || $('commerce-product-current-image').value.trim() || null;
    if (name.length < 2 || !Number.isFinite(price) || price < 0) {
      toast('Informe nome e preço válido.');
      return;
    }
    const saveButton = $('commerce-product-save');
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="ti ti-loader"></i> Salvando...';
    try {
      const file = $('commerce-product-image').files?.[0];
      if (file) imageUrl = await uploadCommerceProductImage(file);
      const payload = { business_id: state.business.id, name, description: description || null, category: category || null, price, active, image_url: imageUrl };
      const result = id ? await sb.from('commerce_products').update(payload).eq('id', id).eq('business_id', state.business.id) : await sb.from('commerce_products').insert(payload);
      if (result.error) throw result.error;
      closeModal('modal-commerce-product');
      await refreshCommerceData();
      toast(id ? 'Produto atualizado.' : 'Produto cadastrado. Configure o saldo na aba Estoque quando necessário.');
    } catch (error) {
      toast(apiError(error, 'Não foi possível salvar o produto.'));
    } finally {
      saveButton.disabled = false;
      saveButton.innerHTML = '<i class="ti ti-device-floppy"></i> Salvar produto';
    }
  }

  async function toggleCommerceProduct(id, active) {
    const { error } = await sb.from('commerce_products').update({ active }).eq('id', id).eq('business_id', state.business.id);
    if (error) { toast(apiError(error)); return; }
    await refreshCommerceData();
    toast(active ? 'Produto publicado na vitrine.' : 'Produto ocultado da vitrine.');
  }

  function openCommerceStock(productId) {
    const product = (state.commerceProducts || []).find(item => item.id === productId);
    if (!product) return;
    $('commerce-stock-title').textContent = product.stock_quantity === null || product.stock_quantity === undefined ? 'Ativar controle de estoque' : 'Ajustar estoque';
    $('commerce-stock-product-id').value = product.id;
    $('commerce-stock-product-name').textContent = product.name + ' · Saldo atual: ' + stockText(product);
    $('commerce-stock-action').value = product.stock_quantity === null || product.stock_quantity === undefined ? 'set' : 'entry';
    $('commerce-stock-quantity').value = product.stock_quantity === null || product.stock_quantity === undefined ? '0' : '';
    $('commerce-stock-note').value = '';
    updateCommerceStockForm();
    openModal('modal-commerce-stock');
  }

  function updateCommerceStockForm() {
    const action = $('commerce-stock-action').value;
    const map = {
      entry: ['Quantidade de entrada', 'A entrada aumenta o saldo disponível na vitrine.'],
      exit: ['Quantidade de saída', 'Use para perda, consumo interno, quebra ou retirada manual.'],
      set: ['Saldo contado agora', 'Use após inventário para definir o saldo atual e ativar/ajustar o controle de estoque.']
    };
    $('commerce-stock-quantity-label').textContent = map[action][0];
    $('commerce-stock-help').textContent = map[action][1];
  }

  async function saveCommerceStockAdjustment() {
    const productId = $('commerce-stock-product-id').value;
    const action = $('commerce-stock-action').value;
    const quantity = Number($('commerce-stock-quantity').value);
    const note = $('commerce-stock-note').value.trim();
    if (!productId || !Number.isInteger(quantity) || quantity < 0 || (action !== 'set' && quantity === 0)) {
      toast('Informe uma quantidade inteira válida.');
      return;
    }
    const { error } = await sb.rpc('commerce_adjust_stock', { p_product_id: productId, p_action: action, p_quantity: quantity, p_note: note || null });
    if (error) { toast(apiError(error)); return; }
    closeModal('modal-commerce-stock');
    await refreshCommerceData();
    toast('Estoque atualizado.');
  }

  async function disableCommerceStockControl(productId) {
    const product = (state.commerceProducts || []).find(item => item.id === productId);
    if (!product || !confirm('Parar de controlar o estoque de "'+product.name+'"? A vitrine continuará vendendo sem limite de saldo.')) return;
    const { error } = await sb.from('commerce_products').update({ stock_quantity: null }).eq('id', productId).eq('business_id', state.business.id);
    if (error) { toast(apiError(error)); return; }
    await refreshCommerceData();
    toast('Controle de estoque desativado para este produto.');
  }

  function renderCommerceOrders() {
    const filter = $('commerce-order-filter')?.value || '';
    const orders = (state.commerceOrders || []).filter(order => !filter || order.status === filter);
    $('commerce-orders-table').innerHTML = orders.length ? orders.map(order => {
      const items = orderItems(order);
      const itemSummary = items.slice(0, 2).map(item => safe(item.product_name)+' ×'+Number(item.quantity)).join(', ') + (items.length > 2 ? ' +' + (items.length - 2) : '');
      return '<tr><td><strong>'+safe(order.public_code || '—')+'</strong><br><span class="muted">'+fmtDate(order.created_at)+'</span></td><td><strong>'+safe(order.buyer_name || 'Cliente')+'</strong><br><span class="muted">'+safe(order.buyer_phone || '—')+'</span></td><td>'+itemSummary+'</td><td><strong>'+money(orderTotal(order))+'</strong></td><td>'+commerceStatusBadge(order.status)+'</td><td><div class="status-actions"><button class="btn sm" onclick="openCommerceOrder(\''+order.id+'\')">Ver</button>'+commerceOrderActions(order)+'</div></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty"><i class="ti ti-receipt-off"></i>Nenhum pedido neste filtro.</div></td></tr>';
  }

  function commerceOrderActions(order) {
    const id = '\''+order.id+'\'';
    if (['awaiting_payment', 'payment_reported'].includes(order.status)) return '<button class="btn sm primary" onclick="changeCommerceOrderStatus('+id+',\'paid\')">Confirmar Pix</button><button class="btn sm danger" onclick="changeCommerceOrderStatus('+id+',\'cancelled\')">Cancelar</button>';
    if (order.status === 'paid') return '<button class="btn sm primary" onclick="changeCommerceOrderStatus('+id+',\'preparing\')">Em preparo</button><button class="btn sm" onclick="changeCommerceOrderStatus('+id+',\'out_for_delivery\')">Saiu p/ entrega</button>';
    if (order.status === 'preparing') return '<button class="btn sm primary" onclick="changeCommerceOrderStatus('+id+',\'ready_for_pickup\')">Pronto p/ retirada</button><button class="btn sm" onclick="changeCommerceOrderStatus('+id+',\'out_for_delivery\')">Saiu p/ entrega</button>';
    if (order.status === 'ready_for_pickup') return '<button class="btn sm primary" onclick="changeCommerceOrderStatus('+id+',\'fulfilled\')">Entregue</button><button class="btn sm" onclick="changeCommerceOrderStatus('+id+',\'out_for_delivery\')">Saiu p/ entrega</button>';
    if (order.status === 'out_for_delivery') return '<button class="btn sm primary" onclick="changeCommerceOrderStatus('+id+',\'fulfilled\')">Marcar entregue</button>';
    return '';
  }

  function historyForTimeline(order) {
    const history = orderHistory(order).slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (!history.length && order?.status) return [{ status: order.status, created_at: order.updated_at || order.created_at }];
    return history;
  }

  function orderTimelineHtml(order) {
    const history = historyForTimeline(order);
    const statusSet = new Set(history.map(item => item.status));
    const stages = order.status === 'cancelled' ? ['awaiting_payment', 'cancelled'] : timelineOrder;
    const currentIndex = stages.indexOf(order.status);
    return '<div class="order-timeline">'+stages.map((status, index) => {
      const entry = history.filter(item => item.status === status).slice(-1)[0];
      const done = statusSet.has(status) || (currentIndex >= 0 && index < currentIndex && order.status !== 'cancelled');
      const current = status === order.status;
      const detail = commerceStatusDetails[status] || [commerceStatusLabels[status] || status, '', 'ti ti-circle'];
      return '<div class="timeline-step '+(done ? 'done ' : '')+(current ? 'current' : '')+'"><div class="timeline-dot"><i class="'+detail[2]+'"></i></div><div class="timeline-copy"><strong>'+safe(detail[0])+'</strong><small>'+safe(entry ? fmtDate(entry.created_at) : detail[1])+'</small></div></div>';
    }).join('')+'</div>';
  }

  function openCommerceOrder(id) {
    const order = (state.commerceOrders || []).find(item => item.id === id);
    if (!order) return;
    const items = orderItems(order);
    $('commerce-order-title').textContent = 'Pedido ' + (order.public_code || '');
    $('commerce-order-content').innerHTML = '<div class="order-detail-top"><div><strong>'+safe(order.buyer_name || 'Cliente')+'</strong><small>'+safe(order.buyer_phone || 'Sem telefone')+'</small></div><div>'+commerceStatusBadge(order.status)+'<strong>'+money(orderTotal(order))+'</strong></div></div><div class="order-items">'+items.map(item => '<div><span>'+safe(item.product_name)+' × '+Number(item.quantity)+'</span><strong>'+money(item.subtotal)+'</strong></div>').join('')+'</div>'+(order.notes ? '<div class="note"><b>Observação:</b> '+safe(order.notes)+'</div>' : '')+'<h3 style="font-size:14px;margin:16px 0 8px">Andamento para o cliente</h3>'+orderTimelineHtml(order)+'<p class="muted">Criado em '+fmtDate(order.created_at)+(order.paid_at ? '<br>Pagamento confirmado em '+fmtDate(order.paid_at) : '')+'</p>';
    $('modal-commerce-order').classList.add('open');
  }

  async function changeCommerceOrderStatus(id, status) {
    const message = {
      paid: 'Confirmar o pagamento? O estoque controlado será baixado nesta etapa.',
      preparing: 'Marcar este pedido como em preparo?',
      ready_for_pickup: 'Marcar este pedido como pronto para retirada?',
      out_for_delivery: 'Marcar este pedido como saiu para entrega?',
      fulfilled: 'Marcar este pedido como entregue?',
      cancelled: 'Cancelar este pedido?'
    }[status] || 'Atualizar status deste pedido?';
    if (!confirm(message)) return;
    const { error } = await sb.rpc('commerce_set_order_status', { p_order_id: id, p_status: status });
    if (error) { toast(apiError(error)); return; }
    await refreshCommerceData();
    toast('Status do pedido atualizado. O cliente já pode acompanhar a mudança.');
  }

  function dateInReport(order, from, to) {
    const base = String(order.paid_at || order.created_at || '').slice(0, 10);
    return (!from || base >= from) && (!to || base <= to);
  }

  function setCommerceReportPeriod(period) {
    if (period === 'today') {
      $('commerce-report-from').value = isoDate();
      $('commerce-report-to').value = isoDate();
    } else {
      $('commerce-report-from').value = monthStart();
      $('commerce-report-to').value = isoDate();
    }
    renderCommerceReports();
  }

  function renderCommerceReports() {
    if (!$('commerce-report-metrics')) return;
    if (!$('commerce-report-from').value || !$('commerce-report-to').value) {
      $('commerce-report-from').value = monthStart();
      $('commerce-report-to').value = isoDate();
    }
    const from = $('commerce-report-from').value;
    const to = $('commerce-report-to').value;
    const allOrders = state.commerceOrders || [];
    const orders = allOrders.filter(order => revenueStatuses.has(order.status) && dateInReport(order, from, to));
    const revenue = orders.reduce((sum, order) => sum + orderTotal(order), 0);
    const items = orders.flatMap(order => orderItems(order));
    const quantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const ticket = orders.length ? revenue / orders.length : 0;
    const progressing = allOrders.filter(order => activeFulfillmentStatuses.has(order.status)).length;
    $('commerce-report-metrics').innerHTML = [
      ['ti ti-currency-real', 'Faturamento confirmado', money(revenue)],
      ['ti ti-receipt', 'Pedidos confirmados', orders.length],
      ['ti ti-shopping-cart', 'Itens vendidos', quantity],
      ['ti ti-chart-arrows-vertical', 'Ticket médio', money(ticket)],
      ['ti ti-truck-delivery', 'Em andamento agora', progressing]
    ].map(item => '<div class="metric"><div class="icon"><i class="'+item[0]+'"></i></div><label>'+item[1]+'</label><strong>'+item[2]+'</strong></div>').join('');
    const byProduct = new Map();
    items.forEach(item => {
      const name = item.product_name || 'Produto';
      const current = byProduct.get(name) || { quantity: 0, revenue: 0 };
      current.quantity += Number(item.quantity || 0);
      current.revenue += Number(item.subtotal || 0);
      byProduct.set(name, current);
    });
    const top = [...byProduct.entries()].sort((a, b) => b[1].revenue - a[1].revenue || b[1].quantity - a[1].quantity);
    $('commerce-report-products').innerHTML = top.length ? top.map(([name, data]) => '<tr><td><strong>'+safe(name)+'</strong></td><td>'+data.quantity+'</td><td>'+money(data.revenue)+'</td></tr>').join('') : '<tr><td colspan="3"><div class="empty">Nenhuma venda confirmada no período.</div></td></tr>';
    const statusRows = ['awaiting_payment','payment_reported','paid','preparing','ready_for_pickup','out_for_delivery','fulfilled','cancelled'].map(status => ({ status, qty: allOrders.filter(order => order.status === status && dateInReport(order, from, to)).length })).filter(row => row.qty > 0);
    $('commerce-report-statuses').innerHTML = statusRows.length ? statusRows.map(row => '<div class="report-line"><span>'+commerceStatusBadge(row.status)+'</span><strong>'+row.qty+' pedido(s)</strong></div>').join('') : '<div class="empty">Ainda não há pedidos neste período.</div>';
  }

  function renderCommerceSettings() {
    const current = state.commerceSettings || {};
    $('commerce-pix-key').value = current.pix_key || '';
    $('commerce-pix-receiver').value = current.pix_receiver_name || state.business?.name || '';
    $('commerce-pix-city').value = current.pix_city || 'RIO DE JANEIRO';
    $('commerce-whatsapp').value = current.contact_whatsapp || state.business?.whatsapp || '';
    $('commerce-store-description').value = current.public_description || '';
  }

  async function saveCommerceSettings() {
    const pixKey = $('commerce-pix-key').value.trim();
    const receiver = $('commerce-pix-receiver').value.trim();
    const city = $('commerce-pix-city').value.trim();
    const whatsapp = $('commerce-whatsapp').value.trim();
    const description = $('commerce-store-description').value.trim();
    if (!pixKey || !receiver || !city) { toast('Informe chave PIX, nome do recebedor e cidade para liberar o checkout.'); return; }
    const { error } = await sb.from('commerce_settings').upsert({ business_id: state.business.id, pix_key: pixKey, pix_receiver_name: receiver, pix_city: city, contact_whatsapp: whatsapp || null, public_description: description || null, updated_at: new Date().toISOString() }, { onConflict: 'business_id' });
    if (error) { toast(apiError(error)); return; }
    await refreshCommerceData();
    toast('Configuração de vendas e PIX salva.');
  }

  async function copyStoreLink() {
    const link = storeLink();
    try { await navigator.clipboard.writeText(link); toast('Link da vitrine copiado.'); } catch { prompt('Copie este link:', link); }
  }

  function filteredStoreProducts() {
    const payload = window.__publicStore;
    if (!payload) return [];
    const filter = $('store-category-filter')?.value || '';
    return (payload.products || []).filter(product => !filter || String(product.category || '') === filter);
  }

  function renderPublicStore() {
    const payload = window.__publicStore;
    if (!payload) return;
    const business = payload.business || {};
    const settings = payload.settings || {};
    const products = payload.products || [];
    $('store-brand').innerHTML = '<i class="ti ti-building-store"></i> ' + safe(business.name || 'VendaFácil');
    $('store-title').textContent = business.name || 'Nossa vitrine';
    $('store-description').textContent = settings.public_description || 'Escolha seus produtos, pague com PIX e acompanhe o pedido.';
    const categories = [...new Set(products.map(product => String(product.category || '').trim()).filter(Boolean))];
    $('store-category-filter').innerHTML = '<option value="">Todas as categorias</option>' + categories.map(category => '<option value="'+safe(category)+'">'+safe(category)+'</option>').join('');
    renderPublicStoreProducts();
    renderStoreCart();
  }

  function renderPublicStoreProducts() {
    const products = filteredStoreProducts();
    $('store-products').innerHTML = products.length ? products.map(product => {
      const unavailable = product.stock_quantity !== null && product.stock_quantity !== undefined && Number(product.stock_quantity) <= 0;
      const image = product.image_url ? '<img src="'+safe(product.image_url)+'" alt="'+safe(product.name)+'">' : '<div class="store-image-placeholder"><i class="ti ti-photo"></i></div>';
      return '<article class="store-product '+(unavailable ? 'unavailable' : '')+'">'+image+'<div class="store-product-body"><small>'+safe(product.category || 'Produto')+'</small><h3>'+safe(product.name)+'</h3><p>'+safe(product.description || 'Produto disponível para retirada ou entrega.')+'</p><div class="store-product-bottom"><strong>'+money(product.price)+'</strong><button class="btn sm primary" '+(unavailable ? 'disabled' : '')+' onclick="addToStoreCart(\''+product.id+'\')">'+(unavailable ? 'Indisponível' : '<i class="ti ti-plus"></i> Adicionar')+'</button></div></div></article>';
    }).join('') : '<div class="store-empty"><i class="ti ti-package-off"></i><strong>Nenhum produto nesta categoria.</strong><span>Volte mais tarde ou escolha outra categoria.</span></div>';
  }

  function storeCart() { if (!Array.isArray(window.__storeCart)) window.__storeCart = []; return window.__storeCart; }
  function addToStoreCart(productId) {
    const payload = window.__publicStore;
    const product = (payload?.products || []).find(item => item.id === productId);
    if (!product) return;
    const cart = storeCart();
    const current = cart.find(item => item.product_id === productId);
    const limit = product.stock_quantity === null || product.stock_quantity === undefined ? Infinity : Number(product.stock_quantity);
    if (current && current.quantity >= limit) { toast('Você atingiu o estoque disponível deste produto.'); return; }
    if (current) current.quantity += 1; else cart.push({ product_id: productId, quantity: 1 });
    renderStoreCart(); toast(product.name + ' adicionado ao carrinho.', 1800);
  }
  function adjustStoreCart(productId, delta) {
    const cart = storeCart(); const item = cart.find(entry => entry.product_id === productId); if (!item) return;
    const product = (window.__publicStore?.products || []).find(entry => entry.id === productId);
    const limit = product?.stock_quantity === null || product?.stock_quantity === undefined ? Infinity : Number(product?.stock_quantity || 0);
    const next = item.quantity + Number(delta);
    if (next <= 0) window.__storeCart = cart.filter(entry => entry.product_id !== productId); else if (next <= limit) item.quantity = next; else { toast('Quantidade maior que o estoque disponível.'); return; }
    renderStoreCart();
  }
  function cartLineItems() {
    const products = window.__publicStore?.products || [];
    return storeCart().map(entry => { const product = products.find(item => item.id === entry.product_id); return product ? { ...entry, product, subtotal: Number(product.price) * Number(entry.quantity) } : null; }).filter(Boolean);
  }
  function renderStoreCart() {
    const lines = cartLineItems(); const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
    $('store-cart-count').textContent = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    $('store-cart-items').innerHTML = lines.length ? lines.map(line => '<div class="cart-line"><div><strong>'+safe(line.product.name)+'</strong><small>'+money(line.product.price)+' por unidade</small></div><div class="cart-line-actions"><button onclick="adjustStoreCart(\''+line.product_id+'\',-1)">−</button><span>'+line.quantity+'</span><button onclick="adjustStoreCart(\''+line.product_id+'\',1)">+</button></div><strong>'+money(line.subtotal)+'</strong></div>').join('') : '<div class="empty"><i class="ti ti-shopping-cart-off"></i>Seu carrinho está vazio.</div>';
    $('store-cart-total').textContent = money(total); $('store-checkout-button').disabled = !lines.length;
  }
  function openStoreCart() { renderStoreCart(); $('store-cart-step').classList.remove('hidden'); $('store-payment-step').classList.add('hidden'); $('modal-store-cart').classList.add('open'); }
  function openStoreCheckout() {
    const payload = window.__publicStore;
    if (!cartLineItems().length) { toast('Adicione pelo menos um produto.'); return; }
    if (!payload?.settings?.pix_key) { toast('Esta loja ainda não configurou o PIX.'); return; }
    $('store-cart-step').classList.add('hidden'); $('store-payment-step').classList.remove('hidden'); $('store-payment-intro').classList.remove('hidden'); $('store-payment-confirmed').classList.add('hidden');
    $('store-buyer-name').value = ''; $('store-buyer-phone').value = ''; $('store-buyer-notes').value = ''; $('store-payment-total').textContent = money(cartLineItems().reduce((sum, line) => sum + line.subtotal, 0)); $('store-qr').innerHTML = ''; $('store-pix-code').value = '';
  }
  function backToStoreCart() { $('store-cart-step').classList.remove('hidden'); $('store-payment-step').classList.add('hidden'); }

  function pixTlv(id, value) { const text = String(value ?? ''); return String(id) + String(text.length).padStart(2, '0') + text; }
  function pixAscii(value, maxLength, fallback) { const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 $%*+\-./:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength); return normalized || fallback; }
  function crc16Ccitt(payload) { let crc = 0xFFFF; for (let i = 0; i < payload.length; i += 1) { crc ^= payload.charCodeAt(i) << 8; for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF; } return crc.toString(16).toUpperCase().padStart(4, '0'); }
  function buildPixPayload({ pixKey, receiverName, city, amount, txid }) {
    const key = String(pixKey || '').trim().replace(/\s/g, ''); const value = Number(amount); if (!key) throw new Error('A chave PIX desta loja não foi configurada.'); if (!Number.isFinite(value) || value <= 0) throw new Error('O valor do pedido é inválido para o PIX.');
    const merchantAccount = pixTlv('00', 'br.gov.bcb.pix') + pixTlv('01', key); const reference = pixAscii(txid, 25, '***');
    const payload = pixTlv('00', '01') + pixTlv('26', merchantAccount) + pixTlv('52', '0000') + pixTlv('53', '986') + pixTlv('54', value.toFixed(2)) + pixTlv('58', 'BR') + pixTlv('59', pixAscii(receiverName, 25, 'VENDAFACIL')) + pixTlv('60', pixAscii(city, 15, 'BRASIL')) + pixTlv('62', pixTlv('05', reference)) + '6304';
    return payload + crc16Ccitt(payload);
  }
  function renderPixQr(payload) { const target = $('store-qr'); target.innerHTML = ''; if (!window.QRCode) { target.innerHTML = '<div class="note">Não foi possível carregar o QR Code. Use o código PIX Copia e Cola abaixo.</div>'; return; } new QRCode(target, { text: payload, width: 216, height: 216, correctLevel: QRCode.CorrectLevel.M }); }

  async function createPublicCommerceOrder() {
    const payload = window.__publicStore; const name = $('store-buyer-name').value.trim(); const phone = $('store-buyer-phone').value.trim(); const notes = $('store-buyer-notes').value.trim(); const lines = cartLineItems();
    if (name.length < 2 || normalizeCustomerPhone(phone).length < 12 || !lines.length) { toast('Informe nome, WhatsApp válido e mantenha ao menos um produto no carrinho.'); return; }
    const button = $('store-create-order-button'); button.disabled = true; button.innerHTML = '<i class="ti ti-loader"></i> Gerando pedido...';
    try {
      const requestItems = lines.map(line => ({ product_id: line.product_id, quantity: Number(line.quantity) }));
      const { data, error } = await sb.rpc('create_public_commerce_order', { p_slug: payload.business.slug, p_buyer_name: name, p_buyer_phone: phone, p_notes: notes || null, p_items: requestItems });
      if (error) throw error;
      const order = data || {}; const pixPayload = buildPixPayload({ pixKey: payload.settings.pix_key, receiverName: payload.settings.pix_receiver_name || payload.business.name, city: payload.settings.pix_city || 'BRASIL', amount: order.total_amount, txid: order.public_code || 'VF' });
      window.__publicStoreOrder = { ...order, pixPayload, buyerName: name, buyerPhone: phone, storeSlug: payload.business.slug };
      try { sessionStorage.setItem('vendafacil-track-' + order.public_code, phone); } catch (_) {}
      $('store-payment-intro').classList.add('hidden'); $('store-payment-confirmed').classList.remove('hidden'); $('store-order-code').textContent = order.public_code || '—'; $('store-confirmed-total').textContent = money(order.total_amount); $('store-pix-code').value = pixPayload; renderPixQr(pixPayload); window.__storeCart = []; renderStoreCart();
    } catch (error) { toast(apiError(error, 'Não foi possível criar o pedido.')); }
    finally { button.disabled = false; button.innerHTML = '<i class="ti ti-qrcode"></i> Gerar PIX do pedido'; }
  }
  async function copyPixCode() { const code = $('store-pix-code').value; if (!code) return; try { await navigator.clipboard.writeText(code); toast('Código PIX copiado. Abra o app do seu banco para pagar.'); } catch { $('store-pix-code').select(); document.execCommand('copy'); toast('Código PIX copiado.'); } }
  async function reportPublicCommercePayment() {
    const order = window.__publicStoreOrder; if (!order?.id) return; const button = $('store-report-payment-button'); button.disabled = true;
    const { error } = await sb.rpc('report_public_commerce_payment', { p_order_id: order.id }); if (error) { button.disabled = false; toast(apiError(error)); return; }
    const whatsapp = normalizeWhatsApp(window.__publicStore?.settings?.contact_whatsapp || window.__publicStore?.business?.whatsapp); toast('Pagamento informado. A loja fará a conferência.'); button.innerHTML = '<i class="ti ti-clock-check"></i> Pagamento informado';
    if (whatsapp.length >= 12) { const message = 'Olá! Efetuei o pagamento do pedido ' + (order.public_code || '') + ' no valor de ' + money(order.total_amount) + '. Nome: ' + order.buyerName + '. Posso enviar o comprovante se necessário.'; setTimeout(() => { location.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(message); }, 450); }
  }

  function openStoreTrackingForm() { $('store-track-code').value = ''; $('store-track-phone').value = ''; $('modal-store-track').classList.add('open'); }
  function goToPublicTracking() {
    const code = $('store-track-code').value.trim().toUpperCase(); const phone = $('store-track-phone').value.trim();
    if (code.length < 5 || normalizeCustomerPhone(phone).length < 12) { toast('Informe o código do pedido e o WhatsApp usado na compra.'); return; }
    try { sessionStorage.setItem('vendafacil-track-' + code, phone); } catch (_) {}
    const slug = window.__publicStore?.business?.slug || '';
    location.href = orderTrackingLink(code, slug);
  }
  function openCurrentOrderTracking() {
    const order = window.__publicStoreOrder; if (!order?.public_code) return; location.href = orderTrackingLink(order.public_code, order.storeSlug);
  }
  async function copyCurrentOrderTrackingLink() {
    const order = window.__publicStoreOrder; if (!order?.public_code) return;
    const link = orderTrackingLink(order.public_code, order.storeSlug);
    try { await navigator.clipboard.writeText(link); toast('Link de acompanhamento copiado.'); } catch { prompt('Copie este link:', link); }
  }
  function goHomeFromStore() { location.href = location.origin + location.pathname; }
  function goHomeFromOrderTracking() {
    const slug = window.__publicTrackStoreSlug || new URLSearchParams(location.search).get('loja');
    location.href = slug ? location.origin + location.pathname + '?loja=' + encodeURIComponent(slug) + '&modo=comercio' : location.origin + location.pathname;
  }

  async function loadPublicStore(slug) {
    showOnly('screen-store'); $('store-loading').classList.remove('hidden'); $('store-content').classList.add('hidden'); $('store-error').classList.add('hidden');
    const { data, error } = await sb.rpc('get_public_store_data', { p_slug: slug });
    if (error) { $('store-loading').classList.add('hidden'); $('store-error').textContent = apiError(error, 'Esta vitrine não está disponível.'); $('store-error').classList.remove('hidden'); return; }
    window.__publicStore = data || { business: {}, settings: {}, products: [] }; window.__storeCart = []; window.__publicStoreOrder = null; renderPublicStore(); $('store-loading').classList.add('hidden'); $('store-content').classList.remove('hidden');
  }

  async function loadPublicOrderTracking(code, slug) {
    showOnly('screen-order-tracking'); window.__publicTrackStoreSlug = slug || '';
    $('track-order-code').value = String(code || '').toUpperCase(); $('track-order-phone').value = '';
    $('track-order-result').classList.add('hidden'); $('track-order-error').classList.add('hidden');
    try { const saved = sessionStorage.getItem('vendafacil-track-' + String(code || '').toUpperCase()); if (saved) { $('track-order-phone').value = saved; await trackPublicCommerceOrder(); } } catch (_) {}
  }

  async function trackPublicCommerceOrder() {
    const code = $('track-order-code').value.trim().toUpperCase(); const phone = $('track-order-phone').value.trim();
    if (code.length < 5 || normalizeCustomerPhone(phone).length < 12) { $('track-order-error').textContent = 'Informe o código do pedido e o WhatsApp usado na compra.'; $('track-order-error').classList.remove('hidden'); return; }
    const button = $('track-order-button'); button.disabled = true; button.innerHTML = '<i class="ti ti-loader"></i> Consultando...'; $('track-order-error').classList.add('hidden');
    const { data, error } = await sb.rpc('get_public_commerce_order_status', { p_public_code: code, p_buyer_phone: phone });
    button.disabled = false; button.innerHTML = '<i class="ti ti-search"></i> Consultar pedido';
    if (error) { $('track-order-error').textContent = apiError(error, 'Não encontramos este pedido com esses dados.'); $('track-order-error').classList.remove('hidden'); $('track-order-result').classList.add('hidden'); return; }
    try { sessionStorage.setItem('vendafacil-track-' + code, phone); } catch (_) {}
    const order = data || {}; const detail = commerceStatusDetails[order.status] || ['Pedido atualizado', '', 'ti ti-info-circle'];
    const history = Array.isArray(order.timeline) ? order.timeline : [];
    const fakeOrder = { status: order.status, created_at: order.created_at, updated_at: order.updated_at, commerce_order_status_history: history };
    $('track-order-result').innerHTML = '<div class="order-track-status"><div class="track-result-head"><div><h2>'+safe(detail[0])+'</h2><p class="muted" style="margin:0">'+safe(detail[1])+'</p></div>'+commerceStatusBadge(order.status)+'</div><div class="card" style="padding:13px;margin:14px 0 0"><div class="row"><div><strong>Pedido <span class="track-code">'+safe(order.public_code || code)+'</span></strong><small>'+safe(order.business_name || 'Loja')+' · criado em '+fmtDate(order.created_at)+'</small></div><strong>'+money(order.total_amount)+'</strong></div></div><h3 style="font-size:14px;margin:18px 0 8px">Acompanhamento</h3>'+orderTimelineHtml(fakeOrder)+'</div>';
    $('track-order-result').classList.remove('hidden');
  }

  Object.assign(window, {
    openCommerceWorkspace,
    goCommercePage,
    refreshCommerceData,
    newCommerceProduct,
    editCommerceProduct,
    previewCommerceImage,
    previewSelectedCommerceImage,
    saveCommerceProduct,
    toggleCommerceProduct,
    openCommerceStock,
    updateCommerceStockForm,
    saveCommerceStockAdjustment,
    disableCommerceStockControl,
    openCommerceOrder,
    changeCommerceOrderStatus,
    setCommerceReportPeriod,
    renderCommerceReports,
    saveCommerceSettings,
    copyStoreLink,
    loadPublicStore,
    loadPublicOrderTracking,
    renderPublicStoreProducts,
    addToStoreCart,
    adjustStoreCart,
    openStoreCart,
    openStoreCheckout,
    backToStoreCart,
    createPublicCommerceOrder,
    copyPixCode,
    reportPublicCommercePayment,
    openStoreTrackingForm,
    goToPublicTracking,
    openCurrentOrderTracking,
    copyCurrentOrderTrackingLink,
    trackPublicCommerceOrder,
    goHomeFromStore,
    goHomeFromOrderTracking
  });
})();

/* VendaFácil Comércio V3 — cadastro do cliente, retirada/entrega e frete por região. */
(() => {
  const originalRefreshCommerceData = window.refreshCommerceData;
  const originalGoCommercePage = window.goCommercePage;
  const v3 = window.__vendafacilCommerceV3 = window.__vendafacilCommerceV3 || { zones: [], store: null, cart: [], customer: null, orders: [], checkoutAfterAccount: false, fulfillment: 'pickup' };

  const statusLabel = (status) => ({
    awaiting_payment: 'Aguardando pagamento',
    payment_reported: 'Aguardando aprovação',
    paid: 'Aguardando aprovação',
    preparing: 'Em preparo',
    ready_for_pickup: 'Pronto para retirada',
    out_for_delivery: 'A caminho',
    fulfilled: 'Entregue',
    cancelled: 'Cancelado'
  }[status] || status || '—');
  const statusDetail = (status) => ({
    awaiting_payment: ['Aguardando pagamento', 'Faça o PIX para a loja validar o pedido.', 'ti ti-qrcode'],
    payment_reported: ['Aguardando aprovação', 'Seu pagamento foi informado e a loja está conferindo.', 'ti ti-clock-check'],
    paid: ['Aguardando aprovação', 'Pagamento confirmado. A loja vai iniciar o preparo.', 'ti ti-circle-check'],
    preparing: ['Em preparo', 'Seu pedido está sendo separado ou preparado.', 'ti ti-package-export'],
    ready_for_pickup: ['Pronto para retirada', 'Seu pedido está pronto para ser buscado na loja.', 'ti ti-shopping-bag-check'],
    out_for_delivery: ['A caminho', 'Seu pedido já saiu para entrega.', 'ti ti-truck-delivery'],
    fulfilled: ['Entregue', 'Pedido concluído. Obrigado pela compra!', 'ti ti-circle-check'],
    cancelled: ['Pedido cancelado', 'Fale com a loja se precisar de ajuda.', 'ti ti-circle-x']
  }[status] || ['Pedido atualizado', '', 'ti ti-info-circle']);
  const statusBadge = (status) => `<span class="commerce-status ${safe(status)}">${safe(statusLabel(status))}</span>`;
  const deliveryLabel = (order) => order?.fulfillment_type === 'delivery' ? 'Entrega' : 'Retirada';
  const isDelivery = (order) => order?.fulfillment_type === 'delivery';
  const orderItems = (order) => Array.isArray(order?.commerce_order_items) ? order.commerce_order_items : [];
  const orderHistory = (order) => Array.isArray(order?.commerce_order_status_history) ? order.commerce_order_status_history : (Array.isArray(order?.timeline) ? order.timeline : []);
  const orderSubtotal = (order) => Number(order?.subtotal_amount ?? order?.total_amount ?? 0);
  const orderFee = (order) => Number(order?.delivery_fee || 0);
  const orderTotal = (order) => Number(order?.total_amount || 0);

  function v3OrderTimeline(order) {
    const history = orderHistory(order).slice().sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const stages = order.status === 'cancelled'
      ? ['awaiting_payment', 'cancelled']
      : ['awaiting_payment', 'payment_reported', 'paid', 'preparing', isDelivery(order) ? 'out_for_delivery' : 'ready_for_pickup', 'fulfilled'];
    const current = stages.indexOf(order.status);
    return `<div class="order-timeline">${stages.map((status, index) => {
      const event = history.filter(x => x.status === status).slice(-1)[0];
      const info = statusDetail(status);
      const done = !!event || (current > index && order.status !== 'cancelled');
      return `<div class="timeline-step ${done ? 'done' : ''} ${status === order.status ? 'current' : ''}"><div class="timeline-dot"><i class="${info[2]}"></i></div><div class="timeline-copy"><strong>${safe(info[0])}</strong><small>${safe(event ? fmtDate(event.created_at) : info[1])}</small></div></div>`;
    }).join('')}</div>`;
  }

  async function v3RefreshCommerceData() {
    await originalRefreshCommerceData();
    if (!state?.business || !sb) return;
    const { data, error } = await sb.from('commerce_delivery_zones').select('*').eq('business_id', state.business.id).order('name');
    if (error) { toast('Execute a atualização do banco V3 para ativar cadastro de clientes, entrega e frete.'); return; }
    v3.zones = data || [];
    v3RenderDeliverySettings();
    v3RenderOrders();
  }

  async function v3OpenCommerceWorkspace() {
    if (!state?.business) return;
    showOnly('screen-commerce-app');
    await v3RefreshCommerceData();
  }

  function v3GoCommercePage(page, trigger) {
    originalGoCommercePage(page, trigger);
    if (page === 'orders') v3RenderOrders();
    if (page === 'delivery') v3RenderDeliverySettings();
  }

  function v3RenderOrders() {
    const target = $('commerce-orders-table');
    if (!target) return;
    const filter = $('commerce-order-filter')?.value || '';
    const orders = (state.commerceOrders || []).filter(o => !filter || o.status === filter);
    target.innerHTML = orders.length ? orders.map(order => {
      const items = orderItems(order);
      const list = items.slice(0,2).map(item => `${safe(item.product_name)} ×${Number(item.quantity)}`).join(', ') + (items.length > 2 ? ` +${items.length-2}` : '');
      const mode = isDelivery(order)
        ? '<span class="order-mode delivery"><i class="ti ti-truck-delivery"></i> Entrega</span>'
        : '<span class="order-mode pickup"><i class="ti ti-shopping-bag"></i> Retirada</span>';
      return `<tr><td><strong>${safe(order.public_code || '—')}</strong><br><span class="muted">${fmtDate(order.created_at)}</span></td><td><strong>${safe(order.buyer_name || 'Cliente')}</strong><br><span class="muted">${safe(order.buyer_phone || '—')}</span></td><td>${mode}<br><span class="muted">${list}</span></td><td><strong>${money(orderTotal(order))}</strong></td><td>${statusBadge(order.status)}</td><td><div class="status-actions"><button class="btn sm" onclick="openCommerceOrder('${order.id}')">Ver</button>${v3OrderActions(order)}</div></td></tr>`;
    }).join('') : '<tr><td colspan="6"><div class="empty"><i class="ti ti-receipt-off"></i>Nenhum pedido neste filtro.</div></td></tr>';
  }

  function v3OrderActions(order) {
    const id = order.id;
    if (['awaiting_payment','payment_reported'].includes(order.status)) return `<button class="btn sm primary" onclick="changeCommerceOrderStatus('${id}','paid')">Aprovar pagamento</button><button class="btn sm danger" onclick="changeCommerceOrderStatus('${id}','cancelled')">Cancelar</button>`;
    if (order.status === 'paid') return `<button class="btn sm primary" onclick="changeCommerceOrderStatus('${id}','preparing')">Em preparo</button>`;
    if (order.status === 'preparing') return isDelivery(order)
      ? `<button class="btn sm primary" onclick="changeCommerceOrderStatus('${id}','out_for_delivery')">A caminho</button>`
      : `<button class="btn sm primary" onclick="changeCommerceOrderStatus('${id}','ready_for_pickup')">Pronto p/ retirada</button>`;
    if (order.status === 'ready_for_pickup') return `<button class="btn sm primary" onclick="changeCommerceOrderStatus('${id}','fulfilled')">Entregue</button>`;
    if (order.status === 'out_for_delivery') return `<button class="btn sm primary" onclick="changeCommerceOrderStatus('${id}','fulfilled')">Marcar entregue</button>`;
    return '';
  }

  function v3OpenCommerceOrder(id) {
    const order = (state.commerceOrders || []).find(x => x.id === id);
    if (!order) return;
    const address = order.delivery_address || {};
    const addressText = [address.street, address.number, address.complement, address.neighborhood, address.reference].filter(Boolean).join(', ');
    $('commerce-order-title').textContent = `Pedido ${order.public_code || ''}`;
    $('commerce-order-content').innerHTML = `<div class="order-detail-top"><div><strong>${safe(order.buyer_name || 'Cliente')}</strong><small>${safe(order.buyer_phone || '')}</small></div><div>${statusBadge(order.status)}<strong>${money(orderTotal(order))}</strong></div></div><div class="delivery-order-summary"><span class="order-mode ${isDelivery(order) ? 'delivery' : 'pickup'}"><i class="ti ${isDelivery(order) ? 'ti-truck-delivery' : 'ti-shopping-bag'}"></i> ${deliveryLabel(order)}</span>${isDelivery(order) ? `<div><b>Endereço:</b> ${safe(addressText || 'Não informado')}<br><span class="muted">${safe(order.delivery_zone_name || '')} · Frete ${money(orderFee(order))}</span></div>` : '<div><b>Retirada:</b> o cliente buscará na loja.</div>'}</div><div class="order-items">${orderItems(order).map(i => `<div><span>${safe(i.product_name)} × ${Number(i.quantity)}</span><strong>${money(i.subtotal)}</strong></div>`).join('')}</div><div class="order-values"><span>Produtos <b>${money(orderSubtotal(order))}</b></span>${isDelivery(order) ? `<span>Frete <b>${money(orderFee(order))}</b></span>` : ''}<span>Total <b>${money(orderTotal(order))}</b></span></div>${order.notes ? `<div class="note"><b>Observação:</b> ${safe(order.notes)}</div>` : ''}<h3 style="font-size:14px;margin:16px 0 8px">Andamento para o cliente</h3>${v3OrderTimeline(order)}`;
    $('modal-commerce-order').classList.add('open');
  }

  async function v3ChangeCommerceOrderStatus(id, status) {
    const labels = { paid:'aprovar o pagamento', preparing:'marcar como em preparo', ready_for_pickup:'marcar como pronto para retirada', out_for_delivery:'marcar como a caminho', fulfilled:'marcar como entregue', cancelled:'cancelar o pedido' };
    if (!confirm(`Confirma ${labels[status] || 'a atualização'}?`)) return;
    const { error } = await sb.rpc('commerce_set_order_status', { p_order_id:id, p_status:status });
    if (error) { toast(apiError(error)); return; }
    await v3RefreshCommerceData();
    toast('Status atualizado. O cliente já visualiza a mudança na conta.');
  }

  function v4NormalizeText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();}
  function v4Digits(value){return String(value||'').replace(/\D/g,'');}
  function v4ZoneNeighborhoods(zone){return Array.isArray(zone?.neighborhoods)?zone.neighborhoods.map(x=>String(x||'').trim()).filter(Boolean):[];}
  function v4ZoneCepRanges(zone){return Array.isArray(zone?.cep_ranges)?zone.cep_ranges.map(x=>({from:v4Digits(x?.from),to:v4Digits(x?.to)})).filter(x=>x.from.length===8&&x.to.length===8):[];}
  function v4FormatCep(value){const d=v4Digits(value);return d.length===8?d.slice(0,5)+'-'+d.slice(5):String(value||'');}
  function v4FormatCepRange(range){return range.from===range.to?v4FormatCep(range.from):v4FormatCep(range.from)+' a '+v4FormatCep(range.to);}
  function v4SplitNeighborhoods(raw){const unique=new Map();String(raw||'').split(/[\n,;]+/).map(x=>x.trim().replace(/\s+/g,' ')).filter(x=>x.length>=2).forEach(x=>{const key=v4NormalizeText(x);if(!unique.has(key))unique.set(key,x);});return [...unique.values()];}
  function v4ParseCepRanges(raw){const map=new Map();const invalid=[];String(raw||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).forEach(item=>{const found=item.match(/\d/g)||[];const digits=found.join('');if(digits.length===8){map.set(digits+'-'+digits,{from:digits,to:digits});return;}if(digits.length===16){const a=digits.slice(0,8),b=digits.slice(8,16),from=a<=b?a:b,to=a<=b?b:a;map.set(from+'-'+to,{from,to});return;}invalid.push(item);});return {ranges:[...map.values()],invalid};}
  function v4ZoneCoverageSummary(zone){const neighborhoods=v4ZoneNeighborhoods(zone),ceps=v4ZoneCepRanges(zone),parts=[];if(neighborhoods.length)parts.push(neighborhoods.slice(0,3).map(safe).join(', ')+(neighborhoods.length>3?' +'+(neighborhoods.length-3):''));if(ceps.length)parts.push(ceps.slice(0,2).map(v4FormatCepRange).map(safe).join(', ')+(ceps.length>2?' +'+(ceps.length-2)+' CEP(s)':''));return parts.join('<br>')||'<span class="muted">Sem cobertura cadastrada</span>';}

  function v3RenderDeliverySettings() {
    if (!$('commerce-delivery-enabled')) return;
    const cfg = state.commerceSettings || {};
    $('commerce-delivery-enabled').checked = !!cfg.delivery_enabled;
    $('commerce-pickup-enabled').checked = cfg.pickup_enabled !== false;
    $('commerce-pickup-address').value = cfg.pickup_address || '';
    $('commerce-delivery-minimum').value = cfg.delivery_minimum_order ? Number(cfg.delivery_minimum_order).toFixed(2) : '';
    $('commerce-delivery-free-above').value = cfg.delivery_free_above ? Number(cfg.delivery_free_above).toFixed(2) : '';
    $('commerce-delivery-eta').value = cfg.delivery_eta_text || '';
    $('commerce-delivery-zones-table').innerHTML = v3.zones.length ? v3.zones.map(zone => `<tr><td><strong>${safe(zone.name)}</strong></td><td>${v4ZoneCoverageSummary(zone)}</td><td>${money(zone.fee)}</td><td>${Number(zone.minimum_order||0) ? money(zone.minimum_order) : 'Sem mínimo'}</td><td>${zone.estimated_minutes ? `${zone.estimated_minutes} min` : '—'}</td><td>${zone.active ? '<span class="commerce-status paid">Ativa</span>' : '<span class="commerce-status cancelled">Pausada</span>'}</td><td><div class="actions"><button class="btn sm" onclick="editCommerceDeliveryZone('${zone.id}')">Editar</button><button class="btn sm ${zone.active ? 'danger' : 'primary'}" onclick="toggleCommerceDeliveryZone('${zone.id}',${zone.active ? 'false' : 'true'})">${zone.active ? 'Pausar' : 'Ativar'}</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty"><i class="ti ti-map-pin-off"></i>Nenhuma região de entrega cadastrada.</div></td></tr>';
  }

  async function v3SaveDeliverySettings() {
    const delivery = $('commerce-delivery-enabled').checked, pickup = $('commerce-pickup-enabled').checked;
    const pickupAddress = $('commerce-pickup-address').value.trim();
    const minimum = Number(String($('commerce-delivery-minimum').value || '0').replace(',','.'));
    const freeAbove = Number(String($('commerce-delivery-free-above').value || '0').replace(',','.'));
    if (!delivery && !pickup) { toast('Ative retirada ou entrega para receber pedidos.'); return; }
    if (pickup && pickupAddress.length < 3) { toast('Informe o endereço ou instrução de retirada.'); return; }
    if (!Number.isFinite(minimum) || !Number.isFinite(freeAbove) || minimum < 0 || freeAbove < 0) { toast('Revise os valores de frete.'); return; }
    const { error } = await sb.from('commerce_settings').upsert({business_id:state.business.id, delivery_enabled:delivery, pickup_enabled:pickup, pickup_address:pickupAddress||null, delivery_minimum_order:minimum||0, delivery_free_above:freeAbove||null, delivery_eta_text:$('commerce-delivery-eta').value.trim()||null, updated_at:new Date().toISOString()},{onConflict:'business_id'});
    if (error) { toast(apiError(error)); return; }
    await v3RefreshCommerceData(); toast('Entrega e frete salvos.');
  }

  function v3NewDeliveryZone() {
    $('commerce-delivery-zone-title').textContent='Nova região de entrega';
    ['commerce-delivery-zone-id','commerce-delivery-zone-name','commerce-delivery-zone-neighborhoods','commerce-delivery-zone-ceps','commerce-delivery-zone-fee','commerce-delivery-zone-minimum','commerce-delivery-zone-minutes'].forEach(id => $(id).value='');
    $('commerce-delivery-zone-active').checked=true; openModal('modal-commerce-delivery-zone');
  }
  function v3EditDeliveryZone(id) {
    const zone=v3.zones.find(x=>x.id===id); if(!zone)return;
    $('commerce-delivery-zone-title').textContent='Editar região de entrega';
    $('commerce-delivery-zone-id').value=zone.id;
    $('commerce-delivery-zone-name').value=zone.name||'';
    $('commerce-delivery-zone-neighborhoods').value=v4ZoneNeighborhoods(zone).join('\n');
    $('commerce-delivery-zone-ceps').value=v4ZoneCepRanges(zone).map(v4FormatCepRange).join('\n');
    $('commerce-delivery-zone-fee').value=Number(zone.fee||0).toFixed(2);
    $('commerce-delivery-zone-minimum').value=Number(zone.minimum_order||0)?Number(zone.minimum_order).toFixed(2):'';
    $('commerce-delivery-zone-minutes').value=zone.estimated_minutes||'';
    $('commerce-delivery-zone-active').checked=!!zone.active; openModal('modal-commerce-delivery-zone');
  }
  async function v3SaveDeliveryZone() {
    const id=$('commerce-delivery-zone-id').value, name=$('commerce-delivery-zone-name').value.trim();
    const neighborhoods=v4SplitNeighborhoods($('commerce-delivery-zone-neighborhoods').value);
    const parsed=v4ParseCepRanges($('commerce-delivery-zone-ceps').value),cepRanges=parsed.ranges;
    const fee=Number(String($('commerce-delivery-zone-fee').value).replace(',','.'));
    const min=Number(String($('commerce-delivery-zone-minimum').value||'0').replace(',','.'));
    const raw=$('commerce-delivery-zone-minutes').value,minutes=raw?Number(raw):null;
    if(parsed.invalid.length){toast('Revise os CEPs. Use um CEP de 8 dígitos ou uma faixa com dois CEPs.');return;}
    if(name.length<2||!Number.isFinite(fee)||fee<0||!Number.isFinite(min)||min<0||(minutes!==null&&(!Number.isInteger(minutes)||minutes<1))){toast('Preencha região, frete e prazo corretamente.');return;}
    if(!neighborhoods.length&&!cepRanges.length){toast('Informe pelo menos um bairro ou uma faixa de CEP atendida.');return;}
    const payload={business_id:state.business.id,name,neighborhoods,cep_ranges:cepRanges,fee,minimum_order:min||0,estimated_minutes:minutes,active:$('commerce-delivery-zone-active').checked,updated_at:new Date().toISOString()};
    const res=id?await sb.from('commerce_delivery_zones').update(payload).eq('id',id).eq('business_id',state.business.id):await sb.from('commerce_delivery_zones').insert(payload);
    if(res.error){toast(apiError(res.error));return;} closeModal('modal-commerce-delivery-zone'); await v3RefreshCommerceData(); toast(id?'Região atualizada.':'Região cadastrada.');
  }
  async function v3ToggleDeliveryZone(id,active){const {error}=await sb.from('commerce_delivery_zones').update({active,updated_at:new Date().toISOString()}).eq('id',id).eq('business_id',state.business.id);if(error){toast(apiError(error));return;}await v3RefreshCommerceData();}

  async function v3GetUser(){const {data,error}=await sb.auth.getUser();return error?null:data?.user||null;}
  async function v3LoadProfile(){const user=await v3GetUser();if(!user){v3.customer=null;return null;}const {data,error}=await sb.from('commerce_customer_profiles').select('*').eq('id',user.id).maybeSingle();if(error){console.error(error);return null;}v3.customer=data||null;return v3.customer;}
  function v3AccountButton(){const b=$('store-account-button');if(b)b.innerHTML=v3.customer?'<i class="ti ti-user-check"></i> Minha conta':'<i class="ti ti-user"></i> Entrar / cadastrar';}
  const v3StoreZones=()=>Array.isArray(v3.store?.delivery_zones)?v3.store.delivery_zones:[];
  const v3StoreProducts=()=>Array.isArray(v3.store?.products)?v3.store.products:[];
  const v3CartLines=()=>v3.cart.map(item=>{const product=v3StoreProducts().find(p=>p.id===item.product_id);return product?{...item,product,subtotal:Number(product.price)*Number(item.quantity)}:null;}).filter(Boolean);
  const v3Subtotal=()=>v3CartLines().reduce((s,x)=>s+x.subtotal,0);
  function v3CoverageChoice(){const select=$('store-delivery-coverage'),option=select?.selectedOptions?.[0]||null,zoneId=option?.dataset?.zoneId||$('store-delivery-zone')?.value||'';return {zone:v3StoreZones().find(z=>z.id===zoneId)||null,type:option?.dataset?.type||'',neighborhood:option?.dataset?.neighborhood||''};}
  function v3SelectedZone(){return v3CoverageChoice().zone;}
  function v3CepMatchesZone(cep,zone){const value=v4Digits(cep);return value.length===8&&v4ZoneCepRanges(zone).some(r=>value>=r.from&&value<=r.to);}
  function v3CoverageOptions(){const zones=v3StoreZones();let html='<option value="">Selecione seu bairro ou área</option>';zones.forEach(zone=>{const parts=[];v4ZoneNeighborhoods(zone).forEach((neighborhood,index)=>parts.push(`<option value="${safe(zone.id)}-n-${index}" data-zone-id="${safe(zone.id)}" data-type="neighborhood" data-neighborhood="${safe(neighborhood)}">${safe(neighborhood)} · ${money(zone.fee)}</option>`));v4ZoneCepRanges(zone).forEach((range,index)=>parts.push(`<option value="${safe(zone.id)}-c-${index}" data-zone-id="${safe(zone.id)}" data-type="cep">Por CEP: ${safe(v4FormatCepRange(range))} · ${money(zone.fee)}</option>`));if(parts.length)html+=`<optgroup label="${safe(zone.name)}">${parts.join('')}</optgroup>`;});return html;}
  function v3PopulateDeliveryCoverage(){const target=$('store-delivery-coverage');if(!target)return;const previous=target.value;target.innerHTML=v3CoverageOptions();if(previous&&[...target.options].some(o=>o.value===previous))target.value=previous;v3DeliveryCoverageChanged();}
  function v3Totals(){const subtotal=v3Subtotal();if(v3.fulfillment!=='delivery')return {subtotal,fee:0,total:subtotal,zone:null};const zone=v3SelectedZone();let fee=Number(zone?.fee||0);const free=Number(v3.store?.settings?.delivery_free_above||0);if(free>0&&subtotal>=free)fee=0;return {subtotal,fee,total:subtotal+fee,zone};}

  async function v3LoadPublicStore(slug){showOnly('screen-store');$('store-loading').classList.remove('hidden');$('store-content').classList.add('hidden');$('store-error').classList.add('hidden');const {data,error}=await sb.rpc('get_public_store_data',{p_slug:slug});if(error){$('store-loading').classList.add('hidden');$('store-error').textContent=apiError(error,'Esta vitrine não está disponível.');$('store-error').classList.remove('hidden');return;}v3.store=data||{business:{},settings:{},products:[],delivery_zones:[]};v3.cart=[];v3.fulfillment='pickup';await v3LoadProfile();v3RenderStore();$('store-loading').classList.add('hidden');$('store-content').classList.remove('hidden');}
  function v3RenderStore(){const p=v3.store||{},business=p.business||{},settings=p.settings||{};$('store-brand').innerHTML=`<i class="ti ti-building-store"></i> ${safe(business.name||'Loja')}`;$('store-title').textContent=business.name||'Nossa vitrine';$('store-description').textContent=settings.public_description||'Escolha seus produtos, pague com PIX e acompanhe cada etapa do pedido.';const categories=[...new Set(v3StoreProducts().map(x=>String(x.category||'').trim()).filter(Boolean))];$('store-category-filter').innerHTML='<option value="">Todas as categorias</option>'+categories.map(c=>`<option value="${safe(c)}">${safe(c)}</option>`).join('');v3RenderStoreProducts();v3RenderCart();v3AccountButton();}
  function v3RenderStoreProducts(){const filter=$('store-category-filter')?.value||'';const products=v3StoreProducts().filter(p=>!filter||p.category===filter);$('store-products').innerHTML=products.length?products.map(p=>{const unavailable=p.stock_quantity!==null&&p.stock_quantity!==undefined&&Number(p.stock_quantity)<=0;const image=p.image_url?`<img src="${safe(p.image_url)}" alt="${safe(p.name)}">`:'<div class="store-image-placeholder"><i class="ti ti-photo"></i></div>';return `<article class="store-product"><div class="store-product-image">${image}</div><div class="store-product-body"><span class="store-category">${safe(p.category||'Produto')}</span><h3>${safe(p.name)}</h3><p>${safe(p.description||'Produto disponível na loja.')}</p><div class="store-product-foot"><strong>${money(p.price)}</strong><button class="btn primary" ${unavailable?'disabled':''} onclick="addToStoreCart('${p.id}')"><i class="ti ti-plus"></i> ${unavailable?'Indisponível':'Adicionar'}</button></div></div></article>`;}).join(''):'<div class="store-empty"><i class="ti ti-package-off"></i><strong>Nenhum produto encontrado.</strong></div>';}
  function v3AddToCart(id){const product=v3StoreProducts().find(x=>x.id===id);if(!product)return;const item=v3.cart.find(x=>x.product_id===id);const limit=product.stock_quantity===null||product.stock_quantity===undefined?99:Number(product.stock_quantity);if(item){if(item.quantity>=limit){toast('Você atingiu o saldo disponível.');return;}item.quantity+=1;}else v3.cart.push({product_id:id,quantity:1});v3RenderCart();toast(`${product.name} adicionado ao carrinho.`);}
  function v3AdjustCart(id,delta){const item=v3.cart.find(x=>x.product_id===id);if(!item)return;const product=v3StoreProducts().find(x=>x.id===id);const limit=product?.stock_quantity===null||product?.stock_quantity===undefined?99:Number(product?.stock_quantity||0);const next=item.quantity+delta;if(next<=0)v3.cart=v3.cart.filter(x=>x.product_id!==id);else if(next<=limit)item.quantity=next;else{toast('Quantidade maior que o estoque disponível.');return;}v3RenderCart();}
  function v3RenderCart(){const lines=v3CartLines(),target=$('store-cart-items');if(!target)return;const qty=lines.reduce((s,x)=>s+Number(x.quantity),0);$('store-cart-count').textContent=qty;target.innerHTML=lines.length?lines.map(line=>`<div class="cart-line"><div><strong>${safe(line.product.name)}</strong><small>${money(line.product.price)} cada</small></div><div class="cart-line-right"><div class="qty-control"><button onclick="adjustStoreCart('${line.product_id}',-1)">−</button><strong>${line.quantity}</strong><button onclick="adjustStoreCart('${line.product_id}',1)">+</button></div><strong>${money(line.subtotal)}</strong></div></div>`).join(''):'<div class="empty">Seu carrinho está vazio.</div>';$('store-cart-total').textContent=money(v3Subtotal());$('store-checkout-button').disabled=!lines.length;}
  function v3OpenStoreCart(){v3RenderCart();$('store-cart-step').classList.remove('hidden');$('store-payment-step').classList.add('hidden');$('modal-store-cart').classList.add('open');}
  async function v3OpenCheckout(){if(!v3CartLines().length)return;const user=await v3GetUser(),profile=user?await v3LoadProfile():null;if(!user||!profile?.full_name||!profile?.phone){v3.checkoutAfterAccount=true;v3OpenAccount();toast('Entre ou crie seu cadastro para acompanhar seus pedidos.');return;}const cfg=v3.store?.settings||{};v3.fulfillment=cfg.pickup_enabled===false?'delivery':'pickup';$('store-cart-step').classList.add('hidden');$('store-payment-step').classList.remove('hidden');$('store-buyer-name').value=profile.full_name;$('store-buyer-phone').value=profile.phone;v3PopulateDeliveryCoverage();v3RenderFulfillment();}
  function v3BackToCart(){$('store-cart-step').classList.remove('hidden');$('store-payment-step').classList.add('hidden');}
  function v3SelectFulfillment(type){const s=v3.store?.settings||{};if(type==='pickup'&&s.pickup_enabled===false)return;if(type==='delivery'&&!s.delivery_enabled)return;v3.fulfillment=type;v3RenderFulfillment();}
  function v3RenderFulfillment(){const s=v3.store?.settings||{},delivery=!!s.delivery_enabled,pickup=s.pickup_enabled!==false; $('store-pickup-choice').classList.toggle('hidden',!pickup);$('store-delivery-choice').classList.toggle('hidden',!delivery);$('store-pickup-choice').classList.toggle('active',v3.fulfillment==='pickup');$('store-delivery-choice').classList.toggle('active',v3.fulfillment==='delivery');$('store-delivery-fields').classList.toggle('hidden',v3.fulfillment!=='delivery');$('store-pickup-info').classList.toggle('hidden',v3.fulfillment!=='pickup');$('store-pickup-address-text').textContent=s.pickup_address||'Combine a retirada com a loja.';const choice=v3CoverageChoice(),t=v3Totals();$('store-checkout-subtotal').textContent=money(t.subtotal);$('store-checkout-freight').textContent=v3.fulfillment==='delivery'?(t.zone?money(t.fee):'—'):money(0);$('store-checkout-total').textContent=money(t.total);$('store-payment-total').textContent=money(t.total);$('store-delivery-help').textContent=v3.fulfillment==='delivery'?(t.zone?`Frete calculado automaticamente para ${choice.type==='neighborhood'?choice.neighborhood:choice.zone.name}${choice.zone.estimated_minutes?`. Prazo estimado: ${choice.zone.estimated_minutes} min.`:''}`:'Selecione seu bairro ou uma área por CEP para calcular o frete.') : '';}
  function v3DeliveryCoverageChanged(){const choice=v3CoverageChoice(),hidden=$('store-delivery-zone'),freeWrap=$('store-delivery-neighborhood-free-wrap'),free=$('store-delivery-neighborhood-free');if(hidden)hidden.value=choice.zone?.id||'';if(freeWrap)freeWrap.classList.toggle('hidden',choice.type!=='cep');if(choice.type!=='cep'&&free)free.value='';v3RenderFulfillment();}
  function v3DeliveryZoneChanged(){v3DeliveryCoverageChanged();}

  function v3PixTlv(id,value){const t=String(value??'');return String(id)+String(t.length).padStart(2,'0')+t;}
  function v3PixAscii(value,max,fallback){const n=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9 $%*+\-./:]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);return n||fallback;}
  function v3Crc16(payload){let crc=0xFFFF;for(let i=0;i<payload.length;i+=1){crc^=payload.charCodeAt(i)<<8;for(let b=0;b<8;b+=1)crc=(crc&0x8000)?((crc<<1)^0x1021)&0xFFFF:(crc<<1)&0xFFFF;}return crc.toString(16).toUpperCase().padStart(4,'0');}
  function v3Pix({key,name,city,amount,txid}){const k=String(key||'').trim().replace(/\s/g,'');const value=Number(amount);if(!k||!Number.isFinite(value)||value<=0)throw new Error('A chave PIX ou o valor do pedido não é válido.');const account=v3PixTlv('00','br.gov.bcb.pix')+v3PixTlv('01',k);const base=v3PixTlv('00','01')+v3PixTlv('26',account)+v3PixTlv('52','0000')+v3PixTlv('53','986')+v3PixTlv('54',value.toFixed(2))+v3PixTlv('58','BR')+v3PixTlv('59',v3PixAscii(name,25,'VENDAFACIL'))+v3PixTlv('60',v3PixAscii(city,15,'BRASIL'))+v3PixTlv('62',v3PixTlv('05',v3PixAscii(txid,25,'***')))+'6304';return base+v3Crc16(base);}
  function v3RenderQr(payload){const target=$('store-qr');target.innerHTML='';if(!window.QRCode){target.innerHTML='<div class="note">Use o código PIX Copia e Cola abaixo.</div>';return;}new QRCode(target,{text:payload,width:216,height:216,correctLevel:QRCode.CorrectLevel.M});}
  async function v3CreateOrder(){const user=await v3GetUser();if(!user){v3.checkoutAfterAccount=true;v3OpenAccount();return;}const name=$('store-buyer-name').value.trim(),phone=$('store-buyer-phone').value.trim(),notes=$('store-buyer-notes').value.trim(),choice=v3CoverageChoice(),zone=choice.zone,cep=v4Digits($('store-delivery-cep').value),neighborhood=choice.type==='neighborhood'?choice.neighborhood:$('store-delivery-neighborhood-free').value.trim(),address={cep,street:$('store-delivery-street').value.trim(),number:$('store-delivery-number').value.trim(),complement:$('store-delivery-complement').value.trim(),neighborhood,reference:$('store-delivery-reference').value.trim()};if(name.length<2||normalizeCustomerPhone(phone).length<12){toast('Revise nome e WhatsApp.');return;}if(v3.fulfillment==='delivery'&&(!zone||address.cep.length!==8||address.street.length<3||!address.number||address.neighborhood.length<2)){toast('Para entrega, escolha sua área e informe CEP, rua, número e bairro.');return;}if(v3.fulfillment==='delivery'&&choice.type==='cep'&&!v3CepMatchesZone(cep,zone)){toast('Este CEP não está dentro da faixa selecionada. Escolha outra área.');return;}const btn=$('store-create-order-button');btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Gerando pedido...';try{const profile=await sb.rpc('ensure_commerce_customer_profile',{p_full_name:name,p_phone:phone});if(profile.error)throw profile.error;v3.customer=profile.data||v3.customer;const {data,error}=await sb.rpc('create_public_commerce_order',{p_slug:v3.store.business.slug,p_buyer_name:name,p_buyer_phone:phone,p_notes:notes||null,p_items:v3CartLines().map(x=>({product_id:x.product_id,quantity:Number(x.quantity)})),p_fulfillment_type:v3.fulfillment,p_delivery_zone_id:v3.fulfillment==='delivery'?zone.id:null,p_delivery_address:v3.fulfillment==='delivery'?address:{}});if(error)throw error;const order=data||{},pix=v3Pix({key:v3.store.settings.pix_key,name:v3.store.settings.pix_receiver_name||v3.store.business.name,city:v3.store.settings.pix_city||'BRASIL',amount:order.total_amount,txid:order.public_code||'VF'});v3.lastOrder={...order,pix,buyerName:name,buyerPhone:phone};$('store-payment-intro').classList.add('hidden');$('store-payment-confirmed').classList.remove('hidden');$('store-order-code').textContent=order.public_code||'—';$('store-confirmed-total').textContent=money(order.total_amount);$('store-pix-code').value=pix;v3RenderQr(pix);v3.cart=[];v3RenderCart();}catch(error){toast(apiError(error,'Não foi possível criar o pedido.'));}finally{btn.disabled=false;btn.innerHTML='<i class="ti ti-qrcode"></i> Gerar PIX do pedido';}}
  async function v3CopyPix(){const code=$('store-pix-code').value;if(!code)return;try{await navigator.clipboard.writeText(code);toast('Código PIX copiado.');}catch{$('store-pix-code').select();document.execCommand('copy');toast('Código PIX copiado.');}}
  async function v3ReportPayment(){const o=v3.lastOrder;if(!o?.id)return;const btn=$('store-report-payment-button');btn.disabled=true;const {error}=await sb.rpc('report_public_commerce_payment',{p_order_id:o.id});if(error){btn.disabled=false;toast(apiError(error));return;}btn.innerHTML='<i class="ti ti-clock-check"></i> Aguardando aprovação';toast('Pagamento informado. Acompanhe na sua conta.');}

  async function v3OpenAccount(){$('modal-store-account').classList.add('open');await v3RenderAccount();}
  function v3AccountTab(tab){$('store-account-login').classList.toggle('hidden',tab!=='login');$('store-account-signup').classList.toggle('hidden',tab!=='signup');$('store-account-login-tab').classList.toggle('active',tab==='login');$('store-account-signup-tab').classList.toggle('active',tab==='signup');}
  async function v3RenderAccount(){const user=await v3GetUser();if(!user){$('store-account-guest').classList.remove('hidden');$('store-account-member').classList.add('hidden');v3AccountTab('login');return;}const p=await v3LoadProfile();$('store-account-guest').classList.add('hidden');$('store-account-member').classList.remove('hidden');$('store-account-email-display').textContent=user.email||'';$('store-account-name').value=p?.full_name||user.user_metadata?.full_name||'';$('store-account-phone').value=p?.phone||user.user_metadata?.phone||'';if(p?.full_name&&p?.phone)await v3LoadMyOrders();else $('store-my-orders').innerHTML='<div class="note">Complete seus dados para vincular seus pedidos à conta.</div>';v3AccountButton();}
  async function v3CustomerLogin(){const email=$('store-account-login-email').value.trim(),password=$('store-account-login-password').value;if(!email||!password){toast('Informe e-mail e senha.');return;}const {error}=await sb.auth.signInWithPassword({email,password});if(error){toast(apiError(error));return;}await v3RenderAccount();if(v3.checkoutAfterAccount){v3.checkoutAfterAccount=false;closeModal('modal-store-account');await v3OpenCheckout();}}
  async function v3CustomerSignUp(){const name=$('store-account-signup-name').value.trim(),phone=$('store-account-signup-phone').value.trim(),email=$('store-account-signup-email').value.trim(),password=$('store-account-signup-password').value;if(name.length<2||normalizeCustomerPhone(phone).length<12||!email.includes('@')||password.length<6){toast('Preencha nome, WhatsApp, e-mail e senha de 6 caracteres.');return;}const {data,error}=await sb.auth.signUp({email,password,options:{data:{account_type:'commerce_customer',full_name:name,phone}}});if(error){toast(apiError(error));return;}if(data.session){const r=await sb.rpc('ensure_commerce_customer_profile',{p_full_name:name,p_phone:phone});if(r.error){toast(apiError(r.error));return;}await v3RenderAccount();if(v3.checkoutAfterAccount){v3.checkoutAfterAccount=false;closeModal('modal-store-account');await v3OpenCheckout();}}else{$('store-account-signup-message').textContent='Cadastro criado. Confirme o e-mail enviado pelo Supabase e entre nesta tela.';$('store-account-signup-message').classList.remove('hidden');}}
  async function v3SaveProfile(){const name=$('store-account-name').value.trim(),phone=$('store-account-phone').value.trim();const {data,error}=await sb.rpc('ensure_commerce_customer_profile',{p_full_name:name,p_phone:phone});if(error){toast(apiError(error));return;}v3.customer=data||null;await v3LoadMyOrders();v3AccountButton();if(v3.checkoutAfterAccount){v3.checkoutAfterAccount=false;closeModal('modal-store-account');await v3OpenCheckout();}else toast('Dados salvos.');}
  async function v3CustomerLogout(){await sb.auth.signOut();v3.customer=null;v3AccountButton();await v3RenderAccount();}
  async function v3LoadMyOrders(){const {data,error}=await sb.rpc('get_my_commerce_orders',{p_slug:v3.store.business.slug});if(error){$('store-my-orders').innerHTML=`<div class="note">${safe(apiError(error))}</div>`;return;}v3.orders=Array.isArray(data)?data:[];$('store-my-orders').innerHTML=v3.orders.length?v3.orders.map(o=>`<button class="my-order-row" onclick="viewMyCommerceOrder('${safe(o.public_code)}')"><span><strong>Pedido ${safe(o.public_code)}</strong><small>${fmtDate(o.created_at)} · ${deliveryLabel(o)}</small></span><span>${statusBadge(o.status)}<strong>${money(o.total_amount)}</strong></span></button>`).join(''):'<div class="empty">Você ainda não tem pedidos nesta loja.</div>';}
  function v3ViewMyOrder(code){const o=v3.orders.find(x=>x.public_code===code);if(!o)return;const info=statusDetail(o.status),a=o.delivery_address||{},address=[a.street,a.number,a.complement,a.neighborhood,a.reference].filter(Boolean).join(', ');$('store-my-order-detail').innerHTML=`<div class="track-result-head"><div><h3>${safe(info[0])}</h3><p class="muted" style="margin:0">${safe(info[1])}</p></div>${statusBadge(o.status)}</div><div class="card" style="padding:13px;margin:14px 0"><div class="row"><div><strong>Pedido ${safe(o.public_code)}</strong><small>${fmtDate(o.created_at)} · ${deliveryLabel(o)}</small></div><strong>${money(o.total_amount)}</strong></div>${isDelivery(o)?`<p class="muted" style="margin:10px 0 0">${safe(address)}</p>`:''}</div><h3 style="font-size:14px;margin:16px 0 8px">Acompanhamento</h3>${v3OrderTimeline(o)}`;$('modal-store-order-detail').classList.add('open');}

  function v3OpenTracking(){ $('store-track-code').value=''; $('store-track-phone').value=''; $('modal-store-track').classList.add('open'); }
  function v3GoTracking(){const code=$('store-track-code').value.trim().toUpperCase(),phone=$('store-track-phone').value.trim();if(code.length<5||normalizeCustomerPhone(phone).length<12){toast('Informe o código e WhatsApp usados no pedido.');return;}location.href=location.origin+location.pathname+'?loja='+encodeURIComponent(v3.store.business.slug)+'&modo=comercio&pedido='+encodeURIComponent(code);}
  async function v3LoadPublicTracking(code,slug){showOnly('screen-order-tracking');window.__publicTrackStoreSlug=slug||'';$('track-order-code').value=String(code||'').toUpperCase();$('track-order-phone').value='';$('track-order-result').classList.add('hidden');$('track-order-error').classList.add('hidden');}
  async function v3TrackPublicOrder(){const code=$('track-order-code').value.trim().toUpperCase(),phone=$('track-order-phone').value.trim();if(code.length<5||normalizeCustomerPhone(phone).length<12){$('track-order-error').textContent='Informe o código e WhatsApp usados no pedido.';$('track-order-error').classList.remove('hidden');return;}const {data,error}=await sb.rpc('get_public_commerce_order_status',{p_public_code:code,p_buyer_phone:phone});if(error){$('track-order-error').textContent=apiError(error,'Pedido não encontrado.');$('track-order-error').classList.remove('hidden');return;}const o=data||{},info=statusDetail(o.status);$('track-order-result').innerHTML=`<div class="order-track-status"><div class="track-result-head"><div><h2>${safe(info[0])}</h2><p class="muted" style="margin:0">${safe(info[1])}</p></div>${statusBadge(o.status)}</div><div class="card" style="padding:13px;margin:14px 0"><div class="row"><div><strong>Pedido ${safe(o.public_code)}</strong><small>${safe(o.business_name||'Loja')} · ${deliveryLabel(o)}</small></div><strong>${money(o.total_amount)}</strong></div></div><h3 style="font-size:14px;margin:18px 0 8px">Acompanhamento</h3>${v3OrderTimeline({...o,commerce_order_status_history:o.timeline||[]})}</div>`;$('track-order-result').classList.remove('hidden');}

  Object.assign(window, {
    openCommerceWorkspace:v3OpenCommerceWorkspace,
    refreshCommerceData:v3RefreshCommerceData,
    goCommercePage:v3GoCommercePage,
    renderCommerceOrders:v3RenderOrders,
    openCommerceOrder:v3OpenCommerceOrder,
    changeCommerceOrderStatus:v3ChangeCommerceOrderStatus,
    saveCommerceDeliverySettings:v3SaveDeliverySettings,
    newCommerceDeliveryZone:v3NewDeliveryZone,
    editCommerceDeliveryZone:v3EditDeliveryZone,
    saveCommerceDeliveryZone:v3SaveDeliveryZone,
    toggleCommerceDeliveryZone:v3ToggleDeliveryZone,
    loadPublicStore:v3LoadPublicStore,
    renderPublicStoreProducts:v3RenderStoreProducts,
    addToStoreCart:v3AddToCart,
    adjustStoreCart:v3AdjustCart,
    openStoreCart:v3OpenStoreCart,
    openStoreCheckout:v3OpenCheckout,
    backToStoreCart:v3BackToCart,
    selectStoreFulfillment:v3SelectFulfillment,
    onStoreDeliveryZoneChange:v3DeliveryZoneChanged,
    onStoreDeliveryCoverageChange:v3DeliveryCoverageChanged,
    createPublicCommerceOrder:v3CreateOrder,
    copyPixCode:v3CopyPix,
    reportPublicCommercePayment:v3ReportPayment,
    openStoreAccount:v3OpenAccount,
    setStoreAccountTab:v3AccountTab,
    customerStoreSignIn:v3CustomerLogin,
    customerStoreSignUp:v3CustomerSignUp,
    saveStoreCustomerProfile:v3SaveProfile,
    customerStoreSignOut:v3CustomerLogout,
    viewMyCommerceOrder:v3ViewMyOrder,
    openCurrentOrderTracking:v3OpenAccount,
    openStoreTrackingForm:v3OpenTracking,
    goToPublicTracking:v3GoTracking,
    loadPublicOrderTracking:v3LoadPublicTracking,
    trackPublicCommerceOrder:v3TrackPublicOrder
  });
})();

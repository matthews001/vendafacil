/* VendaFácil Comércio — módulo complementar ao painel de barbearia.
   Depende do Supabase configurado no index.template.html e do migration SQL deste pacote. */
(() => {
  const commerceStatusLabels = {
    awaiting_payment: 'Aguardando PIX',
    payment_reported: 'Pagamento informado',
    paid: 'Pago',
    fulfilled: 'Entregue',
    cancelled: 'Cancelado'
  };

  const orderItems = (order) => Array.isArray(order?.commerce_order_items) ? order.commerce_order_items : [];
  const commerceStatusBadge = (status) => '<span class="commerce-status '+safe(status)+'">'+safe(commerceStatusLabels[status] || status || '—')+'</span>';
  const stockText = (product) => product.stock_quantity === null || product.stock_quantity === undefined ? 'Sem controle' : Number(product.stock_quantity) + ' un.';
  const storeLink = () => location.origin + location.pathname + '?loja=' + encodeURIComponent(state.business.slug) + '&modo=comercio';
  const orderTotal = (order) => Number(order?.total_amount || 0);

  function setModuleMenu(open) {
    const menu = $('module-menu');
    if (menu) menu.classList.toggle('hidden', !open);
  }

  function toggleModuleMenu() {
    const menu = $('module-menu');
    if (menu) menu.classList.toggle('hidden');
  }

  async function switchModule(module) {
    setModuleMenu(false);
    if (!state.business) {
      toast('Carregue seu negócio antes de trocar de módulo.');
      return;
    }
    if (module === 'comercio') {
      showOnly('screen-commerce-app');
      await refreshCommerceData();
      return;
    }
    showOnly('screen-app');
    await refreshData();
  }

  async function refreshCommerceData() {
    if (!state.business || !sb) return;
    const businessId = state.business.id;
    const [productsResult, ordersResult, settingsResult] = await Promise.all([
      sb.from('commerce_products').select('*').eq('business_id', businessId).order('category').order('name'),
      sb.from('commerce_orders').select('*,commerce_order_items(*)').eq('business_id', businessId).order('created_at', { ascending: false }),
      sb.from('commerce_settings').select('*').eq('business_id', businessId).maybeSingle()
    ]);
    const firstError = [productsResult, ordersResult, settingsResult].map(x => x.error).find(Boolean);
    if (firstError) {
      toast('O módulo Comércio ainda precisa da configuração do banco: ' + apiError(firstError));
      return;
    }
    state.commerceProducts = productsResult.data || [];
    state.commerceOrders = ordersResult.data || [];
    state.commerceSettings = settingsResult.data || null;
    renderCommerceAll();
  }

  function renderCommerceAll() {
    if (!$('commerce-metrics')) return;
    const business = state.business || {};
    $('commerce-sidebar-business').innerHTML = '<strong>'+safe(business.name || 'Meu negócio')+'</strong><span>Modo Comércio</span>';
    renderCommerceHome();
    renderCommerceProducts();
    renderCommerceOrders();
    renderCommerceSettings();
  }

  function renderCommerceHome() {
    const orders = state.commerceOrders || [];
    const products = state.commerceProducts || [];
    const paid = orders.filter(o => ['paid','fulfilled'].includes(o.status));
    const awaiting = orders.filter(o => ['awaiting_payment','payment_reported'].includes(o.status));
    const revenue = paid.reduce((sum, order) => sum + orderTotal(order), 0);
    const ticket = paid.length ? revenue / paid.length : 0;
    $('commerce-metrics').innerHTML = [
      ['ti ti-shopping-bag', 'Pedidos pendentes', awaiting.length],
      ['ti ti-circle-check', 'Vendas confirmadas', paid.length],
      ['ti ti-currency-real', 'Faturamento confirmado', money(revenue)],
      ['ti ti-receipt', 'Ticket médio', money(ticket)]
    ].map(item => '<div class="metric"><div class="icon"><i class="'+item[0]+'"></i></div><label>'+item[1]+'</label><strong>'+item[2]+'</strong></div>').join('');

    const url = storeLink();
    $('commerce-store-link').textContent = url;
    const recent = orders.slice(0, 6);
    $('commerce-recent-orders').innerHTML = recent.length ? recent.map(order => {
      const firstName = String(order.buyer_name || 'Cliente').split(' ')[0];
      return '<div class="row"><div><strong>'+safe(order.public_code || 'Pedido')+' · '+safe(firstName)+'</strong><small>'+fmtDate(order.created_at)+' · '+orderItems(order).reduce((sum, item) => sum + Number(item.quantity || 0), 0)+' item(ns)</small></div><div style="text-align:right"><strong>'+money(orderTotal(order))+'</strong><small>'+stripTags(commerceStatusBadge(order.status))+'</small></div></div>';
    }).join('') : '<div class="empty"><i class="ti ti-shopping-cart-off"></i>Os pedidos da vitrine aparecerão aqui.</div>';

    $('commerce-products-overview').innerHTML = products.length ? products.slice(0, 5).map(product => '<div class="row"><div><strong>'+safe(product.name)+'</strong><small>'+safe(product.category || 'Sem categoria')+' · '+stockText(product)+'</small></div><div style="text-align:right"><strong>'+money(product.price)+'</strong><small>'+ (product.active ? 'Disponível' : 'Desativado') +'</small></div></div>').join('') : '<div class="empty">Cadastre seus produtos para publicar a vitrine.</div>';
  }

  function goCommercePage(page, trigger) {
    document.querySelectorAll('.commerce-section').forEach(section => section.classList.toggle('active', section.id === 'commerce-page-' + page));
    document.querySelectorAll('[data-commerce-page]').forEach(button => button.classList.toggle('active', button === trigger || button.dataset.commercePage === page));
    if (page === 'home') renderCommerceHome();
    if (page === 'products') renderCommerceProducts();
    if (page === 'orders') renderCommerceOrders();
    if (page === 'settings') renderCommerceSettings();
  }

  function renderCommerceProducts() {
    const products = state.commerceProducts || [];
    $('commerce-products-table').innerHTML = products.length ? products.map(product => {
      const image = product.image_url ? '<img class="product-thumb" src="'+safe(product.image_url)+'" alt="'+safe(product.name)+'">' : '<div class="product-thumb empty-thumb"><i class="ti ti-photo"></i></div>';
      return '<tr><td>'+image+'</td><td><strong>'+safe(product.name)+'</strong><br><span class="muted">'+safe(product.description || 'Sem descrição')+'</span></td><td>'+safe(product.category || '—')+'</td><td>'+money(product.price)+'</td><td>'+stockText(product)+'</td><td>'+commerceStatusBadge(product.active ? 'paid' : 'cancelled')+'</td><td><div class="actions"><button class="btn sm" onclick="editCommerceProduct(\''+product.id+'\')">Editar</button><button class="btn sm '+(product.active ? 'danger' : 'primary')+'" onclick="toggleCommerceProduct(\''+product.id+'\','+(product.active ? 'false' : 'true')+')">'+(product.active ? 'Desativar' : 'Ativar')+'</button></div></td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty"><i class="ti ti-package-off"></i>Nenhum produto cadastrado.</div></td></tr>';
  }

  function newCommerceProduct() {
    $('commerce-product-title').textContent = 'Novo produto';
    $('commerce-product-id').value = '';
    $('commerce-product-name').value = '';
    $('commerce-product-description').value = '';
    $('commerce-product-category').value = '';
    $('commerce-product-price').value = '';
    $('commerce-product-stock').value = '';
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
    $('commerce-product-stock').value = product.stock_quantity === null || product.stock_quantity === undefined ? '' : product.stock_quantity;
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
    const url = URL.createObjectURL(file);
    previewCommerceImage(url);
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
    const stockRaw = $('commerce-product-stock').value.trim();
    const stock = stockRaw === '' ? null : Number(stockRaw);
    const active = $('commerce-product-active').checked;
    let imageUrl = $('commerce-product-image-url').value.trim() || $('commerce-product-current-image').value.trim() || null;
    if (name.length < 2 || !Number.isFinite(price) || price < 0 || (stock !== null && (!Number.isInteger(stock) || stock < 0))) {
      toast('Informe nome, preço válido e estoque inteiro não negativo quando usar controle de estoque.');
      return;
    }
    const saveButton = $('commerce-product-save');
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="ti ti-loader"></i> Salvando...';
    try {
      const file = $('commerce-product-image').files?.[0];
      if (file) imageUrl = await uploadCommerceProductImage(file);
      const payload = { business_id: state.business.id, name, description: description || null, category: category || null, price, stock_quantity: stock, active, image_url: imageUrl };
      let result;
      if (id) result = await sb.from('commerce_products').update(payload).eq('id', id).eq('business_id', state.business.id);
      else result = await sb.from('commerce_products').insert(payload);
      if (result.error) throw result.error;
      closeModal('modal-commerce-product');
      await refreshCommerceData();
      toast(id ? 'Produto atualizado.' : 'Produto cadastrado e disponível na vitrine.');
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
    toast(active ? 'Produto ativado na vitrine.' : 'Produto removido da vitrine.');
  }

  function renderCommerceOrders() {
    const orders = state.commerceOrders || [];
    $('commerce-orders-table').innerHTML = orders.length ? orders.map(order => {
      const items = orderItems(order);
      const itemSummary = items.slice(0, 2).map(item => safe(item.product_name)+' ×'+Number(item.quantity)).join(', ') + (items.length > 2 ? ' +' + (items.length - 2) : '');
      return '<tr><td><strong>'+safe(order.public_code || '—')+'</strong><br><span class="muted">'+fmtDate(order.created_at)+'</span></td><td><strong>'+safe(order.buyer_name || 'Cliente')+'</strong><br><span class="muted">'+safe(order.buyer_phone || '—')+'</span></td><td>'+itemSummary+'</td><td><strong>'+money(orderTotal(order))+'</strong></td><td>'+commerceStatusBadge(order.status)+'</td><td><div class="actions"><button class="btn sm" onclick="openCommerceOrder(\''+order.id+'\')">Ver</button>'+commerceOrderActions(order)+'</div></td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty"><i class="ti ti-receipt-off"></i>Ainda não há pedidos.</div></td></tr>';
  }

  function commerceOrderActions(order) {
    if (['awaiting_payment','payment_reported'].includes(order.status)) return '<button class="btn sm primary" onclick="changeCommerceOrderStatus(\''+order.id+'\',\'paid\')">Confirmar pago</button><button class="btn sm danger" onclick="changeCommerceOrderStatus(\''+order.id+'\',\'cancelled\')">Cancelar</button>';
    if (order.status === 'paid') return '<button class="btn sm primary" onclick="changeCommerceOrderStatus(\''+order.id+'\',\'fulfilled\')">Marcar entregue</button>';
    return '';
  }

  function openCommerceOrder(id) {
    const order = (state.commerceOrders || []).find(item => item.id === id);
    if (!order) return;
    const items = orderItems(order);
    $('commerce-order-title').textContent = 'Pedido ' + (order.public_code || '');
    $('commerce-order-content').innerHTML = '<div class="order-detail-top"><div><strong>'+safe(order.buyer_name || 'Cliente')+'</strong><small>'+safe(order.buyer_phone || 'Sem telefone')+'</small></div><div>'+commerceStatusBadge(order.status)+'<strong>'+money(orderTotal(order))+'</strong></div></div><div class="order-items">'+items.map(item => '<div><span>'+safe(item.product_name)+' × '+Number(item.quantity)+'</span><strong>'+money(item.subtotal)+'</strong></div>').join('')+'</div>'+(order.notes ? '<div class="note"><b>Observação:</b> '+safe(order.notes)+'</div>' : '')+'<p class="muted">Criado em '+fmtDate(order.created_at)+(order.paid_at ? '<br>Pagamento confirmado em '+fmtDate(order.paid_at) : '')+'</p>';
    $('modal-commerce-order').classList.add('open');
  }

  async function changeCommerceOrderStatus(id, status) {
    const confirmation = status === 'paid' ? 'Confirmar o pagamento? O estoque controlado será baixado nesta etapa.' : status === 'cancelled' ? 'Cancelar este pedido?' : 'Marcar este pedido como entregue?';
    if (!confirm(confirmation)) return;
    const { error } = await sb.rpc('commerce_set_order_status', { p_order_id: id, p_status: status });
    if (error) { toast(apiError(error)); return; }
    await refreshCommerceData();
    toast(status === 'paid' ? 'Pagamento confirmado e estoque atualizado.' : status === 'fulfilled' ? 'Pedido marcado como entregue.' : 'Pedido cancelado.');
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
    if (!pixKey || !receiver || !city) {
      toast('Informe chave PIX, nome do recebedor e cidade para liberar o checkout.');
      return;
    }
    const { error } = await sb.from('commerce_settings').upsert({
      business_id: state.business.id,
      pix_key: pixKey,
      pix_receiver_name: receiver,
      pix_city: city,
      contact_whatsapp: whatsapp || null,
      public_description: description || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'business_id' });
    if (error) { toast(apiError(error)); return; }
    await refreshCommerceData();
    toast('Configuração de vendas e PIX salva.');
  }

  async function copyStoreLink() {
    const link = storeLink();
    try { await navigator.clipboard.writeText(link); toast('Link da vitrine copiado.'); }
    catch { prompt('Copie este link:', link); }
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
    $('store-description').textContent = settings.public_description || 'Escolha seus produtos e pague com PIX.';
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
      return '<article class="store-product '+(unavailable ? 'unavailable' : '')+'">'+image+'<div class="store-product-body"><small>'+safe(product.category || 'Produto')+'</small><h3>'+safe(product.name)+'</h3><p>'+safe(product.description || 'Produto disponível para retirada ou entrega.')+'</p><div class="store-product-bottom"><strong>'+money(product.price)+'</strong><button class="btn sm primary" '+(unavailable ? 'disabled' : '')+' onclick="addToStoreCart(\''+product.id+'\')">'+(unavailable ? 'Indisponível' : '<i class=\"ti ti-plus\"></i> Adicionar')+'</button></div></div></article>';
    }).join('') : '<div class="store-empty"><i class="ti ti-package-off"></i><strong>Nenhum produto nesta categoria.</strong><span>Volte mais tarde ou escolha outra categoria.</span></div>';
  }

  function storeCart() {
    if (!Array.isArray(window.__storeCart)) window.__storeCart = [];
    return window.__storeCart;
  }

  function addToStoreCart(productId) {
    const payload = window.__publicStore;
    const product = (payload?.products || []).find(item => item.id === productId);
    if (!product) return;
    const cart = storeCart();
    const current = cart.find(item => item.product_id === productId);
    const limit = product.stock_quantity === null || product.stock_quantity === undefined ? Infinity : Number(product.stock_quantity);
    if (current && current.quantity >= limit) { toast('Você atingiu o estoque disponível deste produto.'); return; }
    if (current) current.quantity += 1;
    else cart.push({ product_id: productId, quantity: 1 });
    renderStoreCart();
    toast(product.name + ' adicionado ao carrinho.', 1800);
  }

  function adjustStoreCart(productId, delta) {
    const cart = storeCart();
    const item = cart.find(entry => entry.product_id === productId);
    if (!item) return;
    const product = (window.__publicStore?.products || []).find(entry => entry.id === productId);
    const limit = product?.stock_quantity === null || product?.stock_quantity === undefined ? Infinity : Number(product?.stock_quantity || 0);
    const next = item.quantity + Number(delta);
    if (next <= 0) window.__storeCart = cart.filter(entry => entry.product_id !== productId);
    else if (next <= limit) item.quantity = next;
    else { toast('Quantidade maior que o estoque disponível.'); return; }
    renderStoreCart();
  }

  function cartLineItems() {
    const products = window.__publicStore?.products || [];
    return storeCart().map(entry => {
      const product = products.find(item => item.id === entry.product_id);
      return product ? { ...entry, product, subtotal: Number(product.price) * Number(entry.quantity) } : null;
    }).filter(Boolean);
  }

  function renderStoreCart() {
    const lines = cartLineItems();
    const total = lines.reduce((sum, line) => sum + line.subtotal, 0);
    $('store-cart-count').textContent = lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    $('store-cart-items').innerHTML = lines.length ? lines.map(line => '<div class="cart-line"><div><strong>'+safe(line.product.name)+'</strong><small>'+money(line.product.price)+' por unidade</small></div><div class="cart-line-actions"><button onclick="adjustStoreCart(\''+line.product_id+'\',-1)">−</button><span>'+line.quantity+'</span><button onclick="adjustStoreCart(\''+line.product_id+'\',1)">+</button></div><strong>'+money(line.subtotal)+'</strong></div>').join('') : '<div class="empty"><i class="ti ti-shopping-cart-off"></i>Seu carrinho está vazio.</div>';
    $('store-cart-total').textContent = money(total);
    $('store-checkout-button').disabled = !lines.length;
  }

  function openStoreCart() {
    renderStoreCart();
    $('store-cart-step').classList.remove('hidden');
    $('store-payment-step').classList.add('hidden');
    $('modal-store-cart').classList.add('open');
  }

  function openStoreCheckout() {
    const payload = window.__publicStore;
    if (!cartLineItems().length) { toast('Adicione pelo menos um produto.'); return; }
    if (!payload?.settings?.pix_key) { toast('Esta loja ainda não configurou o PIX.'); return; }
    $('store-cart-step').classList.add('hidden');
    $('store-payment-step').classList.remove('hidden');
    $('store-payment-intro').classList.remove('hidden');
    $('store-payment-confirmed').classList.add('hidden');
    $('store-buyer-name').value = '';
    $('store-buyer-phone').value = '';
    $('store-buyer-notes').value = '';
    $('store-payment-total').textContent = money(cartLineItems().reduce((sum, line) => sum + line.subtotal, 0));
    $('store-qr').innerHTML = '';
    $('store-pix-code').value = '';
  }

  function backToStoreCart() {
    $('store-cart-step').classList.remove('hidden');
    $('store-payment-step').classList.add('hidden');
  }

  function pixTlv(id, value) {
    const text = String(value ?? '');
    return String(id) + String(text.length).padStart(2, '0') + text;
  }

  function pixAscii(value, maxLength, fallback) {
    const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 $%*+\-./:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    return normalized || fallback;
  }

  function crc16Ccitt(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i += 1) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function buildPixPayload({ pixKey, receiverName, city, amount, txid }) {
    const key = String(pixKey || '').trim().replace(/\s/g, '');
    const value = Number(amount);
    if (!key) throw new Error('A chave PIX desta loja não foi configurada.');
    if (!Number.isFinite(value) || value <= 0) throw new Error('O valor do pedido é inválido para o PIX.');
    const merchantAccount = pixTlv('00', 'br.gov.bcb.pix') + pixTlv('01', key);
    const reference = pixAscii(txid, 25, '***');
    const payload =
      pixTlv('00', '01') +
      pixTlv('26', merchantAccount) +
      pixTlv('52', '0000') +
      pixTlv('53', '986') +
      pixTlv('54', value.toFixed(2)) +
      pixTlv('58', 'BR') +
      pixTlv('59', pixAscii(receiverName, 25, 'VENDAFACIL')) +
      pixTlv('60', pixAscii(city, 15, 'BRASIL')) +
      pixTlv('62', pixTlv('05', reference)) +
      '6304';
    return payload + crc16Ccitt(payload);
  }

  function renderPixQr(payload) {
    const target = $('store-qr');
    target.innerHTML = '';
    if (!window.QRCode) {
      target.innerHTML = '<div class="note">Não foi possível carregar o QR Code. Use o código PIX Copia e Cola abaixo.</div>';
      return;
    }
    new QRCode(target, { text: payload, width: 216, height: 216, correctLevel: QRCode.CorrectLevel.M });
  }

  async function createPublicCommerceOrder() {
    const payload = window.__publicStore;
    const name = $('store-buyer-name').value.trim();
    const phone = $('store-buyer-phone').value.trim();
    const notes = $('store-buyer-notes').value.trim();
    const lines = cartLineItems();
    if (name.length < 2 || normalizeCustomerPhone(phone).length < 12 || !lines.length) {
      toast('Informe nome, WhatsApp válido e mantenha ao menos um produto no carrinho.');
      return;
    }
    const button = $('store-create-order-button');
    button.disabled = true;
    button.innerHTML = '<i class="ti ti-loader"></i> Gerando pedido...';
    try {
      const requestItems = lines.map(line => ({ product_id: line.product_id, quantity: Number(line.quantity) }));
      const { data, error } = await sb.rpc('create_public_commerce_order', {
        p_slug: payload.business.slug,
        p_buyer_name: name,
        p_buyer_phone: phone,
        p_notes: notes || null,
        p_items: requestItems
      });
      if (error) throw error;
      const order = data || {};
      const pixPayload = buildPixPayload({
        pixKey: payload.settings.pix_key,
        receiverName: payload.settings.pix_receiver_name || payload.business.name,
        city: payload.settings.pix_city || 'BRASIL',
        amount: order.total_amount,
        txid: order.public_code || 'VF'
      });
      window.__publicStoreOrder = { ...order, pixPayload, buyerName: name, buyerPhone: phone };
      $('store-payment-intro').classList.add('hidden');
      $('store-payment-confirmed').classList.remove('hidden');
      $('store-order-code').textContent = order.public_code || '—';
      $('store-confirmed-total').textContent = money(order.total_amount);
      $('store-pix-code').value = pixPayload;
      renderPixQr(pixPayload);
      window.__storeCart = [];
      renderStoreCart();
    } catch (error) {
      toast(apiError(error, 'Não foi possível criar o pedido.'));
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="ti ti-qrcode"></i> Gerar PIX do pedido';
    }
  }

  async function copyPixCode() {
    const code = $('store-pix-code').value;
    if (!code) return;
    try { await navigator.clipboard.writeText(code); toast('Código PIX copiado. Abra o app do seu banco para pagar.'); }
    catch { $('store-pix-code').select(); document.execCommand('copy'); toast('Código PIX copiado.'); }
  }

  async function reportPublicCommercePayment() {
    const order = window.__publicStoreOrder;
    if (!order?.id) return;
    const button = $('store-report-payment-button');
    button.disabled = true;
    const { error } = await sb.rpc('report_public_commerce_payment', { p_order_id: order.id });
    if (error) { button.disabled = false; toast(apiError(error)); return; }
    const whatsapp = normalizeWhatsApp(window.__publicStore?.settings?.contact_whatsapp || window.__publicStore?.business?.whatsapp);
    toast('Pagamento informado. A loja fará a conferência.');
    if (whatsapp.length >= 12) {
      const message = 'Olá! Efetuei o pagamento do pedido ' + (order.public_code || '') + ' no valor de ' + money(order.total_amount) + '. Nome: ' + order.buyerName + '. Posso enviar o comprovante se necessário.';
      setTimeout(() => { location.href = 'https://wa.me/' + whatsapp + '?text=' + encodeURIComponent(message); }, 450);
    }
  }

  function goHomeFromStore() {
    location.href = location.origin + location.pathname;
  }

  async function loadPublicStore(slug) {
    showOnly('screen-store');
    $('store-loading').classList.remove('hidden');
    $('store-content').classList.add('hidden');
    $('store-error').classList.add('hidden');
    const { data, error } = await sb.rpc('get_public_store_data', { p_slug: slug });
    if (error) {
      $('store-loading').classList.add('hidden');
      $('store-error').textContent = apiError(error, 'Esta vitrine não está disponível.');
      $('store-error').classList.remove('hidden');
      return;
    }
    window.__publicStore = data || { business: {}, settings: {}, products: [] };
    window.__storeCart = [];
    window.__publicStoreOrder = null;
    renderPublicStore();
    $('store-loading').classList.add('hidden');
    $('store-content').classList.remove('hidden');
  }

  Object.assign(window, {
    toggleModuleMenu,
    switchModule,
    goCommercePage,
    refreshCommerceData,
    newCommerceProduct,
    editCommerceProduct,
    previewCommerceImage,
    previewSelectedCommerceImage,
    saveCommerceProduct,
    toggleCommerceProduct,
    openCommerceOrder,
    changeCommerceOrderStatus,
    saveCommerceSettings,
    copyStoreLink,
    loadPublicStore,
    renderPublicStoreProducts,
    addToStoreCart,
    adjustStoreCart,
    openStoreCart,
    openStoreCheckout,
    backToStoreCart,
    createPublicCommerceOrder,
    copyPixCode,
    reportPublicCommercePayment,
    goHomeFromStore
  });
})();

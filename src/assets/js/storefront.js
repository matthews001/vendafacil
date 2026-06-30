(() => {
  'use strict';
  const config = window.__VF_STORE_CONFIG__ || {};
  const $ = id => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  const slug = () => String(q.get('loja') || '').trim().toLowerCase();
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
  const text = value => String(value ?? '').trim();
  const digits = value => String(value ?? '').replace(/\D/g, '');
  const money = value => new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(Number(value || 0));
  const cacheKey = value => 'vendafacil:lite:store:v11-core-flow:' + value;
  const sessionKey = value => 'vendafacil-store-customer-v10:' + value;
  const mapboxToken = () => text(config.mapboxToken || config.mapboxPublicToken || '');
  const pendingPaymentKey = value => 'vendafacil-store-pending-payment:v1:' + value;
  const store = { data:null, cart:[], customer:null, orders:[], lastOrder:null, fulfillment:'pickup', coupon:null, optionProduct:null, refreshTimer:null, db:null, installPrompt:null, ordersBlocked:false, ordersBlockedMessage:'', route:null, map:null, mapLoadPromise:null, radius:null, radiusCheck:null, pendingPayment:null, paymentMethod:'pix', cashChangeFor:'', paymentConfirmedTemplate:'' };
  let toastTimer;
  const cepLookupCache = new Map();

  function notify(message) { const target = $('vf-toast'); if (!target) return; target.textContent = text(message) || 'Pronto.'; target.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => target.classList.remove('show'), 3300); }
  function show(el, visible) { el?.classList.toggle('hidden', !visible); }
  function closeModal(id) { $(id)?.classList.remove('open'); }
  window.closeModal = closeModal;
  window.toggleStoreFilter = () => $('store-filter-box')?.classList.toggle('hidden');
  window.reloadStorefront = () => loadStore({force:true});
  function errorMessage(error, fallback='Não foi possível concluir esta ação.') { return text(error?.message || error?.details || fallback); }
  function getToken(){ try { return localStorage.getItem(sessionKey(slug())) || ''; } catch (_) { return ''; } }
  function setToken(token){ try { if(token) localStorage.setItem(sessionKey(slug()), token); } catch (_) {} }
  function clearToken(){ try { localStorage.removeItem(sessionKey(slug())); } catch (_) {} }
  function readPendingPayment(){ try { return JSON.parse(localStorage.getItem(pendingPaymentKey(slug())) || 'null'); } catch (_) { return null; } }
  function persistPendingPayment(order){
    if(!order?.id) return;
    const data={id:order.id,public_code:order.public_code||'',total_amount:Number(order.total_amount||0),status:order.status||'awaiting_payment',created_at:order.created_at||new Date().toISOString()};
    store.pendingPayment=data;
    try { localStorage.setItem(pendingPaymentKey(slug()), JSON.stringify(data)); } catch (_) {}
  }
  function clearPendingPayment(){ store.pendingPayment=null; try { localStorage.removeItem(pendingPaymentKey(slug())); } catch (_) {} }
  function paymentMethodFromOrder(order){ const direct=String(order?.payment_method||'').toLowerCase(); if(PAYMENT_METHODS[direct]) return direct; const notes=String(order?.notes||order?.customer_notes||''); const match=notes.match(/\[\[VF_PAYMENT:([a-z_]+)\]\]/i); return match&&PAYMENT_METHODS[String(match[1]).toLowerCase()]?String(match[1]).toLowerCase():'pix'; }
  function isPaymentPending(order){ const method=paymentMethodFromOrder(order); return method==='pix' && ['awaiting_payment','payment_reported'].includes(String(order?.status||'')); }
  function pendingOrder(){
    const current=(store.orders||[]).find(isPaymentPending);
    if(current) return current;
    const saved=store.pendingPayment||readPendingPayment();
    return isPaymentPending(saved) ? saved : null;
  }
  function syncPendingPayment(){
    const pending=(store.orders||[]).find(isPaymentPending);
    if(pending) persistPendingPayment(pending);
    else if(store.orders?.length) clearPendingPayment();
    else store.pendingPayment=readPendingPayment();
  }
  function validPhone(value){ let phone = digits(value); if(phone.startsWith('55')) phone = phone.slice(2); return phone.length===10 || phone.length===11; }
  function phoneLabel(value){ const raw=digits(value).replace(/^55/,''); return raw.length===11 ? `(${raw.slice(0,2)}) ${raw.slice(2,7)}-${raw.slice(7)}` : raw.length===10 ? `(${raw.slice(0,2)}) ${raw.slice(2,6)}-${raw.slice(6)}` : text(value)||'—'; }
  function isIos(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); }
  function standalone(){ return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true; }
  function db(){ if(store.db) return store.db; if(!window.supabase || !config.supabaseUrl || !config.supabaseKey) return null; store.db=window.supabase.createClient(config.supabaseUrl,config.supabaseKey); return store.db; }
  async function rpc(name, params){ const client=db(); if(!client) throw new Error('A conexão com a loja ainda não está pronta. Atualize a página.'); const {data,error}=await client.rpc(name,params); if(error) throw error; return data; }
  function geocodeKey(address){ return 'vendafacil:mapbox-geocode:v1:'+slug()+':'+encodeURIComponent(String(address||'').toLowerCase()); }
  async function geocodeBrazilAddress(address){
    const query=text(address); const token=mapboxToken();
    if(!query) throw new Error('Informe o endereço completo antes de conferir o raio.');
    if(!token) throw new Error('A entrega por raio precisa da chave pública do Mapbox configurada na Vercel.');
    const key=geocodeKey(query);
    try{ const cached=JSON.parse(localStorage.getItem(key)||'null'); if(cached&&Number.isFinite(cached.lat)&&Number.isFinite(cached.lng)) return cached; }catch(_){}
    const url='https://api.mapbox.com/search/geocode/v6/forward?access_token='+encodeURIComponent(token)+'&q='+encodeURIComponent(query)+'&country=br&language=pt-BR&limit=1';
    const response=await fetch(url);
    if(!response.ok) throw new Error('Não foi possível localizar este endereço para calcular o raio.');
    const payload=await response.json(); const feature=Array.isArray(payload?.features)?payload.features[0]:null; const coords=feature?.geometry?.coordinates;
    const lng=Number(Array.isArray(coords)?coords[0]:NaN),lat=Number(Array.isArray(coords)?coords[1]:NaN);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) throw new Error('Não encontramos coordenadas para este endereço. Confira CEP, rua e número.');
    const data={lat,lng,label:text(feature?.properties?.full_address||feature?.place_name||query)};
    try{localStorage.setItem(key,JSON.stringify(data));}catch(_){}
    return data;
  }
  function saveCache(data){ try { localStorage.setItem(cacheKey(slug()), JSON.stringify({saved_at:Date.now(),data})); } catch (_) {} }
  function readCache(){ try { return JSON.parse(localStorage.getItem(cacheKey(slug())) || '')?.data || null; } catch (_) { return null; } }
  function appData(){ return store.data || {business:{},settings:{},products:[],delivery_zones:[]}; }
  function products(){ return Array.isArray(appData().products) ? appData().products : []; }
  function zones(){ return Array.isArray(appData().delivery_zones) ? appData().delivery_zones : []; }
  function uniqueId(){ try { return crypto.randomUUID(); } catch (_) { return 'line-'+Date.now()+'-'+Math.random().toString(36).slice(2,8); } }

  const PAYMENT_METHODS = {
    pix:{ label:'Pix', icon:'ti ti-qrcode', kind:'pix' },
    cash:{ label:'Dinheiro', icon:'ti ti-cash', kind:'cash' },
    debit_card:{ label:'Cartão de débito', icon:'ti ti-credit-card', kind:'terminal' },
    credit_card:{ label:'Cartão de crédito', icon:'ti ti-credit-card-pay', kind:'terminal' },
    meal_voucher:{ label:'Vale-refeição', icon:'ti ti-ticket', kind:'terminal' },
    food_voucher:{ label:'Vale-alimentação', icon:'ti ti-basket', kind:'terminal' }
  };
  function defaultPaymentConfig(){
    return {
      pix:{enabled:true,pickup:true,delivery:true},
      cash:{enabled:false,pickup:true,delivery:true,cash_change_enabled:true},
      debit_card:{enabled:false,pickup:true,delivery:true},
      credit_card:{enabled:false,pickup:true,delivery:true},
      meal_voucher:{enabled:false,pickup:true,delivery:true},
      food_voucher:{enabled:false,pickup:true,delivery:true}
    };
  }
  function paymentConfig(){
    const raw=appData().settings?.payment_methods_config;
    const base=defaultPaymentConfig();
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) return base;
    Object.keys(base).forEach(id=>{ const item=raw[id]; if(item && typeof item==='object' && !Array.isArray(item)) base[id]={...base[id],...item}; });
    return base;
  }
  function paymentMethodsForFulfillment(){
    const config=paymentConfig(), mode=store.fulfillment==='delivery'?'delivery':'pickup', settings=appData().settings||{};
    return Object.keys(PAYMENT_METHODS).filter(id=>{
      const item=config[id]||{};
      if(!item.enabled || !item[mode]) return false;
      if(id==='pix' && !String(settings.pix_key||'').trim()) return false;
      return true;
    });
  }
  function paymentMethod(){
    const available=paymentMethodsForFulfillment();
    if(!available.includes(store.paymentMethod)) store.paymentMethod=available[0]||'';
    return store.paymentMethod;
  }
  function paymentLabel(id=paymentMethod()){ return PAYMENT_METHODS[id]?.label||'Pagamento'; }
  function paymentTimingText(id=paymentMethod()){
    const mode=store.fulfillment==='delivery'?'na entrega':'na retirada';
    if(id==='pix') return 'Pague agora pelo Pix.';
    if(id==='cash') return 'Pague em dinheiro '+mode+'.';
    return 'Pague na maquininha '+mode+'.';
  }
  function paymentConfirmationText(id=paymentMethod()){
    const mode=store.fulfillment==='delivery'?'na entrega':'na retirada';
    if(id==='cash') return 'Pagamento em dinheiro '+mode+'.';
    return 'Pagamento na maquininha '+mode+'.';
  }
  function restorePaymentConfirmation(){
    const target=$('store-payment-confirmed');
    if(!target) return;
    if(!store.paymentConfirmedTemplate) store.paymentConfirmedTemplate=target.innerHTML;
    target.innerHTML=store.paymentConfirmedTemplate;
  }
  function ensureCheckoutPaymentCard(){
    if($('store-payment-method-card')) return;
    const schedule=$('store-schedule-box');
    if(!schedule) return;
    const card=document.createElement('div');
    card.id='store-payment-method-card';
    card.className='vf-checkout-card';
    card.innerHTML='<strong>Como deseja pagar?</strong><p id="store-payment-method-help" class="vf-muted">Escolha a forma de pagamento disponível.</p><div id="store-payment-methods" class="vf-payment-methods"></div><div id="store-cash-change-card" class="vf-cash-change-card hidden"><label for="store-cash-change-for">Precisa de troco para quanto?</label><input id="store-cash-change-for" inputmode="decimal" placeholder="Ex.: 50,00"><small>Informe o valor que você entregará à loja. Deixe vazio se não precisar de troco.</small></div><div id="store-payment-method-empty" class="vf-payment-method-empty hidden">Esta loja ainda não configurou uma forma de pagamento disponível para este pedido.</div>';
    schedule.after(card);
    $('store-cash-change-for')?.addEventListener('input',event=>{ store.cashChangeFor=String(event.target.value||'').replace(/[^0-9,\.]/g,''); });
  }
  function renderCheckoutPaymentMethods(){
    ensureCheckoutPaymentCard();
    const out=$('store-payment-methods'),help=$('store-payment-method-help'),empty=$('store-payment-method-empty'),cashCard=$('store-cash-change-card');
    if(!out) return;
    const available=paymentMethodsForFulfillment();
    const selected=paymentMethod();
    out.innerHTML=available.map(id=>{
      const item=PAYMENT_METHODS[id]; const active=id===selected;
      const sub=id==='pix'?'Pagamento online agora':(id==='cash'?(store.fulfillment==='delivery'?'Dinheiro na entrega':'Dinheiro na retirada'):(store.fulfillment==='delivery'?'Maquininha na entrega':'Maquininha na retirada'));
      return '<button type="button" class="vf-payment-method '+(active?'active':'')+'" onclick="selectStorePaymentMethod(\''+id+'\')"><i class="'+item.icon+'"></i><span><strong>'+esc(item.label)+'</strong><small>'+esc(sub)+'</small></span></button>';
    }).join('');
    show(empty,!available.length);
    const config=paymentConfig(),cashEnabled=selected==='cash' && config.cash?.cash_change_enabled!==false;
    show(cashCard,cashEnabled);
    if(cashEnabled && $('store-cash-change-for')) $('store-cash-change-for').value=store.cashChangeFor||'';
    if(help) help.textContent=available.length?paymentTimingText(selected):'A loja precisa ativar pelo menos uma forma de pagamento para este tipo de pedido.';
    const submit=$('store-create-order-button');
    if(submit){ submit.disabled=!available.length; submit.innerHTML=selected==='pix'?'<i class="ti ti-qrcode"></i> Gerar Pix do pedido':'<i class="ti ti-check"></i> Confirmar pedido'; }
  }
  window.selectStorePaymentMethod=id=>{ if(!PAYMENT_METHODS[id]) return; store.paymentMethod=id; if(id!=='cash') store.cashChangeFor=''; renderCheckoutPaymentMethods(); renderCheckoutTotals(); };
  function parseMoneyInput(value){ const normalized=String(value||'').trim().replace(/\./g,'').replace(',','.'); const number=Number(normalized); return Number.isFinite(number)?number:0; }
  function optionGroups(product){ return Array.isArray(product?.option_groups) ? product.option_groups.filter(group=>group&&text(group.id)) : []; }
  function resolveLine(line){ const product=products().find(item=>item.id===line.product_id); if(!product) return null; let adjust=0; const selectedSummary=[]; optionGroups(product).forEach(group=>{ const found=(line.selected_options||[]).find(entry=>entry.group_id===group.id); const ids=Array.isArray(found?.option_ids)?found.option_ids:[]; const selected=(group.options||[]).filter(option=>ids.includes(option.id)&&option.active!==false); if(selected.length){ adjust+=selected.reduce((sum,item)=>sum+Number(item.price_adjustment||0),0); selectedSummary.push({group_name:group.name, options:selected}); }}); const quantity=Math.max(1,Number(line.quantity||1)); const unit=Number(product.price||0)+adjust; return {...line,product,quantity,unit_price:unit,subtotal:unit*quantity,selectedSummary}; }
  function lines(){ return store.cart.map(resolveLine).filter(Boolean); }
  function lineKey(line){ return line.line_id || `${line.product_id}:${JSON.stringify(line.selected_options||[])}:${text(line.customer_note)}`; }
  function updateCartIndicators(){ const all=lines(); const quantity=all.reduce((sum,line)=>sum+line.quantity,0); const total=all.reduce((sum,line)=>sum+line.subtotal,0); $('store-cart-count').textContent=String(quantity); $('store-mobile-cart-quantity').textContent=`${quantity} ${quantity===1?'item':'itens'}`; $('store-mobile-cart-total').textContent=money(total); show($('store-mobile-cart'), quantity>0); }
  function setTheme(data){
    const business=data.business||{}, settings=data.settings||{};
    const accent=/^#[0-9a-f]{6}$/i.test(text(settings.brand_primary_color))?text(settings.brand_primary_color):'#1d9e75';
    const rgb={r:parseInt(accent.slice(1,3),16),g:parseInt(accent.slice(3,5),16),b:parseInt(accent.slice(5,7),16)};
    const dark='#'+[rgb.r*.43,rgb.g*.43,rgb.b*.43].map(value=>Math.max(0,Math.min(255,Math.round(value))).toString(16).padStart(2,'0')).join('');
    document.documentElement.style.setProperty('--vf-accent',accent);
    document.documentElement.style.setProperty('--vf-accent-dark',dark);
    document.documentElement.style.setProperty('--vf-dark',dark);
    document.documentElement.style.setProperty('--vf-soft',`rgba(${rgb.r},${rgb.g},${rgb.b},.12)`);
    const name=business.name||'Nossa vitrine'; document.title=name+' | VendaFácil';
    const logo=text(settings.store_logo_url); const brand=$('store-brand-name'), avatar=$('store-brand-avatar'), heroLogo=$('store-hero-logo');
    if(brand) brand.textContent=name;
    if(avatar) avatar.innerHTML=logo?`<img src="${esc(logo)}" alt="Logo">`:esc(name.charAt(0).toUpperCase()||'L');
    if(heroLogo) heroLogo.innerHTML=logo?`<img src="${esc(logo)}" alt="Logo da loja">`:esc(name.charAt(0).toUpperCase()||'L');
    if($('store-title')) $('store-title').textContent=name;
    if($('store-description')) $('store-description').textContent=settings.public_description||'Escolha seus itens, selecione como pagar e acompanhe o pedido.';
    const hero=$('store-hero'); const banner=text(settings.store_banner_url);
    if(hero){
      hero.classList.toggle('has-banner',!!banner);
      if(banner){
        const safeBanner=banner.replace(/"/g,'%22').replace(/\n|\r/g,'');
        hero.style.setProperty('--vf-store-banner-image',`url("${safeBanner}")`);
      } else hero.style.removeProperty('--vf-store-banner-image');
      hero.style.setProperty('--vf-store-banner-fit',settings.store_banner_fit==='contain'?'contain':'cover');
      hero.style.setProperty('--vf-store-banner-position',`${Number(settings.store_banner_position_x ?? 50)}% ${Number(settings.store_banner_position_y ?? 50)}%`);
    }
    const badge=settings.store_badge_text || (settings.delivery_enabled ? (settings.pickup_enabled===false?'Entrega disponível':'Entrega e retirada'):'Retire na loja');
    if($('store-hero-badge')) $('store-hero-badge').innerHTML=`<i class="ti ti-shopping-bag"></i> ${esc(badge)}`;
    const note=text(settings.store_notice); const notice=$('store-hero-notice'); if(notice){ notice.querySelector('span').textContent=note; show(notice,!!note); }
    updateManifest(name,accent);
  }
  function brazilParts(date=new Date()){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const read=type=>parts.find(part=>part.type===type)?.value||'';
    const dayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
    return {day:dayMap[read('weekday')],year:Number(read('year')),month:Number(read('month')),date:Number(read('day')),hour:Number(read('hour')),minute:Number(read('minute')),second:Number(read('second'))};
  }
  function brazilDateValue(date=new Date()){ const p=brazilParts(date); return `${String(p.year).padStart(4,'0')}-${String(p.month).padStart(2,'0')}-${String(p.date).padStart(2,'0')}`; }
  function toMinutes(value){ const [hour,minute]=String(value||'').split(':').map(Number); return Number.isFinite(hour)&&Number.isFinite(minute)?hour*60+minute:NaN; }
  function isTimeWithinHours(row, minutes){
    if(!row?.active) return false;
    const start=toMinutes(row.open),end=toMinutes(row.close);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start===end) return false;
    return end>start ? minutes>=start&&minutes<end : minutes>=start||minutes<end;
  }
  function hoursForDate(dateValue){
    const raw=appData().settings?.store_opening_hours;
    if(!Array.isArray(raw)||!raw.length) return {configured:false,row:null};
    const date=new Date(`${dateValue}T12:00:00-03:00`);
    return {configured:true,row:raw.find(item=>Number(item?.day)===date.getUTCDay())||null};
  }
  function storeHoursStatus(){
    const raw=appData().settings?.store_opening_hours;
    if(!Array.isArray(raw)||!raw.length) return {configured:false,open:true,label:''};
    const now=brazilParts();
    const row=raw.find(item=>Number(item?.day)===now.day)||null;
    const open=isTimeWithinHours(row,now.hour*60+now.minute);
    return {configured:true,open,row,label:open?'Estamos atendendo agora.':'Loja fechada neste momento.'};
  }
  function scheduleEnabled(){ return appData().settings?.order_scheduling_enabled===true; }
  function orderAvailability(){
    const status=storeHoursStatus();
    if(!status.configured||status.open) return {canCheckout:true,scheduleOnly:false,status,message:''};
    if(scheduleEnabled()) return {canCheckout:true,scheduleOnly:true,status,message:'A loja está fechada agora. Escolha um horário futuro para agendar seu pedido.'};
    return {canCheckout:false,scheduleOnly:false,status,message:'A loja está fechada agora e não aceita pedidos agendados.'};
  }
  function updateCheckoutAvailability(){
    const availability=orderAvailability();
    const continueButton=document.querySelector('#store-cart-step button[onclick="openStoreCheckout()"]');
    if(continueButton){
      continueButton.disabled=!availability.canCheckout;
      continueButton.title=availability.canCheckout?'':availability.message;
      if(!availability.canCheckout) continueButton.innerHTML='<i class="ti ti-clock-off"></i> Loja fechada';
      else continueButton.innerHTML=availability.scheduleOnly?'Agendar pedido <i class="ti ti-calendar-time"></i>':'Continuar pedido <i class="ti ti-arrow-right"></i>';
    }
  }
  function renderPublicNotices(){
    const blocked=$('store-public-notice'),hours=$('store-hours-notice');
    const message=store.ordersBlockedMessage||'Esta loja está temporariamente sem receber novos pedidos.';
    if(blocked){blocked.textContent=message;blocked.classList.toggle('blocked',store.ordersBlocked);show(blocked,store.ordersBlocked);}
    const availability=orderAvailability();
    if(hours){
      const visible=availability.status.configured;
      hours.textContent=availability.status.open?'Estamos atendendo agora.':availability.message;
      hours.classList.toggle('blocked',!availability.status.open);
      show(hours,visible);
    }
    updateCheckoutAvailability();
  }
  function renderProducts(){ const list=$('store-products'), select=$('store-category-filter'); const categories=[...new Set(products().map(p=>text(p.category)).filter(Boolean))]; if(select && !select.dataset.ready){ select.innerHTML='<option value="">Todas as categorias</option>'+categories.map(category=>`<option value="${esc(category)}">${esc(category)}</option>`).join(''); select.dataset.ready='1'; } const selected=select?.value||''; const visible=products().filter(product=>!selected || text(product.category)===selected); $('store-category-pills').innerHTML=[''].concat(categories).map(category=>`<button type="button" class="${selected===category?'active':''}" onclick="setStoreCategory(${JSON.stringify(category)})">${esc(category||'Todos')}</button>`).join(''); list.innerHTML=visible.length ? visible.map(product=>{ const unavailable=product.stock_quantity!==null&&product.stock_quantity!==undefined&&Number(product.stock_quantity)<=0; const image=text(product.image_url); const hasChoices=optionGroups(product).length||product.allow_customer_note; return `<article class="vf-product"><div class="vf-product-image">${image?`<img loading="lazy" decoding="async" src="${esc(image)}" alt="${esc(product.name)}">`:'<i class="ti ti-photo"></i>'}</div><div class="vf-product-body"><span class="vf-product-category">${esc(product.category||'Item')}</span><h3>${esc(product.name)}</h3><p>${esc(product.description||'Item disponível no cardápio.')}</p>${hasChoices?'<span class="vf-product-customize"><i class="ti ti-adjustments-horizontal"></i> Personalize antes de pedir</span>':''}<div class="vf-product-footer"><strong>${money(product.price)}</strong><button class="vf-add" ${unavailable?'disabled':''} type="button" aria-label="${unavailable?'Indisponível':hasChoices?'Personalizar '+esc(product.name):'Adicionar '+esc(product.name)}" title="${unavailable?'Indisponível':hasChoices?'Personalizar':'Adicionar'}" onclick="addToStoreCart('${esc(product.id)}')"><i class="ti ${unavailable?'ti-package-off':hasChoices?'ti-adjustments-horizontal':'ti-plus'}"></i></button></div></div></article>`; }).join('') : '<div class="vf-empty-grid"><i class="ti ti-package-off"></i><p>Nenhum produto encontrado nesta categoria.</p></div>'; updateCartIndicators(); }
  window.setStoreCategory = category => { const select=$('store-category-filter'); if(select) select.value=category||''; renderProducts(); };
  function renderCart(){
    const target=$('store-cart-items');
    const all=lines();
    const pending=pendingOrder();
    const pendingHtml=pending?`<section class="vf-pending-payment-card"><div><strong><i class="ti ti-clock-dollar"></i> Pedido ${esc(pending.public_code||'')} aguardando Pix</strong><small>Você pode continuar o pagamento sem refazer o carrinho.</small></div><button class="vf-btn" type="button" onclick="continueStorePendingPayment('${esc(pending.id)}')">Continuar pagamento</button></section>`:'';
    target.innerHTML=pendingHtml+(all.length?all.map(line=>{const extras=line.selectedSummary.map(group=>`${group.group_name}: ${group.options.map(item=>item.name).join(', ')}`).join(' · '); return `<article class="vf-cart-line"><div><h3>${esc(line.product.name)}</h3><p>${money(line.unit_price)} por unidade</p>${extras?`<span class="vf-line-extra">${esc(extras)}</span>`:''}${line.customer_note?`<span class="vf-line-extra">Obs.: ${esc(line.customer_note)}</span>`:''}</div><div><strong>${money(line.subtotal)}</strong><div class="vf-cart-actions"><button type="button" onclick="changeCartLine('${esc(lineKey(line))}',-1)">−</button><span>${line.quantity}</span><button type="button" onclick="changeCartLine('${esc(lineKey(line))}',1)">+</button><button class="vf-remove" type="button" onclick="removeCartLine('${esc(lineKey(line))}')"><i class="ti ti-trash"></i></button></div></div></article>`;}).join(''):'<div class="vf-empty-grid">Seu carrinho está vazio.</div>');
    $('store-cart-total').textContent=money(all.reduce((sum,line)=>sum+line.subtotal,0));
    updateCartIndicators();
    updateCheckoutAvailability();
  }
  function findCartLine(key){ return store.cart.find(line=>lineKey(line)===key); }
  window.changeCartLine=(key,delta)=>{ const line=findCartLine(key); if(!line)return; line.quantity=Math.max(0,Math.min(99,Number(line.quantity||1)+Number(delta||0))); if(!line.quantity) store.cart=store.cart.filter(item=>item!==line); renderCart(); renderCheckoutTotals(); };
  window.removeCartLine=key=>{ store.cart=store.cart.filter(line=>lineKey(line)!==key); renderCart(); renderCheckoutTotals(); };
  function openOptions(product){ store.optionProduct=product; const groups=optionGroups(product); if(!groups.length && !product.allow_customer_note){ addLine({product_id:product.id,quantity:1,selected_options:[],customer_note:''}); return; } $('product-options-title').textContent=product.name; $('product-options-subtitle').textContent='Personalize seu item. As opções com * são obrigatórias.'; $('product-options-body').innerHTML=groups.map(group=>{ const required=!!group.required; const max=Math.max(1,Number(group.max_select||1)); const type=max===1?'radio':'checkbox'; return `<section class="vf-option-group" data-group-id="${esc(group.id)}" data-max="${max}" data-required="${required?'1':'0'}"><h3>${esc(group.name)} ${required?'<span aria-label="Obrigatório">*</span>':''}</h3><small>${required?'Escolha uma opção.':`Escolha até ${max} opção(ões).`}</small>${(group.options||[]).filter(option=>option.active!==false).map(option=>`<div class="vf-option-choice"><label><input type="${type}" name="group-${esc(group.id)}" value="${esc(option.id)}" data-price="${Number(option.price_adjustment||0)}" onchange="refreshProductOptionPrice()"> ${esc(option.name)}</label><strong>${Number(option.price_adjustment||0)>0?'+'+money(option.price_adjustment):''}</strong></div>`).join('')}</section>`; }).join(''); const note=$('product-options-note'), noteLabel=$('product-options-note-wrap'); note.value=''; show(note,!!product.allow_customer_note); show(noteLabel,!!product.allow_customer_note); $('product-options-price').textContent=money(product.price); const addButton=document.querySelector('#modal-product-options .vf-primary'); if(addButton)addButton.textContent='Adicionar ao pedido'; $('modal-product-options').classList.add('open'); }
  function selectedOptions(product){ const result=[]; optionGroups(product).forEach(group=>{ const choice=[...document.querySelectorAll('[data-group-id]')].filter(node=>node.dataset.groupId===String(group.id)).flatMap(node=>[...node.querySelectorAll('input:checked')]).map(input=>input.value); if(choice.length) result.push({group_id:group.id,option_ids:choice}); }); return result; }
  window.refreshProductOptionPrice=()=>{ const product=store.optionProduct; if(!product)return; const line=resolveLine({product_id:product.id,quantity:1,selected_options:selectedOptions(product)}); $('product-options-price').textContent=money(line?.unit_price||product.price); };
  window.confirmProductOptions=()=>{ const product=store.optionProduct; if(!product)return; for(const group of optionGroups(product)){ const selected=(selectedOptions(product).find(item=>item.group_id===group.id)?.option_ids||[]); const max=Math.max(1,Number(group.max_select||1)); if(group.required&&!selected.length){ notify(`Escolha uma opção em ${group.name}.`); return; } if(selected.length>max){notify(`Escolha no máximo ${max} opção(ões) em ${group.name}.`);return;} } addLine({product_id:product.id,quantity:1,selected_options:selectedOptions(product),customer_note:text($('product-options-note').value)}); closeModal('modal-product-options'); };
  function addLine(line){ const serialized=JSON.stringify(line.selected_options||[]); const existing=store.cart.find(item=>item.product_id===line.product_id&&JSON.stringify(item.selected_options||[])===serialized&&text(item.customer_note)===text(line.customer_note)); if(existing) existing.quantity=Math.min(99,Number(existing.quantity||0)+1); else store.cart.push({...line,line_id:uniqueId()}); renderProducts(); renderCart(); notify('Item adicionado ao carrinho.'); }
  window.addToStoreCart=id=>{ const product=products().find(item=>item.id===id); if(!product) return; if(product.stock_quantity!==null&&product.stock_quantity!==undefined&&Number(product.stock_quantity)<=0){notify('Este produto está indisponível.');return;} openOptions(product); };

  function openCartModal(){ $('modal-store-cart')?.classList.add('open'); }
  window.openStoreCart=()=>{ renderCart(); $('store-cart-step')?.classList.remove('hidden'); $('store-payment-step')?.classList.add('hidden'); openCartModal(); };
  window.backToStoreCart=()=>{ $('store-cart-step')?.classList.remove('hidden'); $('store-payment-step')?.classList.add('hidden'); renderCart(); };
  function cepRanges(zone){ return (Array.isArray(zone?.cep_ranges)?zone.cep_ranges:[]).map(item=>({from:digits(item?.from),to:digits(item?.to || item?.from)})).filter(item=>item.from.length===8&&item.to.length===8); }
  function zoneForCep(cep){ const cleanCep=digits(cep); if(cleanCep.length!==8) return null; return zones().filter(zone=>zone?.active!==false&&!zone?.is_mapbox_default&&String(zone?.vf_delivery_rule||'cep')!=='radius').find(zone=>cepRanges(zone).some(range=>cleanCep>=range.from&&cleanCep<=range.to))||null; }
  function haversineKm(latA,lngA,latB,lngB){ const rad=value=>Number(value)*Math.PI/180; const a=Math.sin((rad(latB)-rad(latA))/2)**2+Math.cos(rad(latA))*Math.cos(rad(latB))*Math.sin((rad(lngB)-rad(lngA))/2)**2; return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(a))); }
  /* Entrega econômica: ViaCEP para preencher endereço. Mapbox só entra no raio opcional, uma vez por endereço e com cache. */
  function formatCep(value){ const raw=digits(value).slice(0,8); return raw.length>5?raw.slice(0,5)+'-'+raw.slice(5):raw; }
  function setCepStatus(message,tone=''){ const target=$('store-delivery-cep-status'); if(!target)return; target.textContent=message; target.className='vf-muted'+(tone?' '+tone:''); }
  function deliveryAddress(){ return {cep:digits($('store-delivery-cep')?.value),street:text($('store-delivery-street')?.value),number:text($('store-delivery-number')?.value),complement:text($('store-delivery-complement')?.value),neighborhood:text($('store-delivery-neighborhood-free')?.value),city:text($('store-delivery-city')?.value),state:text($('store-delivery-state')?.value).toUpperCase(),reference:text($('store-delivery-reference')?.value)}; }
  function deliveryAddressReady(address){ return address.cep.length===8&&address.street.length>=3&&address.number.length>0&&address.city.length>=2&&/^[A-Z]{2}$/.test(address.state); }
  function deliverySignature(address){ return [address.cep,address.street,address.number,address.city,address.state].join('|'); }
  function radiusConfig(){ const s=appData().settings||{}; const r={enabled:s.delivery_radius_enabled,zone_id:s.delivery_radius_zone_id,max_distance_km:s.delivery_radius_km,fee:s.delivery_radius_fee,minimum_order:s.delivery_radius_minimum_order,eta_minutes:s.delivery_radius_eta_minutes,origin_lat:s.delivery_origin_lat,origin_lng:s.delivery_origin_lng}; return r.enabled&&r.zone_id&&Number(r.max_distance_km)>0&&Number.isFinite(Number(r.origin_lat))&&Number.isFinite(Number(r.origin_lng))?r:null; }
  function radiusZone(){ const r=radiusConfig(); if(!r)return null; return {id:r.zone_id,name:'Entrega por raio',fee:Number(r.fee||0),minimum_order:Number(r.minimum_order||0),estimated_minutes:Number(r.eta_minutes||0)||null,active:true,is_radius:true}; }
  function validRadiusCheck(address){ const check=store.radiusCheck, r=radiusConfig(); return !!(check&&r&&check.signature===deliverySignature(address)&&check.distance_km<=Number(r.max_distance_km)&&check.zone_id===r.zone_id); }
  function deliveryMatch(address=deliveryAddress()){ const cepZone=zoneForCep(address.cep); if(cepZone)return {kind:'cep',zone:cepZone}; if(validRadiusCheck(address))return {kind:'radius',zone:radiusZone()}; return {kind:'none',zone:null}; }
  function checkout(){ const all=lines(),subtotal=all.reduce((sum,line)=>sum+line.subtotal,0),address=deliveryAddress(),match=store.fulfillment==='delivery'?deliveryMatch(address):{zone:null,kind:'pickup'}; let fee=Number(match.zone?.fee||0); const freeAbove=Number(appData().settings?.delivery_free_above||0); if(store.fulfillment==='delivery'&&freeAbove>0&&subtotal>=freeAbove)fee=0; const discount=Math.min(subtotal+fee,Number(store.coupon?.discount_amount||0)); return {lines:all,subtotal,zone:match.zone,kind:match.kind,fee,discount,total:Math.max(0,subtotal+fee-discount)}; }
  function renderRadiusOption(address=deliveryAddress()){ const box=$('store-delivery-radius-option'),r=radiusConfig(),status=$('store-delivery-radius-status'); if(!box)return; const showRadius=store.fulfillment==='delivery'&&!!r&&!zoneForCep(address.cep); show(box,showRadius); if(!showRadius)return; if(validRadiusCheck(address)){status.textContent='Entrega disponível por raio: '+store.radiusCheck.distance_km.toFixed(1).replace('.',',')+' km da loja. Frete '+money(checkout().fee)+'.';status.className='vf-muted success';return;} status.textContent='Use o endereço preenchido pelo CEP para conferir o raio de até '+Number(r.max_distance_km).toLocaleString('pt-BR')+' km.';status.className='vf-muted'; }
  window.checkStoreDeliveryRadius=async()=>{ const address=deliveryAddress(),r=radiusConfig(),button=$('store-delivery-radius-button'),status=$('store-delivery-radius-status'); if(!r){notify('A loja ainda não configurou entrega por raio a partir do CEP dela.');return;} if(!deliveryAddressReady(address)||address.neighborhood.length<2){notify('Informe CEP, rua, número, bairro, cidade e UF antes de conferir o raio.');return;} if(button){button.disabled=true;button.innerHTML='<i class="ti ti-loader"></i> Conferindo...';} if(status){status.textContent='Conferindo a distância pelo endereço...';status.className='vf-muted';}
    try{const query=[address.street,address.number,address.neighborhood,address.city,address.state,formatCep(address.cep),'Brasil'].filter(Boolean).join(', ');const point=await geocodeBrazilAddress(query);const distance=haversineKm(Number(r.origin_lat),Number(r.origin_lng),point.lat,point.lng);if(distance>Number(r.max_distance_km)){store.radiusCheck=null;if(status){status.textContent='Este endereço está a '+distance.toFixed(1).replace('.',',')+' km da loja. O raio máximo é '+Number(r.max_distance_km).toLocaleString('pt-BR')+' km.';status.className='vf-muted error';} renderCheckoutTotals();return;}store.radiusCheck={signature:deliverySignature(address),zone_id:r.zone_id,client_lat:point.lat,client_lng:point.lng,distance_km:distance};if(status){status.textContent='Entrega disponível por raio: '+distance.toFixed(1).replace('.',',')+' km da loja.';status.className='vf-muted success';} renderCheckoutTotals();notify('Entrega por raio disponível.');}catch(error){store.radiusCheck=null;if(status){status.textContent=errorMessage(error);status.className='vf-muted error';}notify(errorMessage(error));}finally{if(button){button.disabled=false;button.innerHTML='<i class="ti ti-radar"></i> Conferir pelo endereço';}}
  };
  function resetDeliveryRoute(){ store.route=null; store.radiusCheck=null; renderDeliverySummaryCard(); }
  function validateDeliveryCepZone({notifyUser=false}={}){
    const address=deliveryAddress();
    const zone=zoneForCep(address.cep);
    if(!zone){ store.route=null; return null; }
    if(!deliveryAddressReady(address)){ store.route=null; return zone; }
    const freeAbove=Number(appData().settings?.delivery_free_above||0);
    const subtotal=lines().reduce((sum,line)=>sum+line.subtotal,0);
    const fee=freeAbove>0&&subtotal>=freeAbove?0:Number(zone.fee||0);
    store.route={signature:deliverySignature(address),zone_id:zone.id,zone_name:text(zone.name)||'Área atendida',fee,estimated_minutes:Number(zone.estimated_minutes||0)||null,distanceLabel:'CEP atendido',durationLabel:zone.estimated_minutes?String(zone.estimated_minutes)+' min':'Prazo da loja'};
    if(notifyUser) notify('CEP atendido: '+(text(zone.name)||'área de entrega')+'. Frete '+money(fee)+'.');
    return zone;
  }
  async function lookupStoreDeliveryCep({manual=false}={}){
    const input=$('store-delivery-cep'),button=$('store-delivery-cep-search'),cep=digits(input?.value);
    if(cep.length!==8){ if(manual) notify('Informe um CEP válido com 8 números.'); return null; }
    if(input) input.value=formatCep(cep);
    if(button){button.disabled=true;button.innerHTML='<i class="ti ti-loader"></i>';}
    setCepStatus('Buscando endereço...');
    try{
      let data=cepLookupCache.get(cep);
      if(!data){
        const response=await fetch('https://viacep.com.br/ws/'+cep+'/json/');
        if(!response.ok) throw new Error('Consulta de CEP indisponível.');
        data=await response.json();
        if(data?.erro) throw new Error('CEP não encontrado.');
        cepLookupCache.set(cep,data);
      }
      if($('store-delivery-street')) $('store-delivery-street').value=data.logradouro||'';
      if($('store-delivery-neighborhood-free')) $('store-delivery-neighborhood-free').value=data.bairro||'';
      if($('store-delivery-city')) $('store-delivery-city').value=data.localidade||'';
      if($('store-delivery-state')) $('store-delivery-state').value=String(data.uf||'').toUpperCase();
      const zone=validateDeliveryCepZone();
      if(zone){ setCepStatus('CEP atendido em '+(text(zone.name)||'uma área de entrega')+'. Informe o número para continuar.','success'); }
      else { const r=radiusConfig(); setCepStatus(r?'Este CEP não está em faixa fixa. Use o endereço preenchido pelo CEP para conferir o raio.':'Este CEP não está em uma área de entrega cadastrada pela loja.',r?'':'error'); }
      renderCheckoutTotals();
      setTimeout(()=>$('store-delivery-number')?.focus(),0);
      return data;
    }catch(error){
      setCepStatus(error.message||'Não foi possível consultar o CEP. Preencha o endereço manualmente.','error');
      if(manual) notify(error.message||'Não foi possível consultar o CEP.');
      return null;
    }finally{ if(button){button.disabled=false;button.innerHTML='Buscar CEP';} }
  }
  window.lookupStoreDeliveryCep=()=>lookupStoreDeliveryCep({manual:true});
  function renderDeliverySummaryCard(){
    const card=$('store-delivery-route-card'),message=$('store-delivery-route-message'),summary=$('store-delivery-route-summary');
    if(!card) return;
    const delivery=store.fulfillment==='delivery'; show(card,delivery); if(!delivery)return;
    const address=deliveryAddress(),match=deliveryMatch(address),ready=!!store.route&&store.route.signature===deliverySignature(address);
    renderRadiusOption(address);
    if(!match.zone){
      const r=radiusConfig();
      message.textContent=address.cep.length===8?(r?'Este CEP não está em faixa fixa. Use o endereço preenchido pelo CEP para verificar o raio atendido.':'Este CEP não é atendido pela loja.'):'Informe o CEP para conferir se a loja entrega no endereço.';
      show(summary,false); return;
    }
    if(!deliveryAddressReady(address)){ message.textContent=(match.kind==='radius'?'Entrega por raio disponível.':'CEP atendido em '+(text(match.zone.name)||'uma área de entrega'))+'. Informe rua, número, cidade e UF para continuar.'; show(summary,false); return; }
    if(match.kind==='cep'&&!ready)validateDeliveryCepZone();
    const current=checkout(),distance=match.kind==='radius'&&store.radiusCheck?store.radiusCheck.distance_km.toFixed(1).replace('.',',')+' km':'CEP atendido';
    message.textContent=(match.kind==='radius'?'Entrega por raio disponível.':'Área atendida: '+(text(match.zone.name)||'entrega por CEP'))+' Frete '+money(current.fee)+'.';
    if(summary){ show(summary,true); $('store-route-distance').textContent=distance; $('store-route-time').textContent=match.zone.estimated_minutes?match.zone.estimated_minutes+' min':'Prazo da loja'; $('store-route-fee').textContent=money(current.fee); }
  }
  window.confirmStoreDeliveryCep=async()=>{ const zone=validateDeliveryCepZone({notifyUser:true}); renderCheckoutTotals(); renderDeliverySummaryCard(); return zone; };
  // Compatibilidade para abas abertas com a versão anterior. Não calcula rota nem chama mapa.
  window.calculateStoreDeliveryRoute=window.confirmStoreDeliveryCep;
  function renderCheckoutTotals(){
    const settings=appData().settings||{};
    const delivery=!!settings.delivery_enabled, pickup=settings.pickup_enabled!==false;
    if(!pickup&&delivery)store.fulfillment='delivery'; if(!delivery&&pickup)store.fulfillment='pickup';
    const pickupBtn=$('store-pickup-choice'),deliveryBtn=$('store-delivery-choice'); show(pickupBtn,pickup);show(deliveryBtn,delivery);
    pickupBtn?.classList.toggle('active',store.fulfillment==='pickup');deliveryBtn?.classList.toggle('active',store.fulfillment==='delivery');
    show($('store-delivery-fields'),store.fulfillment==='delivery');show($('store-pickup-info'),store.fulfillment==='pickup'); $('store-pickup-info').textContent=settings.pickup_address||'Combine a retirada com a loja.';
    const address=deliveryAddress(); if(store.fulfillment==='delivery'&&address.cep.length===8&&zoneForCep(address.cep))validateDeliveryCepZone();
    const current=checkout(),status=$('store-delivery-cep-status');
    if(store.fulfillment==='delivery'&&address.cep.length===8&&status){
      if(current.kind==='cep'){status.textContent='CEP atendido: '+(text(current.zone.name)||'área de entrega')+' · frete '+money(current.fee)+'.';status.className='vf-muted success';}
      else if(current.kind==='radius'){status.textContent='Entrega disponível por raio · frete '+money(current.fee)+'.';status.className='vf-muted success';}
      else { const r=radiusConfig();status.textContent=r?'Este CEP não está em faixa fixa. Use o endereço preenchido pelo CEP para conferir o raio.':'Este CEP não está em uma área de entrega cadastrada.';status.className='vf-muted '+(r?'':'error'); }
    }
    renderCheckoutPaymentMethods();
    $('store-checkout-subtotal').textContent=money(current.subtotal);$('store-checkout-freight').textContent=store.fulfillment==='delivery'?(current.zone?money(current.fee):'—'):money(0);$('store-checkout-discount').textContent='−'+money(current.discount);show($('store-checkout-discount-row'),current.discount>0);$('store-checkout-total').textContent=money(current.total);renderDeliverySummaryCard();
  }
  window.selectStoreFulfillment=type=>{ store.fulfillment=type; store.coupon=null; resetDeliveryRoute(); $('store-coupon-result').textContent=''; renderCheckoutTotals(); };
  function localDate(date=new Date()){ return brazilDateValue(date); }
  function scheduleLimitDays(){ return Math.max(1,Math.min(365,Number(appData().settings?.order_max_schedule_days??30))); }
  function scheduleLeadMinutes(){ return Math.max(0,Math.min(10080,Number(appData().settings?.order_min_lead_minutes??60))); }
  function scheduleSlotMinutes(){ const value=Number(appData().settings?.order_schedule_slot_minutes??30); return [5,10,15,20,30,60].includes(value)?value:30; }
  function initSchedule(){
    const box=$('store-schedule-box');
    const enabled=scheduleEnabled();
    const availability=orderAvailability();
    show(box,enabled);
    if(!enabled||!box) return;
    const earliest=new Date(Date.now()+scheduleLeadMinutes()*60000);
    const latest=new Date(); latest.setDate(latest.getDate()+scheduleLimitDays());
    const date=$('store-schedule-date'),time=$('store-schedule-time');
    if(date){ date.min=brazilDateValue(earliest); date.max=brazilDateValue(latest); if(!date.value||date.value<date.min||date.value>date.max) date.value=date.min; }
    if(time) time.step=String(scheduleSlotMinutes()*60);
    const asap=document.querySelector('input[name="store-schedule-mode"][value="asap"]');
    const scheduled=document.querySelector('input[name="store-schedule-mode"][value="scheduled"]');
    const asapLabel=asap?.closest('label');
    if(asapLabel) asapLabel.classList.toggle('hidden',availability.scheduleOnly);
    if(availability.scheduleOnly&&scheduled) scheduled.checked=true;
    if(!availability.scheduleOnly&&asap&&!document.querySelector('input[name="store-schedule-mode"]:checked')) asap.checked=true;
    syncScheduleMinTime();
    window.toggleStoreScheduleFields?.();
  }
  window.toggleScheduleFields=()=>window.toggleStoreScheduleFields?.();
  window.toggleStoreScheduleFields=()=>{
    const availability=orderAvailability();
    const scheduled=document.querySelector('input[name="store-schedule-mode"][value="scheduled"]');
    if(availability.scheduleOnly&&scheduled) scheduled.checked=true;
    const active=document.querySelector('input[name="store-schedule-mode"]:checked')?.value==='scheduled';
    show($('store-schedule-fields'),active);
  };
  window.syncScheduleMinTime=()=>{
    const date=$('store-schedule-date'),time=$('store-schedule-time'); if(!date||!time)return;
    const earliest=new Date(Date.now()+scheduleLeadMinutes()*60000);
    time.min=date.value===brazilDateValue(earliest)?`${String(brazilParts(earliest).hour).padStart(2,'0')}:${String(brazilParts(earliest).minute).padStart(2,'0')}`:'';
    time.step=String(scheduleSlotMinutes()*60);
  };
  function validateScheduledSelection(dateValue,timeValue){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)||!/^\d{2}:\d{2}$/.test(timeValue)) throw new Error('Escolha uma data e um horário válidos para o pedido.');
    const selectedAt=new Date(`${dateValue}T${timeValue}:00-03:00`);
    if(Number.isNaN(selectedAt.getTime())) throw new Error('Data ou horário inválido.');
    const earliest=new Date(Date.now()+scheduleLeadMinutes()*60000);
    if(selectedAt.getTime()<earliest.getTime()) throw new Error(`Escolha um horário com pelo menos ${scheduleLeadMinutes()} minutos de antecedência.`);
    const latestDate=new Date(); latestDate.setDate(latestDate.getDate()+scheduleLimitDays());
    if(dateValue>brazilDateValue(latestDate)) throw new Error(`Você pode agendar no máximo ${scheduleLimitDays()} dias à frente.`);
    const minutes=toMinutes(timeValue);
    if(minutes%scheduleSlotMinutes()!==0) throw new Error(`Escolha um horário em intervalos de ${scheduleSlotMinutes()} minutos.`);
    const hours=hoursForDate(dateValue);
    if(hours.configured&&!isTimeWithinHours(hours.row,minutes)) throw new Error('O horário escolhido está fora do funcionamento da loja.');
    return selectedAt;
  }
  function pixForOrder(order){
    const settings=appData().settings||{};
    return pix({key:settings.pix_key,name:settings.pix_receiver_name||appData().business?.name,city:settings.pix_city||'BRASIL',amount:Number(order?.total_amount||0),txid:order?.public_code||'VF'});
  }
  function renderPixPayment(order){
    if(!order?.id) return false;
    let code='';
    try { code=pixForOrder(order); } catch(error) { notify(errorMessage(error,'A loja ainda não configurou o Pix.')); return false; }
    restorePaymentConfirmation();
    store.lastOrder={...order,pix:code,payment_method:'pix'};
    $('store-cart-step')?.classList.add('hidden');
    $('store-payment-step')?.classList.remove('hidden');
    $('store-payment-intro')?.classList.add('hidden');
    $('store-payment-confirmed')?.classList.remove('hidden');
    if($('store-confirmed-total')) $('store-confirmed-total').textContent=money(order.total_amount);
    if($('store-order-code')) $('store-order-code').textContent=order.public_code?`Pedido ${order.public_code}`:'Pedido aguardando pagamento';
    if($('store-pix-code')) $('store-pix-code').value=code;
    const qr=$('store-qr');
    if(qr){ qr.innerHTML=''; if(window.QRCode) new QRCode(qr,{text:code,width:216,height:216,correctLevel:QRCode.CorrectLevel.M}); }
    const report=$('store-report-payment-button');
    if(report){
      const reported=order.status==='payment_reported';
      report.disabled=reported;
      report.innerHTML=reported?'<i class="ti ti-clock-check"></i> Pagamento informado':'<i class="ti ti-check"></i> Já fiz o pagamento';
    }
    openCartModal();
    return true;
  }
  function renderOfflinePayment(order, method){
    if(!order?.id) return false;
    restorePaymentConfirmation();
    const target=$('store-payment-confirmed'); if(!target) return false;
    const total=money(order.total_amount);
    const details=method==='cash' && Number(order?.payment_details?.cash_change_for||0)>0 ? '<p class="vf-muted">Troco solicitado para '+money(order.payment_details.cash_change_for)+'.</p>' : '';
    store.lastOrder={...order,payment_method:method};
    target.innerHTML='<div class="vf-confirmation"><i class="ti '+(method==='cash'?'ti-cash':'ti-credit-card-pay')+'"></i><h3>Pedido enviado!</h3><p>'+esc(paymentConfirmationText(method))+'</p><p><strong>'+esc(order.public_code||'Pedido criado')+'</strong></p></div><p class="vf-payment-amount">Total do pedido: <strong>'+total+'</strong></p><div class="vf-offline-payment-note"><strong>'+esc(paymentLabel(method))+'</strong><span>'+esc(paymentTimingText(method))+'</span>'+details+'</div><button class="vf-btn vf-primary vf-full" type="button" onclick="openStoreAccount()"><i class="ti ti-package"></i> Ver meus pedidos</button>';
    $('store-cart-step')?.classList.add('hidden');
    $('store-payment-step')?.classList.remove('hidden');
    $('store-payment-intro')?.classList.add('hidden');
    target.classList.remove('hidden');
    openCartModal();
    return true;
  }
  window.continueStorePendingPayment=async id=>{
    await loadProfile(true);
    if(!store.customer){ await openStoreAccount(); notify('Entre para continuar o pagamento do pedido.'); return; }
    if(!store.orders?.length) await loadOrders(true);
    const order=(store.orders||[]).find(item=>String(item.id)===String(id))||pendingOrder();
    if(!order||!isPaymentPending(order)){ clearPendingPayment(); renderCart(); notify('Este pedido não está mais aguardando pagamento.'); return; }
    renderPixPayment(order);
  };
  window.openStoreCheckout=async()=>{
    if(store.ordersBlocked){notify(store.ordersBlockedMessage||'Esta loja está temporariamente sem receber novos pedidos.');return;}
    const availability=orderAvailability();
    if(!availability.canCheckout){ notify(availability.message); return; }
    if(!lines().length){ const pending=pendingOrder(); if(pending){ window.continueStorePendingPayment(pending.id); return; } return; }
    await loadProfile(true);
    if(!store.customer){ store.checkoutAfterAccount=true; await openStoreAccount(); notify('Entre ou crie seu acesso com WhatsApp e senha para finalizar.'); return; }
    store.fulfillment=appData().settings?.pickup_enabled===false?'delivery':'pickup';
    restorePaymentConfirmation();
    resetDeliveryRoute();
    $('store-cart-step')?.classList.add('hidden');
    $('store-payment-step')?.classList.remove('hidden');
    $('store-payment-intro')?.classList.remove('hidden');
    $('store-payment-confirmed')?.classList.add('hidden');
    initSchedule();
    renderCheckoutTotals();
  };
  async function applyCoupon(){ const code=text($('store-coupon-code').value).toUpperCase(),result=$('store-coupon-result'); if(!code){store.coupon=null;result.textContent='';renderCheckoutTotals();return;} const calc=checkout();try{const data=await rpc('commerce_preview_coupon',{p_slug:slug(),p_items:calc.lines.map(line=>({product_id:line.product_id,quantity:line.quantity,selected_options:line.selected_options||[],customer_note:line.customer_note||null})),p_fulfillment_type:store.fulfillment,p_delivery_zone_id:(store.fulfillment==='delivery'?(calc.zone?.id||null):null),p_coupon_code:code});store.coupon=data||null;result.textContent=data?.message||'Cupom aplicado.';renderCheckoutTotals();}catch(error){store.coupon=null;result.textContent=errorMessage(error);renderCheckoutTotals();}}
  window.applyStoreCoupon=applyCoupon;
  function pix({key,name,city,amount,txid}){ const tlv=(id,value)=>String(id).padStart(2,'0')+String(String(value||'').length).padStart(2,'0')+String(value||''),ascii=(value,max,fallback)=>String(value||fallback||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9 $%*+\-./:]/g,'').toUpperCase().slice(0,max)||fallback,crc=payload=>{let c=0xFFFF;for(let i=0;i<payload.length;i++){c^=payload.charCodeAt(i)<<8;for(let bit=0;bit<8;bit++)c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF;}return c.toString(16).toUpperCase().padStart(4,'0');};const pixKey=String(key||'').replace(/\s/g,''),value=Number(amount);if(!pixKey||!Number.isFinite(value)||value<=0)throw new Error('A chave Pix ou o valor do pedido não é válido.');const account=tlv('00','br.gov.bcb.pix')+tlv('01',pixKey),base=tlv('00','01')+tlv('26',account)+tlv('52','0000')+tlv('53','986')+tlv('54',value.toFixed(2))+tlv('58','BR')+tlv('59',ascii(name,25,'VENDAFACIL'))+tlv('60',ascii(city,15,'BRASIL'))+tlv('62',tlv('05',ascii(txid,25,'VF')))+'6304';return base+crc(base); }
  function selectedSchedule(){
    const availability=orderAvailability();
    if(!availability.canCheckout) throw new Error(availability.message);
    let mode=document.querySelector('input[name="store-schedule-mode"]:checked')?.value||'asap';
    if(availability.scheduleOnly) mode='scheduled';
    if(mode!=='scheduled') return {mode:'asap',value:null};
    if(!scheduleEnabled()) throw new Error('Pedidos agendados não estão disponíveis nesta loja.');
    const date=text($('store-schedule-date')?.value),time=text($('store-schedule-time')?.value);
    const local=validateScheduledSelection(date,time);
    return {mode:'scheduled',value:local.toISOString()};
  }
  window.createPublicCommerceOrder=async()=>{
    if(store.ordersBlocked){notify(store.ordersBlockedMessage||'Esta loja está temporariamente sem receber novos pedidos.');return;}
    const availability=orderAvailability();
    if(!availability.canCheckout){ notify(availability.message); return; }
    await loadProfile(true);
    if(!store.customer){store.checkoutAfterAccount=true;await openStoreAccount();return;}
    const calc=checkout();
    if(!calc.lines.length){notify('Seu carrinho está vazio.');return;}
    const method=paymentMethod();
    if(!method){notify('A loja ainda não configurou uma forma de pagamento para este pedido.');return;}
    let schedule;try{schedule=selectedSchedule();}catch(error){notify(errorMessage(error));return;}
    const address=deliveryAddress();
    const deliveryMatchNow=store.fulfillment==='delivery'?deliveryMatch(address):{kind:'pickup',zone:null};
    if(store.fulfillment==='delivery'){
      if(!deliveryMatchNow.zone||!deliveryAddressReady(address)||address.neighborhood.length<2){ notify('Para entrega, informe CEP, rua, número, bairro, cidade e UF. Depois confirme a área por CEP ou pelo endereço.');return; }
      if(deliveryMatchNow.kind==='cep'&&(!store.route||store.route.signature!==deliverySignature(address))){ notify('Confira o CEP e o endereço antes de finalizar o pedido.');return; }
      if(deliveryMatchNow.kind==='radius'&&!validRadiusCheck(address)){ notify('Clique em “Conferir pelo endereço” para confirmar a entrega por raio.');return; }
    }
    const config=paymentConfig();
    let cashChangeFor=null;
    if(method==='cash'&&config.cash?.cash_change_enabled!==false&&String(store.cashChangeFor||'').trim()){
      cashChangeFor=parseMoneyInput(store.cashChangeFor);
      if(cashChangeFor+0.0001<calc.total){notify('O valor para troco deve ser igual ou maior que o total do pedido.');return;}
    }
    const button=$('store-create-order-button');
    if(button){button.disabled=true;button.innerHTML='<i class="ti ti-loader"></i> Enviando pedido...';}
    try{
      const customerNote=text($('store-buyer-notes')?.value);
      const order=await rpc('vf_customer_create_order_checked',{p_slug:slug(),p_session_token:getToken(),p_notes:customerNote||null,p_items:calc.lines.map(line=>({product_id:line.product_id,quantity:line.quantity,selected_options:line.selected_options||[],customer_note:line.customer_note||null})),p_fulfillment_type:store.fulfillment,p_delivery_zone_id:(store.fulfillment==='delivery'?(calc.zone?.id||null):null),p_delivery_address:(store.fulfillment==='delivery'?{...address,delivery_method:deliveryMatchNow.kind==='radius'?'radius':'cep',delivery_radius_km:deliveryMatchNow.kind==='radius'?store.radiusCheck?.distance_km:null}:{}),p_coupon_code:text(store.coupon?.coupon_code||$('store-coupon-code')?.value).toUpperCase()||null,p_scheduled_for:schedule.value,p_schedule_mode:schedule.mode});
      if(!order?.id) throw new Error('O pedido não foi criado. Tente novamente.');
      const payment=await rpc('vf_customer_apply_payment_method',{p_slug:slug(),p_session_token:getToken(),p_order_id:order.id,p_payment_method:method,p_cash_change_for:cashChangeFor});
      const created={...order,...(payment||{}),payment_method:method,payment_details:{...(payment?.payment_details||{}),cash_change_for:cashChangeFor}};
      store.cart=[];
      store.coupon=null;
      store.cashChangeFor='';
      renderProducts();
      renderCart();
      await loadOrders(true);
      if(method==='pix'){
        persistPendingPayment({...created,status:created.status||'awaiting_payment'});
        renderPixPayment(created);
        notify('Pedido criado. Faça o Pix e depois toque em “Já fiz o pagamento”.');
      } else {
        clearPendingPayment();
        renderOfflinePayment(created,method);
        notify('Pedido enviado. '+paymentConfirmationText(method));
      }
    }catch(error){notify(errorMessage(error));}
    finally{if(button){button.disabled=false;button.innerHTML=paymentMethod()==='pix'?'<i class="ti ti-qrcode"></i> Gerar Pix do pedido':'<i class="ti ti-check"></i> Confirmar pedido';}}
  };
  window.copyPixCode=async()=>{const code=$('store-pix-code').value;if(!code)return;try{await navigator.clipboard.writeText(code);}catch(_){$('store-pix-code').select();document.execCommand('copy');}notify('Código Pix copiado.');};
  window.reportPublicCommercePayment=async()=>{
    if(!store.lastOrder?.id || String(store.lastOrder?.payment_method||'pix')!=='pix'){notify('Esta ação é exclusiva para pedidos pagos por Pix.');return;}
    const button=$('store-report-payment-button');
    const whatsapp=digits(appData().settings?.contact_whatsapp||appData().business?.whatsapp||'');
    const targetNumber=whatsapp.length===10||whatsapp.length===11?'55'+whatsapp:whatsapp;
    const popup=targetNumber.length>=12?window.open('about:blank','_blank'):null;
    if(button){button.disabled=true;button.innerHTML='<i class="ti ti-loader"></i> Informando pagamento...';}
    try{
      await rpc('commerce_customer_report_payment',{p_session_token:getToken(),p_order_id:store.lastOrder.id});
      clearPendingPayment();
      await loadOrders(true);
      if(popup){
        const message=`Olá! Informei o pagamento do pedido ${store.lastOrder.public_code||''} no valor de ${money(store.lastOrder.total_amount)}. Posso enviar o comprovante se necessário.`;
        popup.location.href='https://wa.me/'+targetNumber+'?text='+encodeURIComponent(message);
      }
      if(button){button.disabled=true;button.innerHTML='<i class="ti ti-clock-check"></i> Pagamento informado';}
      notify('Pagamento informado. Acompanhe a aprovação em Meus pedidos.');
    }catch(error){
      popup?.close();
      if(button){button.disabled=false;button.innerHTML='<i class="ti ti-check"></i> Já fiz o pagamento';}
      notify(errorMessage(error));
    }
  };
  function statusLabel(value){return ({awaiting_payment:'Aguardando pagamento',payment_reported:'Aguardando aprovação',paid:'Aguardando aprovação',preparing:'Em preparo',ready_for_pickup:'Pronto para retirada',out_for_delivery:'A caminho',fulfilled:'Entregue',cancelled:'Cancelado'}[value]||'Em andamento');}
  function orderDescription(order){const items=Array.isArray(order?.items)?order.items:[];const base=items.length?items.slice(0,2).map(item=>`${item.product_name} ×${Number(item.quantity||0)}`).join(', ')+(items.length>2?` +${items.length-2}`:''):(order.fulfillment_type==='delivery'?'Entrega':'Retirada');const method=PAYMENT_METHODS[paymentMethodFromOrder(order)]?.label;return method?base+' · '+method:base;}
  function dateTime(value){try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}catch(_){return ''}}
  function renderOrders(){const list=$('store-my-orders'),summary=$('store-account-summary');if(!list)return;const active=new Set(['awaiting_payment','payment_reported','paid','preparing','ready_for_pickup','out_for_delivery']);const ongoing=store.orders.filter(order=>active.has(order.status)).length,done=store.orders.filter(order=>order.status==='fulfilled').length;summary.innerHTML=`<div><label>Em andamento</label><strong>${ongoing}</strong></div><div><label>Entregues</label><strong>${done}</strong></div><div><label>Pedidos feitos</label><strong>${store.orders.length}</strong></div>`;list.innerHTML=store.orders.length?store.orders.map(order=>`<article class="vf-my-order"><div><strong>${esc(statusLabel(order.status))}</strong><small>${esc(orderDescription(order))} · ${esc(dateTime(order.created_at))}</small><span class="vf-order-badge">${esc(statusLabel(order.status))}</span></div><strong>${money(order.total_amount)}</strong></article>`).join(''):'<div class="vf-empty-grid">Você ainda não fez pedidos nesta loja.</div>';}
  function renderActiveOrder(){
    const box=$('store-active-order-banner');
    const active=new Set(['awaiting_payment','payment_reported','paid','preparing','ready_for_pickup','out_for_delivery']);
    const order=(store.orders||[]).find(item=>active.has(item.status));
    if(!store.customer||!order){show(box,false);return;}
    const name=text(store.customer.full_name).split(/\s+/)[0]||'cliente';
    const pending=isPaymentPending(order);
    box.innerHTML=`<div><strong>Olá, ${esc(name)}. Seu pedido está: ${esc(statusLabel(order.status))}</strong><small>${pending?'Você pode continuar o pagamento por Pix.':'Abra Meus pedidos para acompanhar a atualização.'}</small></div><button class="vf-btn vf-primary" type="button" onclick="${pending?`continueStorePendingPayment('${esc(order.id)}')`:'openStoreAccount()'}">${pending?'Continuar pagamento':'Ver pedidos'}</button>`;
    show(box,true);
  }
  async function loadProfile(quiet=false){const token=getToken();if(!token){store.customer=null;return null;}try{store.customer=await rpc('commerce_customer_get_profile',{p_slug:slug(),p_session_token:token});return store.customer;}catch(error){if(/sessão|session|expirou/i.test(errorMessage(error))){clearToken();store.customer=null;}if(!quiet)console.warn(error);return null;}}
  async function loadOrders(quiet=false){const token=getToken();if(!token){store.orders=[];store.pendingPayment=readPendingPayment();renderOrders();renderActiveOrder();return [];}try{store.orders=await rpc('commerce_customer_get_orders',{p_slug:slug(),p_session_token:token})||[];syncPendingPayment();renderOrders();renderActiveOrder();return store.orders;}catch(error){if(!quiet)console.warn(error);return [];}}
  function updateAccountButton(){const button=$('store-account-button');if(button)button.innerHTML=store.customer?'<i class="ti ti-package"></i>':'<i class="ti ti-user-circle"></i>';}
  function setAccountTab(tab){show($('store-account-login'),tab==='login');show($('store-account-signup'),tab==='signup');$('store-account-login-tab').classList.toggle('active',tab==='login');$('store-account-signup-tab').classList.toggle('active',tab==='signup');}
  window.setStoreAccountTab=setAccountTab;
  async function renderAccount(){await loadProfile(true);if(!store.customer){show($('store-account-guest'),true);show($('store-account-member'),false);setAccountTab('login');updateAccountButton();return;}show($('store-account-guest'),false);show($('store-account-member'),true);$('store-account-email-display').textContent=phoneLabel(store.customer.phone);await loadOrders(true);updateAccountButton();}
  async function openStoreAccount(){ $('modal-store-account').classList.add('open'); await renderAccount(); }
  window.openStoreAccount=openStoreAccount;
  window.customerStoreSignIn=async()=>{const phone=text($('store-account-login-phone').value),password=$('store-account-login-password').value||'';if(!validPhone(phone)||!password){notify('Informe seu WhatsApp com DDD e sua senha.');return;}try{const result=await rpc('commerce_customer_login',{p_slug:slug(),p_phone:phone,p_password:password});setToken(result?.session_token);store.customer=result?.customer||null;await loadOrders(true);await renderAccount();if(store.checkoutAfterAccount){store.checkoutAfterAccount=false;closeModal('modal-store-account');await window.openStoreCheckout();}}catch(error){notify(errorMessage(error,'WhatsApp ou senha inválidos.'));}};
  window.customerStoreSignUp=async()=>{const name=text($('store-account-signup-name').value),phone=text($('store-account-signup-phone').value),password=$('store-account-signup-password').value||'';if(name.length<2||!validPhone(phone)||password.length<6){notify('Preencha nome, WhatsApp com DDD e senha de pelo menos 6 caracteres.');return;}try{const result=await rpc('commerce_customer_register',{p_slug:slug(),p_full_name:name,p_phone:phone,p_password:password});setToken(result?.session_token);store.customer=result?.customer||null;await loadOrders(true);await renderAccount();if(store.checkoutAfterAccount){store.checkoutAfterAccount=false;closeModal('modal-store-account');await window.openStoreCheckout();}else notify('Cadastro criado. Seus pedidos ficarão salvos nesta conta.');}catch(error){notify(errorMessage(error));}};
  window.customerStoreSignOut=async()=>{try{if(getToken())await rpc('commerce_customer_logout',{p_session_token:getToken()});}catch(_){}clearToken();store.customer=null;store.orders=[];renderActiveOrder();await renderAccount();};
  window.customerForgotPassword=()=>{const contact=digits(appData().settings?.contact_whatsapp||appData().business?.whatsapp||'');if(contact.length<10){notify('A loja ainda não cadastrou um WhatsApp de atendimento.');return;}const number=contact.length<=11?'55'+contact:contact;const phone=text($('store-account-login-phone').value);window.open(`https://wa.me/${number}?text=${encodeURIComponent(`Olá! Preciso recuperar minha senha${phone?` para o WhatsApp ${phone}`:''}.`)}`,'_blank','noopener');};
  function updateManifest(name,color){const manifest=$('vf-pwa-manifest');if(manifest&&slug())manifest.href='/api/store-manifest?'+new URLSearchParams({loja:slug(),nome:name,cor:color}).toString();}
  function initPwa(){window.addEventListener('beforeinstallprompt',event=>{store.installPrompt=event; show($('store-install-button'),false);});window.addEventListener('appinstalled',()=>{store.installPrompt=null;show($('store-install-button'),false);notify('Aplicativo instalado na tela inicial.');});if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{}));if(isIos()&&!standalone()){try{if(!localStorage.getItem('vf-ios-install-tip:'+slug()))show($('vf-pwa-ios-tip'),true);}catch(_){show($('vf-pwa-ios-tip'),true);}}}
  window.vfInstallStoreApp=async()=>{if(store.installPrompt){store.installPrompt.prompt();await store.installPrompt.userChoice;store.installPrompt=null;show($('store-install-button'),false);return;}if(isIos()){show($('vf-pwa-ios-tip'),true);return;}notify('Use o menu do navegador e escolha “Instalar aplicativo”.');};window.vfClosePwaInstallTip=()=>{show($('vf-pwa-ios-tip'),false);try{localStorage.setItem('vf-ios-install-tip:'+slug(),'1');}catch(_){}};
  async function loadStore({force=false}={}){if(!slug()){show($('store-loading'),false);show($('store-error'),true);$('store-error').querySelector('strong').textContent='Link da loja inválido.';return;}show($('store-loading'),true);show($('store-error'),false);try{const result=await Promise.race([rpc('get_public_store_data',{p_slug:slug()}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('A vitrine demorou para responder.')),15000))]);if(!result?.business?.slug)throw new Error('Esta vitrine não foi encontrada.');store.data=result;// Entrega por raio é opcional. A vitrine mantém o checkout por CEP funcionando mesmo sem a RPC do raio.
      store.radius=null;saveCache(result);try{const access=await rpc('vf_get_public_commerce_access',{p_slug:slug()});store.ordersBlocked=!!access?.orders_blocked;store.ordersBlockedMessage=text(access?.message);}catch(_){store.ordersBlocked=false;store.ordersBlockedMessage='';}setTheme(result);renderPublicNotices();renderProducts();show($('store-content'),true);show($('store-loading'),false);await loadProfile(true);await loadOrders(true);updateAccountButton();if(q.get('minhaConta')==='1')openStoreAccount();}catch(error){const cached=force?null:readCache();if(cached){store.data=cached;setTheme(cached);renderPublicNotices();renderProducts();show($('store-content'),true);show($('store-loading'),false);notify('Modo offline: mostrando a última vitrine carregada.');return;}console.error('VendaFácil loja leve:',error);show($('store-loading'),false);show($('store-error'),true);$('store-error').querySelector('p').textContent=errorMessage(error,'Tente atualizar a página em alguns instantes.');}}
  document.addEventListener('DOMContentLoaded',()=>{
    store.pendingPayment=readPendingPayment();
    initPwa();setTimeout(()=>loadStore(),0);
    let cepTimer=null;
    const cepInput=$('store-delivery-cep');
    cepInput?.addEventListener('input',()=>{ cepInput.value=formatCep(cepInput.value); clearTimeout(cepTimer); const cep=digits(cepInput.value); if(cep.length===8) cepTimer=setTimeout(()=>lookupStoreDeliveryCep(),380); else setCepStatus('Digite o CEP para preencher rua, bairro, cidade e UF.'); if(store.route)resetDeliveryRoute();else renderDeliverySummaryCard(); });
    cepInput?.addEventListener('blur',()=>{ if(digits(cepInput.value).length===8) lookupStoreDeliveryCep(); });
    ['store-delivery-number','store-delivery-street','store-delivery-complement','store-delivery-neighborhood-free','store-delivery-city','store-delivery-state'].forEach(id=>$(id)?.addEventListener('input',()=>{ if(id==='store-delivery-state') $(id).value=String($(id).value||'').toUpperCase().slice(0,2); store.route=null; validateDeliveryCepZone(); renderCheckoutTotals(); }));
    document.addEventListener('click',event=>{const modal=event.target.classList?.contains('vf-modal')?event.target:null;if(modal)modal.classList.remove('open');});
  });
})();
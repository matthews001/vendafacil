/* VendaFácil — atualização visual unificada.
   Camada apenas de aparência: não altera ids, eventos, rotas, banco ou regras de venda. */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap');

:root{
  --vf-ui-font:'Inter',system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --vf-ui-display:'Poppins',var(--vf-ui-font);
  --vf-ui-ink:#172033;
  --vf-ui-muted:#64748b;
  --vf-ui-line:#e2e8f0;
  --vf-ui-surface:#ffffff;
  --vf-ui-soft:#f8fafc;
  --vf-ui-shadow-sm:0 2px 8px rgba(15,23,42,.05);
  --vf-ui-shadow-md:0 12px 30px rgba(15,23,42,.08);
  --vf-ui-shadow-lg:0 22px 54px rgba(15,23,42,.14);
  --vf-ui-radius:18px;
}

html{scroll-behavior:smooth}
body{font-family:var(--vf-ui-font)}
button,input,select,textarea{font-family:inherit}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}

/* Aplicação administrativa e PDV */
#screen-commerce-app{
  --commerce-page-bg:#f6f8fc;
  --commerce-card:#fff;
  --commerce-border:rgba(148,163,184,.24);
  --commerce-text:#172033;
  --commerce-muted:#64748b;
  color:var(--commerce-text);
}
#screen-commerce-app .main{
  background:
    radial-gradient(circle at 100% 0, color-mix(in srgb,var(--commerce-accent,#1d9e75) 11%,transparent) 0,transparent 30%),
    linear-gradient(180deg,#fafcff 0%,var(--commerce-page-bg) 100%)!important;
  min-height:100vh;
}
#screen-commerce-app .sidebar{
  background:linear-gradient(180deg,var(--commerce-deep,#0f172a) 0%,color-mix(in srgb,var(--commerce-deep,#0f172a) 82%,#000) 100%)!important;
  border-right:1px solid rgba(255,255,255,.06);
}
#screen-commerce-app .logo{font-family:var(--vf-ui-display);letter-spacing:-.035em}
#screen-commerce-app .business-name{box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 8px 22px rgba(0,0,0,.12)}
#screen-commerce-app .nav button{border-radius:12px;transition:background .18s ease,color .18s ease,transform .18s ease}
#screen-commerce-app .nav button:hover{transform:translateX(2px)}
#screen-commerce-app .nav button.active{box-shadow:inset 3px 0 0 var(--commerce-accent,#1d9e75),0 7px 16px rgba(0,0,0,.16)!important}
#screen-commerce-app .page-head{padding-bottom:4px}
#screen-commerce-app .page-head h1{font-family:var(--vf-ui-display);color:#172033;letter-spacing:-.045em}
#screen-commerce-app .page-head p{color:var(--commerce-muted)}
#screen-commerce-app .card,
#screen-commerce-app .metric{
  background:rgba(255,255,255,.95)!important;
  border:1px solid var(--commerce-border)!important;
  border-radius:var(--vf-ui-radius)!important;
  box-shadow:var(--vf-ui-shadow-sm)!important;
}
#screen-commerce-app .card{padding:20px}
#screen-commerce-app .card:hover,
#screen-commerce-app .metric:hover{box-shadow:var(--vf-ui-shadow-md)!important;transform:translateY(-2px)}
#screen-commerce-app .metric{position:relative;overflow:hidden}
#screen-commerce-app .metric:after{content:'';position:absolute;inset:auto -12px -20px auto;width:72px;height:72px;border-radius:50%;background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 10%,transparent)}
#screen-commerce-app .metric strong{font-family:var(--vf-ui-display);color:#172033!important;-webkit-text-fill-color:currentColor!important;background:none!important}
#screen-commerce-app .metric label{font-weight:800;letter-spacing:.04em}
#screen-commerce-app .btn{
  min-height:38px;
  border-radius:11px;
  border-color:#dbe3ee;
  box-shadow:0 1px 2px rgba(15,23,42,.03);
  transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease;
}
#screen-commerce-app .btn:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.09)}
#screen-commerce-app .btn.primary,
#screen-commerce-app .btn.btn-primary{
  background:linear-gradient(135deg,var(--commerce-accent,#1d9e75),var(--commerce-accent-dark,#0f6e56))!important;
  border-color:transparent!important;
  box-shadow:0 8px 18px color-mix(in srgb,var(--commerce-accent,#1d9e75) 28%,transparent)!important;
}
#screen-commerce-app .btn.primary:hover,
#screen-commerce-app .btn.btn-primary:hover{filter:saturate(1.05) brightness(.98)}
#screen-commerce-app .field input,
#screen-commerce-app .field select,
#screen-commerce-app .field textarea{
  border-color:#dbe3ee;
  background:#fff;
  border-radius:11px;
  min-height:42px;
}
#screen-commerce-app .field input:focus,
#screen-commerce-app .field select:focus,
#screen-commerce-app .field textarea:focus{border-color:var(--commerce-accent,#1d9e75);box-shadow:0 0 0 4px color-mix(in srgb,var(--commerce-accent,#1d9e75) 12%,transparent)}
#screen-commerce-app .note{border-radius:13px;box-shadow:0 3px 8px rgba(15,23,42,.03)}
#screen-commerce-app table{border-collapse:separate;border-spacing:0;overflow:hidden}
#screen-commerce-app th{background:#f8fafc;color:#64748b;font-size:10px;letter-spacing:.07em;text-transform:uppercase;padding:13px 12px}
#screen-commerce-app td{padding:14px 12px;border-bottom:1px solid #edf1f6}
#screen-commerce-app tbody tr{transition:background .15s ease}
#screen-commerce-app tbody tr:hover{background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 4%,transparent)}
#screen-commerce-app .commerce-status,
#screen-commerce-app .badge{border-radius:999px;padding:5px 9px;font-weight:800;letter-spacing:.02em}

/* Início, pedidos e indicadores */
#screen-commerce-app .commerce-dashboard-hero{border-radius:24px;overflow:hidden;box-shadow:0 20px 42px rgba(15,23,42,.18)!important}
#screen-commerce-app .commerce-dashboard-copy h2{font-family:var(--vf-ui-display)}
#screen-commerce-app .commerce-dashboard-meta span{backdrop-filter:blur(8px)}
#screen-commerce-app .commerce-preview-grid .row{border:1px solid #edf1f6!important;background:#fff!important;border-radius:14px}
#screen-commerce-app .commerce-order-board{gap:14px;padding:4px 3px 14px}
#screen-commerce-app .commerce-kanban-column{border:1px solid #e5eaf1;background:rgba(255,255,255,.7);border-radius:18px;padding:12px;box-shadow:0 5px 16px rgba(15,23,42,.035)}
#screen-commerce-app .commerce-kanban-head{padding:5px 5px 13px}
#screen-commerce-app .commerce-kanban-head h3{font-family:var(--vf-ui-display);font-size:13px;color:#263449}
#screen-commerce-app .commerce-kanban-count{background:#f1f5f9;color:#475569}
#screen-commerce-app .commerce-order-card{border:1px solid #e8edf3;border-radius:15px;padding:14px;box-shadow:0 5px 14px rgba(15,23,42,.045)}
#screen-commerce-app .commerce-order-card:hover{box-shadow:0 14px 26px rgba(15,23,42,.10);transform:translateY(-2px)}
#screen-commerce-app .commerce-order-total{font-family:var(--vf-ui-display);color:#172033}
#screen-commerce-app .commerce-order-customer{border-bottom-color:#edf1f6}

/* KDS */
.vf-kds-page{background:linear-gradient(180deg,#f8fafc,#eef3f8);border:1px solid #e1e8f0;border-radius:24px;padding:16px;box-shadow:var(--vf-ui-shadow-md)}
.vf-kds-topbar{border-radius:18px!important;background:linear-gradient(135deg,#172033 0%,#26354d 58%,var(--commerce-accent,#1d9e75) 150%)!important;box-shadow:0 12px 24px rgba(15,23,42,.18)}
.vf-kds-title{font-family:var(--vf-ui-display);letter-spacing:-.035em}
.vf-kds-live-badge{border-radius:999px!important;box-shadow:0 5px 14px rgba(0,0,0,.12)}
.vf-kds-board{gap:14px!important}
.vf-kds-column{border:1px solid #e3e9f1!important;border-radius:18px!important;background:rgba(255,255,255,.82)!important;box-shadow:0 5px 18px rgba(15,23,42,.04)}
.vf-kds-column-head{border-radius:14px 14px 10px 10px!important;padding:14px!important}
.vf-kds-ticket{border:1px solid #e6ebf1!important;border-radius:15px!important;box-shadow:0 7px 18px rgba(15,23,42,.06)!important;overflow:hidden}
.vf-kds-ticket:before{content:'';display:block;height:4px;background:var(--commerce-accent,#1d9e75)}
.vf-kds-order-code{font-family:var(--vf-ui-display);letter-spacing:-.02em}
.vf-kds-items{border-top-color:#edf1f6!important;border-bottom-color:#edf1f6!important}

/* PDV */
#screen-commerce-app .vf-pdv-console{border:1px solid #dfe7ef!important;border-radius:24px!important;background:#f7f9fc!important;box-shadow:0 22px 52px rgba(15,23,42,.12)!important}
#screen-commerce-app .vf-pdv-console-top{background:linear-gradient(118deg,#172033,#20314a 56%,var(--commerce-accent,#1d9e75) 155%)!important;padding:16px 18px!important}
#screen-commerce-app .vf-pdv-store-avatar{background:rgba(255,255,255,.12)!important;border-color:rgba(255,255,255,.18)!important}
#screen-commerce-app .vf-pdv-mode-tabs{gap:9px;padding:14px!important;background:#fff!important;border-bottom-color:#e8edf3!important}
#screen-commerce-app .vf-pdv-mode-tab{border-color:#e0e7ef!important;background:#f9fbfd!important;border-radius:14px!important}
#screen-commerce-app .vf-pdv-mode-tab:hover{background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 5%,#fff)!important;border-color:color-mix(in srgb,var(--commerce-accent,#1d9e75) 45%,#d8e2eb)!important}
#screen-commerce-app .vf-pdv-mode-tab.active{background:linear-gradient(135deg,var(--commerce-accent,#1d9e75),var(--commerce-accent-dark,#0f6e56))!important;box-shadow:0 10px 20px color-mix(in srgb,var(--commerce-accent,#1d9e75) 28%,transparent)!important}
#screen-commerce-app .vf-pdv-workspace{background:#fff!important}
#screen-commerce-app .vf-pdv-catalog{background:#fff!important;border-right-color:#e8edf3!important}
#screen-commerce-app .vf-pdv-search{border-color:#dbe3ee!important;border-radius:13px!important;box-shadow:none!important;background:#f8fafc!important}
#screen-commerce-app .vf-pdv-search:focus-within{border-color:var(--commerce-accent,#1d9e75)!important;box-shadow:0 0 0 4px color-mix(in srgb,var(--commerce-accent,#1d9e75) 11%,transparent)!important}
#screen-commerce-app .vf-pdv-category{border-color:#e0e7ef!important;border-radius:10px!important;background:#f8fafc!important}
#screen-commerce-app .vf-pdv-category.active{background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 9%,#fff)!important;border-color:color-mix(in srgb,var(--commerce-accent,#1d9e75) 45%,#d8e2eb)!important;color:var(--commerce-accent-dark,#0f6e56)!important}
#screen-commerce-app .vf-pdv-product-card{border-color:#e5eaf1!important;border-radius:16px!important;box-shadow:0 5px 14px rgba(15,23,42,.045)!important}
#screen-commerce-app .vf-pdv-product-card:hover{box-shadow:0 16px 30px rgba(15,23,42,.11)!important;transform:translateY(-3px)!important}
#screen-commerce-app .vf-pdv-product-media{height:104px!important;background:#f1f5f9!important}
#screen-commerce-app .vf-pdv-product-body{padding:12px!important}
#screen-commerce-app .vf-pdv-product-price{font-family:var(--vf-ui-display);color:var(--commerce-accent-dark,#0f6e56)!important}
#screen-commerce-app .vf-pdv-product-detail-btn{border-radius:9px!important;border-color:color-mix(in srgb,var(--commerce-accent,#1d9e75) 28%,#d8e2eb)!important;background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 5%,#fff)!important;color:var(--commerce-accent-dark,#0f6e56)!important}
#screen-commerce-app .vf-pdv-cart{background:#f8fafc!important}
#screen-commerce-app .vf-pdv-cart-header,#screen-commerce-app .vf-pdv-cart-foot{background:#fff!important;border-color:#e8edf3!important}
#screen-commerce-app .vf-pdv-cart-title i{background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 11%,#fff)!important;color:var(--commerce-accent-dark,#0f6e56)!important}
#screen-commerce-app .vf-pdv-channel-pill{background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 10%,#fff)!important;color:var(--commerce-accent-dark,#0f6e56)!important}
#screen-commerce-app .vf-pdv-line{border-color:#e5eaf1!important;border-radius:13px!important;background:#fff!important;box-shadow:0 3px 8px rgba(15,23,42,.03)}
#screen-commerce-app .vf-pdv-total-line{background:linear-gradient(135deg,color-mix(in srgb,var(--commerce-accent,#1d9e75) 12%,#fff),color-mix(in srgb,var(--commerce-accent,#1d9e75) 5%,#fff))!important;color:var(--commerce-accent-dark,#0f6e56)!important;border-radius:13px!important}
#screen-commerce-app .vf-pdv-pay-ready{background:linear-gradient(135deg,var(--commerce-accent,#1d9e75),var(--commerce-accent-dark,#0f6e56))!important;border-radius:12px!important;box-shadow:0 12px 22px color-mix(in srgb,var(--commerce-accent,#1d9e75) 26%,transparent)!important}
#screen-commerce-app .vf-pdv-pay-disabled{border-radius:12px!important}
#screen-commerce-app .vf-pdv-payment-method,#screen-commerce-app .vf-pdv7-payment-method{border-radius:13px!important;border-color:#dfe7ef!important;background:#fff!important}
#screen-commerce-app .vf-pdv-payment-method.active,#screen-commerce-app .vf-pdv7-payment-method.active{border-color:var(--commerce-accent,#1d9e75)!important;background:color-mix(in srgb,var(--commerce-accent,#1d9e75) 8%,#fff)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--commerce-accent,#1d9e75) 10%,transparent)!important}
#screen-commerce-app .vf-pdv-success,#screen-commerce-app .vf-pdv7-success,#screen-commerce-app .vf-pdv9-receipt-success{border-radius:18px!important;background:linear-gradient(145deg,#fff,color-mix(in srgb,var(--commerce-accent,#1d9e75) 7%,#fff))!important;border-color:color-mix(in srgb,var(--commerce-accent,#1d9e75) 20%,#dbe3ee)!important}

/* Mesas, despacho e entregador */
.vf-pdv-table-map-card{border-radius:15px!important;border-color:#e0e7ef!important;box-shadow:0 4px 12px rgba(15,23,42,.04)!important}
.vf-pdv-table-map-card.active{box-shadow:0 0 0 3px color-mix(in srgb,var(--commerce-accent,#1d9e75) 13%,transparent),0 12px 24px rgba(15,23,42,.08)!important}
.vf-pdv-table-detail,.vf-pdv-table-toolbar,.vf-pdv-table-context{border-radius:15px!important;border-color:#e4eaf1!important;background:#fff!important}
.vf-dispatch-panel,.vf-dispatch-card{border-radius:18px!important;border-color:#e2e8f0!important;box-shadow:0 7px 18px rgba(15,23,42,.05)!important}
.vf-dispatch-card:hover{box-shadow:0 16px 30px rgba(15,23,42,.10)!important;transform:translateY(-2px)}
.vf-delivery-portal{font-family:var(--vf-ui-font)!important}
.vf-delivery-console{border:1px solid rgba(148,163,184,.25)!important;border-radius:24px!important;box-shadow:var(--vf-ui-shadow-lg)!important;overflow:hidden}
.vf-delivery-head{background:linear-gradient(125deg,var(--vf-delivery-deep,#0f172a),color-mix(in srgb,var(--vf-delivery-accent,#1d9e75) 70%,#0f172a))!important}
.vf-delivery-order{border-radius:17px!important;border-color:#e1e8f0!important;box-shadow:0 6px 16px rgba(15,23,42,.05)!important}
.vf-delivery-metric{border-radius:14px!important;background:#f8fafc!important;border-color:#e4eaf1!important}
.vf-delivery-payment{border-radius:12px!important}

/* Modais e alertas */
#screen-commerce-app .modal-bg{backdrop-filter:blur(8px);background:rgba(15,23,42,.48)}
#screen-commerce-app .modal{border-radius:22px!important;border:1px solid rgba(226,232,240,.85)!important;box-shadow:0 24px 60px rgba(15,23,42,.22)!important}
#screen-commerce-app .modal h2{font-family:var(--vf-ui-display);color:#172033!important}
.vf-live-order-alert{border-radius:15px!important;box-shadow:0 18px 42px rgba(15,23,42,.24)!important}

/* Vitrine pública */
.vf-store-app{font-family:var(--vf-ui-font);background:
  radial-gradient(circle at 100% -10%,color-mix(in srgb,var(--vf-accent) 11%,transparent) 0,transparent 35%),
  linear-gradient(180deg,#fbfcff,#f5f8fb 100%)}
.vf-store-header{background:linear-gradient(112deg,var(--vf-dark),color-mix(in srgb,var(--vf-dark) 74%,var(--vf-accent)))!important;border-bottom:1px solid rgba(255,255,255,.10);box-shadow:0 8px 24px rgba(15,23,42,.17)!important}
.vf-brand{font-family:var(--vf-ui-display);letter-spacing:-.025em}
.vf-brand-avatar{box-shadow:0 5px 12px color-mix(in srgb,var(--vf-accent) 35%,transparent)}
.vf-icon-button,.vf-cart-button{border:1px solid rgba(255,255,255,.14)!important;transition:transform .16s ease,background .16s ease!important}
.vf-icon-button:hover,.vf-cart-button:hover{transform:translateY(-1px);background:rgba(255,255,255,.18)!important}
.vf-hero{border-radius:28px!important;box-shadow:0 24px 54px color-mix(in srgb,var(--vf-accent) 18%,transparent)!important;border:1px solid rgba(255,255,255,.14)}
.vf-hero-overlay{background:linear-gradient(96deg,rgba(8,20,17,.91) 0%,rgba(8,20,17,.62) 46%,rgba(8,20,17,.18) 100%)!important}
.vf-identity h1{font-family:var(--vf-ui-display)}
.vf-hero-logo{border:1px solid rgba(255,255,255,.25);backdrop-filter:blur(8px)}
.vf-hero-stat,.vf-badge,.vf-hero-notice{backdrop-filter:blur(10px)}
.vf-public-notice,.vf-active-order{border-radius:16px!important;box-shadow:0 7px 18px rgba(15,23,42,.04)}
.vf-products-heading h2{font-family:var(--vf-ui-display);letter-spacing:-.03em}
.vf-category-pills{padding:16px 0 7px!important}
.vf-category-pills button{border-radius:999px!important;box-shadow:0 3px 8px rgba(15,23,42,.03);transition:transform .16s ease,border-color .16s ease,background .16s ease!important}
.vf-category-pills button:hover{transform:translateY(-1px)}
.vf-products-grid{gap:16px!important}
.vf-product{border-color:#e2e8f0!important;border-radius:18px!important;box-shadow:0 8px 20px rgba(15,23,42,.06)!important;transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease!important}
.vf-product:hover{transform:translateY(-4px);box-shadow:0 18px 34px rgba(15,23,42,.13)!important;border-color:color-mix(in srgb,var(--vf-accent) 44%,#dbe4ed)!important}
.vf-product-image{height:194px!important;background:linear-gradient(145deg,#edf4f0,#fbfdfd)!important}
.vf-product-image img{transition:transform .3s ease}
.vf-product:hover .vf-product-image img{transform:scale(1.05)}
.vf-product-body{padding:15px!important}
.vf-product h3{font-family:var(--vf-ui-display);font-size:15px!important}
.vf-product-footer{border-top:1px solid #eff3f6;padding-top:12px!important}
.vf-product-footer strong{font-family:var(--vf-ui-display);font-size:17px!important;color:var(--vf-accent-dark)}
.vf-add,.vf-primary{background:linear-gradient(135deg,var(--vf-accent),var(--vf-accent-dark))!important;border-color:transparent!important;box-shadow:0 8px 17px color-mix(in srgb,var(--vf-accent) 28%,transparent)!important}
.vf-add{border-radius:11px!important;transition:transform .16s ease!important}.vf-add:hover{transform:scale(1.06)}
.vf-mobile-cart{border-radius:17px!important;background:linear-gradient(135deg,var(--vf-accent),var(--vf-accent-dark))!important}
.vf-modal{backdrop-filter:blur(7px);background:rgba(15,23,42,.50)!important}
.vf-modal-sheet{border-radius:22px!important;box-shadow:0 28px 68px rgba(15,23,42,.25)!important;border:1px solid rgba(226,232,240,.8)}
.vf-modal-top h2{font-family:var(--vf-ui-display)}
.vf-cart-line,.vf-checkout-card,.vf-option-group{border-color:#e2e8f0!important;border-radius:14px!important;background:#fff!important}
.vf-payment-method{border-color:#e0e7ef!important;border-radius:13px!important}.vf-payment-method.active{box-shadow:0 0 0 3px color-mix(in srgb,var(--vf-accent) 11%,transparent)}
.vf-toast{background:linear-gradient(135deg,var(--vf-dark),color-mix(in srgb,var(--vf-dark) 75%,var(--vf-accent)))!important;border-radius:14px!important;box-shadow:0 14px 32px rgba(15,23,42,.24)!important}

@media(max-width:760px){
  #screen-commerce-app .main{padding:18px 14px 30px!important}
  #screen-commerce-app .page-head h1{font-size:24px!important}
  #screen-commerce-app .card{padding:15px}
  .vf-kds-page{border-radius:18px;padding:10px}
  #screen-commerce-app .vf-pdv-console{border-radius:18px!important}
  #screen-commerce-app .vf-pdv-console-top{padding:14px!important}
  #screen-commerce-app .vf-pdv-mode-tabs{padding:10px!important}
  #screen-commerce-app .vf-pdv-product-media{height:92px!important}
  .vf-delivery-console{border-radius:0!important}
  .vf-hero{border-radius:21px!important}
  .vf-product{border-radius:15px!important}
  .vf-product-image{height:145px!important}
  .vf-products-grid{gap:10px!important}
}

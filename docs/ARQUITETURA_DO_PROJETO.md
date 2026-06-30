# Organização do VendaFácil

Esta versão inicia a organização técnica sem quebrar a operação atual.

## Estrutura principal

- `index.template.html` — estrutura e scripts do painel administrativo, PDV, KDS, mesas, entregas e portal interno.
- `loja.template.html` — estrutura da vitrine pública.
- `assets/styles/app-foundation.css` — estilos-base e layout do painel.
- `assets/styles/app-modules.css` — estilos de módulos: PDV, KDS, mesas, pagamentos, relatórios e entregador.
- `assets/styles/mobile-responsive.css` — ajustes específicos para celular e tablets.
- `assets/styles/theme-contrast.css` — tokens e correções de contraste para claro/escuro.
- `assets/styles/store-modals.css` — estilos complementares da vitrine.
- `assets/visual-refresh.v1.css` — identidade visual e componentes premium existentes.
- `assets/theme-controls.js` — alternância persistente de tema claro/escuro.
- `assets/storefront.js` e `assets/storefront.css` — lógica e base da vitrine pública.
- `assets/commerce-extension.js` — extensões de pedidos, despacho e entrega.
- `scripts/build.mjs` — gera a pasta `dist` e copia os assets necessários.
- `supabase/migrations/` — banco de dados e funções do Supabase.

## Regra de evolução

O HTML ainda concentra as regras de negócio porque existem módulos criados em etapas diferentes e com dependências de ordem entre scripts. A separação de CSS foi concluída agora; a próxima etapa segura é migrar os scripts por módulo, começando por tema e componentes visuais, depois PDV, KDS, mesas e entrega.

Não existe Gemini nem rota de IA nesta versão.

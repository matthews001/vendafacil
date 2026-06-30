# Revisão de contraste — 30/06/2026

## Correção principal
Os cards de resumo da Visão Geral que são criados pelo módulo de cupons/horários (`.vf-growth-card`) usavam um gradiente claro mesmo no modo escuro. O texto secundário herdava cores claras, causando baixa legibilidade.

A correção foi aplicada em uma camada final: `assets/styles/contrast-audit.css`.

## Escopo revisado
- Visão geral: métricas principais, indicadores de estoque, mais vendido, vendido hoje e ticket médio.
- Pedidos: quadro, cards, status e totais.
- PDV: catálogo, carrinho, modos de atendimento, edição de itens e finalização.
- KDS: colunas, tickets, estados e textos internos.
- Entrega/despacho e portal do entregador.
- Mesas, áreas, configurações de pagamento e gestão.
- Vitrine pública, carrinho, checkout, pedidos e modais.
- Inputs, selects, tabelas, botões, badges e indicadores de estado.
- Foco de teclado visível nos dois temas.

## Proteções adicionadas
- O CSS de auditoria é carregado por último nos dois templates.
- O build copia esse CSS para `dist/assets/styles`.
- O PWA foi atualizado para a versão `vendafacil-pwa-v22-contrast-audit`, evitando cache antigo.
- Criado `scripts/check-theme-contrast.mjs`:
  - confirma a presença da camada nos templates, build e PWA;
  - confirma regras para dashboard, PDV, KDS, vitrine e entregador;
  - valida as combinações principais de texto e fundo com mínimo WCAG AA de 4,5:1.

## Resultado local
- Build concluído.
- 28 validações automatizadas concluídas.

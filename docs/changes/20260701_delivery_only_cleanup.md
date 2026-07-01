# Alterações — Delivery-only e preparação da limpeza do banco

- Removidas do frontend as telas, modais, rotas e inicializações do módulo de barbearia/agendamento.
- Mantidos Delivery, vitrine, pedidos, clientes da loja, estoque, entregas, PDV/mesas, equipe, relatórios e Master.
- Área Master e criação de loja passam a trabalhar somente com o módulo `comercio`/Delivery.
- Removidas referências de frontend às tabelas de agenda/barbearia e às estruturas V1 de assinatura.
- Adicionada a migration manual `20260701_19_limpeza_delivery_apos_publicacao.sql`.
- Adicionado o roteiro `docs/LIMPEZA_DELIVERY_SUPABASE.md`.

A migration deve ser executada no Supabase apenas depois de publicar esta versão e validar os fluxos essenciais.

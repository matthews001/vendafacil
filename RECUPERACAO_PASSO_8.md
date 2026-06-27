# Recuperação estável após PDV Passo 8

Este pacote restaura a versão estável do projeto até o PDV Passo 7.

- O Passo 8 de pedidos em tempo real foi removido deste pacote por ter causado falha global de renderização na página inicial.
- A migração `20260627_9_pdv_pedidos_tempo_real.sql`, se já tiver sido executada no Supabase, pode permanecer: ela apenas habilita Realtime para `commerce_orders` e não interfere no sistema.
- O cache do PWA foi atualizado para `vendafacil-pwa-v7-recovery-step7` para substituir a versão anterior no navegador.

Não é necessário rodar SQL para publicar esta recuperação.

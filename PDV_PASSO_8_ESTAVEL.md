# PDV Passo 8 — versão estável

- O passo anterior foi refeito a partir da recuperação estável do Passo 7.
- O script não usa MutationObserver e não renderiza em loop.
- Realtime é apenas um acelerador. Mesmo sem a migração, a tela confere novos pedidos a cada 30 segundos quando Pedidos ou PDV estiverem abertos.
- Execute `supabase/migrations/20260627_9_pdv_pedidos_tempo_real.sql` para ativar atualização imediata via Supabase Realtime.

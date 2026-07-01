# Correção: dinheiro na entrega e despacho obrigatório

## Fluxo corrigido

### Pedido em dinheiro para entrega
1. Cliente finaliza escolhendo **Dinheiro na entrega**.
2. O pedido fica aguardando preparo, sem confirmação de pagamento.
3. No painel/KDS, a ação disponível é **Enviar para preparo**.
4. A baixa de estoque ocorre quando o pedido entra em preparo.
5. O pagamento só é confirmado quando o entregador conclui a entrega.

### Pedido pronto para entrega
1. Cozinha marca como **Pronto p/ despacho**.
2. O sistema abre a área **Entregas** para escolher o entregador.
3. Direcionar o pedido não inicia a rota.
4. O entregador visualiza o pedido como **Aguardando saída**.
5. Apenas o entregador inicia a rota; então o cliente vê **A caminho**.
6. Ao concluir a entrega em dinheiro, o entregador confirma entrega e recebimento.

## Aplicação
1. Execute `APLIQUE_ESTA_MIGRACAO_FLUXO_ENTREGA_DINHEIRO.sql` no Supabase.
2. Publique o projeto completo na Cloudflare Pages.
3. Atualize o painel e a vitrine com `Ctrl + F5`.

Não rode novamente os SQLs antigos de hotfix.

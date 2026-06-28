# KDS — Display da Cozinha

O KDS foi incluído no menu **Cozinha (KDS)** do painel Delivery.

## O que ele faz

- Exibe pedidos com pagamento confirmado em **Novos**.
- Move o pedido para **Preparando** ao iniciar o preparo.
- Move pedidos de retirada para **Prontos** quando terminarem.
- Envia pedidos de entrega para a fila de entrega ao concluir o preparo.
- Atualiza automaticamente a cada 20 segundos enquanto a tela estiver aberta e visível.
- Permite atualização manual, tela cheia, alerta sonoro e popup interno. Essas preferências ficam salvas somente no navegador usado pela cozinha.

## Regra operacional

Pedidos com status de pagamento pendente não entram no KDS. Primeiro a loja confirma o pagamento no painel de **Pedidos** ou no PDV. Isso evita que a cozinha produza pedidos ainda não pagos.

## Banco de dados

Esta funcionalidade usa as tabelas e a RPC já existentes (`commerce_orders`, itens, histórico e `commerce_set_order_status`). Não é necessário executar uma nova migração SQL para habilitar o KDS.

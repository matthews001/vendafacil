# Correção do fluxo de entrega e checkout

1. No Supabase, execute apenas `20260628_20_estabilizacao_raio_por_cep_checkout.sql`.
2. Suba todos os arquivos deste projeto no GitHub.
3. Aguarde a Vercel publicar e faça `Ctrl + F5`.

## O que mudou
- O raio da loja é confirmado por CEP + número, sem GPS do computador/celular.
- O cliente confere o raio pelo próprio endereço preenchido pelo CEP, sem permissão de localização.
- Faixas de CEP continuam tendo prioridade.
- O checkout não chama `vf_customer_create_order_with_payment`; usa a RPC já existente `commerce_customer_create_order`.
- A forma de pagamento fica registrada nas observações técnicas do pedido e aparece no fluxo da vitrine.

## Consumo do Mapbox
O Mapbox só é usado quando necessário: uma vez para confirmar a origem da loja e, para clientes fora de faixa de CEP, uma vez por endereço para conferir o raio. O resultado fica em cache no navegador.

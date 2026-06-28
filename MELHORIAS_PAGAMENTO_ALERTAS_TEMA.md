# Pagamento na entrega, alertas, navegação e tema

## Fluxo de pagamento
- Pix continua como pagamento online.
- Dinheiro, débito, crédito, vales e maquininha em pedidos de entrega ficam pendentes até a entrega.
- O entregador vê claramente o valor, a forma de pagamento e, no caso de dinheiro, o troco solicitado.
- O entregador confirma entrega e pagamento presencial juntos ao finalizar a corrida.
- Balcão e mesa não foram alterados: continuam com fechamento no caixa.

## Entregas e mapas
- O Google Maps e Waze passam a receber rua, número, complemento, bairro, cidade, UF, CEP e Brasil.
- Quando houver latitude/longitude no pedido, os apps usam a coordenada exata.

## Alertas
- Popup apenas para pedido novo ou pedido pronto.
- Novo pedido usa a cor da loja.
- Pedido pronto usa azul de despacho.
- Atualizações intermediárias não geram popup de novo pedido.

## Tema e banner
- A vitrine usa o banner salvo em Marca e vitrine de forma mais robusta.
- A cor principal passa para gerenciador, vitrine e portal do entregador.

## Aplicação
Execute `APLIQUE_ESTA_MIGRACAO_PAGAMENTO_ALERTAS_TEMA.sql` no Supabase antes de publicar a versão do projeto.

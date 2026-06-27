# PDV — operação consolidada

Esta versão estabiliza os fluxos antes de adicionar novos módulos.

## O que foi revisado

- **Balcão:** bloqueia finalização sem loja ativa e usa o pedido gravado no banco para impressão.
- **Mesa:** cada alteração fica no rascunho local imediatamente e é sincronizada ao Supabase; ao recarregar ou fechar/abrir o navegador, a comanda é retomada.
- **Entrega:** permanece com rota, frete e pagamento já existentes; o cupom usa a mesma fonte dos demais pedidos.
- **Vitrine:** pedidos feitos pelo cliente podem ser impressos em `Pedidos → Ver → Imprimir cupom`.

## Mapa de mesas

Na aba **Mesa** da Frente de Caixa:

- verde: mesa livre;
- amarelo: mesa ocupada;
- azul: mesa atualmente em atendimento;
- ao abrir uma mesa ocupada, aparecem itens pendentes, quantidade, total parcial, código da comanda e hora da última atualização;
- mesas livres podem abrir uma nova comanda;
- comandas abertas não são apagadas pelo navegador.

## Persistência

1. Toda mudança de item, quantidade, adicional, observação, cliente ou desconto é guardada no navegador na hora.
2. A mesma mudança é sincronizada para o Supabase em seguida.
3. Ao voltar para a tela, o sistema compara a cópia local com a comanda salva e recupera a mais recente.
4. Ao fechar a comanda, o rascunho local é apagado somente depois da venda confirmada no banco.

## SQL obrigatório

No Supabase SQL Editor, execute uma única vez:

`supabase/migrations/20260628_10_pdv_operacao_consolidada.sql`

Essa migração não apaga mesas, comandas ou pedidos já existentes.

## Teste recomendado

1. Abra uma mesa, adicione dois itens e ajuste uma quantidade.
2. Atualize a página: a mesma mesa e os mesmos itens devem voltar.
3. Feche a aba, abra o sistema novamente, entre em **Mesa** e retome a comanda pelo mapa.
4. Em uma segunda mesa, confira os itens pendentes sem alterar a primeira.
5. Feche a comanda e imprima o cupom.
6. Faça um pedido pela vitrine, abra **Pedidos**, toque em **Ver** e use **Imprimir cupom**.

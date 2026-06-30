# Correção de finalização do PDV

A causa do botão travado foi encontrada e corrigida: o script de **Passo 5 — pagamento e finalização** tinha uma string de impressão quebrada. Por isso o navegador interrompia a execução desse script e o botão permanecia desativado.

## O que foi corrigido

- Fluxo de finalização do **balcão** restaurado:
  - botão **Finalizar venda e pagamento** fica disponível quando existe item no carrinho;
  - abre a tela de forma de pagamento;
  - registra a venda pelo RPC do PDV;
  - confirma troco em dinheiro;
  - mostra confirmação e permite imprimir o comprovante.
- Fluxos de **mesa** e **entrega** permanecem separados:
  - mesa fecha comanda;
  - entrega abre endereço/CEP e pagamento da entrega.
- Corrigidas também três strings quebradas nos módulos de impressão, que geravam erro de sintaxe e podiam impedir scripts posteriores de carregar.
- A vitrine deixou de depender da RPC antiga de checkout e usa criação de pedido + aplicação da forma de pagamento em duas etapas.
- Restaurei as funções internas do despacho de entregas que haviam ficado ausentes no pacote anterior.

## Banco de dados

Esta correção de finalização é de frontend. Não há SQL novo para executar.

Mantenha aplicado o último SQL de pagamento/entrega que já foi enviado anteriormente, pois ele contém a função `vf_customer_apply_payment_method` usada pela vitrine atual.

# Correção do fluxo da vitrine

Esta versão corrige duas falhas que impediam a compra:

1. `addToStoreCart is not defined`: o botão de adicionar ao carrinho voltou a usar uma função global válida.
2. `vf_get_public_delivery_radius 404`: a vitrine não chama mais a RPC opcional de raio quando ela não está instalada no banco. A entrega por faixa de CEP continua funcionando normalmente.

## Não rode SQL para esta correção

Suba o projeto completo para o GitHub e aguarde a Vercel publicar. Em seguida, abra a loja com `Ctrl + F5`.

## Teste obrigatório

1. Abrir uma vitrine.
2. Adicionar um produto ao carrinho.
3. Abrir carrinho.
4. Escolher retirada e gerar o pedido/Pix.
5. Testar entrega apenas se houver uma faixa de CEP ativa cadastrada.

A entrega por raio será reativada depois, em uma atualização separada, quando a RPC e a tela de configuração forem validadas no mesmo banco.

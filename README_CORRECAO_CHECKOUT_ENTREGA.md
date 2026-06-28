# Correção crítica — Checkout, Pix e entrega

Esta versão corrige erros reais encontrados na vitrine e no painel da loja.

## O que foi corrigido

- Corrige `ReferenceError: checkout is not defined` no checkout da vitrine.
- Publica a vitrine com um novo arquivo versionado: `storefront.v9-delivery-stable.js`.
  Isso evita que o navegador/PWA continue carregando o JavaScript antigo.
- Corrige o botão **Nova faixa de CEP**, que antes chamava uma função inexistente.
- Salvar faixa de CEP agora aceita nome opcional e preenche um nome automático pela primeira faixa.
- O cliente não é mais enviado ao WhatsApp ao gerar o Pix.
- WhatsApp só abre depois que o cliente tocar em **Já fiz o pagamento**.
- Um pedido aguardando Pix fica salvo como pendência. Se o cliente fechar a tela, sair do carrinho ou atualizar a página, ele pode tocar em **Continuar pagamento** em Meus pedidos/carrinho.
- Checkout e PDV usam ViaCEP e faixas de CEP; não usam Mapbox, geocoding ou rotas no fluxo de entrega.
- PWA/Service Worker foi atualizado para a versão `v16-delivery-stable`.

## SQL

Não existe SQL novo para estas correções.

Apenas para usar a opção **Entrega por raio**, o banco precisa já ter recebido uma vez o arquivo:

`20260628_18_entrega_por_raio_sem_mapa.sql`

Se você já executou esse SQL na atualização anterior, não execute de novo.

## Depois de subir no GitHub

1. Aguarde a Vercel publicar.
2. Abra a loja e use `Ctrl + F5` uma vez.
3. Em **Entrega e frete**, clique em **Nova faixa de CEP**.
4. Exemplo de faixa: `21842-000 a 21842-999`.
5. Salve frete e prazo.
6. Na vitrine, informe um CEP dessa faixa, gere o Pix, feche a tela e confirme que aparece **Continuar pagamento**.

## Validações executadas

- build limpo da Vercel;
- sintaxe de todos os scripts do painel;
- checkout, CEP, Pix pendente e WhatsApp após confirmação;
- PDV de entrega por CEP;
- Cardápio e complementos;
- PWA/Service Worker;
- acessos, entregador, mesas e impressão.

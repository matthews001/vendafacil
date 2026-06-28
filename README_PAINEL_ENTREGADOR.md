# Painel do Entregador — VendaFácil

## O que foi adicionado

- Menu **Entregas** para o responsável acompanhar pedidos em preparo e em rota.
- Botão **Direcionar** no pedido de entrega quando ele estiver em **Em preparo**.
- Escolha do entregador cadastrado em **Acessos** com o perfil **Entregador**.
- Portal separado para entregador em:

`https://SEU-DOMINIO/entregador?loja=slug-da-loja`

- Login próprio por loja + usuário + PIN de 6 dígitos.
- Cada entregador vê somente as entregas direcionadas para o próprio acesso.
- Botões **Google Maps** e **Waze** que abrem a navegação externa, sem mapa ou cálculo de rota embutido no VendaFácil.
- Botões **Iniciar entrega** e **Confirmar entrega**. Eles atualizam o status do pedido para `out_for_delivery` e `fulfilled`.

## Aplicação

1. No Supabase, abra **SQL Editor → New query**.
2. Execute uma única vez o arquivo:

`20260628_15_painel_entregador.sql`

3. Suba os arquivos deste projeto no GitHub e deixe a Vercel fazer o novo deploy.
4. No painel da loja, abra **Acessos** e crie um usuário com o perfil **Entregador**.
5. Entre em **Entregas** e use o botão **Link do entregador** para copiar a página de acesso.

## Fluxo operacional

1. Loja confirma pagamento.
2. Loja coloca o pedido em **Em preparo**.
3. Gestor abre **Entregas** ou o quadro de **Pedidos** e seleciona **Direcionar**.
4. Escolhe o entregador.
5. Entregador entra no portal, abre Google Maps ou Waze e toca em **Iniciar entrega**.
6. Depois da entrega, toca em **Confirmar entrega**.

## Observações

- Não é necessário criar outro projeto na Vercel ou outro Supabase.
- O portal usa a mesma base de acessos já criada para funcionários.
- A navegação externa usa links para Google Maps e Waze. O VendaFácil não consome API de rota nessa etapa.

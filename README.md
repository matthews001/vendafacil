# VendaFácil Barbearia — publicação de teste na Vercel

Este pacote publica o protótipo como site estático e injeta, na etapa de build, a URL e a chave **publishable** do Supabase configuradas na Vercel.

## Publicar no GitHub + Vercel

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta.
2. Na Vercel: **Add New > Project** e importe o repositório.
3. Em **Environment Variables**, crie as variáveis abaixo para *Production*, *Preview* e *Development*:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
4. Clique em **Deploy**.

A Vercel executará `npm run build` e publicará a pasta `dist` automaticamente.

## Importante sobre o Supabase

A chave publishable pode estar no frontend; ela não substitui segurança de banco. Nunca use `service_role` no projeto, na Vercel ou no GitHub.

Este protótipo ainda contém login simulado e usa dados locais como fallback. Ele tenta sincronizar com as tabelas `negocios` e `negocio_dados`. Se o seu banco atual tiver apenas o schema multiempresa `businesses`, `products`, `customers` etc., a sincronização não acontecerá até o frontend ser migrado para esse schema e para Supabase Auth.

Portanto, esta publicação é adequada para validação visual e testes controlados. Antes de cadastrar dados reais de clientes ou negócios, troque o login local por Supabase Auth e aplique RLS nas tabelas.

## Central de avisos e histórico (V12)

Depois de publicar os arquivos, execute no Supabase a migração:

`supabase/migrations/20260626_master_notices_and_history.sql`

Ela cria a Central de avisos do Painel Master, os filtros por Delivery/Barbearia/lojas específicas, prazo de expiração, prioridade e o histórico enxuto que remove registros com mais de 90 dias.


## Otimização mobile (V13)

A vitrine pública agora abre por `loja.html` / `/loja`, uma página separada do painel administrativo. Links antigos com `?loja=...&modo=comercio` continuam funcionando: a página principal redireciona imediatamente para a vitrine leve antes de carregar o painel, agenda, relatórios e módulos master.

A página leve mantém vitrine, carrinho, cadastro/entrada do cliente, pedido por Pix, entrega/retirada, cupom, opções do produto, pedido agendado e PWA. O painel administrativo continua no arquivo principal.


## Correção do acesso Master (V14)

Esta versão corrige dois pontos do Painel Master:

- a conta Master oficial é `MATHEUS JESUS DE ARAUJO · matheuzaraujo17@gmail.com`;
- o botão **Gerenciador** não fica mais preso na mensagem de operação em andamento quando uma resposta do servidor demora.

Depois de publicar os arquivos, execute no Supabase a migração:

`supabase/migrations/20260626_fix_master_identity_and_access.sql`

A migração cria a lista protegida de contas Master e deixa somente o e-mail acima como administrador da plataforma. Ela exige que essa conta já exista em **Authentication > Users** do Supabase.

## Mapa, rota e tempo de entrega (Mapbox)

1. Na Vercel, crie a variável `MAPBOX_PUBLIC_TOKEN` em **Production**, **Preview** e **Development**. Use somente um token público, iniciado por `pk.`.
2. Execute a migração `supabase/migrations/20260626_delivery_mapbox_route.sql` no Supabase.
3. No painel de cada Delivery, abra **Entrega e frete**, informe o endereço de saída, use **Buscar pelo endereço** ou **Usar minha localização**, e salve.

A vitrine carrega o mapa somente quando o cliente seleciona entrega, completa o endereço e toca em **Calcular rota**. O frete permanece definido pelas regiões cadastradas na loja; o mapa mostra distância e tempo estimado.


## Mapbox automático por endereço (V17)

Esta versão substitui, para a loja que ativar o Mapbox, a seleção manual de bairro no checkout.

1. Execute `supabase/migrations/20260627_mapbox_automatic_delivery.sql` depois da migração anterior do Mapbox.
2. No Gerenciador da loja, entre em **Entrega e frete**, informe o endereço de saída, use **Buscar pelo endereço** e salve.
3. Informe a **taxa de entrega pelo mapa** e, se desejar, a distância máxima.

O cliente informa o endereço e toca em **Calcular rota**. O sistema mostra mapa, distância, tempo e valor do frete. A taxa é guardada em uma região interna protegida, para que o total do pedido continue sendo calculado no Supabase.


## Correção Mapbox — rota pelo endereço

Esta versão elimina o uso do dropdown de bairro na vitrine configurada com Mapbox.
A rota agora é calculada com **CEP, rua e número digitados pelo cliente**; bairro é opcional.

Depois de publicar, execute no Supabase, nesta ordem:

1. `supabase/migrations/20260626_delivery_mapbox_route.sql`
2. `supabase/migrations/20260627_mapbox_automatic_delivery.sql`
3. `supabase/migrations/20260627_2_mapbox_endereco_checkout.sql`

No Gerenciador da loja, em **Entrega e frete**, informe o endereço de saída, use **Buscar pelo endereço**, informe a taxa e salve.

Os links de vitrine agora apontam diretamente para `/loja?loja=...`, impedindo que a versão antiga do checkout seja aberta por engano.


## Correção do checkout Mapbox — endereço obrigatório

Esta versão remove a dependência do seletor antigo de bairro quando a loja está em modo Mapbox. O cálculo usa somente CEP, rua e número digitados pelo cliente. Os arquivos públicos receberam uma versão nova para que o navegador/PWA não reutilize o JavaScript antigo após publicar.

Depois do deploy, execute apenas a migração `supabase/migrations/20260627_3_forcar_mapbox_bolos_de_vo.sql` no Supabase. Ela ativa o modo Mapbox para a loja Bolos de Vó e cria/sincroniza a zona técnica de frete usada pelo pedido.


## PDV profissional — Passo 1: entrada e estrutura

A área **Frente de Caixa** foi criada dentro do painel Delivery. Ela é acessada pelo menu lateral ou pelo botão **Abrir PDV** da Visão geral e permanece separada da vitrine pública.

Nesta primeira etapa não há venda sendo criada ainda. O objetivo é validar a entrada, o acesso autenticado e a navegação. O próximo passo constrói a tela operacional com catálogo, busca, atalhos de Balcão/Mesa/Entrega e carrinho fixo.

Não há nova migração do Supabase nesta etapa.


## Correção do PDV — Passo 1

- Corrigida a ligação do menu e do botão **Abrir PDV**.
- A Frente de Caixa agora abre a tela inicial do Passo 1 dentro do Gerenciador Delivery.
- Esta etapa não inclui ainda produtos, carrinho ou pagamentos; isso começa no Passo 2 e seguintes.
- Não requer migração no Supabase.


## PDV profissional — Passo 2: layout operacional

A tela **Frente de Caixa** agora possui o layout operacional visual do PDV, pensado para computador e tablet:

- barra superior da loja com controles de som e popup;
- modos visuais de **Balcão**, **Mesa** e **Entrega**;
- pesquisa, filtros e área de catálogo preparados;
- carrinho fixo à direita com identificação de cliente, etapa visual de pagamento, total e ações futuras;
- adaptação para tablet e celular.

Este passo ainda **não cria pedidos, não altera estoque e não registra pagamentos**. Produtos reais e busca entram no Passo 3; venda de balcão e pagamento entram no Passo 5.

Não há nova migração do Supabase nesta etapa.

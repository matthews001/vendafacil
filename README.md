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

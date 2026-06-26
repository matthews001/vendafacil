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

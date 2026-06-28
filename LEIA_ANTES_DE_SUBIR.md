# Versão completa atualizada

Este ZIP contém o projeto inteiro com a pasta `assets` restaurada. Ele evita o erro da Vercel `ENOENT: assets/commerce-extension.js` quando todos os arquivos são enviados ao repositório.

## Antes de publicar

1. Substitua todo o conteúdo do repositório pelo conteúdo desta pasta, mantendo a estrutura de pastas.
2. Verifique no GitHub se existe `assets/commerce-extension.js` antes de confirmar o commit.
3. Na Vercel, mantenha as variáveis `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` configuradas.
4. Faça o deploy.

## Banco

- `20260628_13_acessos_funcionarios_seguro.sql`: já foi aplicado durante a configuração de acessos. Não é necessário executar novamente se ele já estiver no seu Supabase.
- `20260628_14_cardapio_complementos.sql`: execute uma vez no SQL Editor somente se ainda não tiver aplicado a coluna de complementos do cardápio.

Não execute as antigas migrations consolidadas que falharam.

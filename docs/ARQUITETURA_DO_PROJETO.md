# Arquitetura do VendaFácil

## Estrutura de código

- `src/templates/` — painel administrativo e vitrine pública antes da geração.
- `src/assets/js/` — scripts públicos carregados pela vitrine e pela central de ajuda.
- `src/assets/styles/` — CSS do painel, PDV, vitrine, responsividade e modais.
- `src/pwa/` — service worker, manifest e ícones do PWA.
- `scripts/` — build e validações estáticas do projeto.
- `supabase/migrations/` — migrações versionadas do banco.
- `supabase/manual/` — SQLs manuais e correções operacionais que exigem aplicação consciente no Supabase.
- `api/` — rotas serverless exigidas pelo Vercel.
- `dist/` — saída gerada pelo build; não editar manualmente.

## Fluxo de publicação

1. O Vercel executa `npm run build`.
2. `scripts/build.mjs` lê as fontes em `src/`.
3. O build grava as páginas e os assets públicos em `dist/`.
4. O Vercel publica somente a pasta `dist/` e mantém as rotas em `api/`.

## Tema visual

A versão atual trabalha somente com o tema claro. O botão, scripts, CSS e preferência persistida do modo escuro foram removidos para não interferirem no painel e no PDV. As cores configuráveis de cada loja continuam independentes disso.

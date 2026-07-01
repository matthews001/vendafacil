# Arquitetura do FechAí

## Estrutura de código

- `src/templates/` — painel administrativo e vitrine pública antes da geração.
- `src/assets/js/` — scripts públicos carregados pela vitrine e pela central de ajuda.
- `src/assets/styles/` — CSS do painel, PDV, vitrine, responsividade e modais.
- `src/pwa/` — service worker, manifest e ícones do PWA.
- `src/cloudflare/` — regras de cache e rotas estáticas do Cloudflare Pages.
- `functions/api/` — Pages Functions para manifest e ícone dinâmico de cada loja.
- `scripts/` — build e validações estáticas do projeto.
- `supabase/migrations/` — migrações versionadas do banco.
- `supabase/manual/` — SQLs manuais e correções operacionais que exigem aplicação consciente no Supabase.
- `dist/` — saída gerada pelo build; não editar manualmente.

## Fluxo de publicação

1. O Cloudflare Pages executa `npm run build`.
2. `scripts/build.mjs` lê as fontes em `src/`.
3. O build grava as páginas, assets, regras `_headers` e `_redirects` em `dist/`.
4. O Cloudflare Pages publica a pasta `dist/`; as rotas dinâmicas ficam em `functions/api/`.

## Tema visual

A versão atual trabalha somente com o tema claro. O botão, scripts, CSS e preferência persistida do modo escuro foram removidos para não interferirem no painel e no PDV. As cores configuráveis de cada loja continuam independentes disso.

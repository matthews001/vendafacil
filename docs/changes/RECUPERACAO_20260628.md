# Registro da recuperação

## Causa tratada

A publicação anterior referenciava arquivos temporários de vitrine que não estavam presentes no deploy. Além disso, uma versão antiga do navegador ainda tentava chamar RPCs que não existiam no catálogo do Supabase.

## Proteções desta versão

- Todos os pontos de publicação usam o mesmo par de arquivos: `storefront.v14-stable.css` e `storefront.v14-stable.js`.
- O cache do PWA usa uma chave nova: `vendafacil-pwa-v20-storefront-recovery`.
- Checkout e painel não dependem das RPCs antigas.
- A migration cria compatibilidade para páginas antigas e solicita recarga do schema do PostgREST.
- A zona de raio é separada das faixas de CEP pelo campo `vf_delivery_rule`.

## Validação local executada

Com variáveis de ambiente de teste, foram executados:

- `npm run build`
- `npm test`
- 23 verificações automatizadas de template, sintaxe, vitrine, checkout, pagamentos, PWA, CEP, raio, PDV, funcionários e entregador.

A execução no Supabase remoto e a publicação na Cloudflare Pages dependem das suas credenciais e precisam ser feitas seguindo `LEIA_ANTES_DE_SUBIR.md`.

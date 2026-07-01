# Correção — Complementos e recarregamento PWA

Esta versão corrige dois erros vistos no navegador:

1. `A conexão com o banco não está pronta` ao salvar um complemento.
   - O Cardápio agora reutiliza a mesma conexão Supabase criada pelo painel.
   - A ação aguarda brevemente a inicialização da conexão antes de falhar.

2. `Response body is already used` em `sw.js` ao recarregar.
   - O Service Worker agora clona a resposta antes de o navegador consumir o corpo.
   - O cache do PWA foi atualizado e o `sw.js` recebeu cabeçalho sem cache para atualizar corretamente.

## Aplicação

Não execute SQL.

1. Substitua o projeto no GitHub por esta versão.
2. Aguarde o deploy da Cloudflare Pages terminar.
3. No navegador, pressione `Ctrl + F5`.
4. Teste: Cardápio → Complementos → selecionar categoria → Salvar complemento.

Se o navegador ainda mantiver a versão anterior, abra F12 → Application → Service Workers → Unregister, depois atualize com `Ctrl + F5` uma única vez.

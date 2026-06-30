# Correção — seleção de mesas no mapa

Esta versão corrige o clique nas mesas do mini mapa do PDV.

- O clique não depende mais de `onclick` embutido no HTML.
- Mesas livres abrem a comanda diretamente.
- Mesas ocupadas abrem o painel com itens pendentes e opção de continuar a comanda.
- O sistema bloqueia clique duplo enquanto uma mesa está sendo aberta.
- Após abrir, o mapa é recarregado e a comanda é recuperada a partir do Supabase.
- Comandas abertas continuam sendo salvas no banco e possuem cópia local de segurança.

## SQL

Não há SQL novo nesta correção. Mantenha executada a migração:

`supabase/migrations/20260628_10_pdv_operacao_consolidada.sql`

## Teste rápido

1. Entre em **Frente de Caixa → Mesa**.
2. Clique em uma mesa **Livre**: a comanda deve abrir imediatamente.
3. Adicione um item, aguarde o aviso de salvamento e atualize a página.
4. Volte em **Mesa**: a mesa deve ficar ocupada e a comanda deve reaparecer.
5. Clique na mesa ocupada: deve abrir o detalhe com os itens pendentes.

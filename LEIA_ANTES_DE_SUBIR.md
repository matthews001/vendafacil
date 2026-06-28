# VendaFácil — recuperação completa da vitrine, checkout e raio

Este pacote substitui a versão que publicou uma vitrine sem CSS e que ainda chamava RPCs antigas inexistentes.

## Faça nesta ordem

1. No Supabase, abra **SQL Editor**.
2. Abra o arquivo `APLIQUE_ESTA_MIGRACAO.sql` deste pacote, copie tudo e execute **uma única vez**.
3. Confirme que o Supabase respondeu com sucesso.
4. No GitHub, substitua o conteúdo do repositório pelos arquivos desta pasta. Não envie o ZIP dentro do repositório: envie o conteúdo extraído.
5. Na Vercel, confirme estas variáveis em **Production**:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `MAPBOX_PUBLIC_TOKEN` — necessário somente para confirmar o endereço no cálculo de raio.
6. Faça um novo deploy e espere concluir.
7. Abra a loja em uma janela anônima ou use `Ctrl + F5` para limpar o cache da aba.

## O que foi corrigido

- A vitrine volta a publicar CSS e JavaScript juntos, agora com arquivos `storefront.v14-stable`.
- O Service Worker recebeu uma versão de cache nova para não reutilizar os arquivos temporários que quebraram a vitrine.
- O checkout atual usa `commerce_customer_create_order`; ele não chama mais `vf_customer_create_order_with_payment`.
- O painel atual salva o raio sem depender de `vf_configure_delivery_radius`.
- As RPCs antigas continuam disponíveis na migration apenas como compatibilidade para abas antigas durante a transição.
- CEP e número da loja passam a ser salvos na configuração da entrega.
- A zona técnica de raio é identificada como `radius`, não aparece como faixa de CEP e não pode ser usada para aceitar qualquer CEP.
- Os scripts de validação que estavam apontando para caminhos errados foram corrigidos.

## Teste mínimo depois do deploy

1. Abra **Gerenciador > Entrega e frete**.
2. Informe CEP e número da loja, confirme a origem pelo CEP, ative o raio e salve.
3. Abra `/loja?loja=loja-teste` e confirme que a vitrine aparece com o layout normal.
4. Faça um pedido de teste por retirada e outro por entrega.
5. Para entrega fora de faixa de CEP, preencha o endereço e use **Conferir pelo endereço**.

Não execute os SQLs de hotfix anteriores novamente. Use somente `APLIQUE_ESTA_MIGRACAO.sql` deste pacote.

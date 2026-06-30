# Entrega por CEP — atualização otimizada

## O que foi corrigido
- A loja e o cliente usam **ViaCEP** para preencher rua, bairro, cidade e UF.
- A vitrine calcula atendimento, frete e prazo por **faixas de CEP** cadastradas pela loja.
- O PDV em modo Entrega usa o mesmo CEP e a mesma faixa de frete.
- A vitrine e o PDV não carregam mapa, não fazem geocoding e não calculam rota durante a compra.
- O botão de CEP tem fallback interno: não fica sem ação caso o JavaScript principal ainda esteja carregando.
- O PWA recebeu nova versão de cache, eliminando o erro de `Response body is already used` e evitando que a vitrine use arquivos antigos.
- A consulta do mesmo CEP é reutilizada na tela atual para evitar chamadas repetidas ao ViaCEP.

## Aplicação obrigatória

### 1. Supabase
No **SQL Editor**, execute uma única vez o arquivo:

`20260628_17_entrega_por_cep_otimizada.sql`

Ele atualiza somente a função de venda de entrega do PDV para usar CEP e faixa de entrega, sem Mapbox.

### 2. GitHub / Vercel
Suba este projeto completo substituindo o atual. Aguarde a Vercel concluir o deploy.

### 3. Atualize o navegador
Abra o site e use `Ctrl + F5` uma vez.

Se a vitrine ainda mostrar uma versão antiga, abra o Inspecionar (`F12`) → **Application** → **Service Workers** → **Unregister**, depois atualize a página.

## Configurar cada loja
1. Abra **Entrega e frete**.
2. Informe o **CEP da loja** e o número; clique em **Buscar CEP**.
3. Cadastre ao menos uma área em **Áreas de entrega por CEP**.
4. Informe a faixa, por exemplo: `23000-000 a 23009-999`.
5. Defina frete, pedido mínimo e prazo.
6. Salve as configurações.

Sem uma faixa de CEP ativa, a opção **Receber em casa** não terá área atendida.

## Teste rápido
- Vitrine: escolha **Receber em casa** → CEP → Buscar CEP → número → confirme frete → gerar PIX.
- PDV: escolha modo **Entrega** → CEP → Buscar CEP → complete número → finalizar pagamento.

## Mapbox
O fluxo de delivery não usa mais Mapbox. Após confirmar que nenhuma outra função sua depende dele, `MAPBOX_PUBLIC_TOKEN` pode ser removida das variáveis da Vercel.

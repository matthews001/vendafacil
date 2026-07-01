# Atualização — Cardápio intuitivo e complementos por categoria

## O que mudou
- Produtos passaram a ser tratados como **itens do cardápio**.
- Categoria agora é obrigatória no cadastro de item, com lista de categorias já existentes.
- O formulário explica o cadastro passo a passo e avisa qual campo precisa ser preenchido.
- Complementos agora são aplicados por **categoria**, sem arrastar itens.
- No complemento, pesquise e marque categorias como `Hambúrgueres`, `Bebidas` ou `Combos`.
- Todo item atual e novo dessas categorias recebe o complemento automaticamente.
- A seleção de itens específicos continua disponível como opção avançada.
- Ao salvar, o sistema mostra quantos itens receberam o complemento.
- Se faltar nome, opção, categoria ou destino do complemento, aparece aviso claro e o campo é destacado.
- Foram adicionadas ajudas rápidas em Visão geral, Estoque, Pedidos, Entrega, PDV, Relatórios e Configurações.
- A vitrine agora deixa mais claro quando o cliente precisa personalizar um item e quando há escolhas obrigatórias.

## Não precisa rodar SQL nesta atualização
A atualização usa a mesma coluna `menu_complement_groups` criada no SQL de Cardápio e Complementos anterior.

Caso o sistema mostre a mensagem pedindo o SQL de Cardápio e Complementos, execute somente uma vez o arquivo antigo:
`20260628_14_cardapio_complementos.sql`

## Como atualizar
1. Extraia este ZIP.
2. Substitua os arquivos do seu repositório GitHub pelos arquivos desta pasta.
3. Faça o commit. A Cloudflare Pages fará o deploy automaticamente.
4. Não rode migrations antigas novamente.

## Teste rápido após publicar
1. Abra Cardápio e cadastre um item na categoria `Hambúrgueres`.
2. Abra Complementos, crie `Adicionais`, adicione `Bacon extra` e marque `Hambúrgueres`.
3. Salve e confira a mensagem com a quantidade de itens atualizados.
4. Crie outro hambúrguer e confirme que os adicionais aparecem automaticamente.
5. Abra a vitrine e clique no item para conferir as escolhas antes de adicionar ao carrinho.

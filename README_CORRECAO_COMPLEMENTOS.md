# Correção — salvar complementos

Esta versão corrige o fluxo real de **Cardápio → Complementos → Salvar**.

- identifica a loja ativa pelo painel, pelas configurações ou pelos itens já carregados;
- grava o grupo de complementos com `upsert`, inclusive quando ainda não houver uma linha em `commerce_settings`;
- atualiza todos os itens vinculados pela categoria escolhida;
- exibe erro claro caso a loja ou a conexão não estejam disponíveis;
- só confirma sucesso após salvar o grupo e atualizar os itens.

Não há SQL novo. A coluna `menu_complement_groups` do SQL `20260628_14_cardapio_complementos.sql` continua necessária e deve já estar aplicada.

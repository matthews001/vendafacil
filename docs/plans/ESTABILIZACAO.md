# FechAí — Ciclo de estabilização

Esta entrega não adiciona novos módulos de negócio. O foco é validar e proteger os fluxos que já existem antes de evoluir o sistema.

## Proteções incluídas

- Evita clique duplo em criação de pedido, confirmação de Pix, ajuste de estoque, login/cadastro de cliente, mudança de status e acesso master.
- Mostra estado de processamento no botão durante operações críticas.
- Traduz falhas comuns de conexão, sessão e permissão para mensagens mais claras.
- Impede adicionar ao carrinho um produto com saldo controlado igual a zero.
- Informa quando o aparelho fica sem internet ou quando a conexão volta.

## Roteiro de validação

Faça os testes abaixo com uma loja de teste ou usando produtos de baixo valor. Marque data, resultado e eventual mensagem de erro.

| Fluxo | Teste | Resultado esperado |
|---|---|---|
| Criar pedido | Adicione produto, escolha entrega/retirada e gere o Pix | Pedido criado uma única vez; QR/Pix aparece; carrinho não duplica |
| Pix | Clique em “Já fiz o pagamento” uma vez | Pedido muda para aguardando aprovação; botão não permite envio repetido |
| Estoque | Ative controle com saldo 0; depois ajuste entrada e saída | Saldo altera corretamente; produto com 0 fica esgotado |
| Cliente | Crie cadastro, saia e entre novamente | Login por WhatsApp e senha funciona; pedidos aparecem apenas para o próprio cliente |
| Status | Confirme Pix e avance o pedido até entregue | Cada status aparece uma vez no histórico do cliente |
| Acesso master | Entre na Área Master e abra o gerenciador de uma loja | Painel certo abre; aviso de acesso master aparece; botão Voltar ao Master funciona |
| Painel do cliente | Cliente altera produto, estoque e configurações permitidas | Alterações são salvas e a vitrine reflete a mudança |
| Vitrine mobile | Teste no celular: categoria, produto, carrinho e checkout | Layout compacto; botão de carrinho visível; nenhum conteúdo cortado |

## Regra durante este ciclo

Não rode migrations antigas novamente e não adicione novos recursos até concluir ao menos três dias de testes. Quando ocorrer um erro, registre:

1. Tela onde aconteceu.
2. Ação feita antes do erro.
3. Print da mensagem.
4. Horário aproximado.
5. Código do pedido, caso exista.

Isso permite corrigir a causa sem criar novos conflitos no banco.

## Ajuste V17 — Entrega automática pelo Mapbox

- A vitrine deixa de pedir a seleção manual de bairro quando a loja ativa o Mapbox.
- O cliente informa endereço, calcula a rota e vê distância, tempo e taxa antes de finalizar.
- A taxa é definida pela loja no painel e vinculada a uma região interna protegida, para o Supabase manter o valor correto no pedido.
- A entrega pode ter distância máxima configurada.

## PDV profissional — Passo 1

- Menu **Frente de Caixa** criado apenas dentro do painel Delivery autenticado.
- Atalho **Abrir PDV** adicionado na Visão geral do Delivery.
- Tela inicial separada para o PDV criada, com identificação da sessão, perfil atual e preparação dos fluxos de Balcão, Mesa e Entrega.
- Não altera pedidos, estoque, PIX, clientes nem o checkout público.


## PDV profissional — Passo 2

- Layout operacional completo criado para a Frente de Caixa, com área principal de catálogo e carrinho lateral fixo.
- Modos Balcão, Mesa e Entrega podem ser visualizados sem criar pedidos.
- Busca, categorias, identificação de cliente e escolha visual de pagamento são apenas prévias neste passo.
- Produtos, carrinho funcional, estoque e pagamentos continuam sem alteração até as próximas etapas.


## PDV — Passo 3
Validar: produtos ativos aparecem, pesquisa e categoria filtram corretamente, produto esgotado fica visível mas não abre detalhe, modal fecha corretamente.

## Ajuste adicional — contexto Master no PDV

- O banner de acesso Master foi movido para um card flutuante no canto inferior direito quando a Frente de Caixa está em modo foco.
- O card pode ser minimizado e mantém o atalho para retornar ao Painel Master.
- Avisos gerais do painel ficam ocultos somente durante a operação do PDV, preservando a área útil para catálogo e pedido.
- Nenhuma migração ou variável nova é necessária.

## PDV profissional — Passo 6: mesas e comandas

- Mesas são cadastradas por loja e exibem o estado livre/ocupada.
- A comanda é persistida no banco sem baixa de estoque enquanto estiver aberta.
- Transferência move a comanda inteira apenas para mesa livre.
- Divisão cria nova comanda em outra mesa livre e mantém os itens restantes na mesa de origem.
- Fechamento usa o mesmo motor seguro de pagamento do PDV; somente nessa hora o estoque é baixado.
- Validar: abrir comanda, adicionar produtos, atualizar a página, trocar de mesa, dividir itens e fechar em cada forma de pagamento.

### Correção 27/06/2026 — Mesas e comandas
- Removido ciclo de atualização contínua do carrinho do PDV ao entrar em Mesa.
- Carregamento de mesas agora evita requisições simultâneas.
- Salvamento automático foi reduzido e só grava alterações reais.


- Corrigido: `vf_pos_create_sale` agora grava `subtotal_amount` junto do total em vendas de balcão e fechamento de comandas.
- Adicionada migração de reparo para bases já publicadas.


## Passo 7 — Entrega integrada ao PDV

Validação técnica incluída nesta versão:
- dados de cliente/endereço separados do rascunho de balcão;
- rota liberada somente com CEP, rua e número;
- distância máxima validada no navegador e novamente no Supabase;
- frete sempre obtido da configuração da loja no Supabase;
- pagamento em dinheiro exige valor suficiente para produtos + entrega;
- pedido grava origem `pos_delivery`, endereço, frete, distância e tempo;
- carrinho só é limpo após RPC bem-sucedida.


## Passo 9 — impressão profissional
- Validação de scripts inline e build antes do pacote.
- Sem nova migração SQL.
- Sem MutationObserver novo no módulo de impressão.

## Correção de estabilidade — Carrinho do PDV

- Removido o conflito entre o clique de detalhes do catálogo e o clique de adicionar ao carrinho.
- Cada card usa uma única ação de inclusão.
- Produtos simples entram diretamente; produtos com adicionais/observação abrem a personalização.
- Criado teste automatizado para inclusão no rascunho e atualização imediata do carrinho.


## Correção — impressão do PDV
- O botão **Imprimir** do carrinho agora abre uma prévia visível dentro do sistema.
- Sem venda finalizada, a prévia usa os itens atuais como rascunho de teste, sem registrar pagamento.
- O botão **Imprimir / Salvar PDF** chama a impressão pelo iframe, evitando bloqueio de pop-up do navegador.
- O cache do PWA foi versionado novamente.

## PDV — Operação consolidada (28/06/2026)
- Mapa de mesas persistente, recuperação de comandas e impressão unificada por pedido.
- Cache do PWA atualizado para `v11-pdv-operacao-consolidada`.

# VendaFácil — Ciclo de estabilização

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

## PDV profissional — Passo 4

- Carrinho do PDV funciona como rascunho local: adicionar, editar, remover e alterar quantidade.
- Opções, adicionais, tamanhos e observação seguem o cadastro do produto.
- Desconto percentual ou em valor recalcula o total do rascunho.
- Não cria pedido, não registra pagamento e não movimenta estoque nesta etapa.

### Validar antes de avançar

1. Adicionar um produto simples e aumentar/diminuir a quantidade.
2. Adicionar produto com adicional/variação e conferir se o valor muda.
3. Editar um item já adicionado e inserir observação.
4. Aplicar desconto em percentual e em valor; conferir subtotal e total.
5. Limpar o pedido e confirmar que o carrinho volta a zero.
6. Fechar/abrir o PDV e confirmar que o rascunho da sessão permanece enquanto a aba não for encerrada.

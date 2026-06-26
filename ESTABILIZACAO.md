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

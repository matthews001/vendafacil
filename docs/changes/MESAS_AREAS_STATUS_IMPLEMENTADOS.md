# Mesas, Áreas e Status do Salão

## Incluído nesta versão
- Nova opção **Mesas** no menu lateral do Delivery.
- Página **Menu Mesas** com áreas agrupadas e status em tempo real.
- Modal **Gerenciar Mesas** com:
  - criação de áreas;
  - criação de uma mesa;
  - criação de várias mesas em sequência;
  - edição de mesa (nome, lugares, área e ordem);
  - desativação de mesa sem comanda aberta;
  - bloqueio de remoção de área que ainda tenha mesas.
- Modal da mesa com:
  - status atual;
  - Livre, Ocupada, Fazendo Pedido, Consumindo e Pagando;
  - **Ver Pedido** para conferir itens pendentes da comanda;
  - **Adicionar Itens** para abrir/retomar a comanda no PDV.
- Aba de **Comissão do Garçom** para guardar percentual padrão da loja.

## SQL obrigatório
Antes de publicar, execute no Supabase SQL Editor:

`APLIQUE_ESTA_MIGRACAO_MESAS_AREAS_STATUS.sql`

O arquivo reúne a criação de áreas/mesas e o status operacional das mesas.

## Segurança operacional
- Mesa com comanda aberta não pode ser desativada.
- Ao fechar ou cancelar uma comanda, a mesa volta automaticamente para **Livre**.
- O histórico de pedidos não é apagado ao desativar uma mesa.

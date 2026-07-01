# FechAí — publicação Delivery-only e limpeza do Supabase

Este pacote separa a limpeza em duas etapas para não derrubar a vitrine nem o painel.

## 1. Publicar primeiro o projeto Delivery-only

1. Faça uma cópia/backup do projeto Supabase antes da alteração do banco.
2. Extraia o ZIP e substitua os arquivos na raiz do repositório do FechAí, sem criar uma pasta extra dentro do repositório.
3. Envie para a branch usada pelo Cloudflare Pages.
4. Espere o deploy concluir e teste em janela anônima ou com atualização forçada.

## 2. Validar antes do SQL

Confirme estes fluxos no site publicado:

- abertura da vitrine e catálogo;
- cadastro e login de cliente;
- criação de pedido por retirada e entrega;
- Pix/pagamento pendente e atualização de status;
- produtos, estoque e cupons;
- áreas de entrega por CEP/raio;
- PDV, mesas e comandas;
- equipe/entregador;
- Painel Master, planos e assinaturas.

## 3. Executar a limpeza do banco

No Supabase SQL Editor, execute uma única vez:

`supabase/manual/20260701_19_limpeza_delivery_apos_publicacao.sql`

O SQL:

- arquiva dados removidos no schema `vf_archive`;
- deixa a V2 como estrutura oficial de planos, assinaturas, pagamentos e configurações Master;
- migra o negócio que ainda estava somente na assinatura V1;
- remove tabelas, funções, triggers e regras antigas de barbearia;
- remove tabelas vazias `negocios` e `negocio_dados`;
- preserva pedidos, produtos, estoque, clientes atuais, Delivery, PDV, mesas, equipe, permissões e imagens.

O último resultado do SQL deve retornar todos os campos como `true`.

## 4. Período de segurança

Não apague o schema `vf_archive` nos próximos 30 dias. Ele guarda a cópia das tabelas removidas para recuperação controlada. Depois de 30 dias de operação estável, revise o conteúdo arquivado antes de decidir por uma exclusão definitiva.

## Observação sobre cache

O banco registrou chamadas antigas de telas de barbearia. Depois do deploy, teste em janela anônima ou faça atualização forçada para impedir que uma versão antiga do navegador continue chamando rotas removidas.

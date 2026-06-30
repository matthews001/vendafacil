# Atualização — Formas de pagamento e maquininha

## O que foi incluído

No painel da loja, em **Pedidos e recebimento → Formas de pagamento**, a loja pode ativar ou desativar:

- Pix
- Dinheiro
- Cartão de débito
- Cartão de crédito
- Vale-refeição
- Vale-alimentação

Para cada opção há controles separados para **retirada** e **entrega**.

Cartões e vales não precisam de integração com adquirente nesta etapa: o cliente escolhe a opção e o pedido mostra **pagamento na maquininha**, na entrega ou na retirada.

## Aplicação obrigatória no Supabase

1. Abra **SQL Editor** no projeto Supabase.
2. Crie uma consulta nova.
3. Abra o arquivo `20260628_19_formas_pagamento_maquininha.sql` desta pasta.
4. Copie todo o conteúdo, cole no SQL Editor e clique em **Run** uma única vez.

Esse SQL adiciona apenas:

- configuração de formas de pagamento por loja;
- detalhes de pagamento no pedido;
- funções para salvar a configuração e criar pedido com Pix, dinheiro ou maquininha.

## Depois do deploy

1. No painel da loja, abra **Pedidos e recebimento → Formas de pagamento**.
2. Configure a chave em **PIX e recebimento**, caso use Pix.
3. Ative os meios aceitos e marque onde valem: retirada, entrega ou ambos.
4. Clique em **Salvar formas de pagamento**.

## Teste obrigatório antes de liberar para clientes

1. **Pix:** gerar pedido, fechar a tela e abrir novamente. O botão **Continuar pagamento** deve recuperar o Pix. O WhatsApp só abre depois de tocar em **Já fiz o pagamento**.
2. **Débito/crédito/vale:** a vitrine deve mostrar **maquininha na entrega** ou **maquininha na retirada**. Ao confirmar, o pedido deve ser criado sem QR Code e sem abrir WhatsApp automaticamente.
3. **Dinheiro:** testar pedido de troco. O valor informado para troco deve ser igual ou maior que o total.
4. **Entrega:** testar CEP/faixa ou raio que já esteja configurado para a loja.

## Cache/PWA

A vitrine agora usa os arquivos `storefront.v10-payment-methods.js` e `storefront.v10-payment-methods.css`, além de um novo cache do PWA. Depois da Vercel publicar, use **Ctrl + F5** na primeira abertura para garantir que o navegador carregue a versão nova.

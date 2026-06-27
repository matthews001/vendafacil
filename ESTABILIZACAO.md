# Estabilização — PDV Passo 5

- O pedido é criado por função segura no Supabase.
- O preço é recalculado no banco a partir do catálogo atual.
- Produtos com estoque controlado só sofrem baixa quando o pagamento está confirmado.
- A opção **Pagar depois** cria o pedido como aguardando pagamento e não baixa estoque.
- A impressão desta etapa é um comprovante simples do navegador. O cupom térmico profissional continua previsto para o Passo 9.

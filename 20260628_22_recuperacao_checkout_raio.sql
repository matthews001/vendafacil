-- VendaFácil PDV — Passo 8 (estável)
-- Habilita Realtime para pedidos. O painel também possui atualização automática de segurança.
-- Não altera pedidos, estoque, valores ou regras de pagamento.

ALTER TABLE public.commerce_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'commerce_orders'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.commerce_orders;
  END IF;
END
$$;

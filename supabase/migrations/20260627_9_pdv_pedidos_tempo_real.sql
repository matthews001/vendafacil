-- VendaFácil PDV — Passo 8
-- Habilita atualização em tempo real para a central operacional de pedidos.
-- Não altera os pedidos existentes, valores, estoque ou regras de pagamento.

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

COMMENT ON TABLE public.commerce_orders IS
'Pedidos do VendaFácil. Realtime habilitado no PDV Passo 8 para alertas e atualização operacional.';

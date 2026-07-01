-- FechAí — Cardápio e complementos reutilizáveis
-- Seguro para o banco atual: adiciona apenas uma coluna nova, sem alterar pedidos, estoque ou funções existentes.
BEGIN;

ALTER TABLE public.commerce_settings
  ADD COLUMN IF NOT EXISTS menu_complement_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;

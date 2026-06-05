-- ============================================================
-- KONVERSA CRM — HABILITAR SUPABASE REALTIME
-- ============================================================
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- Habilitar realtime en tablas que necesitan updates en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Verificar
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

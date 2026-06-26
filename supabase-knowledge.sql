-- ============================================================
-- KONVERSA CRM — BASE DE CONOCIMIENTO (Google Docs)
-- ============================================================
-- Guarda el contenido sincronizado de los Google Docs que
-- alimentan al agente de IA, junto con la metadata de la última
-- sincronización. El webhook (service_role) lee este contenido y
-- lo inyecta en el system prompt del agente.
--
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ── 1. Tabla knowledge_sources — fuentes de conocimiento del agente
CREATE TABLE IF NOT EXISTS public.knowledge_sources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL DEFAULT 'google_docs', -- 'google_docs', 'url', ...
  doc_id text NOT NULL,            -- ID del documento de Google
  title text,                      -- nombre legible de la fuente
  url text,                        -- URL original (para abrir desde la UI)
  content text,                    -- texto plano sincronizado
  char_count integer DEFAULT 0,    -- tamaño del contenido sincronizado
  is_active boolean DEFAULT true,  -- si alimenta o no al agente
  auto_sync boolean DEFAULT true,  -- si se resincroniza en el cron diario
  last_synced_at timestamptz,      -- última sincronización exitosa
  last_sync_status text,           -- 'ok' | 'error'
  last_sync_error text,            -- detalle del último error
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, doc_id)
);

-- ── 2. RLS
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden ver el estado de las fuentes;
-- solo admin puede crear / editar / borrar.
DROP POLICY IF EXISTS "knowledge_sources_select" ON public.knowledge_sources;
DROP POLICY IF EXISTS "knowledge_sources_insert" ON public.knowledge_sources;
DROP POLICY IF EXISTS "knowledge_sources_update" ON public.knowledge_sources;
DROP POLICY IF EXISTS "knowledge_sources_delete" ON public.knowledge_sources;

CREATE POLICY "knowledge_sources_select" ON public.knowledge_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "knowledge_sources_insert" ON public.knowledge_sources
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "knowledge_sources_update" ON public.knowledge_sources
  FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "knowledge_sources_delete" ON public.knowledge_sources
  FOR DELETE TO authenticated USING (public.is_admin());

-- Bloquear anon; el webhook usa service_role (bypassa RLS).
REVOKE ALL ON public.knowledge_sources FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_sources TO authenticated;

-- ── 3. Seed — Base de Conocimiento PINGUS (Google Doc ya existente)
INSERT INTO public.knowledge_sources (provider, doc_id, title, url)
VALUES (
  'google_docs',
  '1LbPShBxNgd4qy9vnjh2bGoZq8C7nxxlcBWIsrsUtEUc',
  'Base de Conocimiento PINGUS',
  'https://docs.google.com/document/d/1LbPShBxNgd4qy9vnjh2bGoZq8C7nxxlcBWIsrsUtEUc/edit'
)
ON CONFLICT (provider, doc_id) DO NOTHING;

-- ── 4. Verificación
SELECT provider, doc_id, title, is_active, auto_sync, last_synced_at, char_count
FROM public.knowledge_sources
ORDER BY created_at;

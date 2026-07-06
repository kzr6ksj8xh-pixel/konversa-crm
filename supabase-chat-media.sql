-- ============================================================
-- KONVERSA CRM — STORAGE PARA ADJUNTOS DEL CHAT
-- ============================================================
-- Ejecutar en Supabase → SQL Editor (una sola vez).
--
-- Crea el bucket público 'chat-media' donde el CRM sube las fotos y
-- documentos que el agente envía a los clientes desde el botón de
-- adjuntar (clip) de la bandeja. El bucket debe ser PÚBLICO porque la
-- Graph API de Meta descarga el archivo por URL antes de reenviarlo al
-- cliente por WhatsApp / Messenger / Instagram.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-media', 'chat-media', true, 16777216)  -- 16 MB
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 16777216;

-- Subida: solo usuarios autenticados del CRM.
DROP POLICY IF EXISTS "chat_media_auth_insert" ON storage.objects;
CREATE POLICY "chat_media_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-media');

-- Lectura autenticada (listar/gestionar desde el CRM). La descarga pública
-- la resuelve el flag public=true del bucket vía CDN.
DROP POLICY IF EXISTS "chat_media_auth_select" ON storage.objects;
CREATE POLICY "chat_media_auth_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media');

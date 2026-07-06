-- ============================================================
-- KONVERSA CRM — DEDUPLICACIÓN DE EVENTOS DE WEBHOOK
-- ============================================================
-- Ejecutar en Supabase → SQL Editor (una sola vez).
--
-- Meta (WhatsApp / Messenger / Instagram) reintenta la entrega del
-- webhook si no recibe un 200 a tiempo. Como api/webhook.js llama a
-- Claude de forma síncrona, un reintento podía duplicar el mensaje
-- del cliente en la bandeja y disparar una segunda respuesta del bot.
--
-- Esta tabla actúa como candado de idempotencia: webhook.js hace un
-- INSERT del ID del proveedor (wamid en WhatsApp, mid en FB/IG) antes
-- de procesar. El primer INSERT gana; una reentrega choca contra la
-- PRIMARY KEY (unique_violation, código 23505) y se descarta.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id    text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índice para la limpieza periódica por antigüedad.
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at
  ON public.webhook_events(created_at);

-- RLS: solo el service_role (que la bypasea) escribe aquí desde el
-- webhook. Ningún cliente autenticado ni anónimo necesita acceso.
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webhook_events FROM anon, authenticated;

-- ── Limpieza opcional ─────────────────────────────────────
-- La tabla solo necesita retener IDs recientes (los reintentos de Meta
-- ocurren en minutos/horas). Podés purgar los antiguos manualmente o
-- con un cron (pg_cron). Ejemplo de purga de más de 7 días:
--
--   DELETE FROM public.webhook_events WHERE created_at < now() - interval '7 days';
--
-- Con pg_cron habilitado:
--   SELECT cron.schedule('purge-webhook-events', '0 3 * * *',
--     $$DELETE FROM public.webhook_events WHERE created_at < now() - interval '7 days'$$);

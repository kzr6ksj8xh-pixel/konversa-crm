-- Silencio de la respuesta automática de la IA por contacto.
-- Refleja el toggle "Respuesta automática IA" de la bandeja omnicanal.
-- Por defecto ACTIVO (true): la IA responde salvo que se silencie el contacto.
-- El webhook (api/webhook.js) consulta esta columna antes de auto-responder.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ai_auto_reply boolean NOT NULL DEFAULT true;

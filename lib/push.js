// ============================================================
// KONVERSA CRM - Sender de Web Push (notificaciones reales)
// ============================================================
// Envía notificaciones push a los agentes suscritos aunque la
// app esté cerrada. Lo llama webhook.js cuando entra un mensaje
// nuevo de un cliente.
//
// Claves VAPID SOLO en variables de entorno de Vercel:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (la pública también se sirve al frontend vía /api/push-public-key)
// ============================================================

import webpush from 'web-push';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@grupopingus.com';

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
  return true;
}

// sb: cliente Supabase (service_role). payload: { title, body, contactId, url }
export async function sendPushToAgents(sb, { title, body, contactId, url } = {}) {
  if (!ensureConfigured()) {
    console.log('[PUSH] VAPID no configurado — omitiendo envío');
    return { sent: 0, skipped: true };
  }
  if (!sb) return { sent: 0 };

  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth');
  if (error) { console.error('[PUSH] leer suscripciones:', error); return { sent: 0 }; }
  if (!subs || !subs.length) return { sent: 0 };

  const payload = JSON.stringify({
    title: title || 'Konversa',
    body: body || '',
    contactId: contactId || null,
    url: url || '/'
  });

  const dead = [];
  const errors = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      sent++;
    } catch (err) {
      const code = err?.statusCode;
      const detail = { endpoint: s.endpoint.substring(0, 60), statusCode: code, message: err?.body || err?.message };
      if (code === 404 || code === 410) dead.push(s.endpoint);
      else console.warn('[PUSH] envío falló:', JSON.stringify(detail));
      errors.push(detail);
    }
  }));

  if (dead.length) {
    await sb.from('push_subscriptions').delete().in('endpoint', dead);
    console.log('[PUSH] limpiadas', dead.length, 'suscripciones muertas');
  }
  console.log('[PUSH] enviadas', sent, 'de', subs.length);
  return { sent, dead: dead.length, total: subs.length, errors };
}

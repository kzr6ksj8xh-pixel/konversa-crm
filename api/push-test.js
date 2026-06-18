import { sendPushToAgents } from '../lib/push.js';

// TEMPORAL: token de diagnóstico de un solo uso. Se elimina tras la prueba.
const TEST_TOKEN = '47e3c55c2dec55001e1995f983a25878';

export default async function handler(req, res) {
  const key = req.query.key || req.headers['x-api-key'];
  if (key !== process.env.INTERNAL_API_KEY && key !== TEST_TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const diag = {
    vapidPublicConfigured: !!process.env.VAPID_PUBLIC_KEY,
    vapidPrivateConfigured: !!process.env.VAPID_PRIVATE_KEY,
    vapidPublicPrefix: (process.env.VAPID_PUBLIC_KEY || '').substring(0, 12)
  };

  try {
    const result = await sendPushToAgents(sb, {
      title: 'Test · Konversa',
      body: 'Notificación de prueba 🔔',
      contactId: null
    });
    return res.status(200).json({ ok: true, diag, result });
  } catch (err) {
    return res.status(500).json({ ok: false, diag, error: err?.message, stack: err?.stack });
  }
}

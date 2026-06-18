import { sendPushToAgents } from '../lib/push.js';

export default async function handler(req, res) {
  const key = req.query.key || req.headers['x-api-key'];
  if (key !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    const result = await sendPushToAgents(sb, {
      title: 'Test · Konversa',
      body: 'Notificación de prueba 🔔',
      contactId: null
    });
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message, stack: err?.stack });
  }
}

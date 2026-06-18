// ============================================================
// KONVERSA CRM - Guardar/renovar suscripción de Web Push
// ============================================================
// Lo llama el Service Worker (sw.js) en 'pushsubscriptionchange'
// cuando el navegador invalida y regenera la suscripción.
// El alta normal la hace el frontend directo a Supabase con
// user_id; este endpoint cubre la RENOVACIÓN (sin sesión).
//
// Usa service_role (bypassa RLS) — solo escribe en
// push_subscriptions (endpoint UNIQUE, user_id nullable).
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://konversa-crm.vercel.app').split(',');

async function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: 'Supabase no configurado' });

  // El body puede venir ya parseado o como string crudo
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Body inválido' });
  }

  // Acepta dos formas:
  //  A) suscripción cruda { endpoint, keys: { p256dh, auth } }
  //  B) { oldEndpoint, subscription: { endpoint, keys: {...} }, userId? }
  const sub = body.subscription || body;
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  const oldEndpoint = body.oldEndpoint || null;
  const userId = body.userId || null;

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'Suscripción incompleta' });
  }

  try {
    // Renovación: si el SW envía el endpoint viejo, migramos la fila
    // existente para preservar el user_id asociado.
    if (oldEndpoint && oldEndpoint !== endpoint) {
      const { data: updated, error: updErr } = await sb.from('push_subscriptions')
        .update({ endpoint, p256dh, auth })
        .eq('endpoint', oldEndpoint)
        .select('id');
      if (updErr) console.error('push-subscribe update:', updErr);
      if (updated && updated.length) {
        return res.status(200).json({ ok: true, renewed: true });
      }
    }

    // Alta nueva o renovación sin coincidencia: upsert por endpoint
    const row = { endpoint, p256dh, auth };
    if (userId) row.user_id = userId;
    const { error } = await sb.from('push_subscriptions')
      .upsert(row, { onConflict: 'endpoint', ignoreDuplicates: false });
    if (error) {
      console.error('push-subscribe upsert:', error);
      return res.status(500).json({ error: 'No se pudo guardar la suscripción' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('push-subscribe error:', e.message);
    return res.status(500).json({ error: 'Error interno' });
  }
}

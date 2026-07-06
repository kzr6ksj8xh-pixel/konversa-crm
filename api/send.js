const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _sb = null;
async function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  if (_sb) return _sb;
  const { createClient } = await import('@supabase/supabase-js');
  _sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _sb;
}

// Verifica que el Bearer token sea un JWT de usuario válido de Supabase.
// Reemplaza la validación por Origin/Referer, que cualquier cliente que no
// sea un navegador puede falsificar.
async function isValidSupabaseUser(token) {
  try {
    const sb = await getSupabase();
    if (!sb) return false;
    const { data, error } = await sb.auth.getUser(token);
    return !error && !!data?.user;
  } catch (e) {
    console.error('isValidSupabaseUser:', e.message);
    return false;
  }
}

async function uploadImageToWhatsApp(imageUrl) {
  try {
    const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) { console.log('WA-FETCH-ERR:', imgRes.status); return null; }
    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    // FormData and Blob are available globally in Node 18+ (Vercel)
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: contentType }), 'product.jpg');
    const upRes = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` },
      body: form
    });
    const upBody = await upRes.text();
    if (!upRes.ok) { console.log('WA-UPLOAD-ERR:', upBody); return null; }
    const { id } = JSON.parse(upBody);
    console.log('WA-UPLOAD-OK:', id);
    return id;
  } catch(e) { console.log('WA-UPLOAD-EX:', e.message); return null; }
}

async function sendWhatsApp(to, text, imageUrl) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  if (imageUrl) {
    try { const u = new URL(imageUrl); u.searchParams.delete('width'); imageUrl = u.toString(); } catch(e) { imageUrl = imageUrl.split('?')[0]; }
  }
  let body;
  if (imageUrl) {
    const mediaId = await uploadImageToWhatsApp(imageUrl);
    if (mediaId) {
      body = { messaging_product: 'whatsapp', to, type: 'image', image: { id: mediaId, caption: text } };
    } else {
      body = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
    }
  } else {
    body = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
  }
  console.log('WA-TYPE:', body.type);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const resBody = await res.text();
  if (!res.ok) console.error('WA-ERR:', res.status, resBody);
  else console.log('WA-OK:', res.status);
  return res.ok;
}

async function sendFBIG(recipientId, text) {
  if (!META_PAGE_TOKEN) return false;
  const res = await fetch('https://graph.facebook.com/v21.0/me/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
      access_token: META_PAGE_TOKEN
    })
  });
  if (!res.ok) console.error('FB/IG send error:', res.status, await res.text());
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Autorización: (a) clave interna para llamadas servidor-a-servidor, o
  // (b) un JWT de usuario de Supabase para el navegador. Ya NO se acepta la
  // validación por Origin/Referer: este endpoint envía con los tokens de la
  // empresa (WhatsApp/Meta), así que exige identidad real.
  const apiKey = req.headers['x-api-key'];
  let authorized = INTERNAL_API_KEY && apiKey === INTERNAL_API_KEY;
  if (!authorized) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    authorized = token ? await isValidSupabaseUser(token) : false;
  }
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { channel, to, text, imageUrl } = req.body || {};
  if (!channel || !to || !text) return res.status(400).json({ error: 'channel, to, text required' });

  let ok = false;
  if (channel === 'wa') ok = await sendWhatsApp(to, text, imageUrl);
  else if (channel === 'fb' || channel === 'ig') ok = await sendFBIG(to, text);
  else return res.status(400).json({ error: 'Unknown channel' });

  return res.status(ok ? 200 : 502).json({ sent: ok });
}

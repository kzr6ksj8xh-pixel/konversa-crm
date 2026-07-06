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

// Descarga el archivo desde su URL pública y lo sube a la media API de
// WhatsApp, devolviendo el media id. Sirve tanto para imágenes como para
// documentos (PDF, Office, etc.).
async function uploadMediaToWhatsApp(mediaUrl, fileName) {
  try {
    const mRes = await fetch(mediaUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!mRes.ok) { console.log('WA-FETCH-ERR:', mRes.status); return null; }
    const buffer = await mRes.arrayBuffer();
    const contentType = mRes.headers.get('content-type') || 'application/octet-stream';
    // FormData and Blob are available globally in Node 18+ (Vercel)
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', new Blob([buffer], { type: contentType }), fileName || 'archivo');
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

async function sendWhatsApp(to, text, mediaUrl, mediaType, fileName) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  if (mediaUrl && mediaType === 'image') {
    // Para imágenes de producto quitamos el parámetro ?width= que sirve una
    // miniatura; queremos la versión completa.
    try { const u = new URL(mediaUrl); u.searchParams.delete('width'); mediaUrl = u.toString(); } catch(e) { mediaUrl = mediaUrl.split('?')[0]; }
  }
  let body;
  if (mediaUrl && (mediaType === 'image' || mediaType === 'document')) {
    const mediaId = await uploadMediaToWhatsApp(mediaUrl, fileName);
    if (mediaId && mediaType === 'image') {
      body = { messaging_product: 'whatsapp', to, type: 'image', image: { id: mediaId, caption: text || undefined } };
    } else if (mediaId) {
      body = { messaging_product: 'whatsapp', to, type: 'document', document: { id: mediaId, caption: text || undefined, filename: fileName || 'archivo' } };
    } else {
      // Falló la subida: al menos mandamos el enlace en texto para no perder el envío.
      body = { messaging_product: 'whatsapp', to, type: 'text', text: { body: (text ? text + '\n' : '') + mediaUrl } };
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

async function sendMeta(recipientId, message) {
  const res = await fetch('https://graph.facebook.com/v21.0/me/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message,
      messaging_type: 'RESPONSE',
      access_token: META_PAGE_TOKEN
    })
  });
  if (!res.ok) console.error('FB/IG send error:', res.status, await res.text());
  return res.ok;
}

async function sendFBIG(channel, recipientId, text, mediaUrl, mediaType) {
  if (!META_PAGE_TOKEN) return false;
  // Messenger admite adjuntos de imagen y archivo por URL. Instagram solo
  // admite imagen; para documentos en IG mandamos el enlace en texto.
  if (mediaUrl && mediaType === 'image') {
    const okImg = await sendMeta(recipientId, { attachment: { type: 'image', payload: { url: mediaUrl, is_reusable: true } } });
    if (text) await sendMeta(recipientId, { text });
    return okImg;
  }
  if (mediaUrl && mediaType === 'document') {
    if (channel === 'fb') {
      const okFile = await sendMeta(recipientId, { attachment: { type: 'file', payload: { url: mediaUrl, is_reusable: true } } });
      if (text) await sendMeta(recipientId, { text });
      return okFile;
    }
    // Instagram: no soporta adjunto de archivo → enviar enlace.
    return await sendMeta(recipientId, { text: (text ? text + '\n' : '') + mediaUrl });
  }
  return await sendMeta(recipientId, { text });
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

  const { channel, to, text, imageUrl, fileName } = req.body || {};
  // Normalizamos: mediaUrl/mediaType son los nuevos campos; imageUrl se mantiene
  // por compatibilidad (envío de imágenes de producto) y equivale a mediaType 'image'.
  const mediaUrl = req.body?.mediaUrl || imageUrl || null;
  const mediaType = req.body?.mediaType || (imageUrl ? 'image' : null);
  const caption = text || '';
  if (!channel || !to) return res.status(400).json({ error: 'channel, to required' });
  if (!caption && !mediaUrl) return res.status(400).json({ error: 'text or media required' });

  let ok = false;
  if (channel === 'wa') ok = await sendWhatsApp(to, caption, mediaUrl, mediaType, fileName);
  else if (channel === 'fb' || channel === 'ig') ok = await sendFBIG(channel, to, caption, mediaUrl, mediaType);
  else return res.status(400).json({ error: 'Unknown channel' });

  return res.status(ok ? 200 : 502).json({ sent: ok });
}

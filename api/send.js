const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

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

  const origin = req.headers['origin'] || req.headers['referer'] || '';
  const apiKey = req.headers['x-api-key'];
  const isValidOrigin = origin.includes('konversa-crm.vercel.app') || origin.includes('localhost');
  const isValidKey = INTERNAL_API_KEY && apiKey === INTERNAL_API_KEY;
  if (!isValidOrigin && !isValidKey) {
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

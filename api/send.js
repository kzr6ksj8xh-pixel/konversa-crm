const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

async function sendWhatsApp(to, text, imageUrl) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  if (imageUrl) imageUrl = imageUrl.split('?')[0];
  let body;
  if (imageUrl) {
    body = { messaging_product: 'whatsapp', to, type: 'image', image: { link: imageUrl, caption: text } };
  } else {
    body = { messaging_product: 'whatsapp', to, type: 'text', text: { body: text } };
  }
  console.log('WA sending:', JSON.stringify({ to, type: body.type, imageUrl: imageUrl || 'none' }));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const resBody = await res.text();
  if (!res.ok) console.error('WA send error:', res.status, resBody);
  else console.log('WA send OK:', resBody);
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

  return res.status(ok ? 200 : 502).json({ sent: ok, channel, imageUrl: imageUrl || null });
}

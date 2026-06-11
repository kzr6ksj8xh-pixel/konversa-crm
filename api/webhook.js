// ============================================================
// KONVERSA CRM - Webhook Omnicanal META + Claude AI
// ============================================================
// Maneja: WhatsApp, Facebook Messenger, Instagram DM
// Todos llegan al mismo endpoint desde Meta
// Deploy: Vercel Serverless Function (api/webhook.js)
//
// Persiste contactos / conversaciones / mensajes en Supabase
// (service_role) para que la bandeja omnicanal del CRM los vea
// vía Realtime. El historial de contexto del bot se reconstruye
// desde la tabla messages, no desde memoria del proceso.
// ============================================================

import crypto from 'crypto';

// Desactivar el body-parser para acceder a los bytes crudos y validar
// la firma HMAC contra el payload exacto que envió Meta.
export const config = { api: { bodyParser: false } };

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const META_APP_SECRET = process.env.META_APP_SECRET;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── System Prompt del Agente IA ───────────────────────────
const SYSTEM_PROMPT = `Eres PINGUS ASISTENTE, el chatbot de ventas de Grupo PINGUS, una empresa mexicana especializada en purificadores de aire y agua con tecnología de ozono avanzada.

DATOS CLAVE DE LA EMPRESA:
- Nombre: Grupo PINGUS
- Eslogan: "The Health Guardian"
- Web: www.grupopingus.com
- WhatsApp Ventas: +52 981 751 1111
- Horario: Lunes a sábado, 10:00 a 19:00 (hora México)
- Envío: 2 días hábiles, GRATIS en toda la República Mexicana
- Garantía: 6 meses contra defectos de fábrica
- Pagos: Tarjeta crédito/débito, PayPal, Transferencia bancaria

TU FUNCIÓN PRINCIPAL (en orden de prioridad):
1. ESCUCHAR: Entiende qué espacio quiere purificar el cliente (aire, agua, o ambos)
2. CALIFICAR: Pregunta los metros cuadrados (m²) del espacio ANTES de cualquier recomendación
3. RECOMENDAR: Sugiere el modelo exacto usando la tabla de recomendación por espacio
4. VENDER: Al recomendar SIEMPRE incluye: nombre del producto + precio en MXN + link directo
5. ESCALAR: Si hay intención de compra, solicitud de factura o pregunta compleja → transferir a asesor humano

CATÁLOGO DE PRODUCTOS:
1. Generador OZONO CIR - $1,995 MXN - Inteligente con ciclos automáticos. Ideal 20-50 m²
2. Generador ULTRA 150 - $1,795 MXN - Portátil alta eficiencia. Ideal 50-100 m²
3. Generador ULTRA 200 - $2,495 MXN - Mayor capacidad. Ideal 100-200 m²
4. Módulo Air CK30 UVC - $8,500 MXN - Desinfección UV-C para clínicas. Ideal para espacios médicos
5. AQUA 1000 - $3,200 MXN - Purificador agua+aire. Ideal restaurantes y negocios
6. AQUA HOME - $1,495 MXN - Purificador de agua doméstico

TABLA DE RECOMENDACIÓN:
- Casa/habitación 20-50 m² (aire): OZONO CIR
- Oficina/local 50-100 m² (aire): ULTRA 150
- Restaurante/negocio 100-200 m² (aire): ULTRA 200
- Clínica/hospital (desinfección): Módulo Air CK30 UVC
- Restaurante/negocio (agua+aire): AQUA 1000
- Casa (agua): AQUA HOME

PAUTAS DE COMUNICACIÓN (OBLIGATORIAS):
- Máximo 3 líneas por mensaje. NUNCA bloques de texto largos.
- NUNCA repitas el saludo si ya saludaste en la conversación.
- Habla siempre de "tú". NUNCA digas "usted".
- Cada recomendación de producto debe tener: NOMBRE + PRECIO + LINK.
- Si el cliente pregunta por un espacio, pide m² ANTES de cualquier sugerencia.
- Si no tienes la información, di: "Te conecto con un asesor para darte el dato exacto" y transfiere.
- No uses emojis en más de 1 de cada 3 mensajes.
- Cierra firmando "Equipo PINGUS – The Health Guardian" SOLO cuando entregues información clave.

PALABRAS PROHIBIDAS (NUNCA las uses):
sinergia, paradigma, apalancamiento, "es menester", "cabe señalar", "en el panorama actual"

MANEJO DE OBJECIONES:
- "Es caro" → Diferenciar por garantía 6 meses + soporte México + envío gratis
- "¿Es seguro el ozono?" → Sí, concentraciones controladas certificadas
- "Vi uno más barato en Amazon" → Garantía oficial + soporte directo + envío gratis 2 días
- Si pide descuento → Transferir a asesor humano

TRANSFERIR A HUMANO cuando:
- El cliente dice "lo quiero", "cómo pago", "lo compro"
- Pide factura
- Pide descuento
- Pregunta compleja fuera de tus fuentes
En estos casos responde: "¡Perfecto! Te conecto con un asesor de Grupo PINGUS para ayudarte. Un momento 🔄"`;

// ── Supabase (service_role) ───────────────────────────────
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

// ── Resolver / crear contacto por canal+handle ────────────
// handle = teléfono (wa) o PSID (fb/ig)
async function resolveContact(sb, channel, handle, name) {
  if (channel === 'wa') {
    const { data } = await sb.from('contacts').select('id,channels')
      .eq('phone', handle).limit(1).maybeSingle();
    if (data) return data;
  }
  const { data: byChannel } = await sb.from('contacts').select('id,channels')
    .contains('channels', [{ ch: channel, handle }]).limit(1).maybeSingle();
  if (byChannel) return byChannel;

  const row = {
    name: name || 'Cliente',
    phone: channel === 'wa' ? handle : null,
    channels: [{ ch: channel, handle }],
    stage: 'entrada'
  };
  const { data: created, error } = await sb.from('contacts').insert(row).select('id,channels').single();
  if (error) { console.error('resolveContact insert:', error); return null; }
  return created;
}

// ── Resolver / crear conversación por contacto+canal ──────
async function resolveConversation(sb, contactId, channel) {
  const { data } = await sb.from('conversations').select('id')
    .eq('contact_id', contactId).eq('channel', channel).limit(1).maybeSingle();
  if (data) return data.id;
  const { data: created, error } = await sb.from('conversations')
    .insert({ contact_id: contactId, channel }).select('id').single();
  if (error) { console.error('resolveConversation insert:', error); return null; }
  return created.id;
}

// ── Guardar mensaje. sender: 'in' | 'out' | 'ai' ──────────
async function persistMessage(sb, conversationId, channel, sender, content) {
  const { error } = await sb.from('messages').insert({
    conversation_id: conversationId, sender, content, channel,
    sent_at: new Date().toISOString()
  });
  if (error) console.error('persistMessage:', error);
  await sb.from('conversations')
    .update({ last_message: content.substring(0, 200), updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}

// ── Historial de contexto desde la DB (últimos 20) ────────
async function loadHistory(sb, conversationId) {
  const { data } = await sb.from('messages')
    .select('sender,content').eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true }).limit(20);
  if (!data) return [];
  return data
    .filter(m => m.sender === 'in' || m.sender === 'out' || m.sender === 'ai')
    .map(m => ({ role: m.sender === 'in' ? 'user' : 'assistant', content: m.content }));
}

// ── Claude API ────────────────────────────────────────────
async function callClaude(history, userMessage) {
  const messages = [...history, { role: 'user', content: userMessage }];
  // Anthropic exige que la conversación empiece con 'user'
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude API error:', response.status, errorText);
    return 'Disculpa, tengo un problema técnico. Te conecto con un asesor. Un momento 🔄';
  }

  const data = await response.json();
  return data.content[0]?.text || 'Disculpa, no pude procesar tu mensaje.';
}

// ── Orquestador: persiste entrante, llama IA, persiste salida ──
async function processIncoming(channel, handle, name, text) {
  const sb = await getSupabase();
  if (!sb) {
    // Sin Supabase configurado: responder sin contexto persistente
    return callClaude([], text);
  }
  const contact = await resolveContact(sb, channel, handle, name);
  if (!contact) return callClaude([], text);

  const convId = await resolveConversation(sb, contact.id, channel);
  if (!convId) return callClaude([], text);

  const history = await loadHistory(sb, convId);
  await persistMessage(sb, convId, channel, 'in', text);

  const reply = await callClaude(history, text);
  await persistMessage(sb, convId, channel, 'ai', reply);
  return reply;
}

// ══════════════════════════════════════════════════════════════
// WHATSAPP
// ══════════════════════════════════════════════════════════════
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } })
  });
  const respText = await response.text();
  if (!response.ok) console.error('WA send error:', response.status, respText);
  else console.log('WA send ok:', respText);
  return response.ok;
}

async function markAsRead(messageId) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId })
  }).catch(err => console.error('Mark as read error:', err));
}

async function handleWhatsApp(body) {
  const entry = body.entry?.[0];
  const value = entry?.changes?.[0]?.value;
  if (value?.statuses?.length) {
    for (const s of value.statuses) {
      console.log(`[WA status] ${s.status} → ${s.recipient_id}`, s.errors ? JSON.stringify(s.errors) : '');
    }
  }
  if (!value?.messages?.length) return { status: 'no_messages' };

  const message = value.messages[0];
  const from = message.from;
  const contactName = value.contacts?.[0]?.profile?.name || 'Cliente';

  console.log(`[WA] ${contactName} (${from}): ${message.type}`);
  await markAsRead(message.id);

  if (message.type !== 'text') {
    await sendWhatsAppMessage(from, '¡Hola! Por el momento solo puedo leer mensajes de texto. ¿En qué te puedo ayudar? 😊');
    return { status: 'non_text_handled', channel: 'whatsapp' };
  }

  const aiResponse = await processIncoming('wa', from, contactName, message.text.body);
  const sent = await sendWhatsAppMessage(from, aiResponse);
  return { status: 'processed', channel: 'whatsapp', from, sent };
}

// ══════════════════════════════════════════════════════════════
// FACEBOOK MESSENGER
// ══════════════════════════════════════════════════════════════
async function sendFBMessage(recipientId, text) {
  const token = META_PAGE_TOKEN;
  if (!token) { console.error('META_PAGE_TOKEN no configurado'); return false; }

  const url = `https://graph.facebook.com/v21.0/me/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
      access_token: token
    })
  });
  const respText = await response.text();
  if (!response.ok) console.error('FB send error:', response.status, respText);
  else console.log('[FB send OK]', respText);
  return response.ok;
}

async function handleMessenger(body) {
  const entry = body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  if (!messaging) return { status: 'no_messaging' };

  // Ignorar echoes (mensajes enviados por la página)
  if (messaging.message?.is_echo) return { status: 'echo_ignored' };

  const senderId = messaging.sender?.id;
  const text = messaging.message?.text;

  if (!senderId || !text) {
    if (senderId && messaging.message?.attachments) {
      await sendFBMessage(senderId, '¡Hola! Por el momento solo puedo leer mensajes de texto. ¿En qué te puedo ayudar? 😊');
    }
    return { status: 'non_text', channel: 'messenger' };
  }

  console.log(`[FB] ${senderId}: "${text}"`);

  // Indicador de typing
  await fetch(`https://graph.facebook.com/v21.0/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: senderId },
      sender_action: 'typing_on',
      access_token: META_PAGE_TOKEN
    })
  }).catch(() => {});

  const aiResponse = await processIncoming('fb', senderId, 'Cliente Facebook', text);
  const sent = await sendFBMessage(senderId, aiResponse);
  return { status: 'processed', channel: 'messenger', from: senderId, sent };
}

// ══════════════════════════════════════════════════════════════
// INSTAGRAM DM
// ══════════════════════════════════════════════════════════════
async function sendIGMessage(recipientId, text) {
  const token = META_PAGE_TOKEN;
  if (!token) { console.error('META_PAGE_TOKEN no configurado'); return false; }

  const url = `https://graph.facebook.com/v21.0/me/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
      access_token: token
    })
  });
  if (!response.ok) console.error('IG send error:', response.status, await response.text());
  return response.ok;
}

async function handleInstagram(body) {
  const entry = body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  if (!messaging) return { status: 'no_messaging' };

  if (messaging.message?.is_echo) return { status: 'echo_ignored' };

  const senderId = messaging.sender?.id;
  const text = messaging.message?.text;

  if (!senderId || !text) {
    if (senderId && messaging.message?.attachments) {
      await sendIGMessage(senderId, '¡Hola! Por el momento solo puedo leer mensajes de texto. ¿En qué te puedo ayudar? 😊');
    }
    return { status: 'non_text', channel: 'instagram' };
  }

  console.log(`[IG] ${senderId}: "${text}"`);

  const aiResponse = await processIncoming('ig', senderId, 'Cliente Instagram', text);
  const sent = await sendIGMessage(senderId, aiResponse);
  return { status: 'processed', channel: 'instagram', from: senderId, sent };
}

// ══════════════════════════════════════════════════════════════
// VERIFICAR FIRMA (fail-closed)
// ══════════════════════════════════════════════════════════════
function verifySignature(req, rawBody) {
  // Sin secret configurado: rechazar (fail-closed) en vez de aceptar todo.
  if (!META_APP_SECRET) {
    console.error('META_APP_SECRET no configurado — rechazando webhook');
    return false;
  }
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;
  // HMAC sobre los bytes crudos exactos que envió Meta. Reserializar
  // req.body NO reproduce los bytes (emojis/acentos/orden) → firma falla.
  const body = rawBody != null ? rawBody
    : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(body).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  // timingSafeEqual lanza si difieren las longitudes → comparar antes
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

// ── Leer body crudo (necesario para validar la firma HMAC) ──
// Strictly-improving: si la plataforma ya consumió el stream,
// devuelve '' y el llamador cae al comportamiento anterior.
async function readRawBody(req) {
  try {
    if (req.rawBody) return req.rawBody.toString('utf8');
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return '';
  }
}

// ══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  // ── GET: Verificación del Webhook de Meta (mismo para WA/FB/IG) ──
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (!VERIFY_TOKEN) {
      console.error('WHATSAPP_VERIFY_TOKEN no configurado');
      return res.status(500).json({ error: 'Servidor mal configurado' });
    }

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verificado correctamente');
      return res.status(200).send(challenge);
    }

    return res.status(403).json({ error: 'Verificación fallida' });
  }

  // ── POST: Mensaje entrante ──
  if (req.method === 'POST') {
    try {
      // Leer bytes crudos para validar la firma. Fallback a req.body si
      // la plataforma ya consumió el stream (mejora estricta).
      let raw = await readRawBody(req);
      let body;
      if (raw) {
        try { body = JSON.parse(raw); } catch { body = null; }
      } else if (req.body) {
        body = req.body;
        raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      if (!verifySignature(req, raw)) {
        console.error('Firma inválida — posible falsificación');
        return res.status(403).json({ error: 'Firma inválida' });
      }

      if (!body?.object) return res.status(200).json({ status: 'no_object' });

      let result;

      switch (body.object) {
        case 'whatsapp_business_account':
          result = await handleWhatsApp(body);
          break;

        case 'page':
          result = await handleMessenger(body);
          break;

        case 'instagram':
          result = await handleInstagram(body);
          break;

        default:
          console.log(`Objeto desconocido: ${body.object}`);
          result = { status: 'unknown_object', object: body.object };
      }

      return res.status(200).json(result);

    } catch (error) {
      console.error('Error procesando mensaje:', error);
      return res.status(200).json({ status: 'error', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

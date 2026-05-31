// ============================================================
// KONVERSA CRM - WhatsApp Webhook + Claude AI Agent
// ============================================================
// Este archivo conecta:
// 1. WhatsApp Business API (Meta Cloud API)
// 2. Claude AI (Anthropic Haiku 4.5)
// 3. Konversa CRM (frontend)
//
// Deploy: Vercel Serverless Function (api/webhook.js)
// ============================================================

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'konversa_verify_2024';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

// ── System Prompt del Agente IA PINGUS ──────────────────────
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

// ── Almacén de conversaciones en memoria ─────────────────────
// En producción usarías una base de datos (Supabase, Redis, etc.)
const conversations = new Map();

function getConversation(phoneNumber) {
  if (!conversations.has(phoneNumber)) {
    conversations.set(phoneNumber, []);
  }
  return conversations.get(phoneNumber);
}

function addMessage(phoneNumber, role, content) {
  const conv = getConversation(phoneNumber);
  conv.push({ role, content });
  // Mantener solo últimos 20 mensajes para no exceder tokens
  if (conv.length > 20) {
    conv.splice(0, conv.length - 20);
  }
  return conv;
}

// ── Llamar a Claude API ─────────────────────────────────────
async function callClaude(phoneNumber, userMessage) {
  const messages = addMessage(phoneNumber, 'user', userMessage);
  
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
      messages: messages
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Claude API error:', response.status, errorText);
    return 'Disculpa, tengo un problema técnico. Te conecto con un asesor. Un momento 🔄';
  }
  
  const data = await response.json();
  const assistantMessage = data.content[0]?.text || 'Disculpa, no pude procesar tu mensaje.';
  
  // Guardar respuesta del asistente en el historial
  addMessage(phoneNumber, 'assistant', assistantMessage);
  
  return assistantMessage;
}

// ── Enviar mensaje por WhatsApp ─────────────────────────────
async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: text }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('WhatsApp send error:', response.status, errorText);
  }
  
  return response.ok;
}

// ── Marcar mensaje como leído ───────────────────────────────
async function markAsRead(messageId) {
  const url = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;
  
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    })
  }).catch(err => console.error('Mark as read error:', err));
}

// ── Handler principal (Vercel Serverless) ───────────────────
export default async function handler(req, res) {
  // ── GET: Verificación del Webhook de Meta ──
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verificado correctamente');
      return res.status(200).send(challenge);
    }
    
    console.log('❌ Verificación fallida - token incorrecto');
    return res.status(403).json({ error: 'Verificación fallida' });
  }
  
  // ── POST: Mensaje entrante de WhatsApp ──
  if (req.method === 'POST') {
    try {
      const body = req.body;
      
      // Verificar que es un mensaje de WhatsApp
      if (!body?.object || body.object !== 'whatsapp_business_account') {
        return res.status(200).json({ status: 'not_whatsapp' });
      }
      
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      
      // Verificar que hay mensajes
      if (!value?.messages || value.messages.length === 0) {
        return res.status(200).json({ status: 'no_messages' });
      }
      
      const message = value.messages[0];
      const from = message.from; // Número del cliente
      const messageId = message.id;
      const contactName = value.contacts?.[0]?.profile?.name || 'Cliente';
      
      console.log(`📩 Mensaje de ${contactName} (${from}): ${message.type}`);
      
      // Marcar como leído
      await markAsRead(messageId);
      
      // Solo procesar mensajes de texto
      if (message.type !== 'text') {
        await sendWhatsAppMessage(from, 
          '¡Hola! Por el momento solo puedo leer mensajes de texto. ¿En qué te puedo ayudar? 😊'
        );
        return res.status(200).json({ status: 'non_text_handled' });
      }
      
      const userText = message.text.body;
      console.log(`💬 Texto: "${userText}"`);
      
      // Obtener respuesta de Claude
      const aiResponse = await callClaude(from, userText);
      console.log(`🤖 Respuesta IA: "${aiResponse.substring(0, 100)}..."`);
      
      // Enviar respuesta por WhatsApp
      const sent = await sendWhatsAppMessage(from, aiResponse);
      
      return res.status(200).json({ 
        status: 'processed',
        from: from,
        sent: sent
      });
      
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error);
      return res.status(200).json({ status: 'error', message: error.message });
    }
  }
  
  // ── Otros métodos ──
  return res.status(405).json({ error: 'Método no permitido' });
}

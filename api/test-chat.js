// ============================================================
// KONVERSA CRM - Test Chat con Claude AI
// ============================================================
// Endpoint para probar el agente IA ANTES de conectar WhatsApp
// URL: https://konversa-crm.vercel.app/api/test-chat
// ============================================================

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://konversa-crm.vercel.app').split(',');

const rateLimitMap = new Map();
function rateLimit(ip, maxReqs = 20, windowMs = 60000) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > windowMs) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= maxReqs;
}

const SYSTEM_PROMPT = `Eres PINGUS ASISTENTE, el chatbot de ventas de Grupo PINGUS, empresa mexicana de purificadores de aire y agua con tecnologia de ozono.

CATALOGO:
1. Generador OZONO CIR - $1,995 MXN - Inteligente, ideal 20-50 m2
2. Generador ULTRA 150 - $1,795 MXN - Portatil, ideal 50-100 m2
3. Generador ULTRA 200 - $2,495 MXN - Mayor capacidad, ideal 100-200 m2
4. Modulo Air CK30 UVC - $8,500 MXN - UV-C para clinicas
5. AQUA 1000 - $3,200 MXN - Agua+aire para negocios
6. AQUA HOME - $1,495 MXN - Agua domestico

PAUTAS: Maximo 3 lineas. Habla de tu. Pide m2 antes de recomendar. Recomendacion = NOMBRE + PRECIO.`;

const testConversations = new Map();

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!rateLimit(clientIp)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en 1 minuto.' });
  }

  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'Falta message' });
    if (!CLAUDE_API_KEY) return res.status(500).json({ error: 'CLAUDE_API_KEY no configurada' });
    const sid = sessionId || 'test-default';
    if (!testConversations.has(sid)) testConversations.set(sid, []);
    const messages = testConversations.get(sid);
    messages.push({ role: 'user', content: message });
    if (messages.length > 20) messages.splice(0, messages.length - 20);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 300, system: SYSTEM_PROMPT, messages: messages })
    });
    if (!response.ok) { const e = await response.text(); return res.status(500).json({ error: 'Claude API error', details: e }); }
    const data = await response.json();
    const reply = data.content[0]?.text || 'No pude generar respuesta';
    messages.push({ role: 'assistant', content: reply });
    return res.status(200).json({ reply, sessionId: sid, model: CLAUDE_MODEL, tokens: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 } });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}

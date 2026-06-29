// ============================================================
// KONVERSA CRM - Test Chat con Claude AI
// ============================================================
// Endpoint para probar el agente IA ANTES de conectar WhatsApp
// URL: https://konversa-crm.vercel.app/api/test-chat
// ============================================================

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://konversa-crm.vercel.app').split(',');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_MESSAGE_LEN = 2000;

// Exige JWT de Supabase: endpoint autenticado (evita abuso de cuota Claude)
async function requireAuth(req) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

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
1. P4 - $1,490 MXN - Purificador de aire, hasta 30 m2 (dormitorios, oficinas, autos)
2. ULTRA 150 - $1,795 MXN - Generador de ozono 150 mg/h, hasta 50 m2 (mas vendido)
3. CIR 150 - $1,995 MXN - Generador de ozono inteligente 150 mg/h, hasta 50 m2
4. AQUA 500 - $1,450 MXN - Purificador de agua y aire, aire hasta 100 m2
5. AQUA 1000 - $1,650 MXN - Purificador de agua/aire con iones, aire hasta 150 m2
6. Klair UV (Air CK30 UVC) - $3,495 MXN - UNICO equipo con desinfeccion/esterilizacion UV-C; modulo que se instala en un MINISPLIT de 1 a 3 toneladas (12,000 a 36,000 BTUs) para purificar y desinfectar el aire

TECNOLOGIA POR PRODUCTO (NUNCA la inventes): El UNICO equipo con luz UV-C que desinfecta y esteriliza es el Klair UV. P4, ULTRA 150, CIR 150 y UTILITY O3 usan OZONO; AQUA 500/1000 purifican aire+agua. NUNCA digas que el P4 ni otro equipo desinfecta con UV-C: eso es falso.

RECOMENDACION PARA AIRE: hasta 30 m2 = P4; hasta 50 m2 = CIR 150 o ULTRA 150; Klair UV SOLO si el cliente tiene minisplit de 1 a 3 toneladas (12,000-36,000 BTUs), ya que se instala dentro del minisplit. Pregunta si tiene minisplit antes de recomendar el Klair UV; sin minisplit recomienda P4/CIR/ULTRA segun m2.

PRECIOS VIGENTES: Los precios de este CATALOGO son los unicos validos. Si en el historial aparece un precio distinto (P4 $2,190, ULTRA $1,985.99, CIR $2,200), estaba desactualizado: ignoralo y usa SIEMPRE el del catalogo.

MESES SIN INTERESES (MSI): Manejamos hasta 6 MSI con TODAS las tarjetas de credito. Ofrecelos en el momento oportuno: SOLO cuando detectes interes de compra (pregunta el precio o disponibilidad, dice "me interesa"/"lo quiero", o pide cotizacion), justo despues de dar el precio. Ejemplo: "Ademas, lo puedes diferir hasta a 6 meses sin intereses con cualquier tarjeta de credito." NUNCA lo menciones en el saludo ni antes de detectar interes.

PAUTAS: Maximo 3 lineas. Habla de tu. Pide m2 antes de recomendar. Recomendacion = NOMBRE + PRECIO. NUNCA uses la palabra "ambos"; ofrece "aire o agua".`;

// Lee la configuración del Agente IA (editable desde el CRM) y la combina
// con el prompt base para que la simulación refleje los cambios guardados.
let _agentCfg = null, _agentCfgAt = 0;
async function buildSystemPrompt() {
  try {
    if (!_agentCfg || (Date.now() - _agentCfgAt) >= 60000) {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return SYSTEM_PROMPT;
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = await sb.from('agent_settings').select('*').eq('id', 1).maybeSingle();
      _agentCfg = data || null;
      _agentCfgAt = Date.now();
    }
  } catch (e) { console.error('[TEST-CHAT] settings:', e.message); }
  const cfg = _agentCfg;
  if (!cfg) return SYSTEM_PROMPT;
  let extra = '';
  if (cfg.prompt && cfg.prompt.trim()) extra += `\n\nPERSONALIDAD Y ROL (configurado en el CRM):\n${cfg.prompt.trim()}`;
  if (Array.isArray(cfg.pautas) && cfg.pautas.length) extra += `\n\nPAUTAS OBLIGATORIAS:\n- ${cfg.pautas.join('\n- ')}`;
  if (cfg.tono) extra += `\n\nTono de voz: ${cfg.tono}.`;
  if (cfg.longitud) extra += ` Longitud de respuestas: ${cfg.longitud}.`;
  if (cfg.idioma) extra += ` Idioma: ${cfg.idioma}.`;
  return extra ? SYSTEM_PROMPT + extra : SYSTEM_PROMPT;
}

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

  const user = await requireAuth(req);
  if (!user) return res.status(401).json({ error: 'No autorizado' });

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!rateLimit(clientIp)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en 1 minuto.' });
  }

  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'Falta message' });
    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ error: 'Mensaje inválido o demasiado largo' });
    }
    if (!CLAUDE_API_KEY) return res.status(500).json({ error: 'CLAUDE_API_KEY no configurada' });
    const sid = sessionId || 'test-default';
    if (!testConversations.has(sid)) testConversations.set(sid, []);
    const messages = testConversations.get(sid);
    messages.push({ role: 'user', content: message });
    if (messages.length > 20) messages.splice(0, messages.length - 20);
    const systemPrompt = await buildSystemPrompt();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 300, system: systemPrompt, messages: messages })
    });
    if (!response.ok) { const e = await response.text(); return res.status(500).json({ error: 'Claude API error', details: e }); }
    const data = await response.json();
    const reply = data.content[0]?.text || 'No pude generar respuesta';
    messages.push({ role: 'assistant', content: reply });
    return res.status(200).json({ reply, sessionId: sid, model: CLAUDE_MODEL, tokens: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0 } });
  } catch (error) { return res.status(500).json({ error: error.message }); }
}

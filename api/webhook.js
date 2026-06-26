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
import { sendPushToAgents } from '../lib/push.js';

export const config = { api: { bodyParser: false } };

// Etiqueta legible del canal para las notificaciones push
const CHANNEL_LABEL = { wa: 'WhatsApp', fb: 'Messenger', ig: 'Instagram' };

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const META_PAGE_TOKEN = process.env.META_PAGE_TOKEN;
// ID de la página de Facebook. Si se define, los envíos de Messenger/Instagram
// usan {PAGE_ID}/messages en vez de me/messages. Esto es necesario cuando
// META_PAGE_TOKEN es un token de System User (con 'me' resolvería al system
// user, no a la página). Con un Page Access Token clásico, 'me' también sirve,
// por eso el fallback mantiene compatibilidad hacia atrás.
const META_PAGE_ID = process.env.META_PAGE_ID;
const MSG_TARGET = META_PAGE_ID || 'me';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
// Solo se llama a Claude si AI_ENABLED === 'true'. Mientras la API key
// no esté válida en Vercel, el bot responde con el fallback inteligente.
const AI_ENABLED = process.env.AI_ENABLED === 'true';
const META_APP_SECRET = process.env.META_APP_SECRET;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── System Prompt del Agente IA ───────────────────────────
const SYSTEM_PROMPT = `Eres PINGUS ASISTENTE, el chatbot de ventas de Grupo PINGUS – The Health Guardian, empresa mexicana especializada en purificadores de aire y agua con tecnología de ozono y UV-C.

DATOS CLAVE DE LA EMPRESA:
- Nombre: Grupo PINGUS – The Health Guardian
- Web: www.grupopingus.com
- WhatsApp Ventas: +52 981 751 1111
- Horario de atención humana: Lunes a Viernes, 9:00 – 19:00 (hora México)
- Envío: GRATIS a toda la República Mexicana, 2 días hábiles (DHL, Estafeta, FedEx o UPS con seguimiento)
- Garantía: 6 meses contra defectos de fábrica + soporte directo en México
- Pagos: Tarjeta crédito/débito, PayPal, Transferencia bancaria

TU FUNCIÓN PRINCIPAL (en orden de prioridad):
1. ESCUCHAR: Entiende qué espacio quiere purificar el cliente (aire o agua)
   REGLA DE LENGUAJE: NUNCA uses la palabra "ambos". Ofrece siempre las opciones como "aire o agua".
2. CALIFICAR: Pregunta los metros cuadrados (m²) del espacio ANTES de cualquier recomendación
3. RECOMENDAR: Sugiere el modelo exacto usando la tabla de recomendación por espacio
4. VENDER: Al recomendar SIEMPRE incluye: nombre del producto + precio en MXN + link directo
5. ESCALAR: Si hay intención de compra, solicitud de factura o pregunta compleja → transferir a asesor humano

CATÁLOGO DE PRODUCTOS:
1. Purificador de Aire P4 - $1,490 MXN - Espacios hasta 30 m² (dormitorios, oficinas, autos) - https://www.grupopingus.com/products/purificador-de-aire-p4
2. Generador ULTRA 150 - $1,795 MXN - Espacios hasta 50 m² (salas, restaurantes, salones) - https://www.grupopingus.com/products/generador-de-ozono-ultra-150-mg-h
3. Generador CIR 150 - $1,995 MXN - Espacios hasta 50 m² (casas, oficinas, consultorios) - https://www.grupopingus.com/products/generador-de-ozono-inteligente-cir-150-mgh
4. Purificador AQUA 500 - $1,450 MXN - Aire (100 m²) + Agua, ideal cocinas, consultorios, hogares - https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-500
5. Purificador AQUA 1000 - $1,650 MXN - Aire (150 m²) + Agua + Iones, ideal restaurantes, colegios - https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-1000
6. Klair UV - $3,495 MXN - ÚNICO equipo con desinfección/esterilización UV-C. Es un módulo UV-C que se instala en el MINISPLIT (aire acondicionado) de 1 a 3 toneladas (12,000 a 36,000 BTUs) para purificar y desinfectar el aire - https://www.grupopingus.com/products/modulo-de-desinfeccion-air-ck30-uvc

⚠️ TECNOLOGÍA POR PRODUCTO — REGLA CRÍTICA (NUNCA la inventes ni la mezcles):
- El ÚNICO equipo que desinfecta y esteriliza con luz UV-C es el Klair UV. Es el único producto con tecnología UV-C de todo el catálogo.
- Los demás equipos NO tienen UV-C. P4, ULTRA 150, CIR 150 y UTILITY O3 funcionan con OZONO. AQUA 500 y AQUA 1000 purifican aire + agua (ozono/filtración/iones), tampoco con UV-C.
- NUNCA digas que el P4, ULTRA 150, CIR 150, AQUA 500/1000 o cualquier otro equipo "desinfecta con UV-C" o tiene UV-C. Eso es FALSO. Solo el Klair UV.

⚠️ RECOMENDACIÓN PARA PURIFICAR/DESINFECTAR EL AIRE — REGLA CRÍTICA:
- Hasta 30 m²: P4 ($1,490 MXN).
- Hasta 50 m²: CIR 150 ($1,995 MXN) o ULTRA 150 ($1,795 MXN).
- Klair UV ($3,495 MXN): SOLO si el cliente tiene MINISPLIT (aire acondicionado) de 1 a 3 toneladas (12,000 a 36,000 BTUs). El Klair UV se instala dentro del minisplit; sin minisplit no aplica.
- Por lo tanto, antes de recomendar el Klair UV pregunta si tiene minisplit y de cuántas toneladas o BTUs. Si NO tiene minisplit, recomienda P4 / CIR 150 / ULTRA 150 según los m². NO recomiendes el Klair UV solo por ser clínica, consultorio o dentista si no tiene minisplit.

⚠️ PRECIOS VIGENTES — REGLA CRÍTICA: Los precios de este CATÁLOGO son los ÚNICOS válidos y actuales. Si en el historial de esta conversación aparece un precio DISTINTO para un producto (por ejemplo P4 a $2,190, ULTRA 150 a $1,985.99 o CIR 150 a $2,200), ese precio estaba DESACTUALIZADO: ignóralo por completo y cotiza SIEMPRE con el precio de este catálogo. Si un precio viejo ya se mencionó antes, corrígelo con naturalidad usando el precio vigente. NUNCA repitas un precio del historial que no coincida con este catálogo.

TABLA DE RECOMENDACIÓN:
- Dormitorio/oficina pequeña hasta 30 m² (aire): P4
- Casa/sala/consultorio hasta 50 m² (aire): CIR 150 o ULTRA 150
- Cocina/consultorio (aire+agua): AQUA 500
- Restaurante/colegio (aire+agua): AQUA 1000
- Cliente con minisplit de 1 a 3 toneladas (12,000–36,000 BTUs) que quiere desinfectar el aire con UV-C: Klair UV

REGLAS CRÍTICAS SOBRE METROS CUADRADOS (m²):
- Pregunta los m² UNA SOLA VEZ por conversación. Si ya los preguntaste antes, NO repitas la pregunta.
- Si el cliente ya respondió con un número (ej: "36", "20"), ESE ES el área en m². Recomienda directamente.
- Si el cliente escribe DOS números seguidos (ej: "5 6", "20 30", "4x5"), son las dimensiones (largo × ancho). Multiplícalos y recomienda directamente.
- NUNCA vuelvas a preguntar los m² si el cliente ya los proporcionó en mensajes anteriores.

PAUTAS DE COMUNICACIÓN (OBLIGATORIAS):
- Máximo 3 líneas por mensaje. NUNCA bloques de texto largos.
- NUNCA repitas el saludo si ya saludaste en la conversación.
- Habla siempre de "tú". NUNCA digas "usted".
- Cada recomendación debe incluir: NOMBRE + PRECIO + LINK.
- Si el cliente pregunta por un espacio, pide m² ANTES de sugerir (solo si aún no los tienes).
- Si no tienes la información, di: "Te conecto con un asesor para darte el dato exacto" y transfiere.
- No uses emojis en más de 1 de cada 3 mensajes.
- Cierra firmando "Equipo PINGUS – The Health Guardian" SOLO cuando entregues info clave.

PALABRAS PROHIBIDAS (NUNCA las uses):
sinergia, paradigma, apalancamiento, "es menester", "cabe señalar", "en el panorama actual"

MANEJO DE OBJECIONES:
- "Es caro" → Garantía 6 meses + soporte México + envío gratis
- "¿Es seguro el ozono?" → Sí, nuestros equipos generan de 100 a 150 mg/h de ozono por periodos cortos, así que SÍ puedes estar en el espacio mientras funciona. Es completamente seguro.
- "Vi uno más barato en Amazon" → Garantía oficial + soporte directo + envío gratis 2 días
- Si pide descuento → Transferir a asesor humano

TRANSFERIR A HUMANO cuando:
- El cliente dice "lo quiero", "cómo pago", "lo compro"
- Pide factura o datos fiscales
- Pide descuento
- Pregunta compleja fuera de tus fuentes
En estos casos responde: "¡Perfecto! Te conecto con un asesor de Grupo PINGUS para ayudarte. Un momento 🔄"
Si está fuera de horario (Lun-Vie 9:00-19:00): "Te responde un asesor en horario hábil a partir de las 9:00."`;

// ── Respuestas de fallback por keyword (cuando Claude API no responde) ──
const FALLBACK_RESPONSES = {
  'hola': '¡Hola! Soy el asistente de PINGUS – The Health Guardian. ¿Qué espacio quieres purificar: aire o agua?',
  'buenos': '¡Hola! Soy el asistente de PINGUS. ¿En qué te puedo ayudar?',
  'buenas': '¡Hola! Soy el asistente de PINGUS. ¿En qué te puedo ayudar?',
  'precio': 'Nuestros equipos van de $1,450 a $3,495 MXN. ¿Quieres que te recomiende uno según tu espacio?',
  'catálogo': 'Tenemos: P4 ($1,490 / 30m²), ULTRA 150 ($1,795 / 50m²), CIR 150 ($1,995 / 50m²), AQUA 500 ($1,450 / 100m²), AQUA 1000 ($1,650 / 150m²) y Klair UV ($3,495 / módulo UV-C para minisplit). ¿Cuántos m² tiene tu espacio?',
  'catalogo': 'Tenemos: P4 ($1,490 / 30m²), ULTRA 150 ($1,795 / 50m²), CIR 150 ($1,995 / 50m²), AQUA 500 ($1,450 / 100m²), AQUA 1000 ($1,650 / 150m²) y Klair UV ($3,495 / módulo UV-C para minisplit). ¿Cuántos m² tiene tu espacio?',
  'klair': 'El Klair UV cuesta $3,495 MXN. Es el módulo UV-C que se instala en tu minisplit (1 a 3 toneladas / 12,000–36,000 BTUs) para purificar y desinfectar el aire. ¿Tienes minisplit? Link: https://www.grupopingus.com/products/modulo-de-desinfeccion-air-ck30-uvc',
  'uv': 'El Klair UV cuesta $3,495 MXN. Es el único equipo con desinfección UV-C: se instala en un minisplit de 1 a 3 toneladas (12,000–36,000 BTUs). ¿Tienes minisplit?',
  'minisplit': 'El Klair UV ($3,495 MXN) es el módulo UV-C que se instala en tu minisplit (1 a 3 toneladas / 12,000–36,000 BTUs) para purificar y desinfectar el aire. Link: https://www.grupopingus.com/products/modulo-de-desinfeccion-air-ck30-uvc',
  'dentista': 'Para purificar el aire de tu consultorio recomiendo según los m²: P4 ($1,490 / 30m²) o CIR 150 ($1,995 / 50m²). Si tienes minisplit, el Klair UV ($3,495 MXN) lo desinfecta con UV-C. ¿Cuántos m² tiene y tienes minisplit?',
  'clínica': 'Para purificar el aire recomiendo según los m²: P4 ($1,490 / 30m²) o CIR 150 ($1,995 / 50m²). Si tienes minisplit, el Klair UV ($3,495 MXN) lo desinfecta con UV-C. ¿Cuántos m² tiene y tienes minisplit?',
  'clinica': 'Para purificar el aire recomiendo según los m²: P4 ($1,490 / 30m²) o CIR 150 ($1,995 / 50m²). Si tienes minisplit, el Klair UV ($3,495 MXN) lo desinfecta con UV-C. ¿Cuántos m² tiene y tienes minisplit?',
  'envío': 'El envío es GRATIS a toda la República Mexicana. Llega en 2 días hábiles por DHL, Estafeta, FedEx o UPS con seguimiento incluido.',
  'envio': 'El envío es GRATIS a toda la República Mexicana. Llega en 2 días hábiles con seguimiento.',
  'garantía': 'Todos nuestros equipos tienen 6 meses de garantía contra defectos de fábrica y soporte directo en México.',
  'garantia': 'Todos nuestros equipos tienen 6 meses de garantía contra defectos de fábrica y soporte directo en México.',
  'pago': 'Puedes pagar con tarjeta de crédito/débito, PayPal o transferencia bancaria. Compra 100% segura.',
  'factura': 'Para facturación te conecto con un asesor que te apoya con tus datos fiscales. Un momento... 🔄',
  'comprar': '¡Perfecto! Te conecto con un asesor para finalizar tu compra. Un momento... 🔄',
  'quiero': '¡Perfecto! Te conecto con un asesor en un momento. ¿Me confirmas tu nombre?',
  'p4': 'El P4 cuesta $1,490 MXN. Purificador de aire para espacios hasta 30 m². Link: https://www.grupopingus.com/products/purificador-de-aire-p4',
  'ultra': 'El ULTRA 150 cuesta $1,795 MXN, cubre 50 m². Link: https://www.grupopingus.com/products/generador-de-ozono-ultra-150-mg-h',
  'cir': 'El CIR 150 cuesta $1,995 MXN, cubre 50 m². Link: https://www.grupopingus.com/products/generador-de-ozono-inteligente-cir-150-mgh',
  'aqua 500': 'El AQUA 500 cuesta $1,450 MXN. Purifica aire (100 m²) y agua. Link: https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-500',
  'aqua 1000': 'El AQUA 1000 cuesta $1,650 MXN, cubre 150 m² + iones. Link: https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-1000',
  'ozono': 'Nuestros equipos generan de 100 a 150 mg/h de ozono por periodos cortos. Puedes estar en el espacio mientras funciona. Elimina bacterias, virus, hongos y olores. ¿Te interesa para algún espacio en particular?',
  'seguro': 'Sí, nuestros equipos generan de 100 a 150 mg/h por periodos cortos, así que puedes estar en el espacio mientras funciona. Es completamente seguro.',
  'caro': 'Nuestros equipos incluyen garantía de 6 meses, soporte directo en México y envío gratis. ¿Quieres que comparemos con lo que necesitas?',
  'descuento': 'Para descuentos especiales te conecto con un asesor. Un momento... 🔄',
  'aire': 'Para purificar aire necesito saber los m² de tu espacio. ¿Es pequeño (hasta 30 m²), mediano (50-100 m²) o grande (150+ m²)?',
  'agua': 'Para purificar agua tenemos: AQUA 500 ($1,450 MXN / aire 100m² + agua) y AQUA 1000 ($1,650 MXN / aire 150m² + agua + iones). ¿Cuántos m² tiene tu espacio?',
  'ambos': 'Para purificar aire y agua tenemos: AQUA 500 ($1,450 MXN / 100m²) y AQUA 1000 ($1,650 MXN / 150m²). ¿Cuántos m² tiene tu espacio?',
  'casa': 'Para casa te recomiendo el CIR 150 ($1,995 MXN) si es hasta 50 m², o el AQUA 500 ($1,450 MXN) si también quieres purificar agua. ¿Cuántos m² tiene tu espacio?',
  'oficina': 'Para oficinas el modelo ideal depende de los m². ¿Cuántos metros cuadrados tiene tu oficina?',
  'restaurante': 'Para restaurantes recomiendo el AQUA 1000 ($1,650 MXN) que cubre 150 m² y purifica aire + agua. ¿Cuántos m² tiene el local?',
  'consultorio': 'Para consultorios recomiendo según los m²: P4 ($1,490 / 30m²) o CIR 150 ($1,995 / 50m²). Si tienes minisplit, el Klair UV ($3,495 MXN) lo desinfecta con UV-C. ¿Cuántos m² tiene y tienes minisplit?',
  'hospital': 'Para purificar el aire recomiendo según los m²: P4 ($1,490 / 30m²) o CIR 150 ($1,995 / 50m²). Si tienes minisplit, el Klair UV ($3,495 MXN) lo desinfecta con UV-C. ¿Cuántos m² tiene y tienes minisplit?',
  'gracias': 'Con gusto. Si necesitas más información, aquí estoy. Equipo PINGUS – The Health Guardian.',
  'sí': 'Perfecto, cuéntame más sobre tu espacio y te recomiendo el equipo ideal.',
  'si': 'Perfecto, cuéntame más sobre tu espacio y te recomiendo el equipo ideal.',
  'no': 'Entendido. Si cambias de opinión o tienes alguna duda, aquí estoy para ayudarte.',
  'información': 'Con gusto te ayudo. ¿Qué espacio quieres purificar: aire o agua? ¿Cuántos m² tiene?',
  'info': 'Con gusto te ayudo. ¿Qué espacio quieres purificar: aire o agua? ¿Cuántos m² tiene?',
  'purificador': 'Tenemos purificadores de aire desde $1,490 MXN y de agua+aire desde $1,450 MXN. ¿Qué espacio necesitas purificar?',
};

// Recomienda el equipo ideal según m² y si quiere purificar agua
function recommendByArea(area, wantsWater) {
  if (wantsWater) {
    if (area <= 100) return 'el AQUA 500 ($1,450 MXN), purifica aire (hasta 100 m²) + agua. Link: https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-500';
    return 'el AQUA 1000 ($1,650 MXN), cubre 150 m² + agua + iones. Link: https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-1000';
  }
  if (area <= 30) return 'el P4 ($1,490 MXN), purificador de aire para espacios hasta 30 m². Link: https://www.grupopingus.com/products/purificador-de-aire-p4';
  if (area <= 50) return 'el CIR 150 ($1,995 MXN) o el ULTRA 150 ($1,795 MXN), ideales hasta 50 m². Link: https://www.grupopingus.com/products/generador-de-ozono-inteligente-cir-150-mgh';
  if (area <= 100) return 'el AQUA 500 ($1,450 MXN), cubre hasta 100 m² y purifica aire + agua. Link: https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-500';
  return 'el AQUA 1000 ($1,650 MXN), cubre hasta 150 m² + iones. Link: https://www.grupopingus.com/products/purificador-de-agua-aire-aqua-1000';
}

// Fallback inteligente: usa el mensaje actual + historial para detectar
// m², intención de agua y contexto médico, y recomendar directamente.
function fallbackReply(text, history = []) {
  const cur = (text || '').toLowerCase();
  const ctx = (history.filter(m => m.role === 'user').map(m => m.content).join(' ') + ' ' + text).toLowerCase();

  // ── Detectar metros cuadrados ──
  let area = null;
  const dim = cur.match(/(\d{1,4})\s*[x×]\s*(\d{1,4})/); // "5x6", "4 x 5"
  if (dim) {
    area = parseInt(dim[1], 10) * parseInt(dim[2], 10);
  } else {
    const nums = cur.match(/\d{1,4}/g);
    if (nums) area = parseInt(nums[0], 10);
  }

  const wantsWater = /agua/.test(ctx);
  // El Klair UV (UV-C) se instala en un minisplit de 1 a 3 toneladas (12,000–36,000 BTUs).
  // Solo se recomienda cuando el cliente menciona que tiene minisplit / esos BTUs / toneladas.
  const hasMinisplit = /(mini\s?split|minisplit|aire acondicionado|\d{1,3}\s?(ton|tonelada)|1[2-9][.,]?\d{3}\s?btu|[23][0-9][.,]?\d{3}\s?btu|\bbtus?\b)/.test(ctx);

  if (hasMinisplit) {
    return `El Klair UV ($3,495 MXN) es el módulo UV-C que se instala en tu minisplit (1 a 3 toneladas / 12,000–36,000 BTUs) para desinfectar el aire. Link: https://www.grupopingus.com/products/modulo-de-desinfeccion-air-ck30-uvc`;
  }

  if (area && area > 0 && area < 2000) {
    return `Para ${area} m² te recomiendo ${recommendByArea(area, wantsWater)}`;
  }

  // ── Respuesta por keyword ──
  for (const key in FALLBACK_RESPONSES) {
    if (cur.includes(key)) return FALLBACK_RESPONSES[key];
  }
  return 'Gracias por tu mensaje. Para recomendarte el equipo ideal, cuéntame: ¿qué espacio quieres purificar (aire o agua) y cuántos m² tiene?';
}

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

// ── Configuración del Agente IA (editable desde el CRM) ───────
// Se cachea ~60s para no consultar Supabase en cada mensaje.
let _agentCfg = null;
let _agentCfgAt = 0;
async function getAgentSettings() {
    if (_agentCfg && (Date.now() - _agentCfgAt) < 60000) return _agentCfg;
    try {
        const sb = await getSupabase();
        if (!sb) return null;
        const { data } = await sb.from('agent_settings').select('*').eq('id', 1).maybeSingle();
        _agentCfg = data || null;
        _agentCfgAt = Date.now();
    } catch (e) {
        console.error('[AGENT] getAgentSettings:', e.message);
    }
    return _agentCfg;
}

// Construye el system prompt combinando la base (catálogo, reglas) con la
// personalidad e instrucciones que el usuario configura en el CRM.
async function buildSystemPrompt() {
    const cfg = await getAgentSettings();
    if (!cfg) return SYSTEM_PROMPT;
    let extra = '';
    if (cfg.prompt && cfg.prompt.trim()) extra += `\n\nPERSONALIDAD Y ROL (configurado en el CRM):\n${cfg.prompt.trim()}`;
    if (Array.isArray(cfg.pautas) && cfg.pautas.length) extra += `\n\nPAUTAS OBLIGATORIAS:\n- ${cfg.pautas.join('\n- ')}`;
    if (cfg.tono) extra += `\n\nTono de voz: ${cfg.tono}.`;
    if (cfg.longitud) extra += ` Longitud de respuestas: ${cfg.longitud}.`;
    if (cfg.idioma) extra += ` Idioma: ${cfg.idioma}.`;
    return extra ? SYSTEM_PROMPT + extra : SYSTEM_PROMPT;
}

// ── Resolver / crear contacto por canal+handle (atómico vía RPC) ──
async function resolveContact(sb, channel, handle, name) {
    const phone = channel === 'wa' ? handle : null;
    const { data, error } = await sb.rpc('resolve_contact_atomic', {
          p_channel: channel, p_handle: handle, p_name: name || 'Cliente', p_phone: phone
    }).maybeSingle();
    if (error) {
          console.error('resolveContact RPC error:', error);
          return null;
    }
    if (!data) return null;
    return { id: data.contact_id, channels: data.contact_channels };
}

// ── Resolver / crear conversación por contacto+canal (atómico vía RPC) ──
async function resolveConversation(sb, contactId, channel) {
    const { data, error } = await sb.rpc('resolve_conversation_atomic', {
          p_contact_id: contactId, p_channel: channel
    });
    if (error) {
          console.error('resolveConversation RPC error:', error);
          return null;
    }
    return data;
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
      .filter(m => m.sender === 'in' || m.sender === 'customer' || m.sender === 'out' || m.sender === 'ai')
      .map(m => ({ role: (m.sender === 'in' || m.sender === 'customer') ? 'user' : 'assistant', content: m.content }));
}

// ── Claude API ────────────────────────────────────────────
async function callClaude(history, userMessage) {
    if (!AI_ENABLED) {
        console.log('[CLAUDE] Deshabilitado (AI_ENABLED!=true) — usando fallback inteligente');
        return null;
    }
    if (!CLAUDE_API_KEY) {
        console.error('[CLAUDE] API_KEY no configurada — usando fallback');
        return null;
    }
    console.log('[CLAUDE] Llamando API con modelo:', CLAUDE_MODEL, '| key prefix:', CLAUDE_API_KEY.substring(0, 12) + '...');

    const messages = [...history, { role: 'user', content: userMessage }];
    while (messages.length && messages[0].role !== 'user') messages.shift();

    const systemPrompt = await buildSystemPrompt();

  try {
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
                  system: systemPrompt,
                  messages
          })
    });

    if (!response.ok) {
          const errorText = await response.text();
          console.error('[CLAUDE] API error:', response.status, errorText.substring(0, 500));
          return null;
    }

    const data = await response.json();
    const reply = data.content[0]?.text || null;
    console.log('[CLAUDE] Respuesta OK:', reply ? reply.substring(0, 80) + '...' : 'null');
    return reply;
  } catch (err) {
    console.error('[CLAUDE] Fetch exception:', err.message);
    return null;
  }
}

// ── Orquestador: persiste entrante, llama IA, persiste salida ──
async function processIncoming(channel, handle, name, text) {
    const sb = await getSupabase();
    if (!sb) {
        const aiReply = await callClaude([], text);
        return aiReply || fallbackReply(text);
    }
    const contact = await resolveContact(sb, channel, handle, name);
    if (!contact) {
        const aiReply = await callClaude([], text);
        return aiReply || fallbackReply(text);
    }

  const convId = await resolveConversation(sb, contact.id, channel);
    if (!convId) {
        const aiReply = await callClaude([], text);
        return aiReply || fallbackReply(text);
    }

  const history = await loadHistory(sb, convId);
    await persistMessage(sb, convId, channel, 'customer', text);
    await sb.from('contacts').update({updated_at:new Date().toISOString()}).eq('id',contact.id);

  // Notificar a los agentes (push real, incluso con la app cerrada).
  // Corre en paralelo con Claude; se espera al final para que termine
  // antes de que el serverless se congele.
    const pushPromise = sendPushToAgents(sb, {
        title: `${name} · ${CHANNEL_LABEL[channel] || 'Mensaje'}`,
        body: text.length > 120 ? text.slice(0, 120) + '…' : text,
        contactId: contact.id
    }).catch(e => console.warn('[PUSH]', e?.message));

  const reply = await callClaude(history, text);
    const finalReply = reply || fallbackReply(text, history);
    await persistMessage(sb, convId, channel, 'ai', finalReply);
    await pushPromise;
    return finalReply;
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

  const url = `https://graph.facebook.com/v21.0/${MSG_TARGET}/messages`;
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

  await fetch(`https://graph.facebook.com/v21.0/${MSG_TARGET}/messages`, {
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

  const url = `https://graph.facebook.com/v21.0/${MSG_TARGET}/messages`;
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
    if (!META_APP_SECRET) {
          console.error('META_APP_SECRET no configurado — rechazando webhook');
          return false;
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) return false;
    const body = rawBody != null ? rawBody
          : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
    const expected = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(body).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
}

// ── Leer body crudo ──
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

  if (req.method === 'POST') {
        try {
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

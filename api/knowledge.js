// ============================================================
// KONVERSA CRM - Base de Conocimiento (Google Docs)
// ============================================================
// Sincroniza el contenido de los Google Docs que alimentan al
// agente de IA y lo guarda en la tabla `knowledge_sources`.
//
// Endpoints:
//   GET  /api/knowledge                       → Cron diario (Bearer CRON_SECRET)
//   POST /api/knowledge { action: 'sync' }    → Forzar resincronización (todas o un doc_id)
//   POST /api/knowledge { action: 'status' }  → Estado de las fuentes
//   POST /api/knowledge { action: 'set-auto-sync', doc_id, enabled }
//                                             → Activar/desactivar resync diario
//
// Auth POST: JWT de Supabase (admin) o cabecera x-internal-key.
// Auth GET (cron): cabecera Authorization: Bearer <CRON_SECRET>.
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Autenticación para POST (JWT admin de Supabase o clave interna) ──
async function requireAuth(req, sb) {
  const headerKey = req.headers['x-internal-key'];
  if (INTERNAL_API_KEY && headerKey && headerKey === INTERNAL_API_KEY) {
    return { internal: true };
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// ── Cron diario: valida el secreto de Vercel Cron ──
function isAuthorizedCron(req) {
  if (!CRON_SECRET) return false;
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return token === CRON_SECRET;
}

// ── Descargar un Google Doc como texto plano ──
// Requiere que el documento esté compartido como "cualquiera con el enlace".
async function fetchGoogleDoc(docId) {
  const url = `https://docs.google.com/document/d/${encodeURIComponent(docId)}/export?format=txt`;
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) {
    throw new Error(`Google Docs ${resp.status}: no se pudo descargar el documento (¿está compartido como público?)`);
  }
  const text = await resp.text();
  // Si Google devuelve HTML (login/permiso) en vez del texto, es un doc privado.
  const head = text.slice(0, 200).toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html')) {
    throw new Error('El documento no es accesible públicamente. Compártelo como "cualquiera con el enlace puede ver".');
  }
  return text.replace(/\r\n/g, '\n').trim();
}

// ── Sincronizar una fuente ──
async function syncSource(sb, source) {
  try {
    const content = await fetchGoogleDoc(source.doc_id);
    const { error } = await sb.from('knowledge_sources')
      .update({
        content,
        char_count: content.length,
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'ok',
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', source.id);
    if (error) throw new Error(error.message);
    return { doc_id: source.doc_id, title: source.title, status: 'ok', char_count: content.length };
  } catch (err) {
    await sb.from('knowledge_sources')
      .update({
        last_sync_status: 'error',
        last_sync_error: String(err.message || err).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq('id', source.id);
    return { doc_id: source.doc_id, title: source.title, status: 'error', error: String(err.message || err) };
  }
}

// ── Sincronizar todas las fuentes activas (opcionalmente filtradas) ──
async function syncAll(sb, { docId = null, onlyAutoSync = false } = {}) {
  let q = sb.from('knowledge_sources').select('*').eq('is_active', true);
  if (docId) q = q.eq('doc_id', docId);
  if (onlyAutoSync) q = q.eq('auto_sync', true);
  const { data: sources, error } = await q;
  if (error) throw new Error(error.message);
  if (!sources || sources.length === 0) {
    return { synced: 0, results: [] };
  }
  const results = [];
  for (const source of sources) {
    results.push(await syncSource(sb, source));
  }
  const ok = results.filter((r) => r.status === 'ok').length;
  return { synced: ok, total: results.length, results };
}

// ── Estado de las fuentes (sin volcar el contenido completo) ──
async function getStatus(sb) {
  const { data, error } = await sb.from('knowledge_sources')
    .select('doc_id, title, url, is_active, auto_sync, last_synced_at, last_sync_status, last_sync_error, char_count')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase no configurado' });
  }

  // ── GET: cron diario de Vercel ──
  if (req.method === 'GET') {
    if (!isAuthorizedCron(req)) {
      return res.status(401).json({ error: 'No autorizado (cron)' });
    }
    try {
      const sb = await getSupabase();
      const result = await syncAll(sb, { onlyAutoSync: true });
      console.log('[KNOWLEDGE] Cron sync:', JSON.stringify(result));
      return res.status(200).json({ status: 'ok', source: 'cron', ...result });
    } catch (error) {
      console.error('[KNOWLEDGE] Cron error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ── POST: acciones desde la app ──
  if (req.method === 'POST') {
    try {
      const { action, doc_id, enabled } = req.body || {};
      if (!action) return res.status(400).json({ error: 'Falta action' });

      const sb = await getSupabase();
      const auth = await requireAuth(req, sb);
      if (!auth) return res.status(401).json({ error: 'No autorizado' });

      switch (action) {
        case 'sync': {
          const result = await syncAll(sb, { docId: doc_id || null });
          return res.status(200).json({ status: 'ok', ...result });
        }
        case 'status': {
          const sources = await getStatus(sb);
          return res.status(200).json({ status: 'ok', sources });
        }
        case 'set-auto-sync': {
          if (!doc_id) return res.status(400).json({ error: 'Falta doc_id' });
          const { error } = await sb.from('knowledge_sources')
            .update({ auto_sync: !!enabled, updated_at: new Date().toISOString() })
            .eq('doc_id', doc_id);
          if (error) return res.status(500).json({ error: error.message });
          return res.status(200).json({ status: 'ok', doc_id, auto_sync: !!enabled });
        }
        default:
          return res.status(400).json({ error: `Acción desconocida: ${action}` });
      }
    } catch (error) {
      console.error('[KNOWLEDGE] error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

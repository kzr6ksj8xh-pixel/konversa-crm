// ============================================================
// KONVERSA CRM — Sincronización de conocimiento desde Google Drive
// ============================================================
// Endpoint que dispara el botón "Actualizar con Drive" del CRM.
//
// Lee el Google Doc "Base de Conocimiento PINGUS" con una CUENTA DE
// SERVICIO de Google (el doc debe estar compartido con el email de esa
// cuenta) y guarda su texto plano en agent_settings.knowledge. El webhook
// del agente inyecta ese texto en el system prompt (ver buildSystemPrompt
// en api/webhook.js), así que el bot responde con la información más
// reciente sin tocar el código.
//
// Variables de entorno necesarias (Vercel):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL        cuenta-servicio@proyecto.iam.gserviceaccount.com
//   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  clave privada (con \n literales o reales)
//   AGENT_KB_DOC_ID                     (opcional) ID del Google Doc a leer
//   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Deploy: Vercel Serverless Function (api/drive-sync.js)
// ============================================================

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// La clave privada suele pegarse en Vercel con "\n" literales; los normalizamos.
const SA_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
// ID del Google Doc "Base de Conocimiento PINGUS – Manual del Agente IA".
const DOC_ID = process.env.AGENT_KB_DOC_ID || '1RnhfW6gFTfkkiFvCGZUj18y6UBkXYxP1OyUIO51KKn0';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Tope de tamaño para no inflar el system prompt del agente sin control.
const MAX_CHARS = 60000;

function base64url(input) {
    return Buffer.from(input).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Obtiene un access token de Google vía JWT firmado (RS256) con la cuenta
// de servicio. No requiere la librería googleapis.
async function getGoogleAccessToken(scope) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
        iss: SA_EMAIL,
        scope,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    };
    const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsigned);
    const signature = base64url(signer.sign(SA_KEY));
    const jwt = unsigned + '.' + signature;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        throw new Error('No se pudo autenticar con Google: ' + (data.error_description || data.error || res.status));
    }
    return data.access_token;
}

export default async function handler(req, res) {
    // El CRM llama desde el mismo origen; CORS abierto por si se usa PWA/dominio propio.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido' });

    if (!SA_EMAIL || !SA_KEY) {
        return res.status(500).json({
            ok: false,
            error: 'Faltan credenciales de Google. Configura GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY en Vercel.'
        });
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({
            ok: false,
            error: 'Falta configuración de Supabase en el servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
        });
    }

    try {
        // 1) Token de Google (solo lectura de Drive).
        const token = await getGoogleAccessToken('https://www.googleapis.com/auth/drive.readonly');

        // 2) Exportar el Google Doc como texto plano.
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${DOC_ID}/export?mimeType=text/plain`;
        const docRes = await fetch(exportUrl, { headers: { Authorization: 'Bearer ' + token } });
        if (!docRes.ok) {
            const body = await docRes.text().catch(() => '');
            if (docRes.status === 404 || docRes.status === 403) {
                throw new Error(`No se pudo leer el documento. Comparte el Google Doc con la cuenta de servicio (${SA_EMAIL}) con permiso de lectura.`);
            }
            throw new Error('Error al exportar el documento de Drive (' + docRes.status + '): ' + body.slice(0, 200));
        }
        let text = (await docRes.text()).replace(/\r\n/g, '\n').trim();
        if (!text) throw new Error('El documento de Drive está vacío.');
        let truncated = false;
        if (text.length > MAX_CHARS) { text = text.slice(0, MAX_CHARS); truncated = true; }

        // 3) Guardar en agent_settings (fila única id=1).
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
        const syncedAt = new Date().toISOString();
        const { error } = await sb.from('agent_settings').upsert(
            { id: 1, knowledge: text, knowledge_synced_at: syncedAt, updated_at: syncedAt },
            { onConflict: 'id' }
        );
        if (error) throw new Error('No se pudo guardar en Supabase: ' + error.message);

        console.log(`[drive-sync] OK — ${text.length} caracteres desde ${DOC_ID}`);
        return res.status(200).json({ ok: true, chars: text.length, truncated, syncedAt, docId: DOC_ID });
    } catch (e) {
        console.error('[drive-sync]', e.message);
        return res.status(500).json({ ok: false, error: e.message });
    }
}

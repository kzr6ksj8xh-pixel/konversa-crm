function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://konversa-crm.vercel.app').split(',');

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Show deletion request form
  if (req.method === 'GET') {
    const { confirmation_code } = req.query;

    if (confirmation_code) {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Estado de eliminación — Konversa CRM</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #fafaf8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
            .card { background: white; border-radius: 16px; padding: 48px; max-width: 480px; width: 90%; text-align: center; border: 1px solid #e5e5e0; }
            .icon { font-size: 48px; margin-bottom: 16px; }
            h1 { font-size: 22px; color: #0f0f0f; margin-bottom: 8px; }
            p { color: #666; font-size: 15px; line-height: 1.6; }
            .code { background: #f4f4f0; border-radius: 8px; padding: 12px 16px; font-family: monospace; font-size: 14px; color: #444; margin: 16px 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h1>Solicitud recibida</h1>
            <p>Tu solicitud de eliminación de datos ha sido registrada y será procesada en los próximos 30 días.</p>
            <div class="code">Código: ${escHtml(confirmation_code)}</div>
            <p>Guarda este código para dar seguimiento a tu solicitud escribiendo a <strong>privacidad@grupopingus.com</strong>.</p>
          </div>
        </body>
        </html>
      `);
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Eliminar mis datos — Konversa CRM</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #fafaf8; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .card { background: white; border-radius: 16px; padding: 48px; max-width: 480px; width: 90%; border: 1px solid #e5e5e0; }
          h1 { font-size: 22px; color: #0f0f0f; margin-bottom: 8px; }
          p { color: #666; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
          label { display: block; font-size: 13px; font-weight: 500; color: #333; margin-bottom: 6px; }
          input { width: 100%; padding: 10px 14px; border: 1px solid #e5e5e0; border-radius: 8px; font-size: 15px; outline: none; box-sizing: border-box; }
          input:focus { border-color: #4f46e5; }
          .field { margin-bottom: 20px; }
          button { width: 100%; padding: 12px; background: #4f46e5; color: white; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; font-weight: 500; }
          button:hover { background: #4338ca; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Eliminar mis datos</h1>
          <p>Completa este formulario para solicitar la eliminación de todos tus datos personales de Konversa CRM de Grupo Pingus.</p>
          <form method="POST">
            <div class="field">
              <label>Correo electrónico</label>
              <input type="email" name="email" required placeholder="tu@correo.com">
            </div>
            <div class="field">
              <label>ID de usuario de Facebook (opcional)</label>
              <input type="text" name="fb_user_id" placeholder="Ej: 123456789">
            </div>
            <button type="submit">Solicitar eliminación</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }

  // POST - Process deletion request (Meta callback or form submission)
  if (req.method === 'POST') {
    const contentType = req.headers['content-type'] || '';

    // Meta sends a signed_request when user removes app from Facebook
    if (contentType.includes('application/x-www-form-urlencoded') && req.body?.signed_request) {
      const appSecret = process.env.META_APP_SECRET;
      if (!appSecret) {
        console.error('META_APP_SECRET no configurado — no se puede validar signed_request');
        return res.status(500).json({ error: 'Servidor mal configurado' });
      }

      const [encodedSig, payload] = req.body.signed_request.split('.', 2);
      if (!encodedSig || !payload) {
        return res.status(400).json({ error: 'signed_request mal formado' });
      }

      const { createHmac } = await import('crypto');
      const expectedSig = createHmac('sha256', appSecret).update(payload).digest('base64url');
      const receivedSig = encodedSig.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (expectedSig !== receivedSig) {
        return res.status(403).json({ error: 'Firma inválida' });
      }

      const userData = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const userId = userData.user_id;

      const confirmationCode = `DEL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const statusUrl = `https://konversa-crm.vercel.app/api/delete-data?confirmation_code=${encodeURIComponent(confirmationCode)}`;

      // TODO: implementar eliminación real en Supabase
      // await supabase.from('contacts').delete().eq('fb_user_id', userId);
      console.log(`Solicitud de eliminación de Meta para user_id: ${userId}, código: ${confirmationCode}`);

      return res.status(200).json({
        url: statusUrl,
        confirmation_code: confirmationCode
      });
    }

    // Form submission
    const { email, fb_user_id } = req.body || {};
    const confirmationCode = `DEL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Here you would trigger actual data deletion:
    // await supabase.from('contacts').delete().eq('email', email)
    // await supabase.from('conversations').delete().eq('fb_user_id', fb_user_id)

    return res.redirect(302, `/api/delete-data?confirmation_code=${confirmationCode}`);
  }

  return res.status(405).send('Method Not Allowed');
}

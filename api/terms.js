export default function handler(req, res) {
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Términos de Servicio — Konversa CRM</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1a1a1a; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { margin-top: 2rem; color: #333; }
    a { color: #0070f3; }
    nav { margin-bottom: 2rem; font-size: 0.9rem; }
    footer { margin-top: 3rem; font-size: 0.8rem; color: #666; border-top: 1px solid #eee; padding-top: 1rem; }
    ul { padding-left: 1.5rem; }
    li { margin-bottom: 0.4rem; }
  </style>
</head>
<body>
  <nav><a href="https://konversa-crm.vercel.app/">Konversa CRM — Grupo Pingus</a> · Legal</nav>

  <h1>Términos de Servicio</h1>
  <p>Última actualización: 8 de junio de 2026</p>

  <h2>1. Aceptación de los términos</h2>
  <p>Al acceder y utilizar Konversa CRM, operado por Grupo Pingus, aceptas quedar vinculado por estos Términos de Servicio. Si no estás de acuerdo con alguno de estos términos, no debes utilizar la plataforma.</p>

  <h2>2. Descripción del servicio</h2>
  <p>Konversa CRM es una plataforma interna de gestión de relaciones con clientes desarrollada y operada exclusivamente por Grupo Pingus. Permite la gestión de conversaciones, contactos y seguimiento comercial a través de integraciones con Meta (Facebook Messenger y WhatsApp).</p>

  <h2>3. Uso autorizado</h2>
  <p>El acceso a Konversa CRM está restringido al personal autorizado de Grupo Pingus. Queda prohibido:</p>
  <ul>
    <li>Compartir credenciales de acceso con terceros</li>
    <li>Usar la plataforma para fines distintos a los operativos de Grupo Pingus</li>
    <li>Extraer, copiar o redistribuir datos de la plataforma sin autorización</li>
    <li>Intentar acceder a funciones o datos no autorizados</li>
  </ul>

  <h2>4. Datos y privacidad</h2>
  <p>El tratamiento de datos personales se rige por nuestra <a href="https://konversa-crm.vercel.app/api/privacy">Política de Privacidad</a>. Los usuarios autorizados son responsables de manejar la información de los contactos conforme a la normativa aplicable.</p>

  <h2>5. Integraciones con Meta</h2>
  <p>Konversa CRM utiliza las APIs de Meta Platform (Facebook, WhatsApp). El uso de estas integraciones está sujeto adicionalmente a los <a href="https://www.facebook.com/legal/terms" target="_blank">Términos de Servicio de Meta</a> y sus políticas de uso de datos.</p>

  <h2>6. Disponibilidad del servicio</h2>
  <p>Grupo Pingus hará sus mejores esfuerzos para mantener la plataforma disponible. Sin embargo, no garantiza disponibilidad ininterrumpida y se reserva el derecho de realizar mantenimientos programados o no programados.</p>

  <h2>7. Propiedad intelectual</h2>
  <p>Todo el código, diseño y contenido de Konversa CRM es propiedad de Grupo Pingus. Queda prohibida su reproducción o uso fuera del contexto operativo autorizado.</p>

  <h2>8. Modificaciones</h2>
  <p>Grupo Pingus puede modificar estos Términos en cualquier momento. Los cambios serán notificados al personal autorizado y entrarán en vigor al momento de su publicación.</p>

  <h2>9. Contacto</h2>
  <p>Para cualquier consulta sobre estos términos:</p>
  <ul>
    <li>Correo: <a href="mailto:admin@grupopingus.com">admin@grupopingus.com</a></li>
    <li>Plataforma: <a href="https://konversa-crm.vercel.app">konversa-crm.vercel.app</a></li>
  </ul>

  <footer>© 2026 Grupo Pingus · Konversa CRM · Todos los derechos reservados</footer>
</body>
</html>
  `;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}

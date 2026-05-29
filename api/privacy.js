export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Política de Privacidad — Konversa CRM</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Serif+Display&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --ink: #0f0f0f; --ink2: #444; --ink3: #888; --accent: #1a73e8; --orange: #FF6B35; --bg: #fafaf8; --border: #e5e5e0; --max: 680px; }
  body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--ink); line-height: 1.75; font-size: 16px; }
  header { border-bottom: 1px solid var(--border); padding: 24px 0; }
  .wrap { max-width: var(--max); margin: 0 auto; padding: 0 24px; }
  .logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .logo-icon { width: 32px; height: 32px; background: #0f1c3f; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .logo-name { font-size: 15px; font-weight: 500; color: var(--ink); }
  .logo-sub { font-size: 12px; color: var(--ink3); }
  main { padding: 64px 0 96px; }
  .hero-label { font-size: 11px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); margin-bottom: 16px; }
  h1 { font-family: 'DM Serif Display', serif; font-size: 40px; line-height: 1.15; color: var(--ink); margin-bottom: 12px; }
  .updated { font-size: 13px; color: var(--ink3); margin-bottom: 48px; padding-bottom: 48px; border-bottom: 1px solid var(--border); }
  .toc { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 24px 28px; margin-bottom: 48px; }
  .toc-title { font-size: 12px; font-weight: 500; letter-spacing: 1.5px; text-transform: uppercase; color: var(--ink3); margin-bottom: 14px; }
  .toc ol { padding-left: 18px; }
  .toc li { margin-bottom: 6px; }
  .toc a { color: var(--accent); text-decoration: none; font-size: 14px; }
  section { margin-bottom: 48px; }
  h2 { font-family: 'DM Serif Display', serif; font-size: 24px; color: var(--ink); margin-bottom: 16px; padding-top: 8px; }
  p { color: var(--ink2); margin-bottom: 16px; font-size: 15px; }
  ul { color: var(--ink2); padding-left: 20px; margin-bottom: 16px; font-size: 15px; }
  li { margin-bottom: 8px; }
  .highlight { background: white; border-left: 3px solid var(--orange); padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0; }
  .highlight p { margin: 0; font-size: 14px; }
  .contact-card { background: #0f1c3f; border-radius: 12px; padding: 32px; margin-top: 48px; }
  .contact-card h3 { font-family: 'DM Serif Display', serif; font-size: 20px; color: white; margin-bottom: 8px; }
  .contact-card p { color: rgba(255,255,255,0.65); font-size: 14px; margin-bottom: 4px; }
  .contact-card a { color: #FF6B35; text-decoration: none; }
  footer { border-top: 1px solid var(--border); padding: 24px 0; text-align: center; }
  footer p { font-size: 13px; color: var(--ink3); margin: 0; }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <a href="/" class="logo">
      <div class="logo-icon">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M2 5.5C2 4.4 2.9 3.5 4 3.5H14C15.1 3.5 16 4.4 16 5.5V11C16 12.1 15.1 13 14 13H10.5L8 16L5.5 13H4C2.9 13 2 12.1 2 11V5.5Z" fill="#FF6B35"/>
          <circle cx="6" cy="8.25" r="1.25" fill="white"/>
          <circle cx="9" cy="8.25" r="1.25" fill="white"/>
          <circle cx="12" cy="8.25" r="1.25" fill="white"/>
        </svg>
      </div>
      <div>
        <div class="logo-name">Konversa CRM</div>
        <div class="logo-sub">Grupo Pingus</div>
      </div>
    </a>
  </div>
</header>
<main>
  <div class="wrap">
    <div class="hero-label">Legal</div>
    <h1>Política de Privacidad</h1>
    <p class="updated">Última actualización: 29 de mayo de 2026</p>
    <div class="toc">
      <div class="toc-title">Contenido</div>
      <ol>
        <li><a href="#informacion">Información que recopilamos</a></li>
        <li><a href="#uso">Cómo usamos tu información</a></li>
        <li><a href="#facebook">Datos de Facebook y Messenger</a></li>
        <li><a href="#compartir">Compartir información</a></li>
        <li><a href="#retencion">Retención de datos</a></li>
        <li><a href="#derechos">Tus derechos</a></li>
        <li><a href="#eliminacion">Eliminación de datos</a></li>
        <li><a href="#seguridad">Seguridad</a></li>
        <li><a href="#contacto">Contacto</a></li>
      </ol>
    </div>
    <section id="informacion"><h2>1. Información que recopilamos</h2><p>Konversa CRM, operado por Grupo Pingus, recopila información necesaria para brindar servicios de gestión de relaciones con clientes. Esto incluye:</p><ul><li>Nombre y apellidos del contacto</li><li>Correo electrónico y teléfono</li><li>Mensajes enviados a través de Facebook Messenger</li><li>Información del perfil público de Facebook (nombre, foto, ID)</li><li>Historial de conversaciones con nuestra página</li></ul></section>
    <section id="uso"><h2>2. Cómo usamos tu información</h2><p>Usamos la información exclusivamente para:</p><ul><li>Responder tus mensajes y consultas</li><li>Gestionar el seguimiento comercial y de ventas</li><li>Mejorar la calidad del servicio al cliente</li><li>Coordinar entre el equipo de agentes de Grupo Pingus</li></ul><div class="highlight"><p>No utilizamos tu información para publicidad de terceros, ni la vendemos o compartimos con empresas externas.</p></div></section>
    <section id="facebook"><h2>3. Datos de Facebook y Messenger</h2><p>Esta aplicación utiliza la API de Meta para recibir y gestionar mensajes de la Página de Facebook de Grupo Pingus. Al comunicarte con nuestra página:</p><ul><li>Tu ID y nombre público de Facebook son recibidos automáticamente</li><li>El contenido de tus mensajes se almacena de forma segura</li><li>Los datos son accesibles únicamente por personal autorizado de Grupo Pingus</li></ul></section>
    <section id="compartir"><h2>4. Compartir información</h2><p>No compartimos tu información con terceros, excepto proveedores de infraestructura (Supabase, Vercel) bajo acuerdos de confidencialidad, o cuando sea requerido por ley.</p></section>
    <section id="retencion"><h2>5. Retención de datos</h2><p>Conservamos tus datos mientras exista una relación comercial activa. Si solicitas eliminación, la procesamos en 30 días hábiles.</p></section>
    <section id="derechos"><h2>6. Tus derechos</h2><ul><li>Acceder a tus datos personales</li><li>Solicitar corrección de datos incorrectos</li><li>Solicitar eliminación de tus datos</li><li>Oponerte al procesamiento</li><li>Portar tus datos a otro servicio</li></ul></section>
    <section id="eliminacion"><h2>7. Eliminación de datos</h2><p>Puedes solicitar la eliminación de todos tus datos en cualquier momento:</p><ul><li>Correo: <strong>privacidad@grupopingus.com</strong></li><li>Formulario: <a href="/api/delete-data" style="color:var(--accent)">konversa-crm.vercel.app/api/delete-data</a></li></ul></section>
    <section id="seguridad"><h2>8. Seguridad</h2><p>Implementamos cifrado HTTPS/TLS, acceso restringido por roles y autenticación segura para proteger tu información.</p></section>
    <section id="contacto"><h2>9. Contacto</h2>
      <div class="contact-card">
        <h3>Grupo Pingus</h3>
        <p>Correo: <a href="mailto:privacidad@grupopingus.com">privacidad@grupopingus.com</a></p>
        <p>Plataforma: <a href="https://konversa-crm.vercel.app">konversa-crm.vercel.app</a></p>
      </div>
    </section>
  </div>
</main>
<footer><div class="wrap"><p>© 2026 Grupo Pingus · Konversa CRM · Todos los derechos reservados</p></div></footer>
</body>
</html>`);
}

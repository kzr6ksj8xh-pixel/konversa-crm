/* ============================================================
 * Ctx:Whatsapp — widget autónomo (Konversa CRM)
 * Se inyecta en la tienda Shopify vía ScriptTag al instalar la app.
 * Lee el número de WhatsApp de Konversa desde el backend y pinta un
 * botón flotante que abre wa.me. Versión GRATIS.
 * ============================================================ */
(function () {
  'use strict';
  if (window.__ctxWaMounted) return;
  window.__ctxWaMounted = true;

  // Host de la app: derivado del <script> que cargó este archivo.
  var HOST = 'https://konversa-crm.vercel.app';
  try {
    var self = document.currentScript;
    if (self && self.src) HOST = new URL(self.src).origin;
  } catch (e) { /* usa el default */ }

  // Ajustes por defecto (la versión gratis no se configura por tienda)
  var CFG = {
    position: 'right',
    color: '#25D366',
    label: 'Chatea con nosotros por WhatsApp',
    greeting: '¿Necesitas ayuda? Escríbenos',
    showGreeting: true,
    message: 'Hola, tengo una pregunta sobre su tienda.'
  };

  function shopDomain() {
    try {
      if (window.Shopify && window.Shopify.shop) return window.Shopify.shop;
    } catch (e) {}
    return window.location.hostname;
  }

  function injectStyles() {
    if (document.getElementById('ctx-wa-style')) return;
    var css = ''
      + '.ctx-wa{position:fixed;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;pointer-events:none}'
      + '.ctx-wa--right{right:20px;align-items:flex-end}'
      + '.ctx-wa--left{left:20px;align-items:flex-start}'
      + '.ctx-wa__btn{pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s ease,box-shadow .15s ease;text-decoration:none}'
      + '.ctx-wa__btn:hover,.ctx-wa__btn:focus-visible{transform:scale(1.06);box-shadow:0 6px 20px rgba(0,0,0,.3);outline:none}'
      + '.ctx-wa__btn svg{display:block}'
      + '.ctx-wa__bubble{pointer-events:auto;position:relative;max-width:220px;background:#fff;color:#1a1a1a;font-size:14px;line-height:1.35;padding:10px 30px 10px 14px;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.18)}'
      + '.ctx-wa__bubble-close{position:absolute;top:4px;right:6px;border:0;background:transparent;color:#999;font-size:18px;line-height:1;cursor:pointer;padding:2px}'
      + '.ctx-wa__bubble-close:hover{color:#555}'
      + '.ctx-wa--no-bubble .ctx-wa__bubble{display:none}'
      + '@media(max-width:600px){.ctx-wa{bottom:16px}.ctx-wa--right{right:16px}.ctx-wa--left{left:16px}.ctx-wa__bubble{max-width:180px}}';
    var s = document.createElement('style');
    s.id = 'ctx-wa-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function render(number) {
    var num = String(number).replace(/\D/g, '');
    if (!num) return;
    injectStyles();

    var href = 'https://wa.me/' + num;
    if (CFG.message) href += '?text=' + encodeURIComponent(CFG.message);

    var wrap = document.createElement('div');
    wrap.className = 'ctx-wa ctx-wa--' + (CFG.position === 'left' ? 'left' : 'right');

    if (CFG.showGreeting && CFG.greeting) {
      var bubble = document.createElement('div');
      bubble.className = 'ctx-wa__bubble';
      bubble.textContent = CFG.greeting;
      var close = document.createElement('button');
      close.className = 'ctx-wa__bubble-close';
      close.type = 'button';
      close.setAttribute('aria-label', 'Cerrar');
      close.innerHTML = '&times;';
      close.addEventListener('click', function (e) {
        e.preventDefault();
        wrap.classList.add('ctx-wa--no-bubble');
      });
      bubble.appendChild(close);
      wrap.appendChild(bubble);
    }

    var btn = document.createElement('a');
    btn.className = 'ctx-wa__btn';
    btn.href = href;
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
    btn.setAttribute('aria-label', CFG.label);
    btn.title = CFG.label;
    btn.style.background = CFG.color;
    btn.innerHTML =
      '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.3.6 4.5 1.8 6.4L3 29l7.3-2.2c1.8 1 3.9 1.5 6 1.5 7 0 12.5-5.5 12.5-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.3 1.3 1.3-4.2-.3-.4a10 10 0 01-1.6-5.4C5.1 9.6 10 4.9 16 4.9c6 0 10.9 4.7 10.9 10.6S22 25.7 16 25.7zm5.9-7.9c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-1.9-.9-3.1-1.7-4.3-3.8-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.6-.1-.2-.8-1.9-1.1-2.6-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.5 3.8 6 5.3 2.2 1 3.1 1 4.2.9.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.5z"/>' +
      '</svg>';

    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  // Reubica el badge promocional flotante (PageFly) para que no choque con
  // el botón de WhatsApp (abajo-derecha). Lo movemos a abajo-izquierda:
  // sigue siendo comercialmente visible pero no estorba.
  function repositionPromo() {
    var TOKEN = 'OZON30'; // código del badge; muy específico de este elemento
    function findBadge() {
      var els = document.body.getElementsByTagName('*');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        // el elemento más "hoja" que contiene el código (evita wrappers grandes)
        if (el.children.length <= 6 && el.textContent && el.textContent.indexOf(TOKEN) !== -1) {
          return el;
        }
      }
      return null;
    }
    function floatingAncestor(el) {
      var node = el;
      while (node && node !== document.body) {
        var pos = window.getComputedStyle(node).position;
        if (pos === 'fixed' || pos === 'sticky') return node;
        node = node.parentElement;
      }
      return el; // si no hay contenedor flotante, movemos el propio badge
    }
    function apply() {
      try {
        var badge = findBadge();
        if (!badge) return false;
        var target = floatingAncestor(badge);
        if (target.dataset.ctxWaMoved === '1') return true;
        target.style.setProperty('right', 'auto', 'important');
        target.style.setProperty('left', '20px', 'important');
        target.style.setProperty('bottom', '20px', 'important');
        target.dataset.ctxWaMoved = '1';
        return true;
      } catch (e) { return true; } // si algo falla, no reintentar en bucle
    }
    if (apply()) return;
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (apply() || tries > 20) clearInterval(iv); // hasta ~10s
    }, 500);
  }

  function start() {
    repositionPromo();
    var shop = shopDomain();
    var url = HOST + '/api/shopify?action=widget-config&shop=' + encodeURIComponent(shop);
    fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (cfg && cfg.enabled && cfg.number) render(cfg.number);
      })
      .catch(function () { /* nunca romper la tienda */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

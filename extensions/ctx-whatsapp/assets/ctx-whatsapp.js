/* ============================================================
 * Ctx:Whatsapp — botón flotante de WhatsApp (Konversa CRM)
 * Versión GRATIS: abre wa.me con el número de Konversa.
 * ============================================================ */
(function () {
  'use strict';

  function init() {
    if (window.__ctxWaMounted) return; // evita botón duplicado (ScriptTag + extensión)
    var root = document.getElementById('ctx-wa-root');
    if (!root || root.dataset.ctxWaMounted === '1') return;
    root.dataset.ctxWaMounted = '1';
    window.__ctxWaMounted = true;

    var host = (root.dataset.appHost || 'https://konversa-crm.vercel.app').replace(/\/+$/, '');
    var shop = root.dataset.shop || '';
    if (!shop) return;

    var url = host + '/api/shopify?action=widget-config&shop=' + encodeURIComponent(shop);

    fetch(url, { method: 'GET', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cfg) {
        if (!cfg || !cfg.enabled || !cfg.number) return; // fail-safe: no pintar botón roto
        render(root, cfg.number);
      })
      .catch(function () { /* silencioso: nunca romper la tienda */ });
  }

  function render(root, number) {
    var num = String(number).replace(/\D/g, '');
    if (!num) return;

    var position = root.dataset.position === 'left' ? 'left' : 'right';
    var color = root.dataset.color || '#25D366';
    var label = root.dataset.label || 'Chatea con nosotros por WhatsApp';
    var message = root.dataset.message || '';
    var showGreeting = root.dataset.showGreeting === 'true';
    var greeting = root.dataset.greeting || '';

    var href = 'https://wa.me/' + num;
    if (message) href += '?text=' + encodeURIComponent(message);

    var wrap = document.createElement('div');
    wrap.className = 'ctx-wa ctx-wa--' + position;

    if (showGreeting && greeting) {
      var bubble = document.createElement('div');
      bubble.className = 'ctx-wa__bubble';
      bubble.textContent = greeting;
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
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.style.setProperty('--ctx-wa-color', color);
    btn.innerHTML =
      '<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M16 3C9 3 3.5 8.5 3.5 15.5c0 2.3.6 4.5 1.8 6.4L3 29l7.3-2.2c1.8 1 3.9 1.5 6 1.5 7 0 12.5-5.5 12.5-12.5S23 3 16 3zm0 22.7c-1.9 0-3.7-.5-5.3-1.5l-.4-.2-4.3 1.3 1.3-4.2-.3-.4a10 10 0 01-1.6-5.4C5.1 9.6 10 4.9 16 4.9c6 0 10.9 4.7 10.9 10.6S22 25.7 16 25.7zm5.9-7.9c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.8.2-.2.3-.9 1.1-1.1 1.3-.2.2-.4.2-.7.1-1.9-.9-3.1-1.7-4.3-3.8-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.6-.1-.2-.8-1.9-1.1-2.6-.3-.7-.6-.6-.8-.6h-.7c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.8s1.2 3.3 1.4 3.5c.2.2 2.5 3.8 6 5.3 2.2 1 3.1 1 4.2.9.7-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.5z"/>' +
      '</svg>';

    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

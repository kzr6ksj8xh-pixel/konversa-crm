// ============================================================
// KONVERSA CRM - Shopify Integration
// ============================================================
// Endpoints:
//   GET  /api/shopify?action=install&shop=mi-tienda.myshopify.com  → OAuth inicio
//   GET  /api/shopify?action=callback&code=xxx&shop=xxx            → OAuth callback
//   POST /api/shopify  { action: 'sync-products' }                 → Sincronizar productos
//   POST /api/shopify  { action: 'sync-orders' }                   → Sincronizar pedidos
//   POST /api/shopify  { action: 'search-product', query: '...' }  → Buscar producto
//   POST /api/shopify  { action: 'order-status', email: '...' }    → Estado de pedido
// ============================================================

import crypto from 'crypto';

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = 'read_products,read_orders,read_inventory,read_customers';
const APP_URL = process.env.APP_URL || 'https://konversa-crm.vercel.app';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// ── Verificar HMAC de Shopify ─────────────────────────────
function verifyShopifyHmac(query) {
  const { hmac, ...params } = query;
  if (!hmac || !SHOPIFY_API_SECRET) return false;
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const computed = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(sorted).digest('hex');
  const a = Buffer.from(hmac);
  const b = Buffer.from(computed);
  if (a.length !== b.length) return false; // timingSafeEqual lanza si difieren
  return crypto.timingSafeEqual(a, b);
}

// ── State firmado para OAuth (CSRF, stateless) ────────────
function makeOAuthState() {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(ts).digest('hex');
  return `${ts}.${sig}`;
}
function isValidOAuthState(state) {
  if (!state || !SHOPIFY_API_SECRET) return false;
  const [ts, sig] = String(state).split('.');
  if (!ts || !sig) return false;
  if (Date.now() - Number(ts) > 600000) return false; // 10 min TTL
  const expected = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(ts).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ── Autenticación: JWT de Supabase o clave interna ────────
async function requireAuth(req, sb) {
  const internal = process.env.INTERNAL_API_KEY;
  const headerKey = req.headers['x-internal-key'];
  if (internal && headerKey && headerKey === internal) return { internal: true };

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// ── Sanea texto de búsqueda para filtros PostgREST ────────
// Quita caracteres que permiten inyección en la expresión .or()
function sanitizeSearch(q) {
  return String(q).replace(/[,()%\\*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// ── Validar formato de dominio Shopify ────────────────────
function isValidShopDomain(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

// ── Obtener token guardado ────────────────────────────────
async function getStoredToken(sb, shopDomain) {
  const { data } = await sb.from('integrations')
    .select('access_token, config')
    .eq('provider', 'shopify')
    .eq('shop_domain', shopDomain)
    .eq('is_active', true)
    .single();
  return data;
}

// ── Llamar Shopify Admin API ──────────────────────────────
async function shopifyAPI(shopDomain, accessToken, endpoint, method = 'GET', body = null) {
  const url = `https://${shopDomain}/admin/api/2024-10/${endpoint}`;
  const opts = {
    method,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(url, opts);
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Shopify API ${response.status}: ${err}`);
  }
  return response.json();
}

// ══════════════════════════════════════════════════════════════
// OAUTH FLOW
// ══════════════════════════════════════════════════════════════
function handleInstall(shop, res) {
  if (!SHOPIFY_API_KEY) return res.status(500).json({ error: 'SHOPIFY_API_KEY no configurado' });
  if (!isValidShopDomain(shop)) return res.status(400).json({ error: 'Dominio de tienda inválido' });

  const state = makeOAuthState();
  // Sin query params: Shopify rechaza redirect URLs con query string en la config de la app
  const redirectUri = `${APP_URL}/api/shopify`;
  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return res.redirect(302, installUrl);
}

async function handleCallback(query, res) {
  const { shop, code, hmac, state } = query;

  if (!shop || !code) return res.status(400).json({ error: 'Faltan parámetros' });
  if (!isValidShopDomain(shop)) return res.status(400).json({ error: 'Dominio inválido' });
  if (!isValidOAuthState(state)) return res.status(403).json({ error: 'State inválido (posible CSRF)' });
  if (!verifyShopifyHmac(query)) return res.status(403).json({ error: 'HMAC inválido' });

  // Intercambiar code por access_token
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code
    })
  });

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text();
    console.error('Shopify token exchange error:', err);
    return res.status(500).json({ error: 'Error obteniendo token' });
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;
  const scopes = tokenData.scope;

  // Guardar en Supabase
  const sb = await getSupabase();
  const { error } = await sb.from('integrations').upsert({
    provider: 'shopify',
    shop_domain: shop,
    access_token: accessToken,
    scopes,
    is_active: true,
    updated_at: new Date().toISOString()
  }, { onConflict: 'provider,shop_domain' });

  if (error) {
    console.error('Error guardando token:', error);
    return res.status(500).json({ error: 'Error guardando integración' });
  }

  // Sync inicial de productos
  try {
    await syncProducts(sb, shop, accessToken);
  } catch (e) {
    console.error('Sync inicial falló:', e.message);
  }

  // Redirigir al CRM con éxito
  return res.redirect(302, `${APP_URL}?shopify=connected&shop=${encodeURIComponent(shop)}`);
}

// ══════════════════════════════════════════════════════════════
// SYNC PRODUCTOS
// ══════════════════════════════════════════════════════════════
async function syncProducts(sb, shopDomain, accessToken) {
  let url = 'products.json?limit=50&status=active';
  let allProducts = [];

  // Paginar todos los productos
  while (url) {
    const data = await shopifyAPI(shopDomain, accessToken, url);
    allProducts = allProducts.concat(data.products || []);

    // Shopify pagination via Link header (simplificado: max 250 productos)
    if (allProducts.length >= 250 || !data.products?.length) break;
    url = null; // Una sola página por ahora
  }

  const rows = allProducts.map(p => ({
    shopify_id: p.id,
    title: p.title,
    description: p.body_html?.replace(/<[^>]*>/g, '') || '',
    vendor: p.vendor,
    product_type: p.product_type,
    handle: p.handle,
    status: p.status,
    variants: p.variants || [],
    images: (p.images || []).map(img => ({ id: img.id, src: img.src })),
    tags: p.tags ? p.tags.split(',').map(t => t.trim()) : [],
    price_min: Math.min(...(p.variants || []).map(v => parseFloat(v.price) || 0)),
    price_max: Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0)),
    inventory_total: (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
    synced_at: new Date().toISOString()
  }));

  // Upsert en lotes de 20
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const { error } = await sb.from('shopify_products')
      .upsert(batch, { onConflict: 'shopify_id' });
    if (error) console.error('Upsert products error:', error);
  }

  return { synced: rows.length };
}

// ══════════════════════════════════════════════════════════════
// SYNC PEDIDOS
// ══════════════════════════════════════════════════════════════
async function syncOrders(sb, shopDomain, accessToken) {
  const data = await shopifyAPI(shopDomain, accessToken, 'orders.json?limit=50&status=any');
  const orders = data.orders || [];

  const rows = orders.map(o => ({
    shopify_id: o.id,
    order_number: o.name,
    email: o.email,
    phone: o.phone,
    total_price: parseFloat(o.total_price) || 0,
    currency: o.currency,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    customer_name: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : '',
    line_items: (o.line_items || []).map(li => ({
      title: li.title,
      quantity: li.quantity,
      price: li.price
    })),
    created_at: o.created_at,
    synced_at: new Date().toISOString()
  }));

  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20);
    const { error } = await sb.from('shopify_orders')
      .upsert(batch, { onConflict: 'shopify_id' });
    if (error) console.error('Upsert orders error:', error);
  }

  return { synced: rows.length };
}

// ══════════════════════════════════════════════════════════════
// BUSCAR PRODUCTO (para el agente IA)
// ══════════════════════════════════════════════════════════════
async function searchProduct(sb, query) {
  const q = sanitizeSearch(query);
  if (!q) return [];
  const { data, error } = await sb.from('shopify_products')
    .select('title, description, price_min, price_max, handle, status, inventory_total, vendor')
    .eq('status', 'active')
    .or(`title.ilike.%${q}%,description.ilike.%${q}%,product_type.ilike.%${q}%`)
    .limit(5);

  if (error) throw error;
  return data || [];
}

// ══════════════════════════════════════════════════════════════
// ESTADO DE PEDIDO (para el agente IA)
// ══════════════════════════════════════════════════════════════
async function orderStatus(sb, email) {
  const { data, error } = await sb.from('shopify_orders')
    .select('order_number, total_price, currency, financial_status, fulfillment_status, customer_name, created_at, line_items')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) throw error;
  return data || [];
}

// ══════════════════════════════════════════════════════════════
// HANDLER
// ══════════════════════════════════════════════════════════════
export default async function handler(req, res) {
  // ── GET: OAuth flow ──
  if (req.method === 'GET') {
    const { action, shop, code } = req.query;

    if (action === 'install') {
      if (!shop) return res.status(400).json({ error: 'Falta parámetro shop' });
      return handleInstall(shop, res);
    }

    // El callback de OAuth llega sin "action" (la redirect URL no admite query params)
    if (action === 'callback' || (code && shop)) {
      return handleCallback(req.query, res);
    }

    return res.status(400).json({ error: 'Acción no válida. Usa action=install o action=callback' });
  }

  // ── POST: API actions ──
  if (req.method === 'POST') {
    try {
      const { action, query, email, shop_domain } = req.body || {};

      if (!action) return res.status(400).json({ error: 'Falta action' });

      const sb = await getSupabase();

      // ── Autenticación obligatoria (JWT Supabase o clave interna) ──
      const auth = await requireAuth(req, sb);
      if (!auth) return res.status(401).json({ error: 'No autorizado' });

      // Determinar tienda (usar la primera activa si no se especifica)
      let shopDomain = shop_domain;
      let accessToken;

      if (action !== 'search-product' && action !== 'order-status') {
        if (!shopDomain) {
          const { data } = await sb.from('integrations')
            .select('shop_domain, access_token')
            .eq('provider', 'shopify')
            .eq('is_active', true)
            .limit(1)
            .single();
          if (!data) return res.status(400).json({ error: 'No hay tienda Shopify conectada' });
          shopDomain = data.shop_domain;
          accessToken = data.access_token;
        } else {
          const stored = await getStoredToken(sb, shopDomain);
          if (!stored) return res.status(400).json({ error: 'Tienda no conectada' });
          accessToken = stored.access_token;
        }
      }

      switch (action) {
        case 'sync-products': {
          const result = await syncProducts(sb, shopDomain, accessToken);
          return res.status(200).json({ status: 'ok', ...result });
        }

        case 'sync-orders': {
          const result = await syncOrders(sb, shopDomain, accessToken);
          return res.status(200).json({ status: 'ok', ...result });
        }

        case 'search-product': {
          if (!query) return res.status(400).json({ error: 'Falta query' });
          const products = await searchProduct(sb, query);
          return res.status(200).json({ status: 'ok', products });
        }

        case 'order-status': {
          if (!email) return res.status(400).json({ error: 'Falta email' });
          const orders = await orderStatus(sb, email);
          return res.status(200).json({ status: 'ok', orders });
        }

        default:
          return res.status(400).json({ error: `Acción desconocida: ${action}` });
      }

    } catch (error) {
      console.error('Shopify error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}

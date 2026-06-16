// ============================================================
// KONVERSA CRM - Shopify Webhooks
// ============================================================
// Recibe webhooks de Shopify para:
//   - orders/create, orders/updated
//   - products/create, products/update
// Configurar en Shopify Admin → Settings → Notifications → Webhooks
// URL: https://konversa-crm.vercel.app/api/shopify-webhook
// ============================================================

import crypto from 'crypto';

function productPrices(variants) {
  const prices = (variants || []).map(v => parseFloat(v.price)).filter(n => !isNaN(n) && n > 0);
  return {
    price_min: prices.length ? Math.min(...prices) : 0,
    price_max: prices.length ? Math.max(...prices) : 0
  };
}

// Body crudo necesario para validar el HMAC de Shopify.
export const config = { api: { bodyParser: false } };

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

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

function verifyShopifyWebhook(req, rawBody) {
  // Sin secret: rechazar (fail-closed) en vez de aceptar todo.
  if (!SHOPIFY_API_SECRET) {
    console.error('SHOPIFY_API_SECRET no configurado — rechazando webhook');
    return false;
  }
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return false;
  const body = rawBody != null ? rawBody
    : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  const computed = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(body, 'utf8').digest('base64');
  const a = Buffer.from(hmac);
  const b = Buffer.from(computed);
  if (a.length !== b.length) return false; // timingSafeEqual lanza si difieren
  return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  // Bytes crudos para el HMAC, con fallback a req.body.
  let raw = await readRawBody(req);
  let body;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = null; }
  } else if (req.body) {
    body = req.body;
    raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  if (!verifyShopifyWebhook(req, raw)) {
    console.error('Shopify webhook: HMAC inválido');
    return res.status(401).json({ error: 'HMAC inválido' });
  }

  const topic = req.headers['x-shopify-topic'];

  console.log(`[Shopify webhook] ${topic}`);

  try {
    const sb = await getSupabase();

    switch (topic) {
      // ── Producto creado o actualizado ──
      case 'products/create':
      case 'products/update': {
        const p = body;
        const { price_min, price_max } = productPrices(p.variants);
        const { error: pe } = await sb.from('shopify_products').upsert({
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
          price_min,
          price_max,
          inventory_total: (p.variants || []).reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
          synced_at: new Date().toISOString()
        }, { onConflict: 'shopify_id' });
        if (pe) throw new Error(`products upsert: ${pe.message}`);

        return res.status(200).json({ status: 'product_synced', id: p.id });
      }

      // ── Producto eliminado ──
      case 'products/delete': {
        await sb.from('shopify_products')
          .update({ status: 'archived', synced_at: new Date().toISOString() })
          .eq('shopify_id', body.id);

        return res.status(200).json({ status: 'product_archived', id: body.id });
      }

      // ── Pedido creado o actualizado ──
      case 'orders/create':
      case 'orders/updated': {
        const o = body;
        const shopDomain = req.headers['x-shopify-shop-domain'] || null;
        const { error: oe } = await sb.from('shopify_orders').upsert({
          shopify_id: o.id,
          shop_domain: shopDomain,
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
        }, { onConflict: 'shopify_id' });
        if (oe) throw new Error(`orders upsert: ${oe.message}`);

        return res.status(200).json({ status: 'order_synced', id: o.id });
      }

      // ── Carrito abandonado ──
      case 'checkouts/create':
      case 'checkouts/update': {
        const c = body;

        // Solo procesar si hay email o teléfono (cliente identificado)
        const email = c.email || c.customer?.email;
        const phone = c.phone || c.billing_address?.phone || c.shipping_address?.phone || c.customer?.phone;
        if (!email && !phone) return res.status(200).json({ status: 'ignored_anonymous' });

        // Solo si el carrito NO está completado
        if (c.completed_at) return res.status(200).json({ status: 'ignored_completed' });

        // Evitar duplicados: solo procesar si el carrito lleva >30 min sin cambios
        const updatedAt = new Date(c.updated_at || c.created_at).getTime();
        if (Date.now() - updatedAt < 30 * 60 * 1000) {
          return res.status(200).json({ status: 'ignored_too_recent' });
        }

        // Buscar contacto en Supabase por teléfono o email
        let contact = null;
        if (phone) {
          const cleanPhone = phone.replace(/\D/g, '');
          const { data } = await sb.from('contacts').select('id,name').eq('phone', cleanPhone).limit(1).maybeSingle();
          contact = data;
        }
        if (!contact && email) {
          const { data } = await sb.from('contacts').select('id,name').eq('email', email).limit(1).maybeSingle();
          contact = data;
        }
        if (!contact) return res.status(200).json({ status: 'ignored_no_contact' });

        // Buscar conversación activa del contacto
        const { data: conv } = await sb.from('conversations')
          .select('id').eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!conv) return res.status(200).json({ status: 'ignored_no_conversation' });

        // Construir resumen del carrito
        const items = (c.line_items || []);
        const total = parseFloat(c.total_price) || 0;
        const currency = c.currency || 'MXN';
        const itemList = items.slice(0, 3).map(i => `${i.title} x${i.quantity}`).join(', ');
        const more = items.length > 3 ? ` y ${items.length - 3} más` : '';
        const noteText = `🛒 Carrito abandonado en Shopify\n${itemList}${more}\nTotal: $${total.toFixed(2)} ${currency}\n${c.abandoned_checkout_url || ''}`.trim();

        // Guardar como nota interna en la conversación
        await sb.from('messages').insert({
          conversation_id: conv.id,
          sender: 'note',
          content: noteText,
          channel: 'wa',
          sent_at: new Date().toISOString()
        });

        // Actualizar updated_at del contacto para que suba en la lista
        await sb.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contact.id);

        console.log(`[Shopify] Carrito abandonado registrado para contacto ${contact.id}`);
        return res.status(200).json({ status: 'abandoned_cart_noted', contact_id: contact.id });
      }

      default:
        console.log(`Topic no manejado: ${topic}`);
        return res.status(200).json({ status: 'ignored', topic });
    }

  } catch (error) {
    console.error('Shopify webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
}

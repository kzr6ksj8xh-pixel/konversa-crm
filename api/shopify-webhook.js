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

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function verifyShopifyWebhook(req) {
  if (!SHOPIFY_API_SECRET) return true;
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return false;
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const computed = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(rawBody, 'utf8').digest('base64');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(computed));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  if (!verifyShopifyWebhook(req)) {
    console.error('Shopify webhook: HMAC inválido');
    return res.status(401).json({ error: 'HMAC inválido' });
  }

  const topic = req.headers['x-shopify-topic'];
  const body = req.body;

  console.log(`[Shopify webhook] ${topic}`);

  try {
    const sb = await getSupabase();

    switch (topic) {
      // ── Producto creado o actualizado ──
      case 'products/create':
      case 'products/update': {
        const p = body;
        await sb.from('shopify_products').upsert({
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
        }, { onConflict: 'shopify_id' });

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
        await sb.from('shopify_orders').upsert({
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
        }, { onConflict: 'shopify_id' });

        return res.status(200).json({ status: 'order_synced', id: o.id });
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

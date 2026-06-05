-- ============================================================
-- KONVERSA CRM — TABLA DE INTEGRACIONES + SHOPIFY
-- ============================================================
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- ── 1. Tabla integrations — guarda tokens y config de cada integración
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  provider text NOT NULL,  -- 'shopify', 'meta', 'email'
  shop_domain text,        -- para Shopify: 'mi-tienda.myshopify.com'
  access_token text,       -- token encriptado
  refresh_token text,
  scopes text,
  config jsonb DEFAULT '{}'::jsonb,  -- config adicional por provider
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 2. Tabla shopify_products — cache local de productos Shopify
CREATE TABLE IF NOT EXISTS public.shopify_products (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_id bigint NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  vendor text,
  product_type text,
  handle text,
  status text DEFAULT 'active',
  variants jsonb DEFAULT '[]'::jsonb,
  images jsonb DEFAULT '[]'::jsonb,
  tags text[],
  price_min numeric,
  price_max numeric,
  inventory_total integer DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ── 3. Tabla shopify_orders — cache de pedidos recientes
CREATE TABLE IF NOT EXISTS public.shopify_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_id bigint NOT NULL UNIQUE,
  order_number text,
  email text,
  phone text,
  total_price numeric,
  currency text DEFAULT 'MXN',
  financial_status text,
  fulfillment_status text,
  customer_name text,
  line_items jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  synced_at timestamptz DEFAULT now()
);

-- ── 4. RLS para nuevas tablas
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;

-- integrations: solo admin ve/edita (contiene tokens sensibles)
CREATE POLICY "integrations_select" ON public.integrations FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "integrations_insert" ON public.integrations FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "integrations_update" ON public.integrations FOR UPDATE TO authenticated USING (public.is_admin());
CREATE POLICY "integrations_delete" ON public.integrations FOR DELETE TO authenticated USING (public.is_admin());

-- shopify_products: todos leen, solo admin modifica
CREATE POLICY "shopify_products_select" ON public.shopify_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "shopify_products_insert" ON public.shopify_products FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "shopify_products_update" ON public.shopify_products FOR UPDATE TO authenticated USING (public.is_admin());

-- shopify_orders: todos leen, solo admin modifica
CREATE POLICY "shopify_orders_select" ON public.shopify_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "shopify_orders_insert" ON public.shopify_orders FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "shopify_orders_update" ON public.shopify_orders FOR UPDATE TO authenticated USING (public.is_admin());

-- Bloquear anon
REVOKE ALL ON public.integrations FROM anon;
REVOKE ALL ON public.shopify_products FROM anon;
REVOKE ALL ON public.shopify_orders FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shopify_products TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.shopify_orders TO authenticated;

-- ── 5. Verificación
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('integrations', 'shopify_products', 'shopify_orders')
ORDER BY tablename;

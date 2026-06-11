-- ============================================================
-- KONVERSA CRM — RLS + RBAC SERVER-SIDE
-- ============================================================
-- Ejecutar en Supabase → SQL Editor (completo, de una vez)
-- ============================================================

-- ── 1. Helper: obtener rol del usuario actual ──────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── 2. Helper: verificar si es admin ───────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 3. Trigger: forzar rol 'operator' en signup ────────────
-- Previene que alguien se auto-asigne admin via API
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, avatar_initials)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'operator',  -- SIEMPRE operator, nunca confiar en el cliente
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 2))
  );
  RETURN NEW;
END;
$$;

-- Crear trigger si no existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 4. HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. POLÍTICAS RLS — PROFILES
-- ============================================================
-- Limpiar políticas existentes
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;

-- Todos los autenticados ven todos los perfiles (necesario para ver nombres de agentes)
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Usuario puede editar su propio perfil (excepto rol)
CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    -- ^ impide que cambie su propio rol
  );

-- Admin puede editar cualquier perfil (incluyendo cambiar roles)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Insert solo via trigger (handle_new_user), no directo
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());


-- ============================================================
-- 6. POLÍTICAS RLS — CONTACTS
-- ============================================================
DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;

-- Todos ven todos los contactos (equipo necesita contexto completo)
CREATE POLICY "contacts_select"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (true);

-- Crear contactos: propios (o admin). Evita WITH CHECK(true) permisivo.
CREATE POLICY "contacts_insert"
  ON public.contacts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR agent_id = auth.uid() OR agent_id IS NULL);

-- Operador solo edita sus contactos asignados, admin edita todos
CREATE POLICY "contacts_update"
  ON public.contacts FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR agent_id = auth.uid()
  );

-- Solo admin puede eliminar contactos
CREATE POLICY "contacts_delete"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ============================================================
-- 7. POLÍTICAS RLS — CONVERSATIONS
-- ============================================================
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_delete" ON public.conversations;

-- Todos ven todas las conversaciones
CREATE POLICY "conversations_select"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "conversations_insert"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR assigned_to = auth.uid() OR assigned_to IS NULL);

-- Operador solo edita conversaciones asignadas a él
CREATE POLICY "conversations_update"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR assigned_to = auth.uid()
  );

-- Solo admin elimina conversaciones
CREATE POLICY "conversations_delete"
  ON public.conversations FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ============================================================
-- 8. POLÍTICAS RLS — LEADS
-- ============================================================
DROP POLICY IF EXISTS "leads_select" ON public.leads;
DROP POLICY IF EXISTS "leads_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_update" ON public.leads;
DROP POLICY IF EXISTS "leads_delete" ON public.leads;

-- Todos ven todos los leads
CREATE POLICY "leads_select"
  ON public.leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "leads_insert"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR agent_id = auth.uid() OR agent_id IS NULL);

-- Operador solo edita sus leads, admin edita todos
CREATE POLICY "leads_update"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR agent_id = auth.uid()
  );

-- Solo admin elimina leads
CREATE POLICY "leads_delete"
  ON public.leads FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ============================================================
-- 9. POLÍTICAS RLS — MESSAGES
-- ============================================================
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_delete" ON public.messages;

-- Todos ven todos los mensajes (necesario para contexto de conversaciones)
CREATE POLICY "messages_select"
  ON public.messages FOR SELECT
  TO authenticated
  USING (true);

-- Insertar mensajes solo en conversaciones propias (o admin).
CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR conversation_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.assigned_to = auth.uid() OR c.assigned_to IS NULL)
    )
  );

-- Solo admin puede eliminar mensajes
CREATE POLICY "messages_delete"
  ON public.messages FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ============================================================
-- 10. POLÍTICAS RLS — TEMPLATES
-- ============================================================
DROP POLICY IF EXISTS "templates_select" ON public.templates;
DROP POLICY IF EXISTS "templates_insert" ON public.templates;
DROP POLICY IF EXISTS "templates_update" ON public.templates;
DROP POLICY IF EXISTS "templates_delete" ON public.templates;

-- Todos ven todas las plantillas
CREATE POLICY "templates_select"
  ON public.templates FOR SELECT
  TO authenticated
  USING (true);

-- Crear plantillas propias (o admin).
CREATE POLICY "templates_insert"
  ON public.templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() OR created_by = auth.uid() OR created_by IS NULL);

-- Creador o admin puede editar
CREATE POLICY "templates_update"
  ON public.templates FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR created_by = auth.uid()
  );

-- Creador o admin puede eliminar
CREATE POLICY "templates_delete"
  ON public.templates FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR created_by = auth.uid()
  );


-- ============================================================
-- 11. POLÍTICAS RLS — AUTOMATIONS
-- ============================================================
DROP POLICY IF EXISTS "automations_select" ON public.automations;
DROP POLICY IF EXISTS "automations_insert" ON public.automations;
DROP POLICY IF EXISTS "automations_update" ON public.automations;
DROP POLICY IF EXISTS "automations_delete" ON public.automations;

-- Todos ven las automatizaciones
CREATE POLICY "automations_select"
  ON public.automations FOR SELECT
  TO authenticated
  USING (true);

-- Solo admin puede crear/editar/eliminar automatizaciones
CREATE POLICY "automations_insert"
  ON public.automations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "automations_update"
  ON public.automations FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "automations_delete"
  ON public.automations FOR DELETE
  TO authenticated
  USING (public.is_admin());


-- ============================================================
-- 12. BLOQUEAR ANON (usuarios no autenticados)
-- ============================================================
-- Revocar todo acceso a anon en todas las tablas
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.contacts FROM anon;
REVOKE ALL ON public.conversations FROM anon;
REVOKE ALL ON public.leads FROM anon;
REVOKE ALL ON public.messages FROM anon;
REVOKE ALL ON public.templates FROM anon;
REVOKE ALL ON public.automations FROM anon;

-- Permitir solo a authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automations TO authenticated;

-- El service_role bypasea RLS (para webhooks/serverless)
-- No necesita grants adicionales


-- ============================================================
-- 12b. REVOCAR EXECUTE DE FUNCIONES SECURITY DEFINER
-- ============================================================
-- Son helpers internos de las políticas RLS, no RPC públicas.
-- Evita que anon/authenticated las invoquen vía /rest/v1/rpc/*.
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;


-- ============================================================
-- 12c. ÍNDICES EN FOREIGN KEYS (perf + RLS subqueries)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contacts_agent_id ON public.contacts(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON public.leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_contact_id ON public.leads(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON public.conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON public.templates(created_by);


-- ============================================================
-- 13. VERIFICACIÓN
-- ============================================================
-- Ejecutá esto después para confirmar que RLS está activo:
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

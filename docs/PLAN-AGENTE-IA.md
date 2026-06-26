# Plan: Programar el Agente IA de Konversa con código real

> Objetivo: convertir el panel "Agente IA" (hoy maqueta visual) en un agente
> **realmente programable** desde la UI, con tres ejes:
> **(1) Pautas reales**, **(2) Integraciones reales**, **(3) Nuevas fuentes de conocimiento**.

---

## 1. Diagnóstico del estado actual

### Lo que SÍ es real (backend en producción)
- `api/webhook.js` — recibe WhatsApp / Messenger / Instagram desde Meta, persiste
  contacto/conversación/mensaje en Supabase, llama a **Claude** (`claude-haiku-4-5`)
  y responde. Tiene fallback inteligente por keywords si la API falla.
- `api/shopify.js` — OAuth real + sync de productos/pedidos a las tablas
  `shopify_products` / `shopify_orders`. Incluye `searchProduct()` y `orderStatus()`
  pensadas "para el agente IA".
- `api/test-chat.js` — endpoint autenticado para probar a Claude.
- `supabase/functions/automation-cron/index.ts` — reglas de automatización por tiempo
  (lead estancado, bot de descuento) vía pg_cron.

### Lo que es MAQUETA (no conectado)
| UI (tab) | Realidad |
|---|---|
| **Personalidad** (`#aiaPrompt`, `#aiaPautas`) | El textarea/pautas se guardan solo en `localStorage`. **No** llegan al bot. |
| **Pautas** | Lista HTML estática (líneas 851-861). |
| **Acciones** (`aiaActions`) | Array JS en memoria, editable en pantalla, **no** persiste ni afecta al bot. |
| **Fuentes** | Tabla HTML estática (un Google Doc de adorno + texto fijo). |
| **Integraciones** | Solo Shopify tiene flujo real; el resto son tarjetas. |
| **Toggle "Activado/Desactivado"** | Solo cambia color (`aiAgentActive` en memoria). El bot **siempre** responde. |
| Chat de prueba (`sendAIAChat`) | Usa respuestas falsas (`aiaResponses`), **no** llama a `/api/test-chat`. |

### El gap central
El **`SYSTEM_PROMPT` y el catálogo están hardcodeados** en `api/webhook.js`
(líneas 44-108). Cambiar el comportamiento del bot hoy exige editar código y
redeploy. **Nada de lo que el usuario configura en la UI cambia al bot.**
Además, el webhook **no importa ni usa** `shopify.js`: el agente no consulta
precios/stock/pedidos reales — todo viene del texto fijo del prompt.

> **Conclusión:** el trabajo no es "construir un agente" (ya existe y funciona),
> sino **conectar la configuración a una fuente de verdad (Supabase)** y que
> `webhook.js` la lea en caliente, más darle **herramientas** (tools) e
> **ingesta de conocimiento**.

---

## 2. Arquitectura objetivo

```
            ┌──────────────────────── UI (index.html, tab Agente IA) ───────────────────────┐
            │  Personalidad · Pautas · Acciones · Fuentes · Integraciones · Ajustes         │
            └───────────────┬───────────────────────────────────────────────────────────────┘
                            │  (JWT Supabase)
            ┌───────────────▼───────────────┐     ┌──────────────────────────────┐
            │  /api/agent-config (GET/PUT)  │     │  /api/knowledge (CRUD+ingest)│
            └───────────────┬───────────────┘     └───────────────┬──────────────┘
                            │                                      │
              ┌─────────────▼──────────────────────────────────────▼───────────────┐
              │                         SUPABASE (fuente de verdad)                 │
              │  agent_config · agent_actions · knowledge_sources · knowledge_chunks│
              │  integrations · shopify_products · shopify_orders                   │
              └─────────────▲───────────────────────────────────────────────────────┘
                            │  (service_role, lectura cacheada)
   Meta ──webhook──►  api/webhook.js  ──►  buildSystemPrompt(config) + retrieveKnowledge(msg)
                            │                       + TOOLS [buscar_producto, estado_pedido,
                            │                                transferir_a_humano, agendar_cita]
                            └────────────►  Claude (tool use) ────►  respuesta
```

### Tablas nuevas (Supabase)

```sql
-- ── Configuración del agente (1 fila por cuenta; multi-tenant: por org_id) ──
CREATE TABLE public.agent_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active     boolean NOT NULL DEFAULT true,          -- el toggle REAL
  persona       text    NOT NULL DEFAULT '',            -- "Personalidad" (textarea)
  pautas        jsonb   NOT NULL DEFAULT '[]'::jsonb,    -- [{texto, prohibida:bool}]
  tone          text    DEFAULT 'cercano',
  response_len  text    DEFAULT 'corta',                -- corta|media|larga
  max_lines     int     DEFAULT 3,
  signature     text    DEFAULT 'Equipo PINGUS – The Health Guardian',
  banned_words  text[]  DEFAULT '{}',
  business_hours jsonb  DEFAULT '{"tz":"America/Mexico_City","days":"1-5","from":"09:00","to":"19:00"}',
  fallback_human text   DEFAULT 'Te conecto con un asesor para darte el dato exacto.',
  model         text    DEFAULT 'claude-haiku-4-5-20251001',
  updated_by    uuid REFERENCES public.profiles(id),
  updated_at    timestamptz DEFAULT now()
);

-- ── Acciones (las "Acciones" de la UI; reglas When/Do/More) ──
CREATE TABLE public.agent_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position    int  NOT NULL DEFAULT 0,
  enabled     boolean DEFAULT true,
  cuando      text NOT NULL,            -- "Cuando"
  hacer       text NOT NULL,            -- "Hacer"
  mas         text,                     -- "Más"
  disjunctive boolean DEFAULT true,     -- alguna vs todas las condiciones
  created_at  timestamptz DEFAULT now()
);

-- ── Fuentes de conocimiento ──
CREATE TABLE public.knowledge_sources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL,            -- 'texto' | 'url' | 'google_doc' | 'faq' | 'shopify' | 'archivo'
  title       text NOT NULL,
  ref         text,                     -- URL / fileId de Drive / null
  content     text,                     -- texto crudo (para 'texto'/'faq')
  status      text DEFAULT 'activa',    -- activa | pausada | error
  enabled     boolean DEFAULT true,
  synced_at   timestamptz,
  error       text,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now()
);

-- ── Chunks + embeddings (solo si se activa RAG; requiere extensión vector) ──
-- CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE public.knowledge_chunks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
  chunk       text NOT NULL,
  tokens      int,
  embedding   vector(1024),             -- voyage-3 = 1024 dims
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX ON public.knowledge_chunks USING ivfflat (embedding vector_cosine_ops);

-- RLS: lectura/escritura solo admin autenticado (igual patrón que integrations).
-- service_role (webhook) salta RLS para leer config en caliente.
```

---

## 3. Eje 1 — Pautas reales

**Meta:** que `Personalidad`, `Pautas`, `Acciones`, `Ajustes` y el `toggle`
de la UI **definan de verdad** cómo responde el bot, sin tocar código.

### 3.1 Backend
1. **Nuevo endpoint `api/agent-config.js`** (autenticado con JWT Supabase, `is_admin()`):
   - `GET` → devuelve `agent_config` + `agent_actions`.
   - `PUT` → valida y guarda (longitudes, sanea, `updated_by`, `updated_at`).
2. **`api/webhook.js` — construir el prompt dinámicamente:**
   - Añadir `loadAgentConfig(sb)` con **caché en memoria del proceso** (TTL ~60 s)
     para no pegarle a la DB en cada mensaje.
   - Reemplazar la constante `SYSTEM_PROMPT` por `buildSystemPrompt(config, actions, knowledge)`:
     ```js
     function buildSystemPrompt(cfg, actions, kb) {
       const pautas = (cfg.pautas||[]).map(p => `- ${p.texto}`).join('\n');
       const banned = (cfg.banned_words||[]).join(', ');
       const acc = actions.filter(a=>a.enabled)
         .map(a => `CUANDO ${a.cuando}\n→ HACER: ${a.hacer}${a.mas?`\n  (${a.mas})`:''}`).join('\n\n');
       return [
         cfg.persona,
         `PAUTAS (OBLIGATORIAS):\n${pautas}`,
         `Máximo ${cfg.max_lines} líneas. Respuestas ${cfg.response_len}.`,
         banned && `PALABRAS PROHIBIDAS: ${banned}`,
         acc && `ACCIONES:\n${acc}`,
         kb && `FUENTES DE CONOCIMIENTO:\n${kb}`,
         `Horario humano: ${JSON.stringify(cfg.business_hours)}.`,
         `Firma: "${cfg.signature}" solo al entregar info clave.`,
       ].filter(Boolean).join('\n\n');
     }
     ```
   - **Respetar el toggle:** si `cfg.is_active === false`, el bot **no** responde
     automáticamente (solo persiste el entrante + push al agente humano). Eso hace
     real el botón "Activar/Desactivar agente".
   - Migrar el catálogo PINGUS hardcodeado a una **fuente de conocimiento semilla**
     (ver Eje 3), para que deje de vivir en el código.

### 3.2 Frontend (`index.html`, tab Agente IA)
- `saveAIASettings()` y guardado de Personalidad → `PUT /api/agent-config` (en vez de `localStorage`).
- `aiaPautas`: convertir la lista estática en **CRUD** (añadir / editar / eliminar /
  marcar "prohibida") que guarda en `agent_config.pautas`.
- `aiaActions`: persistir el array contra `agent_actions` (ya hay UI de edición;
  falta el `fetch`).
- `toggleAgentStatus()` → `PUT { is_active }` y reflejar estado al cargar.
- Chat de prueba (`sendAIAChat`) → llamar al **`/api/test-chat` real** (que también
  debe leer `agent_config`) para que "probar" pruebe la config viva.

**Entregable del eje:** lo que se escribe en la UI cambia el comportamiento del
bot de WhatsApp/Messenger/IG en < 1 min (TTL de caché), sin redeploy.

---

## 4. Eje 2 — Integraciones reales

**Meta:** que el agente **consulte datos vivos** y **ejecute acciones**, no que
recite un catálogo fijo. Se implementa con **tool use (function calling) de Claude**.

### 4.1 Dar herramientas a Claude en `webhook.js`
Añadir el bloque `tools` a la llamada de la API y un bucle de tool-use:

```js
const TOOLS = [
  { name: 'buscar_producto',
    description: 'Busca productos reales (precio, stock, link) en la tienda Shopify conectada.',
    input_schema: { type:'object', properties:{ query:{type:'string'} }, required:['query'] } },
  { name: 'estado_pedido',
    description: 'Consulta el estado de un pedido por email del cliente.',
    input_schema: { type:'object', properties:{ email:{type:'string'} }, required:['email'] } },
  { name: 'transferir_a_humano',
    description: 'Escala la conversación a un asesor humano y marca el lead como calificado.',
    input_schema: { type:'object', properties:{ motivo:{type:'string'} }, required:['motivo'] } },
  { name: 'agendar_cita',
    description: 'Agenda una cita/demostración en el calendario del equipo.',
    input_schema: { type:'object', properties:{ fecha:{type:'string'}, nombre:{type:'string'} }, required:['fecha'] } },
];
```

Manejo de cada tool:
- **`buscar_producto`** → reutiliza `searchProduct(sb, query)` de `shopify.js`
  (extraer a un módulo compartido `lib/shopify-data.js`). Devuelve título, precio,
  stock y handle reales. **Esto elimina el catálogo hardcodeado.**
- **`estado_pedido`** → `orderStatus(sb, email)`.
- **`transferir_a_humano`** → marca `conversations.assigned_to` / `contacts.stage =
  'calificado'`, dispara `sendPushToAgents`, y responde el mensaje de handoff.
  Hace reales las "Acciones" de escalamiento.
- **`agendar_cita`** → **Google Calendar** (hay MCP/credenciales disponibles en el
  entorno) o webhook a un Calendly; crea el evento y confirma.

### 4.2 Estado real de integraciones en la UI
- La tab **Integraciones** debe leer la tabla `integrations` (`GET /api/agent-config`
  puede incluir `integrations` activas) para mostrar **Conectado/No conectado** real
  por proveedor, en lugar del chip fijo.
- Shopify ya tiene OAuth + sync; solo falta **cablear la búsqueda al bot** (4.1) y
  un cron de re-sync (extender `automation-cron` o un cron Vercel) para mantener
  precios/stock frescos.

### 4.3 Integraciones candidatas (orden sugerido)
1. **Shopify** (ya 80% hecho) → conectar tool `buscar_producto`/`estado_pedido`. **Quick win.**
2. **Google Calendar** → `agendar_cita` (demos/visitas).
3. **Meta/WhatsApp Catálogo** → enviar productos como tarjetas nativas.
4. **Email / Google Drive** → ver Eje 3 (Drive como fuente de conocimiento).

**Entregable del eje:** el bot responde con **precio y stock reales** de Shopify,
agenda citas y escala a humano de verdad — todo decidido por Claude vía tools.

---

## 5. Eje 3 — Añadir nuevas fuentes de conocimiento

**Meta:** que el equipo agregue conocimiento (texto, URL, Google Doc, FAQ, productos)
desde la UI y el bot lo use al responder. Se hace en **dos niveles**:

### Nivel A — Concatenación directa (Fase 1, simple y barato)
Para bases de conocimiento pequeñas (lo típico de una PyME): se concatena el
contenido de las `knowledge_sources` **activas** dentro del system prompt.
- `loadKnowledge(sb)` (cacheado) → junta `content` de fuentes `enabled` hasta un
  presupuesto de tokens (ej. 4-6k) y lo inyecta en `buildSystemPrompt`.
- Cubre 90% de los casos sin embeddings ni costos extra.

### Nivel B — RAG con embeddings (Fase 3, escalable)
Cuando el conocimiento crece (muchos docs/productos) y no cabe en el prompt:
- **Ingesta** (`/api/knowledge` action `ingest`): descarga/limpia el contenido,
  lo parte en chunks (~500 tokens), genera embeddings y los guarda en `knowledge_chunks`.
- **Embeddings:** usar **Voyage AI `voyage-3`** (proveedor recomendado por Anthropic;
  Anthropic no ofrece API de embeddings propia). Alternativa: OpenAI `text-embedding-3`.
- **Recuperación:** por cada mensaje entrante, embeddear la consulta y traer top-k
  chunks por similitud coseno (`knowledge_chunks` con `ivfflat`); inyectar solo esos.

### 5.1 Tipos de fuente y su ingesta
| Tipo | Cómo se ingiere |
|---|---|
| `texto` / `faq` | Directo del textarea de la UI → `content`. |
| `url` | `fetch` + extracción de texto (limpiar HTML). Re-sync programable. |
| `google_doc` | **Google Drive MCP** (`read_file_content`) o API de Drive con el `fileId`. |
| `shopify` | Genera fuente sintética desde `shopify_products` (título+desc+precio). |
| `archivo` (PDF) | Subir a Storage + extraer texto (pdf-parse) → chunks. |

### 5.2 Backend y Frontend
- **`api/knowledge.js`** (autenticado): `list`, `create`, `update`, `delete`,
  `sync` (re-ingesta de una fuente), `ingest-all`.
- **Tab Fuentes** (hoy estática) → tabla real conectada a `knowledge_sources`:
  agregar fuente (modal por tipo), activar/pausar, re-sincronizar, ver estado/errores.
- Botón "Sincronizar productos" de Shopify ya existe (`syncShopifyNow`); añadir
  "Generar fuente desde productos" para volcar el catálogo a `knowledge_sources`.

**Entregable del eje:** el equipo agrega un Google Doc, una URL o un FAQ desde la
UI y el bot empieza a usarlo en sus respuestas (Nivel A inmediato; RAG cuando escale).

---

## 6. Plan por fases (incremental, cada fase deja algo usable)

### Fase 0 — Cimientos (0.5–1 día)
- Migración SQL: `agent_config`, `agent_actions`, `knowledge_sources` (+ RLS).
- Seed: volcar el `SYSTEM_PROMPT`/catálogo PINGUS actual a `agent_config` +
  una `knowledge_source` tipo `texto`, para no perder el comportamiento vigente.

### Fase 1 — Pautas reales (Eje 1)
- `api/agent-config.js` (GET/PUT).
- `webhook.js`: `loadAgentConfig` + `buildSystemPrompt` + respetar `is_active`.
- UI: Personalidad/Pautas/Acciones/Toggle → persisten en Supabase.
- Chat de prueba real contra `/api/test-chat` (que lee la config).

### Fase 2 — Integraciones reales (Eje 2)
- Extraer `lib/shopify-data.js`; añadir `tools` + bucle tool-use en `webhook.js`.
- Tools `buscar_producto`, `estado_pedido`, `transferir_a_humano`.
- UI Integraciones con estado real desde `integrations`.
- (Opcional) `agendar_cita` con Google Calendar.

### Fase 3 — Conocimiento Nivel A (Eje 3, concat)
- `api/knowledge.js` (CRUD + sync URL/Google Doc/Shopify).
- `loadKnowledge` concatenado en el prompt.
- Tab Fuentes funcional.

### Fase 4 — RAG (Eje 3, Nivel B) — solo si la KB crece
- `vector` + `knowledge_chunks`, embeddings Voyage, recuperación top-k.

---

## 7. Riesgos y consideraciones

- **Latencia serverless (Vercel):** tool-use añade 1–2 saltos a Claude. Mantener
  `max_tokens` acotado, cachear config/KB en el proceso, y limitar el bucle de
  tools (máx 2–3 iteraciones) para no exceder el timeout de la función.
- **Costo de tokens:** inyectar toda la KB en cada mensaje sube el costo. Nivel A
  con presupuesto de tokens; pasar a RAG (Nivel B) cuando la KB no quepa.
- **Seguridad:** `agent-config`/`knowledge` deben exigir `is_admin()` (RLS + check
  en el endpoint). Sanear el contenido de fuentes externas (URLs) — es texto que
  entra al prompt (riesgo de prompt-injection); aislarlo claramente como "datos de
  referencia, no instrucciones".
- **Multi-tenant:** si Konversa sirve a varias empresas, todas las tablas nuevas
  necesitan `org_id` y filtrar por la org del webhook (hoy el proyecto asume una
  sola cuenta PINGUS). Definir esto antes de la Fase 0 si aplica.
- **Caché de config:** un cambio en la UI tarda hasta el TTL (~60 s) en reflejarse
  en el bot. Aceptable; si se quiere instantáneo, invalidar caché por timestamp.
- **No romper el fallback:** mantener `fallbackReply` por si la config/DB falla.

---

## 8. Resumen de archivos a tocar

| Archivo | Cambio |
|---|---|
| `supabase/*.sql` (nuevo) | Migración: agent_config, agent_actions, knowledge_sources, knowledge_chunks + RLS + seed |
| `api/agent-config.js` (nuevo) | GET/PUT config + acciones (auth admin) |
| `api/knowledge.js` (nuevo) | CRUD + ingesta de fuentes |
| `lib/shopify-data.js` (nuevo) | Extraer `searchProduct`/`orderStatus` reutilizable |
| `api/webhook.js` | `loadAgentConfig`, `buildSystemPrompt`, `loadKnowledge`, tools + tool-use, respetar `is_active` |
| `api/test-chat.js` | Leer `agent_config` (misma config que producción) |
| `index.html` (tab Agente IA) | Conectar Personalidad/Pautas/Acciones/Toggle/Fuentes/Integraciones a los endpoints; chat de prueba real |
| `supabase/functions/automation-cron` | (Opcional) re-sync periódico de Shopify / re-ingesta de fuentes |

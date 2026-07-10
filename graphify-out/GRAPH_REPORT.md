# Graph Report - /Users/eggs./Documents/TRABAJO/APPS/konversa-crm  (2026-07-10)

## Corpus Check
- 35 files · ~62,887 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 237 nodes · 334 edges · 25 communities (24 shown, 1 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.84)
- Token cost: 131,067 input · 0 output

## Community Hubs (Navigation)
- SPA y Widget WhatsApp (Contexto)
- Webhook Meta (WhatsApp/FB/IG) + IA
- Integración Shopify (OAuth + ScriptTag)
- Edge Function: Automation Cron
- Configuración Vercel
- Manifest PWA
- Edge Function: Campañas Marketing
- API: Envío de Mensajes
- API: Test Chat
- Identidad de Marca (Logo)
- Dependencias (package.json)
- Privacidad y Cumplimiento Meta
- API: Borrado de Datos
- Webhook Shopify
- Widget WhatsApp (JS embebido)
- API: Google Drive Sync
- API: Suscripción Push
- Plan Agente IA (RAG)
- Deno Config: Automation Cron
- Deno Config: Marketing
- Extensión CTX WhatsApp (Assets)

## God Nodes (most connected - your core abstractions)
1. `processIncoming()` - 15 edges
2. `Supabase (backend: auth, Postgres, storage, realtime)` - 12 edges
3. `handler()` - 11 edges
4. `handleCallback()` - 8 edges
5. `Konversa CRM SPA (index.html, single-file app)` - 8 edges
6. `handleWhatsApp()` - 7 edges
7. `getSupabase()` - 6 edges
8. `handleMessenger()` - 6 edges
9. `handleInstagram()` - 6 edges
10. `handler()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Botón flotante de WhatsApp (Ctx:Whatsapp, versión gratis)` --conceptually_related_to--> `Canales omnicanal CH: WhatsApp, Messenger, Instagram DM, Email, Nota interna`  [INFERRED]
  CTX-WHATSAPP.md → index.html
- `Endpoint público GET /api/shopify?action=widget-config` --shares_data_with--> `Integrations module — credenciales Shopify/WA Business/Messenger/IG/SMTP/Meta/WA Cloud (INTEGRATIONS, renderIntegrations, saveIntegration)`  [INFERRED]
  CTX-WHATSAPP.md → index.html
- `api/webhook.js — webhook Meta (WA/Messenger/IG) + respuesta IA` --conceptually_related_to--> `Canales omnicanal CH: WhatsApp, Messenger, Instagram DM, Email, Nota interna`  [INFERRED]
  PLAN-AGENTE-IA.md → index.html
- `Tabla agent_config (toggle real, persona, pautas, tone, horario, modelo)` --conceptually_related_to--> `Supabase (backend: auth, Postgres, storage, realtime)`  [INFERRED]
  PLAN-AGENTE-IA.md → index.html
- `processIncoming()` --calls--> `sendPushToAgents()`  [EXTRACTED]
  api/webhook.js → lib/push.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Customer Message Data Flow (Meta to Konversa Infrastructure)** — privacy_meta_api, privacy_konversa_crm, privacy_supabase, privacy_vercel [INFERRED 0.85]
- **Flujo de mensaje saliente: chat UI → sendToChannel → /api/send + persistencia en Supabase** — index_inbox_view, index_send_to_channel, index_api_send, index_data_layer [EXTRACTED 1.00]
- **Arquitectura objetivo: UI → /api/agent-config → Supabase → webhook.js buildSystemPrompt → Claude** — plan_agente_ia_api_agent_config, plan_agente_ia_agent_config, plan_agente_ia_build_system_prompt, plan_agente_ia_api_webhook, plan_agente_ia_claude [EXTRACTED 1.00]
- **Flujo del widget: tienda Shopify → widget-config → api/shopify.js → número Konversa → wa.me** — ctx_whatsapp_widget_whatsapp, ctx_whatsapp_widget_config_endpoint, ctx_whatsapp_api_shopify, ctx_whatsapp_get_konversa_whatsapp_number [EXTRACTED 1.00]

## Communities (25 total, 1 thin omitted)

### Community 0 - "SPA y Widget WhatsApp (Contexto)"
Cohesion: 0.07
Nodes (42): api/shopify.js (OAuth + sync + widget-config + searchProduct/orderStatus), Guardián global window.__ctxWaMounted, CTX-WHATSAPP.md — Widget WhatsApp para Shopify (doc), getKonversaWhatsAppNumber() — resolución del número, Instalación automática vía ScriptTag (shopify-wa-widget.js), Theme App Extension — App embed block (extensions/ctx-whatsapp), Endpoint público GET /api/shopify?action=widget-config, Botón flotante de WhatsApp (Ctx:Whatsapp, versión gratis) (+34 more)

### Community 1 - "Webhook Meta (WhatsApp/FB/IG) + IA"
Cohesion: 0.14
Nodes (30): buildSystemPrompt(), callClaude(), CHANNEL_LABEL, claimEvent(), config, FALLBACK_RESPONSES, fallbackReply(), getAgentSettings() (+22 more)

### Community 2 - "Integración Shopify (OAuth + ScriptTag)"
Cohesion: 0.20
Nodes (21): ensureWhatsAppScriptTag(), getKonversaWhatsAppNumber(), getStoredToken(), getSupabase(), handleCallback(), handleInstall(), handler(), handleWidgetConfig() (+13 more)

### Community 3 - "Edge Function: Automation Cron"
Cohesion: 0.22
Nodes (14): ActionResult, addInternalNote(), Contact, Conversation, findWhatsAppConversation(), isWithin24HrWindow(), Lead, Message (+6 more)

### Community 4 - "Configuración Vercel"
Cohesion: 0.17
Nodes (11): maxDuration, maxDuration, maxDuration, maxDuration, functions, api/drive-sync.js, api/shopify.js, api/shopify-webhook.js (+3 more)

### Community 5 - "Manifest PWA"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 6 - "Edge Function: Campañas Marketing"
Cohesion: 0.28
Nodes (6): Campaign, Contact, runCampaign(), sendFBIG(), SendOutcome, sendWhatsAppTemplate()

### Community 7 - "API: Envío de Mensajes"
Cohesion: 0.46
Nodes (7): getSupabase(), handler(), isValidSupabaseUser(), sendFBIG(), sendMeta(), sendWhatsApp(), uploadMediaToWhatsApp()

### Community 8 - "API: Test Chat"
Cohesion: 0.36
Nodes (7): ALLOWED_ORIGINS, buildSystemPrompt(), handler(), rateLimit(), rateLimitMap, requireAuth(), testConversations

### Community 9 - "Identidad de Marca (Logo)"
Cohesion: 0.36
Nodes (8): Rounded-Square App Icon Format, Brand Color Palette (Navy, Orange, Blue, White), Conversation / Messaging Metaphor, Konversa CRM Product Identity, Konversa Logo, KONVERSA Wordmark, Orange Speech Bubble Icon, Three-Dot Typing Indicator

### Community 10 - "Dependencias (package.json)"
Cohesion: 0.25
Nodes (7): dependencies, @supabase/supabase-js, web-push, name, private, type, version

### Community 11 - "Privacidad y Cumplimiento Meta"
Cohesion: 0.29
Nodes (8): Data Deletion Mechanism, Grupo Pingus, Konversa CRM, Meta (Facebook) Platform API, Política de Uso de la Plataforma de Meta, Política de Privacidad (Privacy Policy), Supabase (Infrastructure Provider), Vercel (Infrastructure Provider)

### Community 12 - "API: Borrado de Datos"
Cohesion: 0.48
Nodes (6): ALLOWED_ORIGINS, deleteUserData(), escHtml(), getSupabase(), handler(), setCors()

### Community 13 - "Webhook Shopify"
Cohesion: 0.48
Nodes (6): config, getSupabase(), handler(), productPrices(), readRawBody(), verifyShopifyWebhook()

### Community 14 - "Widget WhatsApp (JS embebido)"
Cohesion: 0.60
Nodes (5): hideOtherWhatsAppWidgets(), injectStyles(), render(), shopDomain(), start()

### Community 15 - "API: Google Drive Sync"
Cohesion: 0.60
Nodes (4): base64url(), getGoogleAccessToken(), handler(), SA_KEY

### Community 16 - "API: Suscripción Push"
Cohesion: 0.60
Nodes (4): ALLOWED_ORIGINS, getSupabase(), handler(), setCors()

### Community 17 - "Plan Agente IA (RAG)"
Cohesion: 0.40
Nodes (5): Endpoint planificado /api/knowledge (CRUD + ingest), Tabla knowledge_chunks (chunks + embeddings vector(1024), ivfflat), Tabla knowledge_sources (texto/url/google_doc/faq/shopify/archivo), Nivel A: concatenación directa de conocimiento en el prompt, Nivel B: RAG con embeddings Voyage AI voyage-3

### Community 18 - "Deno Config: Automation Cron"
Cohesion: 0.50
Nodes (3): compilerOptions, lib, strict

### Community 19 - "Deno Config: Marketing"
Cohesion: 0.50
Nodes (3): compilerOptions, lib, strict

## Knowledge Gaps
- **66 isolated node(s):** `ALLOWED_ORIGINS`, `SA_KEY`, `ALLOWED_ORIGINS`, `config`, `ALLOWED_ORIGINS` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `ALLOWED_ORIGINS`, `SA_KEY`, `ALLOWED_ORIGINS` to the rest of the system?**
  _66 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `SPA y Widget WhatsApp (Contexto)` be split into smaller, more focused modules?**
  _Cohesion score 0.06736353077816493 - nodes in this community are weakly interconnected._
- **Should `Webhook Meta (WhatsApp/FB/IG) + IA` be split into smaller, more focused modules?**
  _Cohesion score 0.1350806451612903 - nodes in this community are weakly interconnected._
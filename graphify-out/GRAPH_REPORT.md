# Graph Report - /Users/eggs./Documents/TRABAJO/APPS/konversa-crm  (2026-07-10)

## Corpus Check
- 27 files · ~52,321 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 224 nodes · 321 edges · 24 communities
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 21 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Webhook Meta (WhatsApp/FB/IG) + IA
- SPA: Vistas, Auth y Arranque
- Integración Shopify (OAuth)
- Realtime: Contactos, Leads y Mensajes
- Edge Function: Automation Cron
- Push y Mensajería Omnicanal
- Manifest PWA
- Configuración Vercel
- Edge Function: Campañas Marketing
- Identidad de Marca (Logo)
- Dependencias (package.json)
- Privacidad y Cumplimiento Meta
- API: Borrado de Datos
- Webhook Shopify
- API: Test Chat
- Agente IA de Ventas (PINGUS)
- API: Suscripción Push
- API: Envío de Mensajes
- Deno Config: Automation Cron
- Deno Config: Marketing

## God Nodes (most connected - your core abstractions)
1. `processIncoming()` - 13 edges
2. `bootApp (App Bootstrap)` - 13 edges
3. `Supabase Client (sb)` - 11 edges
4. `handler()` - 10 edges
5. `startRealtime` - 9 edges
6. `handleCallback()` - 7 edges
7. `loadAllData` - 7 edges
8. `renderContactList` - 7 edges
9. `handler()` - 6 edges
10. `handleRealtimeMessage` - 6 edges

## Surprising Connections (you probably didn't know these)
- `processIncoming()` --calls--> `sendPushToAgents()`  [EXTRACTED]
  api/webhook.js → lib/push.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Realtime Resilience and Reconnection Flow** — index_startrealtime, index_resyncrealtime, index_startrealtimepoll, index_handlerealtimemessage, index_supabase_realtime [EXTRACTED 1.00]
- **Web Push Notification Pipeline (VAPID + Service Worker + Supabase)** — index_subscribetopush, index_api_push_public_key, index_push_subscriptions_table, index_service_worker, index_web_push [EXTRACTED 1.00]
- **AI Sales Agent Module (Grupo PINGUS Bot)** — index_ai_agent_view, index_loadaiagentstats, index_aiaresponses, index_aiaactions, index_sendaiachat [EXTRACTED 1.00]
- **Customer Message Data Flow (Meta to Konversa Infrastructure)** — privacy_meta_api, privacy_konversa_crm, privacy_supabase, privacy_vercel [INFERRED 0.85]

## Communities (24 total, 0 thin omitted)

### Community 0 - "Webhook Meta (WhatsApp/FB/IG) + IA"
Cohesion: 0.14
Nodes (26): callClaude(), CHANNEL_LABEL, config, FALLBACK_RESPONSES, fallbackReply(), getSupabase(), handleInstagram(), handleMessenger() (+18 more)

### Community 1 - "SPA: Vistas, Auth y Arranque"
Cohesion: 0.11
Nodes (27): /api/shopify Endpoint, bootApp (App Bootstrap), Demo Mode, doForgot (Password Recovery), doLogin, doLogout, doRegister, doResetPass (+19 more)

### Community 2 - "Integración Shopify (OAuth)"
Cohesion: 0.22
Nodes (18): getStoredToken(), getSupabase(), handleCallback(), handleInstall(), handler(), isValidOAuthState(), isValidShopDomain(), makeOAuthState() (+10 more)

### Community 3 - "Realtime: Contactos, Leads y Mensajes"
Cohesion: 0.19
Nodes (18): contacts Table (Supabase), conversations Table (Supabase), deleteContactFromDB (Cascade Delete), handleRealtimeContact, handleRealtimeMessage, leads Table (Supabase), loadMessagesFromDB, messages Table (Supabase) (+10 more)

### Community 4 - "Edge Function: Automation Cron"
Cohesion: 0.22
Nodes (14): ActionResult, addInternalNote(), Contact, Conversation, findWhatsAppConversation(), isWithin24HrWindow(), Lead, Message (+6 more)

### Community 5 - "Push y Mensajería Omnicanal"
Cohesion: 0.27
Nodes (10): /api/push-public-key Endpoint, /api/send Endpoint, Omnichannel Messaging (WhatsApp/Facebook/Instagram), push_subscriptions Table (Supabase), sendToChannel, Service Worker (PWA), showRealtimeNotif, subscribeToPush (+2 more)

### Community 6 - "Manifest PWA"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 7 - "Configuración Vercel"
Cohesion: 0.20
Nodes (9): maxDuration, maxDuration, maxDuration, functions, api/shopify.js, api/shopify-webhook.js, api/webhook.js, headers (+1 more)

### Community 8 - "Edge Function: Campañas Marketing"
Cohesion: 0.28
Nodes (6): Campaign, Contact, runCampaign(), sendFBIG(), SendOutcome, sendWhatsAppTemplate()

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

### Community 14 - "API: Test Chat"
Cohesion: 0.38
Nodes (6): ALLOWED_ORIGINS, handler(), rateLimit(), rateLimitMap, requireAuth(), testConversations

### Community 15 - "Agente IA de Ventas (PINGUS)"
Cohesion: 0.47
Nodes (6): AI Agent View, aiaActions (Editable AI Agent Rules), aiaResponses (AI Keyword Reply Map), Grupo PINGUS (The Health Guardian), loadAIAgentStats, sendAIAChat (AI Agent Test Chat)

### Community 16 - "API: Suscripción Push"
Cohesion: 0.60
Nodes (4): ALLOWED_ORIGINS, getSupabase(), handler(), setCors()

### Community 17 - "API: Envío de Mensajes"
Cohesion: 0.70
Nodes (4): handler(), sendFBIG(), sendWhatsApp(), uploadImageToWhatsApp()

### Community 18 - "Deno Config: Automation Cron"
Cohesion: 0.50
Nodes (3): compilerOptions, lib, strict

### Community 19 - "Deno Config: Marketing"
Cohesion: 0.50
Nodes (3): compilerOptions, lib, strict

## Knowledge Gaps
- **58 isolated node(s):** `ALLOWED_ORIGINS`, `ALLOWED_ORIGINS`, `config`, `ALLOWED_ORIGINS`, `rateLimitMap` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bootApp (App Bootstrap)` connect `SPA: Vistas, Auth y Arranque` to `Realtime: Contactos, Leads y Mensajes`, `Push y Mensajería Omnicanal`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `startRealtime` connect `Realtime: Contactos, Leads y Mensajes` to `SPA: Vistas, Auth y Arranque`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `Supabase Client (sb)` connect `SPA: Vistas, Auth y Arranque` to `Realtime: Contactos, Leads y Mensajes`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `ALLOWED_ORIGINS`, `ALLOWED_ORIGINS`, `config` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Webhook Meta (WhatsApp/FB/IG) + IA` be split into smaller, more focused modules?**
  _Cohesion score 0.13756613756613756 - nodes in this community are weakly interconnected._
- **Should `SPA: Vistas, Auth y Arranque` be split into smaller, more focused modules?**
  _Cohesion score 0.11396011396011396 - nodes in this community are weakly interconnected._
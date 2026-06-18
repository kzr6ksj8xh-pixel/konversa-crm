// automation-cron/index.ts
// Supabase Edge Function — scheduled automation rules for Konversa CRM.
// Intended to be called by pg_cron / Supabase Cron every hour.
//
// Auth: Bearer <CRON_SECRET> header required.
//
// Rules
//  1. Lead estancado en Cotización 24 hrs → WhatsApp message + internal note + bump updated_at
//  2. Lead estancado en cualquier etapa 48 hrs → internal note (skip if note already added in last 48 hrs)
//  3. Bot de descuento — 24 hrs sin respuesta del cliente → mensaje "15% de descuento en 48 hrs"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Lead {
  id: string;
  name: string;
  stage: string;
  updated_at: string;
  whatsapp: string | null;
  contact_id: string | null;
  agent_id: string | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string | null;
  stage: string | null;
  updated_at: string;
  agent_id: string | null;
}

interface Conversation {
  id: string;
  contact_id: string;
  channel: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender: string;
  content: string;
  channel: string | null;
  sent_at: string;
}

interface ActionResult {
  rule: string;
  leadId: string;
  success: boolean;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
}

/**
 * Send a free-form WhatsApp text message via Meta Cloud API.
 * Only valid within the 24-hour customer service window.
 */
async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  // Normalize phone: strip spaces/dashes, ensure it starts with country code digits only
  const normalized = to.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");

  const url =
    `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalized,
    type: "text",
    text: { preview_url: false, body: text },
  };

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Find or look-up the active WhatsApp conversation for a contact.
 * Returns null if none exists.
 */
async function findWhatsAppConversation(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, contact_id, channel")
    .eq("contact_id", contactId)
    .eq("channel", "wa")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as Conversation;
}

/**
 * Check whether the last inbound message in a conversation is within 24 hours.
 * Meta requires inbound contact within 24 hrs to send free-form messages.
 */
async function isWithin24HrWindow(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select("id, sent_at")
    .eq("conversation_id", conversationId)
    .in("sender", ["in", "customer"]) // inbound from customer
    .gte("sent_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

/**
 * Insert an internal note message into a conversation.
 */
async function addInternalNote(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender: "note",
    content,
    channel: null,
    sent_at: new Date().toISOString(),
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Check whether an internal note with the given content prefix was already
 * saved for this conversation within the last `hours` hours.
 */
async function noteExistsRecently(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  contentLike: string,
  hours: number,
): Promise<boolean> {
  const cutoff = new Date(
    Date.now() - hours * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("sender", "note")
    .ilike("content", `%${contentLike}%`)
    .gte("sent_at", cutoff)
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Rule 3 helpers — FB/IG sending
// ---------------------------------------------------------------------------

async function sendFBIGMessage(
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const resp = await fetch("https://graph.facebook.com/v21.0/me/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
        access_token: pageToken,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Rule 1 — Lead estancado en Cotización 24 hrs
// ---------------------------------------------------------------------------

async function runRule1(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  phoneNumberId: string,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  // Leads in 'cotizacion' stage not updated in the last 24 hrs
  const cutoff24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, name, stage, updated_at, whatsapp, contact_id, agent_id")
    .eq("stage", "cotizacion")
    .lt("updated_at", cutoff24);

  if (leadsError) {
    console.error("[Rule1] Error fetching leads:", leadsError.message);
    return results;
  }

  if (!leads || leads.length === 0) {
    console.log("[Rule1] No leads in cotizacion stalled >24h");
    return results;
  }

  for (const lead of leads as Lead[]) {
    try {
      // Resolve contact
      if (!lead.contact_id) {
        results.push({
          rule: "rule1",
          leadId: lead.id,
          success: false,
          detail: "No contact_id on lead",
        });
        continue;
      }

      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("id, name, phone, stage, updated_at, agent_id")
        .eq("id", lead.contact_id)
        .maybeSingle();

      if (contactError || !contact) {
        results.push({
          rule: "rule1",
          leadId: lead.id,
          success: false,
          detail: `Contact not found: ${contactError?.message ?? "null"}`,
        });
        continue;
      }

      const contactData = contact as Contact;

      // Find WhatsApp conversation
      const conversation = await findWhatsAppConversation(
        supabase,
        contactData.id,
      );

      let whatsappSent = false;
      let noteSaved = false;

      if (conversation) {
        const inWindow = await isWithin24HrWindow(supabase, conversation.id);
        const phone = contactData.phone ?? lead.whatsapp;

        if (inWindow && phone) {
          const message =
            `Hola ${contactData.name ?? lead.name}, ¿pudimos resolver tus dudas sobre nuestra propuesta? Estamos aquí para ayudarte 😊`;
          const waResult = await sendWhatsAppMessage(
            accessToken,
            phoneNumberId,
            phone,
            message,
          );
          whatsappSent = waResult.success;
          if (!waResult.success) {
            console.warn(
              `[Rule1] WhatsApp failed for lead ${lead.id}:`,
              waResult.error,
            );
          }
        } else {
          console.log(
            `[Rule1] Lead ${lead.id}: outside 24hr window or no phone — skipping WhatsApp`,
          );
        }

        // Always add internal note to conversation
        const noteContent =
          "🤖 Recordatorio automático enviado al cliente (cotización 24hrs sin movimiento)";
        const noteResult = await addInternalNote(
          supabase,
          conversation.id,
          noteContent,
        );
        noteSaved = noteResult.success;
        if (!noteResult.success) {
          console.warn(
            `[Rule1] Note failed for lead ${lead.id}:`,
            noteResult.error,
          );
        }
      } else {
        console.log(
          `[Rule1] Lead ${lead.id}: no WhatsApp conversation found`,
        );
      }

      // Bump updated_at to prevent re-triggering next hour
      const { error: updateError } = await supabase
        .from("leads")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", lead.id);

      if (updateError) {
        console.warn(
          `[Rule1] Could not bump updated_at for lead ${lead.id}:`,
          updateError.message,
        );
      }

      results.push({
        rule: "rule1",
        leadId: lead.id,
        success: true,
        detail: `whatsappSent=${whatsappSent}, noteSaved=${noteSaved}`,
      });
    } catch (e) {
      console.error(`[Rule1] Unexpected error for lead ${lead.id}:`, e);
      results.push({
        rule: "rule1",
        leadId: lead.id,
        success: false,
        detail: String(e),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Rule 2 — Lead estancado en cualquier etapa 48 hrs (solo nota interna)
// ---------------------------------------------------------------------------

async function runRule2(
  supabase: ReturnType<typeof createClient>,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  const cutoff48 = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, name, stage, updated_at, whatsapp, contact_id, agent_id")
    .lt("updated_at", cutoff48)
    .not("stage", "eq", "finalizado");

  if (leadsError) {
    console.error("[Rule2] Error fetching leads:", leadsError.message);
    return results;
  }

  if (!leads || leads.length === 0) {
    console.log("[Rule2] No leads stalled >48h");
    return results;
  }

  for (const lead of leads as Lead[]) {
    try {
      if (!lead.contact_id) {
        results.push({
          rule: "rule2",
          leadId: lead.id,
          success: false,
          detail: "No contact_id on lead",
        });
        continue;
      }

      const conversation = await findWhatsAppConversation(
        supabase,
        lead.contact_id,
      );

      if (!conversation) {
        // No conversation at all — skip silently (nothing to attach note to)
        results.push({
          rule: "rule2",
          leadId: lead.id,
          success: false,
          detail: "No conversation found for contact",
        });
        continue;
      }

      const NOTE_MARKER = "Lead sin actividad por más de 48 horas";

      // Skip if we already dropped this note in the last 48 hrs
      const alreadyNoted = await noteExistsRecently(
        supabase,
        conversation.id,
        NOTE_MARKER,
        48,
      );

      if (alreadyNoted) {
        results.push({
          rule: "rule2",
          leadId: lead.id,
          success: true,
          detail: "Note already exists — skipped",
        });
        continue;
      }

      const noteContent = `⏰ ${NOTE_MARKER}`;
      const noteResult = await addInternalNote(
        supabase,
        conversation.id,
        noteContent,
      );

      results.push({
        rule: "rule2",
        leadId: lead.id,
        success: noteResult.success,
        detail: noteResult.success
          ? "Internal note saved"
          : noteResult.error,
      });
    } catch (e) {
      console.error(`[Rule2] Unexpected error for lead ${lead.id}:`, e);
      results.push({
        rule: "rule2",
        leadId: lead.id,
        success: false,
        detail: String(e),
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Rule 3 — Bot de descuento 24 hrs sin respuesta del cliente
// ---------------------------------------------------------------------------

const DISCOUNT_MESSAGE =
  "¡Hola! 🎉 Aprovecha *15% de descuento* en todos los productos que compres *EN LAS PRÓXIMAS 48 HORAS*. ¡No dejes pasar esta oportunidad! 🛍️\n\n🌐 www.grupopingus.com";

const DISCOUNT_NOTE_MARKER = "Bot descuento 15 enviado";

async function runRule3(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  phoneNumberId: string,
  metaPageToken: string,
  force = false,
  minHours = 24,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  // Only send between 09:00 and 21:00 Mexico City time (skipped in force mode)
  if (!force) {
    const nowDate = new Date();
    const hourMX = Number(
      nowDate.toLocaleString("en-US", {
        timeZone: "America/Mexico_City",
        hour: "numeric",
        hour12: false,
      }),
    );
    if (hourMX < 9 || hourMX >= 21) {
      console.log(`[Rule3] Outside allowed hours (${hourMX}h MX) — skipping`);
      return results;
    }
  }

  const now = Date.now();

  // In force mode: any conversation silent >= minHours (no upper bound)
  // In cron mode: exact 24-25h window to avoid re-sending every hour
  const cutoffMin = new Date(now - (force ? minHours : 24) * 60 * 60 * 1000).toISOString();
  const cutoffMax = force ? undefined : new Date(now - 25 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("messages")
    .select("conversation_id")
    .in("sender", ["in", "customer"])
    .lt("sent_at", cutoffMin);

  if (cutoffMax) query = query.gte("sent_at", cutoffMax);

  const { data: candidateMessages, error: msgError } = await query;

  if (msgError) {
    console.error("[Rule3] Error fetching candidate messages:", msgError.message);
    return results;
  }

  if (!candidateMessages || candidateMessages.length === 0) {
    console.log("[Rule3] No inbound messages in the 24-25h window");
    return results;
  }

  const uniqueConvIds = [
    ...new Set(candidateMessages.map((m: { conversation_id: string }) => m.conversation_id)),
  ];

  for (const convId of uniqueConvIds) {
    try {
      // Confirm the LATEST inbound in this conversation is exactly in the 24-25h window.
      // If the customer sent a more recent message we skip (still active).
      const { data: latestInbound, error: latestErr } = await supabase
        .from("messages")
        .select("sent_at")
        .eq("conversation_id", convId)
        .in("sender", ["in", "customer"])
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr || !latestInbound) continue;

      const latestMs = new Date(latestInbound.sent_at).getTime();
      if (latestMs > now - minHours * 60 * 60 * 1000) continue; // still active
      if (!force && latestMs < now - 25 * 60 * 60 * 1000) continue; // cron: already handled

      // Skip if discount note already exists in this conversation (last 7 days)
      const alreadySent = await noteExistsRecently(
        supabase,
        convId,
        DISCOUNT_NOTE_MARKER,
        7 * 24,
      );
      if (alreadySent) {
        results.push({
          rule: "rule3",
          leadId: convId,
          success: true,
          detail: "Discount already sent — skipped",
        });
        continue;
      }

      // Fetch conversation + contact
      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .select("id, contact_id, channel")
        .eq("id", convId)
        .maybeSingle();

      if (convErr || !conv) continue;

      const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .select("id, name, phone, channels")
        .eq("id", (conv as Conversation & { channel: string }).contact_id)
        .maybeSingle();

      if (contactErr || !contact) continue;

      const channel = (conv as unknown as { channel: string }).channel;
      let messageSent = false;

      // Send via WhatsApp
      if (channel === "wa") {
        const phone =
          (contact as unknown as { phone: string | null }).phone ??
          // Fallback: look in channels JSONB
          (
            (contact as unknown as { channels: Array<{ ch: string; handle: string }> | null })
              .channels ?? []
          ).find((c) => c.ch === "wa")?.handle ?? null;

        if (phone && accessToken && phoneNumberId) {
          const waResult = await sendWhatsAppMessage(
            accessToken,
            phoneNumberId,
            phone,
            DISCOUNT_MESSAGE,
          );
          messageSent = waResult.success;
          if (!waResult.success) {
            console.warn(
              `[Rule3] WhatsApp failed for conv ${convId}:`,
              waResult.error,
            );
          }
        }
      } else if (channel === "fb" || channel === "ig") {
        // Resolve recipient handle from contacts.channels JSONB
        const contactChannels = (
          contact as unknown as {
            channels: Array<{ ch: string; handle: string }> | null;
          }
        ).channels ?? [];
        const channelEntry = contactChannels.find((c) => c.ch === channel);
        const recipientId = channelEntry?.handle;

        if (recipientId && metaPageToken) {
          const fbResult = await sendFBIGMessage(
            metaPageToken,
            recipientId,
            DISCOUNT_MESSAGE,
          );
          messageSent = fbResult.success;
          if (!fbResult.success) {
            console.warn(
              `[Rule3] FB/IG failed for conv ${convId}:`,
              fbResult.error,
            );
          }
        }
      }

      // Save outbound message in DB so it shows in the chat
      if (messageSent) {
        await supabase.from("messages").insert({
          conversation_id: convId,
          sender: "out",
          content: DISCOUNT_MESSAGE,
          channel,
          sent_at: new Date().toISOString(),
        });
      }

      // Always add internal note as audit trail
      const noteContent = `${DISCOUNT_NOTE_MARKER} enviado automáticamente — 24h sin respuesta del cliente. Entregado=${messageSent}.`;
      await addInternalNote(supabase, convId, noteContent);

      results.push({
        rule: "rule3",
        leadId: convId,
        success: true,
        detail: `channel=${channel}, messageSent=${messageSent}`,
      });
    } catch (e) {
      console.error(`[Rule3] Unexpected error for conv ${convId}:`, e);
      results.push({ rule: "rule3", leadId: convId, success: false, detail: String(e) });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // ── Auth ────────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (token !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ── Supabase client (service role — bypasses RLS) ───────────────────────
  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  // ── WhatsApp / Meta credentials ──────────────────────────────────────────
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const metaPageToken = Deno.env.get("META_PAGE_TOKEN") ?? "";

  const missingWa = !accessToken || !phoneNumberId;
  if (missingWa) {
    console.warn(
      "[automation-cron] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set — WhatsApp sends will be skipped",
    );
  }

  // ── Parámetros opcionales para disparo manual ────────────────────────────
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const minHours = parseInt(url.searchParams.get("minHours") ?? "24", 10);

  // ── Run rules ────────────────────────────────────────────────────────────
  const startedAt = new Date().toISOString();

  const [rule1Results, rule2Results, rule3Results] = await Promise.all([
    runRule1(supabase, accessToken, phoneNumberId),
    runRule2(supabase),
    runRule3(supabase, accessToken, phoneNumberId, metaPageToken, force, minHours),
  ]);

  const allResults = [...rule1Results, ...rule2Results, ...rule3Results];

  const summary = {
    ranAt: startedAt,
    rule1: {
      total: rule1Results.length,
      success: rule1Results.filter((r) => r.success).length,
      failed: rule1Results.filter((r) => !r.success).length,
    },
    rule2: {
      total: rule2Results.length,
      success: rule2Results.filter((r) => r.success).length,
      failed: rule2Results.filter((r) => !r.success).length,
    },
    rule3: {
      total: rule3Results.length,
      success: rule3Results.filter((r) => r.success).length,
      failed: rule3Results.filter((r) => !r.success).length,
    },
    details: allResults,
  };

  console.log("[automation-cron] Summary:", JSON.stringify(summary, null, 2));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { contactId, leadId } = req.body || {};
  if (!contactId && !leadId) return res.status(400).json({ error: 'contactId or leadId required' });

  const sb = await getSupabase();
  if (!sb) return res.status(500).json({ error: 'supabase_not_configured' });

  try {
    if (contactId) {
      const { data: convs } = await sb.from('conversations').select('id').eq('contact_id', contactId);
      const convIds = (convs || []).map(c => c.id);
      if (convIds.length) await sb.from('messages').delete().in('conversation_id', convIds);
      await sb.from('conversations').delete().eq('contact_id', contactId);
      await sb.from('leads').delete().eq('contact_id', contactId);
      await sb.from('contacts').delete().eq('id', contactId);
    } else {
      await sb.from('leads').delete().eq('id', leadId);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('delete-contact error:', e);
    return res.status(500).json({ error: e.message });
  }
}

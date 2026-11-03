import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (_req: Request) => {
  try {
    const now = new Date().toISOString();

    // Récupérer les sessions expirées
    const { data: expiredSessions, error: sessionsError } = await supabase
      .from('tenant_sessions')
      .select('id, reservation_id, email')
      .lt('expires_at', now);

    if (sessionsError) {
      return new Response(JSON.stringify({ error: sessionsError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const sessionIds = (expiredSessions || []).map((s: { id: string }) => s.id);
    const reservationIds = [...new Set((expiredSessions || []).map((s: { reservation_id: string }) => s.reservation_id))];

    if (sessionIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, purged: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Supprimer les photos associées
    await supabase.storage.from('etats-des-lieux').remove(
      reservationIds.flatMap((rid: string) => {
        const prefixes = ['checkin', 'checkout'];
        return prefixes.map((m) => `${rid}/${m}`);
      })
    );

    // Supprimer les photos de la DB
    await supabase.from('photos').delete().in('reservation_id', reservationIds);

    // Supprimer les pdf_reports
    await supabase.from('pdf_reports').delete().in('reservation_id', reservationIds);

    // Supprimer les checklists
    await supabase.from('checklists').delete().in('reservation_id', reservationIds);

    // Supprimer les sessions
    await supabase.from('tenant_sessions').delete().in('id', sessionIds);

    return new Response(JSON.stringify({ ok: true, purged: sessionIds.length }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

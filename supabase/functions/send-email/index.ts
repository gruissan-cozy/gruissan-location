import { createClient } from 'jsr:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const OWNER_EMAIL = Deno.env.get('OWNER_EMAIL') || 'gruissancozy@gmail.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(RESEND_API_KEY);

Deno.serve(async (req: Request) => {
  try {
    const { reservation_id, moment } = await req.json().catch(() => ({ reservation_id: null, moment: null }));
    if (!reservation_id || !moment) {
      return new Response(JSON.stringify({ error: 'reservation_id et moment requis' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: report, error: reportError } = await supabase
      .from('pdf_reports')
      .select('path, sent_to_tenant, sent_to_owner')
      .eq('reservation_id', reservation_id)
      .eq('moment', moment)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (reportError || !report) {
      return new Response(JSON.stringify({ error: 'PDF introuvable' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select('nom, email')
      .eq('id', reservation_id)
      .single();

    const tenantEmail = booking?.email || OWNER_EMAIL;

    // Télécharger le PDF
    const { data: pdfData, error: downloadError } = await supabase.storage.from('etats-des-lieux').download(report.path);
    if (downloadError || !pdfData) {
      return new Response(JSON.stringify({ error: 'PDF introuvable dans Storage' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const pdfBuffer = await pdfData.arrayBuffer();

    const results = await Promise.allSettled([
      // Email au locataire
      !report.sent_to_tenant
        ? resend.emails.send({
            from: 'Gruissan Cozy <onboarding@resend.dev>',
            to: [tenantEmail],
            subject: `État des lieux ${moment === 'checkin' ? 'check-in' : 'check-out'} — Gruissan Cozy`,
            html: `<p>Bonjour,</p><p>Votre état des lieux ${moment === 'checkin' ? 'd\'entrée' : 'de sortie'} est en pièce jointe.</p><p>À bientôt,<br/>Gruissan Cozy</p>`,
            attachments: [{ filename: `etat-des-lieux-${moment}.pdf`, content: Buffer.from(pdfBuffer) }],
          })
        : Promise.resolve({ ok: true as const, skipped: 'tenant' as const }),
      // Email au propriétaire
      !report.sent_to_owner
        ? resend.emails.send({
            from: 'Gruissan Cozy <onboarding@resend.dev>',
            to: [OWNER_EMAIL],
            subject: `[ADMIN] État des lieux ${moment === 'checkin' ? 'check-in' : 'check-out'} — ${booking?.nom || '?'}`,
            html: `<p>Nouvel état des lieux ${moment === 'checkin' ? 'd\'entrée' : 'de sortie'} pour ${booking?.nom || '?'}.</p><p>Pièce jointe : PDF.</p>`,
            attachments: [{ filename: `etat-des-lieux-${moment}-${reservation_id}.pdf`, content: Buffer.from(pdfBuffer) }],
          })
        : Promise.resolve({ ok: true as const, skipped: 'owner' as const }),
    ]);

    const sentToTenant = results[0].status === 'fulfilled' && !(results[0].value as any).skipped;
    const sentToOwner = results[1].status === 'fulfilled' && !(results[1].value as any).skipped;

    await supabase
      .from('pdf_reports')
      .update({ sent_to_tenant: sentToTenant, sent_to_owner: sentToOwner })
      .eq('reservation_id', reservation_id)
      .eq('moment', moment);

    return new Response(JSON.stringify({ ok: true, sentToTenant, sentToOwner }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

import { BUCKET, corsHeaders, createServiceClient, jsonResponse, readTenantToken, validateTenantToken } from '../_shared/tenant.ts';

const EMAIL_COPY: Record<string, { tenantSubject: string; tenantBody: string; ownerSubject: string; ownerBody: string; reportFile: string }> = {
  fr: {
    tenantSubject: 'Votre état des lieux {step} — Gruissan Cozy',
    tenantBody: 'Bonjour {name},<br>Vous trouverez en pièce jointe le PDF de votre état des lieux {step} à Gruissan Cozy.<br>Bonne journée.',
    ownerSubject: '[Gruissan Cozy] État des lieux {step} — {name}',
    ownerBody: 'État des lieux {step} reçu pour {name} ({email}). Le rapport signé est en pièce jointe.',
    reportFile: 'etat-des-lieux',
  },
  en: {
    tenantSubject: 'Your {step} inventory — Gruissan Cozy',
    tenantBody: 'Hello {name},<br>Please find attached the PDF of your {step} inventory at Gruissan Cozy.<br>Kind regards.',
    ownerSubject: '[Gruissan Cozy] {step} inventory — {name}',
    ownerBody: '{step} inventory received for {name} ({email}). The signed report is attached.',
    reportFile: 'inventory-report',
  },
  es: {
    tenantSubject: 'Su inventario de {step} — Gruissan Cozy',
    tenantBody: 'Hola {name},<br>Adjuntamos el PDF del inventario de {step} de Gruissan Cozy.<br>Un saludo.',
    ownerSubject: '[Gruissan Cozy] Inventario de {step} — {name}',
    ownerBody: 'Inventario de {step} recibido para {name} ({email}). Se adjunta el informe firmado.',
    reportFile: 'informe-inventario',
  },
  de: {
    tenantSubject: 'Ihr {step}-Zustandsbericht — Gruissan Cozy',
    tenantBody: 'Guten Tag {name},<br>Im Anhang finden Sie das PDF Ihres {step}-Zustandsberichts für Gruissan Cozy.<br>Freundliche Grüße.',
    ownerSubject: '[Gruissan Cozy] {step}-Zustandsbericht — {name}',
    ownerBody: '{step}-Zustandsbericht für {name} ({email}) eingegangen. Der unterschriebene Bericht ist beigefügt.',
    reportFile: 'zustandsbericht',
  },
};

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function sendResendEmail(apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, result };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405);

  try {
    const session = await validateTenantToken(readTenantToken(req));
    if (!session) return jsonResponse({ error: 'Lien locataire invalide ou expiré.' }, 401);

    const body = await req.json().catch(() => null);
    const reservationId = body?.reservation_id;
    const moment = body?.moment;
    if (typeof reservationId !== 'string' || reservationId !== session.reservation_id || !['checkin', 'checkout'].includes(moment)) {
      return jsonResponse({ error: 'Réservation ou étape invalide.' }, 400);
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('RESEND_FROM_EMAIL');
    const ownerEmail = Deno.env.get('OWNER_EMAIL') || 'gruissancozy@gmail.com';
    if (!apiKey || !from) return jsonResponse({ error: 'Configuration email incomplète.' }, 503);

    const supabase = createServiceClient();
    const { data: report, error: reportError } = await supabase
      .from('pdf_reports')
      .select('id, path, sent_to_tenant, sent_to_owner')
      .eq('reservation_id', reservationId)
      .eq('moment', moment)
      .maybeSingle();
    if (reportError || !report) return jsonResponse({ error: 'Rapport PDF introuvable.' }, 404);

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('nom, email, statut, lang')
      .eq('id', reservationId)
      .maybeSingle();
    if (bookingError || !booking || !['confirmee', 'terminee'].includes(booking.statut)) {
      return jsonResponse({ error: 'Réservation non autorisée.' }, 403);
    }
    if (!booking.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.email)) {
      return jsonResponse({ error: 'Adresse email du locataire manquante ou invalide.' }, 422);
    }

    const { data: pdf, error: downloadError } = await supabase.storage.from(BUCKET).download(report.path);
    if (downloadError || !pdf) return jsonResponse({ error: 'Rapport PDF indisponible.' }, 502);
    const content = base64(new Uint8Array(await pdf.arrayBuffer()));
    const lang = booking.lang && EMAIL_COPY[booking.lang] ? booking.lang : 'fr';
    const step = ({ fr: moment === 'checkin' ? 'arrivée' : 'départ', en: moment === 'checkin' ? 'check-in' : 'check-out', es: moment === 'checkin' ? 'entrada' : 'salida', de: moment === 'checkin' ? 'Ankunft' : 'Abreise' })[lang as 'fr' | 'en' | 'es' | 'de'];
    const copy = EMAIL_COPY[lang];
    const safeName = htmlEscape(booking.nom);
    const safeEmail = htmlEscape(booking.email);
    const safeSubjectName = booking.nom.replace(/[\r\n]/g, ' ').slice(0, 120);
    const substituteHtml = (text: string) => text.replaceAll('{step}', step).replaceAll('{name}', safeName).replaceAll('{email}', safeEmail);
    const substituteSubject = (text: string) => text.replaceAll('{step}', step).replaceAll('{name}', safeSubjectName);
    const attachment = [{ filename: `${copy.reportFile}-${moment}.pdf`, content }];

    let sentTenant = Boolean(report.sent_to_tenant);
    let sentOwner = Boolean(report.sent_to_owner);
    const failures: string[] = [];

    if (!sentTenant) {
      const result = await sendResendEmail(apiKey, {
        from,
        to: [booking.email],
        subject: substituteSubject(copy.tenantSubject),
        html: substituteHtml(copy.tenantBody),
        attachments: [...attachment],
      });
      sentTenant = result.ok;
      if (!result.ok) failures.push('envoi_locataire');
    }

    if (!sentOwner) {
      const result = await sendResendEmail(apiKey, {
        from,
        to: [ownerEmail],
        subject: substituteSubject(copy.ownerSubject),
        html: substituteHtml(copy.ownerBody),
        attachments: [{ filename: `${copy.reportFile}-${moment}-${reservationId}.pdf`, content }],
      });
      sentOwner = result.ok;
      if (!result.ok) failures.push('envoi_proprietaire');
    }

    const statusMessage = failures.length ? `Échec : ${failures.join(', ')}` : null;
    const { error: updateError } = await supabase.from('pdf_reports').update({
      sent_to_tenant: sentTenant,
      sent_to_owner: sentOwner,
      error: statusMessage,
    }).eq('id', report.id);
    if (updateError) return jsonResponse({ error: 'Email traité, mais statut non enregistré. Réessayez.' }, 500);
    console.info(JSON.stringify({ event: 'tenant_report_email', reportId: report.id, moment, sentTenant, sentOwner, failureCount: failures.length }));
    if (failures.length) return jsonResponse({ ok: false, sentToTenant: sentTenant, sentToOwner: sentOwner, error: 'Un des emails n’a pas pu être envoyé.' }, 502);
    return jsonResponse({ ok: true, sentToTenant: sentTenant, sentToOwner: sentOwner });
  } catch {
    console.error('Erreur interne send-email (détails omis).');
    return jsonResponse({ error: 'Envoi des emails impossible.' }, 500);
  }
});

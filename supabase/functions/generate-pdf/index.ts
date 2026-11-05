import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';
import { BUCKET, corsHeaders, createServiceClient, jsonResponse, normalizePdfText, readTenantToken, validateTenantToken } from '../_shared/tenant.ts';

const A4: [number, number] = [595.28, 841.89];
const REQUIRED_ROOMS = ['living', 'kitchen', 'bedroom', 'mezzanine', 'bathroom', 'entrance'];
const PDF_COPY: Record<'fr' | 'en' | 'es' | 'de', Record<string, string>> = {
  fr: { title: 'ÉTAT DES LIEUX — GRUISSAN COZY', checkin: 'Étape : arrivée / check-in', checkout: 'Étape : départ / check-out', tenant: 'Locataire', stay: 'Séjour', created: 'Document établi le', guide: 'GUIDE DE L’APPARTEMENT', rooms: 'ÉTAT DES PIÈCES', condition: 'État général de la pièce', signature: 'SIGNATURE DU LOCATAIRE', signatureNote: 'Signature apposée sur écran tactile :', signed: 'Signé le', photo: 'PHOTO', ok: '[OK]', issue: '[À SIGNALER]' },
  en: { title: 'INVENTORY REPORT — GRUISSAN COZY', checkin: 'Stage: arrival / check-in', checkout: 'Stage: departure / check-out', tenant: 'Tenant', stay: 'Stay', created: 'Report generated', guide: 'APARTMENT GUIDE', rooms: 'ROOM CONDITION', condition: 'Overall room condition', signature: 'TENANT SIGNATURE', signatureNote: 'Signed on touchscreen:', signed: 'Signed on', photo: 'PHOTO', ok: '[OK]', issue: '[TO REPORT]' },
  es: { title: 'INVENTARIO — GRUISSAN COZY', checkin: 'Etapa: llegada / check-in', checkout: 'Etapa: salida / check-out', tenant: 'Inquilino', stay: 'Estancia', created: 'Informe generado', guide: 'GUÍA DEL APARTAMENTO', rooms: 'ESTADO DE LAS ESTANCIAS', condition: 'Estado general de la estancia', signature: 'FIRMA DEL INQUILINO', signatureNote: 'Firma realizada en pantalla táctil:', signed: 'Firmado el', photo: 'FOTO', ok: '[OK]', issue: '[A SEÑALAR]' },
  de: { title: 'ZUSTANDSBERICHT — GRUISSAN COZY', checkin: 'Schritt: Ankunft / Check-in', checkout: 'Schritt: Abreise / Check-out', tenant: 'Mieter', stay: 'Aufenthalt', created: 'Bericht erstellt am', guide: 'WOHNUNGSHANDBUCH', rooms: 'ZUSTAND DER RÄUME', condition: 'Allgemeiner Zustand des Raums', signature: 'UNTERSCHRIFT DES MIETERS', signatureNote: 'Auf dem Touchscreen unterschrieben:', signed: 'Unterschrieben am', photo: 'FOTO', ok: '[OK]', issue: '[ZU MELDEN]' },
};

const ROOM_NAMES: Record<'fr' | 'en' | 'es' | 'de', Record<string, string>> = {
  fr: { living: 'Pièce de vie', kitchen: 'Cuisine', bedroom: 'Chambre', mezzanine: 'Mezzanine', bathroom: 'Salle de bain', entrance: 'Entrée' },
  en: { living: 'Living room', kitchen: 'Kitchen', bedroom: 'Bedroom', mezzanine: 'Mezzanine', bathroom: 'Bathroom', entrance: 'Entrance' },
  es: { living: 'Sala de estar', kitchen: 'Cocina', bedroom: 'Dormitorio', mezzanine: 'Entresuelo', bathroom: 'Baño', entrance: 'Entrada' },
  de: { living: 'Wohnbereich', kitchen: 'Küche', bedroom: 'Schlafzimmer', mezzanine: 'Galerie', bathroom: 'Bad', entrance: 'Eingang' },
};

type ChecklistEntry = { room: string; item: string; ok: boolean; note: string | null };
type PhotoEntry = { room: string; path: string; mime: string; size: number };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405);

  try {
    const session = await validateTenantToken(readTenantToken(req));
    if (!session) return jsonResponse({ error: 'Lien locataire invalide ou expiré.' }, 401);

    const body = await req.json().catch(() => null);
    const reservationId = body?.reservation_id;
    const moment = body?.moment;
    const signatureDataUrl = body?.signature;
    if (typeof reservationId !== 'string' || reservationId !== session.reservation_id || !['checkin', 'checkout'].includes(moment)) {
      return jsonResponse({ error: 'Réservation ou étape invalide.' }, 400);
    }
    let signatureBytes: Uint8Array | null = null;
    if (signatureDataUrl !== undefined) {
      if (typeof signatureDataUrl !== 'string' || signatureDataUrl.length > 700_000) {
        return jsonResponse({ error: 'Signature invalide ou trop volumineuse.' }, 400);
      }
      const signatureMatch = signatureDataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
      if (!signatureMatch) return jsonResponse({ error: 'Format de signature invalide.' }, 415);
      signatureBytes = Uint8Array.from(atob(signatureMatch[1]), (char) => char.charCodeAt(0));
    }

    const supabase = createServiceClient();
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('check_in, check_out, nom, email, statut, lang')
      .eq('id', reservationId)
      .maybeSingle();
    if (bookingError || !booking) return jsonResponse({ error: 'Réservation introuvable.' }, 404);
    if (!['confirmee', 'terminee'].includes(booking.statut)) {
      return jsonResponse({ error: 'Cette réservation n’est pas confirmée.' }, 403);
    }

    const [{ data: checklist, error: checklistError }, { data: photos, error: photosError }, { data: guide, error: guideError }] = await Promise.all([
      supabase.from('checklists').select('room, item, ok, note').eq('reservation_id', reservationId).eq('moment', moment).order('room'),
      supabase.from('photos').select('room, path, mime, size').eq('reservation_id', reservationId).eq('moment', moment).order('created_at'),
      supabase.from('guide_sections').select('titre, contenu, ordre').eq('actif', true).order('ordre'),
    ]);
    if (checklistError || photosError || guideError) return jsonResponse({ error: 'Données de l’état des lieux indisponibles.' }, 500);
    const checklistRows = (checklist || []) as ChecklistEntry[];
    const photoRows = (photos || []) as PhotoEntry[];
    const invalidChecklist = checklistRows.length > 100 || checklistRows.some((row) =>
      !REQUIRED_ROOMS.includes(row.room) || typeof row.item !== 'string' || row.item.length > 120
      || typeof row.ok !== 'boolean'
      || (row.note !== null && (typeof row.note !== 'string' || row.note.length > 500))
    );
    if (invalidChecklist) return jsonResponse({ error: 'La checklist contient des données invalides.' }, 400);
    const rooms = REQUIRED_ROOMS;
    if (photoRows.length > REQUIRED_ROOMS.length * 2 || photoRows.some((photo) =>
      !rooms.includes(photo.room) || !['image/jpeg', 'image/png'].includes(photo.mime)
      || !Number.isInteger(photo.size) || photo.size < 1 || photo.size > 1_500_000
    ) || rooms.some((room) => photoRows.filter((photo) => photo.room === room).length > 2)) {
      return jsonResponse({ error: 'La liste de photos contient des données invalides.' }, 400);
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage(A4);
    let y = page.getHeight() - 48;
    const margin = 42;
    const contentWidth = page.getWidth() - margin * 2;
    const ink = rgb(0.08, 0.19, 0.28);
    const ocean = rgb(0.06, 0.30, 0.50);

    const nextPage = () => {
      page = pdf.addPage(A4);
      y = page.getHeight() - 48;
    };
    const ensureSpace = (height: number) => {
      if (y - height < 42) nextPage();
    };
    const textLine = (text: string, size = 10, isBold = false, indent = 0) => {
      ensureSpace(size + 6);
      page.drawText(normalizePdfText(text).replace(/[^\u0000-\u00ff]/g, '?'), { x: margin + indent, y, size, font: isBold ? bold : font, color: ink, maxWidth: contentWidth - indent });
      y -= size + 6;
    };
    const paragraph = (input: string, size = 9, isBold = false, indent = 0) => {
      const safe = normalizePdfText(input).replace(/[^\u0000-\u00ff]/g, '?');
      const words = safe.split(/\s+/).filter(Boolean);
      const activeFont = isBold ? bold : font;
      const maxWidth = contentWidth - indent;
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (activeFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
          textLine(line, size, isBold, indent);
          line = word;
        } else line = candidate;
      }
      if (line) textLine(line, size, isBold, indent);
    };

    const docLang = (['fr', 'en', 'es', 'de'].includes(booking.lang) ? booking.lang : 'fr') as 'fr' | 'en' | 'es' | 'de';
    const copy = PDF_COPY[docLang];
    const pdfText = (value: string) => normalizePdfText(value).replace(/[^\u0000-\u00ff]/g, '?');
    const roomName = (room: string) => ROOM_NAMES[docLang][room] || room;

    page.drawText(pdfText(copy.title), { x: margin, y, size: 15, font: bold, color: ocean });
    y -= 28;
    textLine(moment === 'checkin' ? copy.checkin : copy.checkout, 12, true);
    textLine(`${copy.tenant}: ${booking.nom}`);
    textLine(`${copy.stay}: ${booking.check_in} — ${booking.check_out}`);
    textLine(`${copy.created}: ${new Date().toLocaleString(docLang, { timeZone: 'Europe/Paris' })}`);
    y -= 8;

    if (guide?.length) {
      textLine(copy.guide, 12, true);
      for (const section of guide) {
        const title = section.titre?.[docLang] || section.titre?.fr || '';
        const html = section.contenu?.[docLang] || section.contenu?.fr || '';
        if (title) textLine(title, 10, true);
        const plainText = normalizePdfText(html
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
          .replace(/<[^>]*>/g, ' '));
        if (plainText) paragraph(plainText, 8);
        y -= 2;
      }
      y -= 6;
    }

    textLine(copy.rooms, 12, true);
    for (const room of rooms) {
      textLine(roomName(room), 10, true, 4);
      for (const row of checklistRows.filter((item) => item.room === room)) {
        textLine(`${row.ok ? copy.ok : copy.issue} ${row.item === 'condition' ? copy.condition : row.item}${row.note ? ` — ${row.note}` : ''}`, 9, false, 12);
      }
    }

    // Une page photo par pièce garde les images lisibles et leur légende associée.
    for (const room of rooms) {
      for (const photo of photoRows.filter((item) => item.room === room)) {
        const { data: file, error } = await supabase.storage.from(BUCKET).download(photo.path);
        if (error || !file) return jsonResponse({ error: `Photo indisponible pour ${room}.` }, 502);
        const bytes = new Uint8Array(await file.arrayBuffer());
        let image;
        try {
          image = photo.mime === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        } catch {
          return jsonResponse({ error: `Format photo illisible pour ${room}.` }, 415);
        }
        nextPage();
        textLine(`${copy.photo} — ${roomName(room)}`, 12, true);
        const scale = Math.min(contentWidth / image.width, 620 / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, { x: (page.getWidth() - width) / 2, y: Math.max(50, y - height), width, height });
        y = Math.max(46, y - height - 20);
      }
    }

    if (signatureBytes) {
      nextPage();
      textLine(copy.signature, 12, true);
      textLine(copy.signatureNote, 10);
      const signature = await pdf.embedPng(signatureBytes);
      const signatureWidth = Math.min(300, contentWidth);
      const signatureHeight = signature.height / signature.width * signatureWidth;
      page.drawImage(signature, { x: margin, y: Math.max(80, y - signatureHeight - 8), width: signatureWidth, height: signatureHeight });
      y = Math.max(62, y - signatureHeight - 24);
      textLine(`${copy.signed} ${new Date().toLocaleString(docLang, { timeZone: 'Europe/Paris' })}`, 9);
    }

    const pdfBytes = await pdf.save();
    const path = `${reservationId}/${moment}/etat-des-lieux-${moment}.pdf`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (uploadError) return jsonResponse({ error: 'Impossible d’enregistrer le rapport PDF.' }, 502);

    const { data: report, error: reportError } = await supabase.from('pdf_reports').upsert({
      reservation_id: reservationId,
      moment,
      path,
      size: pdfBytes.byteLength,
      sent_to_tenant: false,
      sent_to_owner: false,
      error: null,
    }, { onConflict: 'reservation_id,moment' }).select('id, path, size').single();
    if (reportError || !report) return jsonResponse({ error: 'Impossible d’enregistrer le rapport.' }, 500);

    const { data: signedPdf, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signedError || !signedPdf?.signedUrl) return jsonResponse({ error: 'Lien temporaire du PDF indisponible.' }, 502);

    console.info(JSON.stringify({ event: 'tenant_pdf_generated', reportId: report.id, moment, size: pdfBytes.byteLength }));
    return jsonResponse({ ok: true, report, signedUrl: signedPdf.signedUrl });
  } catch {
    console.error('Erreur interne generate-pdf (détails omis).');
    return jsonResponse({ error: 'La génération du PDF a échoué.' }, 500);
  }
});

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { PDFDocument, rgb, StandardFonts } from 'npm:pdf-lib@1.17.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'etats-des-lieux';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  try {
    const { reservation_id, moment } = await req.json().catch(() => ({ reservation_id: null, moment: null }));
    if (!reservation_id || !moment) {
      return new Response(JSON.stringify({ error: 'reservation_id et moment requis' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // 1. Récupérer la réservation
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('check_in, check_out, nom, email')
      .eq('id', reservation_id)
      .single();

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Réservation introuvable' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Récupérer la checklist
    const { data: checklist, error: checklistError } = await supabase
      .from('checklists')
      .select('room, item, ok, note')
      .eq('reservation_id', reservation_id)
      .eq('moment', moment);

    if (checklistError) {
      return new Response(JSON.stringify({ error: 'Checklist introuvable' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Récupérer les photos
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('room, path, mime')
      .eq('reservation_id', reservation_id)
      .eq('moment', moment);

    if (photosError) {
      return new Response(JSON.stringify({ error: 'Photos introuvables' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Générer le PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();

    let y = height - 50;
    const lineHeight = 16;
    const margin = 40;
    const maxWidth = width - margin * 2;

    const drawText = (text: string, size = 12, color = rgb(0, 0, 0)) => {
      page.drawText(text, { x: margin, y, size, font, color });
      y -= lineHeight;
    };

    const drawWrappedText = (text: string, size = 12, color = rgb(0, 0, 0)) => {
      const words = text.split(' ');
      let line = '';
      for (const word of words) {
        const test = line + word + ' ';
        if (font.widthOfTextAtSize(test, size) > maxWidth) {
          drawText(line.trim(), size, color);
          line = word + ' ';
        } else {
          line = test;
        }
      }
      if (line.trim()) drawText(line.trim(), size, color);
    };

    // Titre
    page.drawText(`État des lieux - ${moment === 'checkin' ? 'Check-in' : 'Check-out'}`, { x: margin, y, size: 18, font, color: rgb(0.06, 0.3, 0.55) });
    y -= 30;
    drawText(`Réservation: ${booking.nom}`, 12);
    drawText(`Dates: ${booking.check_in} → ${booking.check_out}`, 12);
    drawText(`Email: ${booking.email}`, 12);
    y -= 10;

    // Checklist
    drawText('Checklist:', 14, rgb(0.06, 0.3, 0.55));
    const grouped: Record<string, typeof checklist> = {};
    for (const item of checklist || []) {
      (grouped[item.room] ||= []).push(item);
    }

    for (const [room, items] of Object.entries(grouped)) {
      drawText(`• ${room}`, 12, rgb(0.2, 0.2, 0.2));
      for (const item of items) {
        const status = item.ok ? '✓' : '✗';
        drawText(`  ${status} ${item.item}${item.note ? ` (${item.note})` : ''}`, 11);
      }
      y -= 4;
    }

    y -= 10;
    drawText(`Généré le ${new Date().toISOString().split('T')[0]}`, 10, rgb(0.4, 0.4, 0.4));

    // 5. Ajouter les photos si présentes
    for (const photo of photos || []) {
      try {
        const { data: fileData, error: downloadError } = await supabase.storage.from(BUCKET).download(photo.path);
        if (downloadError || !fileData) continue;

        const imageBytes = await fileData.arrayBuffer();
        let image;
        if (photo.mime === 'image/png') {
          image = await pdfDoc.embedPng(imageBytes);
        } else {
          image = await pdfDoc.embedJpg(imageBytes);
        }

        const imageWidth = Math.min(200, maxWidth);
        const imageHeight = (image.height / image.width) * imageWidth;

        if (y - imageHeight < margin) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - 50;
        }

        page.drawImage(image, {
          x: margin,
          y: y - imageHeight,
          width: imageWidth,
          height: imageHeight,
        });
        y -= imageHeight + 10;
      } catch {
        // Ignorer les images invalides
      }
    }

    const pdfBytes = await pdfDoc.save();

    // 6. Upload dans Storage
    const fileName = `${reservation_id}/${moment}/etat-des-lieux-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(fileName, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (uploadError) {
      return new Response(JSON.stringify({ error: uploadError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 7. Mettre à jour pdf_reports
    const { error: updateError } = await supabase
      .from('pdf_reports')
      .update({ path: fileName, size: pdfBytes.byteLength })
      .eq('reservation_id', reservation_id)
      .eq('moment', moment);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, path: fileName, size: pdfBytes.byteLength }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});

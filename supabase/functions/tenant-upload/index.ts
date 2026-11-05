import { BUCKET, corsHeaders, createServiceClient, jsonResponse, readTenantToken, validateTenantToken } from '../_shared/tenant.ts';

const MAX_PHOTOS_PER_ROOM = 2;
const ALLOWED_ROOMS = new Set(['living', 'kitchen', 'bedroom', 'mezzanine', 'bathroom', 'entrance']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405);

  try {
    const session = await validateTenantToken(readTenantToken(req));
    if (!session) return jsonResponse({ error: 'Lien locataire invalide ou expiré.' }, 401);

    const body = await req.json().catch(() => null);
    if (!body || !['upload', 'delete', 'sign'].includes(body.action)) {
      return jsonResponse({ error: 'Action invalide.' }, 400);
    }

    const supabase = createServiceClient();
    const { data: booking, error: bookingError } = await supabase.from('bookings')
      .select('statut').eq('id', session.reservation_id).maybeSingle();
    if (bookingError || !booking || !['confirmee', 'terminee'].includes(booking.statut)) {
      return jsonResponse({ error: 'Réservation non autorisée.' }, 403);
    }

    if (body.action === 'upload') {
      const moment = body.moment;
      const room = body.room;
      const dataUrl = body.dataUrl;
      if (!['checkin', 'checkout'].includes(moment) || !ALLOWED_ROOMS.has(room)) {
        return jsonResponse({ error: 'Pièce ou étape invalide.' }, 400);
      }
      if (typeof dataUrl !== 'string') return jsonResponse({ error: 'Photo manquante.' }, 400);
      if (dataUrl.length > 2_100_000) return jsonResponse({ error: 'Photo trop volumineuse.' }, 413);

      const { count, error: countError } = await supabase.from('photos').select('id', { count: 'exact', head: true })
        .eq('reservation_id', session.reservation_id).eq('moment', moment).eq('room', room);
      if (countError) return jsonResponse({ error: 'Limite de photos indisponible.' }, 500);
      if ((count || 0) >= MAX_PHOTOS_PER_ROOM) return jsonResponse({ error: 'Maximum 2 photos par pièce.' }, 409);

      const match = dataUrl.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return jsonResponse({ error: 'Format photo non accepté.' }, 415);
      const mime = match[1] === 'png' ? 'image/png' : 'image/jpeg';
      const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
      if (bytes.byteLength > 1_500_000) return jsonResponse({ error: 'Photo trop volumineuse (1,5 Mo max).' }, 413);

      const path = `${session.reservation_id}/${moment}/${crypto.randomUUID()}.${mime === 'image/png' ? 'png' : 'jpg'}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
        contentType: mime,
        upsert: false,
      });
      if (uploadError) return jsonResponse({ error: 'Échec du stockage de la photo.' }, 502);

      const { data: photo, error: insertError } = await supabase.from('photos').insert({
        reservation_id: session.reservation_id,
        moment,
        room,
        path,
        mime,
        size: bytes.byteLength,
      }).select('id, room, moment').single();

      if (insertError || !photo) {
        await supabase.storage.from(BUCKET).remove([path]);
        return jsonResponse({ error: 'Échec de l’enregistrement de la photo.' }, 500);
      }
      console.info(JSON.stringify({ event: 'tenant_photo_uploaded', photoId: photo.id, moment, room, size: bytes.byteLength }));
      return jsonResponse({ photo });
    }

    const photoId = body.photoId;
    if (typeof photoId !== 'string') return jsonResponse({ error: 'Photo invalide.' }, 400);
    const { data: photo, error: photoError } = await supabase
      .from('photos')
      .select('id, reservation_id, path')
      .eq('id', photoId)
      .eq('reservation_id', session.reservation_id)
      .maybeSingle();
    if (photoError || !photo) return jsonResponse({ error: 'Photo introuvable.' }, 404);

    if (body.action === 'sign') {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photo.path, 300);
      if (error || !data?.signedUrl) return jsonResponse({ error: 'Aperçu indisponible.' }, 502);
      return jsonResponse({ url: data.signedUrl });
    }

    const { error: removeError } = await supabase.storage.from(BUCKET).remove([photo.path]);
    if (removeError) return jsonResponse({ error: 'Suppression de la photo impossible.' }, 502);
    const { error: deleteError } = await supabase.from('photos').delete().eq('id', photo.id);
    if (deleteError) return jsonResponse({ error: 'Suppression de la référence impossible.' }, 500);
    return jsonResponse({ ok: true });
  } catch {
    console.error('Erreur interne tenant-upload (détails omis).');
    return jsonResponse({ error: 'Erreur interne.' }, 500);
  }
});

/**
 * tenant-link — émission et gestion du lien locataire depuis /admin/sejours/.
 *
 * Jusqu'ici un lien ne pouvait être créé qu'en écrivant du SQL à la main dans
 * le SQL Editor Supabase. Cette fonction est le seul chemin d'écriture :
 *
 *   - elle vérifie le JWT de l'administrateur (`auth.getUser`) et refuse tout
 *     compte dont l'email n'est pas `ADMIN_EMAIL` ;
 *   - elle n'accepte que les séjours `confirme` / `termine` ;
 *   - elle borne l'expiration (lendemain du départ par défaut, 30 jours max)
 *     avec les règles pures de `_shared/lien.ts` ;
 *   - elle ne journalise JAMAIS le jeton ni la date d'expiration : un jeton
 *     dans les logs est un accès permanent pour qui les lit.
 *
 * Le jeton est renvoyé une seule fois au navigateur, qui construit l'URL
 * (`src/lib/lien-locataire.ts`). Aucune URL n'est fabriquée ici : la fonction
 * ne connaît pas l'adresse publique du site.
 */
import { corsHeaders, createServiceClient, jsonResponse } from '../_shared/tenant.ts';
import {
  expirationAcceptee,
  expirationDepuisDate,
  expirationParDefaut,
  genererJeton,
  sessionPublique,
  statutAccepteLien,
} from '../_shared/lien.ts';

/** Adresse du propriétaire : seule autorisée à émettre un lien. */
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') || 'gruissancozy@gmail.com').toLowerCase();

interface Corps {
  action?: unknown;
  reservation_id?: unknown;
  expires_at?: unknown;
}

/** Colonnes de `tenant_sessions` utiles à l'administration. */
const COLONNES = 'id, reservation_id, expires_at, token';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405);

  try {
    const supabase = createServiceClient();

    // --- Authentification : JWT de session Supabase, email propriétaire ---
    const entete = req.headers.get('authorization') || '';
    const jwt = entete.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ error: 'Authentification requise.' }, 401);

    const { data: utilisateur, error: authError } = await supabase.auth.getUser(jwt);
    const email = utilisateur?.user?.email?.toLowerCase();
    if (authError || !email || email !== ADMIN_EMAIL) {
      return jsonResponse({ error: 'Accès réservé au propriétaire.' }, 403);
    }

    const body = (await req.json().catch(() => null)) as Corps | null;
    if (!body || typeof body.action !== 'string') {
      return jsonResponse({ error: 'Action invalide.' }, 400);
    }
    const reservationId = body.reservation_id;
    if (typeof reservationId !== 'string' || !reservationId) {
      return jsonResponse({ error: 'Séjour invalide.' }, 400);
    }

    // --- Séjour : statut et date de départ font foi ---
    const { data: sejour, error: sejourError } = await supabase
      .from('sejours')
      .select('id, statut, depart, client_email, lang')
      .eq('id', reservationId)
      .maybeSingle();
    if (sejourError || !sejour) return jsonResponse({ error: 'Séjour introuvable.' }, 404);

    const existante = await supabase
      .from('tenant_sessions')
      .select(COLONNES)
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (body.action === 'lister') {
      if (existante.error) return jsonResponse({ error: 'Lecture du lien impossible.' }, 500);
      const vue = existante.data ? sessionPublique(existante.data) : null;
      return jsonResponse({ session: vue, lang: sejour.lang ?? null });
    }

    // Toutes les autres actions écrivent : statut du séjour obligatoire.
    if (!statutAccepteLien(sejour.statut)) {
      return jsonResponse(
        { error: 'Un lien ne peut être émis que pour un séjour confirmé ou terminé.' },
        409,
      );
    }

    if (body.action === 'creer') {
      const demandee = body.expires_at
        ? expirationDepuisDate(String(body.expires_at))
        : expirationParDefaut(sejour.depart);
      if (!expirationAcceptee(sejour.depart, demandee)) {
        return jsonResponse(
          { error: 'Expiration invalide : elle doit être future et au plus 30 jours après le départ.' },
          422,
        );
      }
      const expiresAt = demandee.toISOString();

      // Un lien encore actif est réaffiché plutôt que dupliqué (index unique
      // sur reservation_id depuis 0009).
      if (existante.data) {
        const vue = sessionPublique(existante.data);
        if (vue.active) return jsonResponse({ session: vue, lang: sejour.lang ?? null, reutilise: true });
        const { error: purgeError } = await supabase
          .from('tenant_sessions')
          .delete()
          .eq('reservation_id', reservationId);
        if (purgeError) return jsonResponse({ error: 'Remplacement du lien impossible.' }, 500);
      }

      const { data: creee, error: insertError } = await supabase
        .from('tenant_sessions')
        .insert({
          reservation_id: reservationId,
          email: sejour.client_email || null,
          token: genererJeton(),
          expires_at: expiresAt,
        })
        .select(COLONNES)
        .single();
      if (insertError || !creee) return jsonResponse({ error: 'Création du lien impossible.' }, 500);

      console.info(JSON.stringify({ event: 'tenant_link_created', reservationId }));
      return jsonResponse({ session: sessionPublique(creee), lang: sejour.lang ?? null }, 201);
    }

    if (body.action === 'expiration') {
      if (!existante.data) return jsonResponse({ error: 'Aucun lien à modifier.' }, 404);
      const demandee = expirationDepuisDate(body.expires_at ? String(body.expires_at) : null);
      if (!expirationAcceptee(sejour.depart, demandee)) {
        return jsonResponse(
          { error: 'Expiration invalide : elle doit être future et au plus 30 jours après le départ.' },
          422,
        );
      }
      const { data: miseAJour, error: updateError } = await supabase
        .from('tenant_sessions')
        .update({ expires_at: demandee.toISOString() })
        .eq('reservation_id', reservationId)
        .select(COLONNES)
        .single();
      if (updateError || !miseAJour) return jsonResponse({ error: 'Modification du lien impossible.' }, 500);

      console.info(JSON.stringify({ event: 'tenant_link_expiry_changed', reservationId }));
      return jsonResponse({ session: sessionPublique(miseAJour), lang: sejour.lang ?? null });
    }

    if (body.action === 'revoquer') {
      const { error: deleteError } = await supabase
        .from('tenant_sessions')
        .delete()
        .eq('reservation_id', reservationId);
      if (deleteError) return jsonResponse({ error: 'Révocation du lien impossible.' }, 500);

      console.info(JSON.stringify({ event: 'tenant_link_revoked', reservationId }));
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Action inconnue.' }, 400);
  } catch {
    console.error('Erreur interne tenant-link (détails omis).');
    return jsonResponse({ error: 'Gestion du lien impossible.' }, 500);
  }
});

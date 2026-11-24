import { BUCKET, corsHeaders, createServiceClient, jsonResponse } from '../_shared/tenant.ts';
import {
  RETENTION_COORDONNEES_JOURS,
  RETENTION_DONNEES_PERSONNELLES_JOURS,
  RETENTION_PREUVE_ANNEES,
  NOM_ANONYMISE,
  buildEffacementCoordonneesEntry,
  buildEffacementMessageEntry,
  buildEvidenceExpiryEntry,
  coordonneesExpiryCutoff,
  evidenceExpiryCutoff,
  planEffacementSejour,
  planReservationPurge,
  summarizePurge,
  type PurgeEntry,
} from '../_shared/purge.ts';

const BATCH_SIZE = 100;

function equalSecret(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

async function listFiles(supabase: ReturnType<typeof createServiceClient>, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) throw new Error('Dossier Storage imbriqué anormalement.');
  const files: string[] = [];
  for (let offset = 0; ; offset += BATCH_SIZE) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: BATCH_SIZE, offset });
    if (error) throw new Error('Lecture Storage impossible.');
    for (const entry of data || []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) files.push(...await listFiles(supabase, path, depth + 1));
      else files.push(path);
    }
    if (!data || data.length < BATCH_SIZE) break;
  }
  return files;
}

async function removeFiles(supabase: ReturnType<typeof createServiceClient>, paths: readonly string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error('Suppression Storage impossible.');
    removed += batch.length;
  }
  return removed;
}

async function countRows(
  supabase: ReturnType<typeof createServiceClient>,
  table: 'pdf_reports' | 'photos' | 'checklists',
  reservationId: string,
): Promise<number> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('reservation_id', reservationId);
  if (error) throw new Error('Lecture des données locataire impossible.');
  return count || 0;
}

/**
 * Purge quotidienne des données locataire.
 *
 * Deux temps, volontairement séparés :
 *  1. données personnelles (session expirée) : email, jeton, notes de
 *     checklist et fichiers hors preuve sont supprimés ; le PDF signé et
 *     les photos d'état des lieux sont CONSERVÉS et anonymisés (métadonnées
 *     vidées), parce qu'ils constituent la preuve en cas de litige ;
 *  2. coordonnées du voyageur (`sejours.client_*`) et messages du
 *     formulaire de contact (`messages`) : effacés une fois le délai de
 *     RETENTION_COORDONNEES_JOURS écoulé depuis le départ. `client_nom`
 *     étant `not null`, il est remplacé par un libellé neutre ;
 *  3. preuve arrivée au terme de sa durée de conservation
 *     (RETENTION_PREUVE_ANNEES après le départ) : elle est supprimée à son
 *     tour, et seulement là.
 *
 * La purge est idempotente : la relancer ne supprime rien de plus.
 */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Méthode non autorisée.' }, 405);

  const expectedSecret = Deno.env.get('CRON_SECRET');
  const actualSecret = req.headers.get('x-cron-secret') || '';
  if (!expectedSecret || !equalSecret(actualSecret, expectedSecret)) {
    return jsonResponse({ error: 'Non autorisé.' }, 401);
  }

  try {
    const supabase = createServiceClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const expired: Array<{ id: string; reservation_id: string }> = [];
    for (let offset = 0; ; offset += BATCH_SIZE) {
      const { data, error } = await supabase.from('tenant_sessions')
        .select('id, reservation_id')
        .lt('expires_at', nowIso)
        .range(offset, offset + BATCH_SIZE - 1);
      if (error) return jsonResponse({ error: 'Lecture des accès expirés impossible.' }, 500);
      expired.push(...(data || []));
      if (!data || data.length < BATCH_SIZE) break;
    }

    const byReservation = new Map<string, string[]>();
    for (const session of expired) {
      const list = byReservation.get(session.reservation_id) || [];
      list.push(session.id);
      byReservation.set(session.reservation_id, list);
    }

    let removedSessions = 0;
    let removedFiles = 0;
    const deferred: string[] = [];
    const report: Array<PurgeEntry & { reservationId: string; retainedUntil: string }> = [];

    for (const [reservationId, sessionIds] of byReservation) {
      const { count, error: activeError } = await supabase
        .from('tenant_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('reservation_id', reservationId)
        .gt('expires_at', nowIso);
      if (activeError) throw new Error('Vérification des accès actifs impossible.');

      if ((count || 0) > 0) {
        const { error: expiredDeleteError } = await supabase.from('tenant_sessions').delete().in('id', sessionIds);
        if (expiredDeleteError) throw new Error('Suppression des accès expirés impossible.');
        removedSessions += sessionIds.length;
        deferred.push(reservationId);
        continue;
      }

      // Migration 0012 : la réservation vit dans `sejours`, dont le champ de
      // départ est nommé `depart` (vocabulaire unifié).
      const [{ data: sejour, error: sejourError }, paths, checklistCount, reportCount, photoCount] = await Promise.all([
        supabase.from('sejours').select('depart').eq('id', reservationId).maybeSingle(),
        listFiles(supabase, reservationId),
        countRows(supabase, 'checklists', reservationId),
        countRows(supabase, 'pdf_reports', reservationId),
        countRows(supabase, 'photos', reservationId),
      ]);
      if (sejourError) throw new Error('Lecture du séjour impossible.');

      const plan = planReservationPurge({
        reservationId,
        paths,
        sessionCount: sessionIds.length,
        checklistCount,
        reportCount,
        photoCount,
        departure: sejour?.depart ?? null,
        now,
      });

      // Anonymisation : rien ne réécrit le PDF signé (horodatage de signature
      // intact) ; seules les métadonnées libres des photos sont vidées.
      removedFiles += await removeFiles(supabase, plan.disposablePaths);

      const [checklistResult, photoResult, reportResult, sessionResult] = await Promise.all([
        supabase.from('checklists').delete().eq('reservation_id', reservationId).select('id'),
        supabase.from('photos').update({ meta: {} }).eq('reservation_id', reservationId).select('id'),
        supabase.from('pdf_reports').update({ error: null }).eq('reservation_id', reservationId).select('id'),
        supabase.from('tenant_sessions').delete().in('id', sessionIds).select('id'),
      ]);
      if (checklistResult.error || photoResult.error || reportResult.error || sessionResult.error) {
        throw new Error(`Purge des données SQL impossible pour ${reservationId}.`);
      }

      removedSessions += sessionIds.length;
      report.push({ reservationId, retainedUntil: plan.retainedUntil, ...plan.entry });
    }

    // Second temps : les coordonnées du voyageur, dans `sejours` et dans les
    // messages du formulaire de contact. Le dossier de séjour survit
    // (dates, montants, statut) : ce sont ces champs, et non l'identité, qui
    // servent à la taxe de séjour et à la comptabilité.
    const cutoffCoordonnees = coordonneesExpiryCutoff(now);
    const { data: sejoursAEffacer, error: sejoursError } = await supabase
      .from('sejours')
      .select('id, depart, client_nom, client_email, client_telephone, client_message')
      .lt('depart', cutoffCoordonnees)
      .order('depart')
      .limit(BATCH_SIZE * 10);
    if (sejoursError) throw new Error('Lecture des séjours à effacer impossible.');

    let effacedSejours = 0;
    for (const sejour of sejoursAEffacer || []) {
      const patch = planEffacementSejour(sejour, now);
      if (!patch) continue;
      const { error: updateError } = await supabase
        .from('sejours')
        .update(patch)
        .eq('id', sejour.id);
      if (updateError) throw new Error(`Effacement des coordonnées impossible pour ${sejour.id}.`);
      effacedSejours += 1;
      report.push({
        reservationId: sejour.id,
        retainedUntil: '',
        ...buildEffacementCoordonneesEntry(String(sejour.depart)),
      });
    }

    // Messages du formulaire de contact : mêmes coordonnées, même délai. Ils
    // ne sont rattachés à aucun séjour, donc traités séparément.
    const { data: messagesAEffacer, error: messagesError } = await supabase
      .from('messages')
      .select('id')
      .lt('created_at', `${cutoffCoordonnees}T00:00:00Z`)
      .limit(BATCH_SIZE * 10);
    if (messagesError) throw new Error('Lecture des messages à effacer impossible.');

    let effacedMessages = 0;
    const idsMessages = (messagesAEffacer || []).map((m: { id: string }) => m.id);
    if (idsMessages.length > 0) {
      // `nom`, `email` et `message` sont `not null` : même contrainte que
      // `client_nom`, mêmes valeurs neutres.
      const { error: messagesUpdateError } = await supabase
        .from('messages')
        .update({
          nom: NOM_ANONYMISE,
          email: 'efface@invalid',
          telephone: null,
          message: 'Message effacé (délai de conservation écoulé).',
        })
        .in('id', idsMessages);
      if (messagesUpdateError) throw new Error('Effacement des messages impossible.');
      effacedMessages = idsMessages.length;
      report.push({
        reservationId: '',
        retainedUntil: '',
        ...buildEffacementMessageEntry(effacedMessages),
      });
    }

    // Troisième temps : la preuve elle-même, une fois sa durée de conservation
    // atteinte (RETENTION_PREUVE_ANNEES après le départ du locataire).
    const cutoff = evidenceExpiryCutoff(now);
    const { data: agedSejours, error: agedError } = await supabase
      .from('sejours')
      .select('id, depart')
      .lt('depart', cutoff)
      .order('depart')
      .limit(BATCH_SIZE * 10);
    if (agedError) throw new Error('Lecture des séjours anciens impossible.');

    let expiredEvidenceReservations = 0;
    let expiredEvidenceFiles = 0;
    for (const sejour of agedSejours || []) {
      const [reportCount, photoCount] = await Promise.all([
        countRows(supabase, 'pdf_reports', sejour.id),
        countRows(supabase, 'photos', sejour.id),
      ]);
      if (!reportCount && !photoCount) continue;

      // La durée de conservation de la preuve est atteinte : tout part.
      const paths = await listFiles(supabase, sejour.id);
      expiredEvidenceFiles += await removeFiles(supabase, paths);

      const [reportDelete, photoDelete] = await Promise.all([
        supabase.from('pdf_reports').delete().eq('reservation_id', sejour.id),
        supabase.from('photos').delete().eq('reservation_id', sejour.id),
      ]);
      if (reportDelete.error || photoDelete.error) {
        throw new Error(`Suppression de la preuve impossible pour ${sejour.id}.`);
      }
      expiredEvidenceReservations += 1;
      report.push({
        reservationId: sejour.id,
        retainedUntil: '',
        ...buildEvidenceExpiryEntry({
          departure: sejour.depart,
          deletedPdfReports: reportCount,
          deletedPhotos: photoCount,
          deletedFiles: paths.length,
        }),
      });
    }

    const retention = {
      personalDataDays: RETENTION_DONNEES_PERSONNELLES_JOURS,
      coordonneesDays: RETENTION_COORDONNEES_JOURS,
      evidenceYears: RETENTION_PREUVE_ANNEES,
    };
    const summary = summarizePurge(report);
    console.info(JSON.stringify({
      event: 'tenant_data_purge',
      removedSessions,
      removedFiles,
      expiredEvidenceReservations,
      expiredEvidenceFiles,
      effacedSejours,
      effacedMessages,
      deferredReservations: deferred.length,
      retention,
      summary,
      report,
    }));
    return jsonResponse({
      ok: true,
      removedSessions,
      removedFiles,
      expiredEvidenceReservations,
      expiredEvidenceFiles,
      effacedSejours,
      effacedMessages,
      deferredReservations: deferred.length,
      retention,
      summary,
      report,
    });
  } catch {
    console.error('Erreur interne purge-tenant-data (détails omis).');
    return jsonResponse({ error: 'La purge automatique a échoué et sera réessayée.' }, 500);
  }
});

import { BUCKET, corsHeaders, createServiceClient, jsonResponse } from '../_shared/tenant.ts';

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
    const expired: Array<{ id: string; reservation_id: string }> = [];
    for (let offset = 0; ; offset += BATCH_SIZE) {
      const { data, error } = await supabase.from('tenant_sessions')
        .select('id, reservation_id')
        .lt('expires_at', new Date().toISOString())
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
    for (const [reservationId, sessionIds] of byReservation) {
      const { count, error: activeError } = await supabase
        .from('tenant_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('reservation_id', reservationId)
        .gt('expires_at', new Date().toISOString());
      if (activeError) throw new Error('Vérification des accès actifs impossible.');

      if ((count || 0) > 0) {
        const { error: expiredDeleteError } = await supabase.from('tenant_sessions').delete().in('id', sessionIds);
        if (expiredDeleteError) throw new Error('Suppression des accès expirés impossible.');
        removedSessions += sessionIds.length;
        deferred.push(reservationId);
        continue;
      }

      const paths = await listFiles(supabase, reservationId);
      for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + BATCH_SIZE));
        if (storageError) throw new Error(`Suppression Storage impossible pour ${reservationId}.`);
        removedFiles += Math.min(BATCH_SIZE, paths.length - i);
      }

      const [photoResult, reportResult, checklistResult, sessionResult] = await Promise.all([
        supabase.from('photos').delete().eq('reservation_id', reservationId),
        supabase.from('pdf_reports').delete().eq('reservation_id', reservationId),
        supabase.from('checklists').delete().eq('reservation_id', reservationId),
        supabase.from('tenant_sessions').delete().in('id', sessionIds),
      ]);
      if (photoResult.error || reportResult.error || checklistResult.error || sessionResult.error) {
        throw new Error(`Purge des données SQL impossible pour ${reservationId}.`);
      }
      removedSessions += sessionIds.length;
    }

    console.info(JSON.stringify({ event: 'tenant_data_purge', removedSessions, removedFiles, deferredReservations: deferred.length }));
    return jsonResponse({ ok: true, removedSessions, removedFiles, deferredReservations: deferred.length });
  } catch {
    console.error('Erreur interne purge-tenant-data (détails omis).');
    return jsonResponse({ error: 'La purge automatique a échoué et sera réessayée.' }, 500);
  }
});

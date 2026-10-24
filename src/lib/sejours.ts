/**
 * Logique métier du calendrier de séjours (chantier 1).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Toutes les fonctions sont couvertes par tests/sejours.test.ts.
 */

/** Un séjour réduit à ses dates (et son identifiant, pour s'auto-exclure). */
export interface PlageDates {
  id?: string;
  arrivee: string; // ISO « AAAA-MM-JJ »
  depart: string; // ISO « AAAA-MM-JJ »
}

/** Statuts d'un séjour qui bloquent le calendrier. */
export const STATUTS_BLOQUANTS = ['option', 'confirme'] as const;

/** Statuts possibles d'un séjour (alignés sur la contrainte SQL). */
export const STATUTS_SEJOUR = ['option', 'confirme', 'annule', 'termine'] as const;

export type StatutSejour = (typeof STATUTS_SEJOUR)[number];

/**
 * Deux séjours se chevauchent-ils ?
 *
 * Convention hôtelière : le jour du départ libère le logement, une arrivée
 * le même jour est donc autorisée. Un séjour « 10 → 17 » et un séjour
 * « 17 → 24 » ne se chevauchent pas ; « 10 → 17 » et « 16 → 20 » si.
 */
export function chevauche(a: PlageDates, b: PlageDates): boolean {
  return a.arrivee < b.depart && b.arrivee < a.depart;
}

/**
 * Renvoie les séjours existants qui entrent en conflit avec `candidat`.
 *
 * - ignore le séjour en cours d'édition (même `id`) ;
 * - ignore les statuts non bloquants (annulé, terminé).
 */
export function trouverChevauchements(
  candidat: PlageDates,
  existants: ReadonlyArray<PlageDates & { statut?: string }>,
  statutsBloquants: ReadonlyArray<string> = STATUTS_BLOQUANTS,
): Array<PlageDates & { statut?: string }> {
  return existants.filter(
    (s) =>
      s.id !== candidat.id &&
      statutsBloquants.includes(s.statut ?? 'confirme') &&
      chevauche(candidat, s),
  );
}

/** Nombre de nuits entre deux dates ISO (0 si les dates sont invalides/inversées). */
export function nuits(arrivee: string, depart: string): number {
  const a = Date.parse(`${arrivee}T00:00:00Z`);
  const d = Date.parse(`${depart}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(d)) return 0;
  const diff = Math.round((d - a) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/** Vrai si la plage de dates est cohérente (départ strictement après arrivée). */
export function plageValide(arrivee: string, depart: string): boolean {
  return nuits(arrivee, depart) > 0;
}

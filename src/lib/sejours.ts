/**
 * Logique métier du calendrier de séjours.
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Toutes les fonctions sont couvertes par tests/sejours.test.ts.
 *
 * Depuis la migration 0011 (`bookings` fusionnée dans `sejours`), un séjour
 * suit un cycle de vie unique :
 *
 *     demande → option → confirme → termine   (+ annule)
 *
 * « demande » est une réservation reçue depuis le formulaire public : elle
 * n'est PAS confirmée et ne bloque donc pas le calendrier. C'est le
 * propriétaire qui la fait passer en « option » (dates tenues, demande en
 * cours) puis en « confirme ».
 */

/** Un séjour réduit à ses dates (et son identifiant, pour s'auto-exclure). */
export interface PlageDates {
  id?: string;
  arrivee: string; // ISO « AAAA-MM-JJ »
  depart: string; // ISO « AAAA-MM-JJ »
}

/**
 * Statuts d'un séjour qui bloquent le calendrier.
 *
 * CHOIX DOCUMENTÉ : une `demande` ne bloque pas. Plusieurs visiteurs peuvent
 * demander les mêmes dates ; c'est au propriétaire de trancher en passant une
 * demande en `option`. Bloquer dès la demande rendrait le calendrier public
 * dépendant de demandes non traitées (dates « occupées » par un simple
 * formulaire), et ferait perdre des réservations.
 */
export const STATUTS_BLOQUANTS = ['option', 'confirme'] as const;

/** Statuts possibles d'un séjour (alignés sur la contrainte SQL de 0011). */
export const STATUTS_SEJOUR = ['demande', 'option', 'confirme', 'annule', 'termine'] as const;

export type StatutSejour = (typeof STATUTS_SEJOUR)[number];

/**
 * Statuts qui n'occupent réellement aucune nuit.
 *
 * `annule` libère les dates ; `termine` est passé (le calendrier public ne
 * l'affiche plus). Ils sont ignorés par la détection de chevauchement et par
 * les statistiques de disponibilité.
 */
export const STATUTS_INACTIFS = ['demande', 'annule', 'termine'] as const;

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
 * - ignore les statuts non bloquants (`demande`, `annule`, `termine`) ;
 * - un séjour sans statut est considéré bloquant (comportement historique).
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

/**
 * Vrai si le statut occupe des nuits dans le calendrier public.
 *
 * Aligné sur la politique RLS de `0003_sejours.sql` (`option`, `confirme`) :
 * le public ne voit que ces deux statuts.
 */
export function occupeCalendrier(statut: string | null | undefined): boolean {
  return (STATUTS_BLOQUANTS as ReadonlyArray<string>).includes(statut ?? 'confirme');
}

/**
 * Vrai si le séjour est encore à traiter par le propriétaire.
 *
 * Sert au back office : une `demande` attend une décision (option, confirmé,
 * refusé).
 */
export function estDemandeATraiter(statut: string | null | undefined): boolean {
  return statut === 'demande';
}

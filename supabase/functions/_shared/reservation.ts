/**
 * Vocabulaire unifié des réservations (migration 0011).
 *
 * Module PUR : aucune dépendance à Deno, au DOM, au réseau ou à Supabase.
 * Il est importé par les quatre Edge Functions locataire
 * (`tenant-upload`, `generate-pdf`, `send-email`, `purge-tenant-data`) et
 * couvert par `tests/reservation.test.ts`.
 *
 * Contexte : deux tables coexistaient. `bookings` (formulaire public) portait
 * les statuts `demande | confirmee | annulee | terminee` ; `sejours` (back
 * office) portait `option | confirme | annule | termine`. La migration 0011
 * fusionne tout dans `sejours` avec le cycle de vie :
 *
 *     demande → option → confirme → termine   (+ annule)
 *
 * Les Edge Functions comparaient le statut à `['confirmee', 'terminee']` :
 * après la fusion, cette comparaison ne correspondrait plus à rien et l'état
 * des lieux casserait SILENCIEUSEMENT pour tous les nouveaux séjours. Ce
 * module est la seule source de vérité de cette règle, partagée par les
 * quatre fonctions et par les tests.
 */

/** Statuts pour lesquels un locataire peut ouvrir son état des lieux. */
export const STATUTS_LOCATAIRE = ['confirme', 'termine'] as const;

export type StatutLocataire = (typeof STATUTS_LOCATAIRE)[number];

/** Statut unifié d'un séjour (aligné sur la contrainte SQL de 0011). */
export const STATUTS_UNIFIES = ['demande', 'option', 'confirme', 'annule', 'termine'] as const;

export type StatutUnifie = (typeof STATUTS_UNIFIES)[number];

/**
 * Vrai si le locataire peut accéder à son espace (photos, PDF, emails).
 *
 * Seuls un séjour confirmé ou terminé ouvre ce droit : une demande, une
 * option ou un séjour annulé n'a pas d'état des lieux.
 */
export function estReservationAutorisee(statut: string | null | undefined): boolean {
  return typeof statut === 'string' && (STATUTS_LOCATAIRE as ReadonlyArray<string>).includes(statut);
}

/**
 * Correspondance des statuts hérités de `bookings` vers le vocabulaire
 * unifié. Reproduit exactement le `case` de la migration 0011.
 *
 * Une valeur inconnue (donnée corrompue, futur statut) devient `demande` :
 * jamais bloquante, donc une ligne à trier plutôt que des dates bloquées par
 * erreur.
 */
export const STATUTS_HERITES: Readonly<Record<string, StatutUnifie>> = {
  demande: 'demande',
  confirmee: 'confirme',
  annulee: 'annule',
  terminee: 'termine',
  // Le vocabulaire de `sejours` reste valide (idempotence d'une reprise).
  option: 'option',
  confirme: 'confirme',
  annule: 'annule',
  termine: 'termine',
};

/** Traduit un statut hérité (ou déjà unifié) vers le vocabulaire unifié. */
export function statutUnifie(statut: string | null | undefined): StatutUnifie {
  if (typeof statut !== 'string') return 'demande';
  return STATUTS_HERITES[statut] ?? 'demande';
}

/** Ligne de `bookings`, réduite aux colonnes reprises par la migration. */
export interface BookingHerite {
  id: string;
  created_at: string;
  check_in: string;
  check_out: string;
  guests: number;
  nom: string;
  email: string;
  telephone?: string | null;
  message?: string | null;
  packs?: unknown;
  total_estime?: number | null;
  statut: string;
  historique?: unknown;
  lang?: string | null;
}

/** Ligne de `sejours` produite par la migration (mêmes colonnes, mêmes noms). */
export interface SejourMigre {
  id: string;
  created_at: string;
  arrivee: string;
  depart: string;
  client_nom: string;
  client_email: string;
  client_telephone: string | null;
  client_message: string | null;
  personnes: number;
  adultes: number;
  mineurs: number;
  statut: StatutUnifie;
  prix_estime: number | null;
  note: string | null;
  packs: unknown;
  historique: unknown;
  lang: string | null;
  origine: 'import';
}

/** Date ISO + n jours (UTC), sans dépendance à une bibliothèque. */
function ajouterJours(dateIso: string, jours: number): string {
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(t)) return dateIso;
  return new Date(t + jours * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Transforme une demande `bookings` en séjour `sejours`, SANS PERTE.
 *
 * ⚠️ MODÈLE DE RÉFÉRENCE, PAS UNE IMPLÉMENTATION DE PRODUCTION. Aucune Edge
 * Function n'appelle cette fonction : la reprise réelle des lignes est faite
 * par le SQL de `migrations/0011_unifier_bookings_sejours.sql`. Elle est
 * conservée comme spécification EXÉCUTABLE de cette migration — les tests
 * décrivent ainsi le comportement attendu en TypeScript lisible, et la
 * correspondance des statuts partagée (`statutUnifie`) est, elle, réellement
 * utilisée par les quatre fonctions.
 *
 * Conséquence assumée : rien ne détecte automatiquement une divergence entre
 * ce modèle et le SQL. Une modification de l'un doit être reportée dans
 * l'autre ; `tests/reservation.test.ts` et `tests/migration-0011.test.ts`
 * vérifient les deux côtés séparément, pas leur égalité.
 *
 * Règles reprises du SQL :
 * - l'identifiant est conservé : les liens locataire déjà émis continuent de
 *   fonctionner, et la migration est idempotente (`on conflict (id)`);
 * - `check_in`/`check_out` deviennent `arrivee`/`depart`;
 * - `guests` alimente `personnes` ET `adultes` (le détail adultes/mineurs
 *   n'était pas collecté) ; `mineurs` vaut 0 ;
 * - `total_estime` devient `prix_estime` (le prix négocié `prix_total` reste
 *   vide : il ne se déduit pas d'une demande) ;
 * - `origine = 'import'` ;
 * - une plage incohérente (départ ≤ arrivée, refusée depuis 0010 mais possible
 *   avant) est ramenée à une nuit, avec les dates d'origine conservées dans la
 *   note interne : rien n'est perdu, l'identifiant reste utilisable.
 */
export function sejourDepuisBooking(booking: BookingHerite): SejourMigre {
  const incoherente = !(booking.check_out > booking.check_in);
  const depart = incoherente ? ajouterJours(booking.check_in, 1) : booking.check_out;
  const note = incoherente
    ? `[migration 0011] dates incohérentes reprises de bookings : arrivée ${booking.check_in}, `
      + `départ ${booking.check_out} (départ ramené au lendemain de l'arrivée).`
    : null;

  return {
    id: booking.id,
    created_at: booking.created_at,
    arrivee: booking.check_in,
    depart,
    client_nom: booking.nom,
    client_email: booking.email,
    client_telephone: booking.telephone ?? null,
    client_message: booking.message ?? null,
    personnes: booking.guests,
    adultes: booking.guests,
    mineurs: 0,
    statut: statutUnifie(booking.statut),
    prix_estime: booking.total_estime ?? null,
    note,
    packs: booking.packs ?? [],
    historique: booking.historique ?? [],
    lang: booking.lang ?? null,
    origine: 'import',
  };
}

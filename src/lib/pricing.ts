/**
 * Logique de tarification — partagée entre le rendu serveur (Astro)
 * et le script client de la page /reserver (aucune dépendance externe).
 */

import tarifsContenu from '../../content/tarifs.json';

/**
 * Taux de la taxe de séjour, par nuit et par personne assujettie (en euros).
 *
 * ⚠️ Le taux communal de Gruissan reste À CONFIRMER auprès de la mairie
 * (délibération de l'année en cours) : la valeur actuelle n'a AUCUNE source
 * officielle dans ce dépôt, elle est provisoire.
 *
 * Source unique de vérité : `content/tarifs.json`, clé
 * `taxe_sejour_par_nuit_personne` (éditable par le propriétaire). Aucun
 * autre nombre ne doit être codé en dur ailleurs : le formulaire de
 * réservation, les tests métier et l'affichage lisent cette constante.
 *
 * Rappel : seuls les ADULTES sont assujettis — les mineurs sont exonérés.
 */
export const TAUX_TAXE_SEJOUR_PAR_NUIT_PERSONNE = Number(
  tarifsContenu.taxe_sejour_par_nuit_personne,
);

export interface Saison {
  id: string;
  periode: string;
  prix_semaine: number;
  prix_nuit_min: number;
  nuits_min: number;
  note: string;
}

export type SaisonId = 'haute' | 'moyenne' | 'basse';

/** Nombre de nuits entre deux dates ISO (YYYY-MM-DD), 0 si invalide. */
export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Mois (1-12) couverts par le séjour, de l'arrivée au départ inclus. */
export function monthsOfStay(checkIn: string, checkOut: string): number[] {
  const a = Date.parse(`${checkIn}T00:00:00Z`);
  const b = Date.parse(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return [];
  const months: number[] = [];
  const cur = new Date(a);
  const end = new Date(b);
  while (cur <= end && months.length < 24) {
    const m = cur.getUTCMonth() + 1;
    if (!months.includes(m)) months.push(m);
    cur.setUTCMonth(cur.getUTCMonth() + 1, 1);
  }
  return months;
}

/**
 * Saison du séjour : juillet ou août → haute ; juin ou septembre → moyenne ;
 * sinon basse. La saison la plus forte présente sur la période gagne.
 */
export function seasonIdFor(checkIn: string, checkOut: string): SaisonId {
  const months = monthsOfStay(checkIn, checkOut);
  if (months.some((m) => m === 7 || m === 8)) return 'haute';
  if (months.some((m) => m === 6 || m === 9)) return 'moyenne';
  return 'basse';
}

export interface StayEstimate {
  nights: number;
  weeks: number;
  saison: Saison;
  base: number;
  /** true si le séjour est plus court que le minimum de la saison */
  tooShort: boolean;
}

/** Prix de base du séjour : prix_semaine × semaines (arrondi supérieur). */
export function computeStay(
  checkIn: string,
  checkOut: string,
  saisons: Saison[],
): StayEstimate | null {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) return null;
  const saisonId = seasonIdFor(checkIn, checkOut);
  const saison = saisons.find((s) => s.id === saisonId) ?? saisons[saisons.length - 1];
  const weeks = Math.ceil(nights / 7);
  return {
    nights,
    weeks,
    saison,
    base: saison.prix_semaine * weeks,
    tooShort: nights < saison.nuits_min,
  };
}

/** Chevauchement période demandée / ligne availability (réservée). */
export function overlaps(
  startDate: string,
  endDate: string,
  checkIn: string,
  checkOut: string,
): boolean {
  return startDate <= checkOut && endDate >= checkIn;
}

// ---------------------------------------------------------------------------
// Devis instantané (issue #17)
// ---------------------------------------------------------------------------

/** Garde anti-abus : au-delà, le devis est refusé (saisie aberrante). */
export const MAX_NUITES = 400;

/** Unité de facturation d'un pack. */
export type PackUnite = 'par_personne' | 'par_sejour' | 'par_nuit';

/** Arrondi au centime près, robuste aux artefacts d'arithmétique flottante. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Tarif à la nuit dérivé du prix à la semaine : `prix_semaine / 7`. */
export function nightlyRate(saison: Saison): number {
  return round2(saison.prix_semaine / 7);
}

/** Saison d'une date donnée (le mois détermine la saison). */
export function seasonIdForDate(dateISO: string): SaisonId {
  const ts = Date.parse(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(ts)) return 'basse';
  const month = new Date(ts).getUTCMonth() + 1;
  if (month === 7 || month === 8) return 'haute';
  if (month === 6 || month === 9) return 'moyenne';
  return 'basse';
}

/** Nombre de voyageurs normalisé (entier ≥ 0). */
function normalizeGuests(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Taux de taxe de séjour exploitable, ou `null` s'il est absent ou illisible.
 *
 * Règle du dépôt : un taux absent n'est JAMAIS remplacé par une valeur
 * approchante — le montant devient « non calculable » et l'interface
 * l'indique (« à confirmer ») au lieu d'afficher 0 €.
 */
export function normalizeTauxTaxe(
  value: number | string | undefined | null,
): number | null {
  if (value === undefined || value === null) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

/**
 * Capacité du logement normalisée (entier > 0), ou `null` si elle n'est pas
 * exploitable : une capacité absente ou aberrante ne doit pas inventer de
 * plafond (elle est simplement ignorée, comme le prévoit l'appelant).
 */
function normalizeCapacite(value: number | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * true si le total adultes + mineurs dépasse la capacité du logement.
 *
 * `capacite` omise (ou illisible) → aucun plafond : le calcul ne refuse rien.
 * Cette garde évite qu'un formulaire proposant adultes et mineurs séparément
 * accepte 8 personnes dans un logement déclaré pour 4.
 */
export function exceedsCapacity(
  adults: number,
  minors: number,
  capacite?: number,
): boolean {
  const cap = normalizeCapacite(capacite);
  if (cap === null) return false;
  return normalizeGuests(adults) + normalizeGuests(minors) > cap;
}

export interface PackSelection {
  id: string;
  slug: string;
  prix: number;
  unite: PackUnite;
  quantite: number;
}

export interface DevisSaison {
  saisonId: SaisonId;
  periode: string;
  nuits: number;
  prixNuit: number;
  total: number;
}

export interface DevisPack {
  id: string;
  slug: string;
  prix: number;
  unite: PackUnite;
  quantite: number;
  total: number;
}

export interface DevisInput {
  checkIn: string;
  checkOut: string;
  /** Adultes assujettis à la taxe de séjour (au moins 1). */
  adults: number;
  /** Mineurs, exonérés de la taxe de séjour (0 par défaut). */
  minors?: number;
  /** Capacité du logement : au-delà, le devis est refusé. Omise → pas de plafond. */
  capacite?: number;
  saisons: Saison[];
  packs?: PackSelection[];
  caution?: number;
  taxeSejourParNuitPersonne?: number;
}

/** Détail vérifiable de la taxe de séjour (affiché dans le récapitulatif). */
export interface DevisTaxeSejour {
  /** Adultes assujettis — base du calcul. */
  adultes: number;
  /** Mineurs exonérés (jamais facturés). */
  mineurs: number;
  nuits: number;
  /** Taux par nuit et par adulte, en euros (0 si non calculable). */
  taux: number;
  /** Montant dû = adultes × nuits × taux. */
  montant: number;
  /**
   * false si le taux est absent ou illisible : le montant n'est alors PAS
   * calculable. On ne le remplace jamais par une valeur approchante
   * (règle du dépôt) — l'interface affiche « à confirmer ».
   */
  calculable: boolean;
}

export interface Devis {
  nights: number;
  /** Nombre total de voyageurs (adultes + mineurs), base des packs. */
  guests: number;
  /** Adultes assujettis à la taxe de séjour. */
  adults: number;
  /** Mineurs exonérés de la taxe de séjour. */
  minors: number;
  /** Sous-total du séjour (toutes saisons confondues). */
  stay: number;
  /** Détail nuit par nuit, regroupé par saison traversée. */
  stayBySeason: DevisSaison[];
  packs: DevisPack[];
  packsTotal: number;
  taxeSejour: number;
  /** Détail de la taxe : adultes × nuits × taux (mineurs exonérés). */
  taxeSejourDetail: DevisTaxeSejour;
  /** Total dû = séjour + packs + taxe de séjour (caution exclue). */
  total: number;
  /** Caution à prévoir à l'arrivée — remboursable, non incluse dans le total. */
  caution: number;
  /** Montant total à prévoir (total dû + caution). */
  toPay: number;
  /** true si le séjour est plus court que le minimum de la saison la plus forte. */
  tooShort: boolean;
  /** Saison la plus forte rencontrée pendant le séjour. */
  saisonForte: Saison;
}

/**
 * Devis instantané : séjour (chaque nuit facturée selon la saison qui la
 * contient) + packs (selon leur unité) + taxe de séjour appliquée aux SEULS
 * adultes (les mineurs sont exonérés).
 * La caution est renseignée mais reste hors du total dû (elle est remboursable).
 * Retourne `null` si les dates sont manquantes, invalides ou inversées, s'il
 * n'y a aucun adulte (un séjour sans adulte n'est pas une réservation) ou si
 * adultes + mineurs dépassent la capacité du logement.
 */
export function computeQuote(input: DevisInput): Devis | null {
  const { checkIn, checkOut, saisons } = input;
  if (!checkIn || !checkOut || saisons.length === 0) return null;

  const adults = normalizeGuests(input.adults);
  if (adults < 1) return null;
  const minors = normalizeGuests(input.minors ?? 0);
  if (exceedsCapacity(adults, minors, input.capacite)) return null;
  const guests = adults + minors;
  const packs = (input.packs ?? []).filter(
    (p) => p && Number.isFinite(Number(p.prix)) && p.unite,
  );
  const caution = round2(Number(input.caution ?? 0) || 0);
  // `undefined` = non fourni → on lit la constante du contenu ; `null` explicite
  // = taux volontairement absent → montant non calculable (jamais 0 €).
  const taxeRate = normalizeTauxTaxe(
    input.taxeSejourParNuitPersonne === undefined
      ? TAUX_TAXE_SEJOUR_PAR_NUIT_PERSONNE
      : input.taxeSejourParNuitPersonne,
  );

  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0 || nights > MAX_NUITES) return null;

  // --- Séjour : chaque nuit est facturée selon la saison qui la contient.
  // Une réservation peut chevaucher deux saisons (ex. fin juin / début juillet).
  const parSaison = new Map<SaisonId, { nuits: number; prixNuit: number }>();
  const curseur = new Date(Date.parse(`${checkIn}T00:00:00Z`));
  for (let i = 0; i < nights; i++) {
    const date = curseur.toISOString().slice(0, 10);
    const saisonId = seasonIdForDate(date);
    const saison = saisons.find((s) => s.id === saisonId) ?? saisons[saisons.length - 1];
    const entree = parSaison.get(saisonId) ?? { nuits: 0, prixNuit: nightlyRate(saison) };
    entree.nuits += 1;
    parSaison.set(saisonId, entree);
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }

  const stayBySeason: DevisSaison[] = [];
  let stay = 0;
  for (const [saisonId, entree] of parSaison) {
    const saison = saisons.find((s) => s.id === saisonId) ?? saisons[saisons.length - 1];
    const total = round2(entree.nuits * entree.prixNuit);
    stayBySeason.push({
      saisonId,
      periode: saison.periode,
      nuits: entree.nuits,
      prixNuit: entree.prixNuit,
      total,
    });
    stay = round2(stay + total);
  }

  // --- Packs : le prix dépend de l'unité déclarée.
  const devisPacks: DevisPack[] = packs.map((p) => {
    const quantite = Math.max(1, Math.floor(Number(p.quantite) || 1));
    const prix = round2(Number(p.prix) || 0);
    let total = 0;
    if (p.unite === 'par_personne') total = round2(prix * guests * quantite);
    else if (p.unite === 'par_nuit') total = round2(prix * nights * quantite);
    else total = round2(prix * quantite);
    return { id: p.id, slug: p.slug, prix, unite: p.unite, quantite, total };
  });
  const packsTotal = round2(devisPacks.reduce((sum, p) => sum + p.total, 0));

  // --- Taxe de séjour : adultes × nuits × taux (mineurs exonérés).
  // Taux absent → montant NON calculable (jamais remplacé par 0 €) : il n'est
  // pas ajouté au total, et `taxeSejourDetail.calculable` vaut false pour que
  // l'interface l'annonce au visiteur.
  const taxeCalculable = taxeRate !== null;
  const taxeTaux = taxeRate ?? 0;
  const taxeSejour = taxeCalculable ? round2(nights * adults * taxeTaux) : 0;

  const total = round2(stay + packsTotal + taxeSejour);

  // --- Saison la plus forte rencontrée (pour l'avertissement « nuits min »).
  const saisonForte =
    saisons.find((s) => s.id === seasonIdFor(checkIn, checkOut)) ?? saisons[saisons.length - 1];

  return {
    nights,
    guests,
    adults,
    minors,
    stay,
    stayBySeason,
    packs: devisPacks,
    packsTotal,
    taxeSejour,
    taxeSejourDetail: {
      adultes: adults,
      mineurs: minors,
      nuits: nights,
      taux: taxeTaux,
      montant: taxeSejour,
      calculable: taxeCalculable,
    },
    total,
    caution,
    toPay: round2(total + caution),
    tooShort: nights < saisonForte.nuits_min,
    saisonForte,
  };
}

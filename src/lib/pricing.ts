/**
 * Logique de tarification — partagée entre le rendu serveur (Astro)
 * et le script client de la page /reserver (aucune dépendance externe).
 */

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
  guests: number;
  saisons: Saison[];
  packs?: PackSelection[];
  caution?: number;
  taxeSejourParNuitPersonne?: number;
}

export interface Devis {
  nights: number;
  /** Sous-total du séjour (toutes saisons confondues). */
  stay: number;
  /** Détail nuit par nuit, regroupé par saison traversée. */
  stayBySeason: DevisSaison[];
  packs: DevisPack[];
  packsTotal: number;
  taxeSejour: number;
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
 * contient) + packs (selon leur unité) + taxe de séjour (nuits × voyageurs).
 * La caution est renseignée mais reste hors du total dû (elle est remboursable).
 * Retourne `null` si les dates sont manquantes, invalides ou inversées.
 */
export function computeQuote(input: DevisInput): Devis | null {
  const { checkIn, checkOut, saisons } = input;
  if (!checkIn || !checkOut || saisons.length === 0) return null;

  const guests = normalizeGuests(input.guests);
  const packs = (input.packs ?? []).filter(
    (p) => p && Number.isFinite(Number(p.prix)) && p.unite,
  );
  const caution = round2(Number(input.caution ?? 0) || 0);
  const taxeRate = round2(Number(input.taxeSejourParNuitPersonne ?? 0) || 0);

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

  // --- Taxe de séjour : nuits × voyageurs × taux (à zéro si non configurée).
  const taxeSejour = round2(nights * guests * taxeRate);

  const total = round2(stay + packsTotal + taxeSejour);

  // --- Saison la plus forte rencontrée (pour l'avertissement « nuits min »).
  const saisonForte =
    saisons.find((s) => s.id === seasonIdFor(checkIn, checkOut)) ?? saisons[saisons.length - 1];

  return {
    nights,
    stay,
    stayBySeason,
    packs: devisPacks,
    packsTotal,
    taxeSejour,
    total,
    caution,
    toPay: round2(total + caution),
    tooShort: nights < saisonForte.nuits_min,
    saisonForte,
  };
}

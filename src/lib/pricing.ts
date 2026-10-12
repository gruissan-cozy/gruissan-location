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

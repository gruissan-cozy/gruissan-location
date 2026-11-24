/**
 * Lien locataire — règles pures du jeton d'accès temporaire.
 *
 * Module PUR : aucune dépendance à Deno, au DOM, au réseau ou à Supabase.
 * Il est importé par l'Edge Function `tenant-link` (création, lecture,
 * révocation) et couvert par `tests/tenant-lien.test.ts`.
 *
 * Contexte : jusqu'ici un lien locataire ne pouvait être émis qu'en écrivant
 * du SQL à la main dans le SQL Editor Supabase, sur une ligne `bookings`.
 * Depuis la migration 0012 la réservation vit dans `sejours` ; ce module
 * porte les règles que le bouton du back office applique :
 *
 *   - seuls un séjour `confirme` ou `termine` peuvent recevoir un lien ;
 *   - l'expiration par défaut est le lendemain du départ à 12 h (Paris) ;
 *   - l'expiration choisie par le propriétaire ne peut pas dépasser
 *     30 jours après le départ, ni être dans le passé ;
 *   - le jeton est aléatoire (32 octets), jamais dérivé d'une donnée du
 *     séjour : ni l'identifiant, ni l'email ne doivent permettre de le
 *     deviner.
 */

/** Nombre de jours après le départ au-delà duquel l'accès est refusé. */
export const JOURS_MAX_APRES_DEPART = 30;

/** Heure (Europe/Paris) de fermeture du lien, le lendemain du départ. */
export const HEURE_EXPIRATION = 12;

/** Statuts d'un séjour qui autorisent un lien locataire. */
export const STATUTS_LIEN = ['confirme', 'termine'] as const;

export type StatutLien = (typeof STATUTS_LIEN)[number];

/** Taille du jeton en octets (64 caractères hexadécimaux). */
export const JETON_OCTETS = 32;

/**
 * Vrai si le séjour peut recevoir (ou conserver) un lien locataire.
 *
 * Un séjour `annule` est exclu : le lien existant est révoqué en base par la
 * migration 0012, et cette garde empêche d'en recréer un.
 */
export function statutAccepteLien(statut: string | null | undefined): boolean {
  return typeof statut === 'string' && (STATUTS_LIEN as ReadonlyArray<string>).includes(statut);
}

/** Date ISO `AAAA-MM-JJ` décalée de `jours` (calendaire, sans fuseau). */
export function ajouterJours(dateIso: string, jours: number): string {
  const [annee, mois, jour] = dateIso.split('-').map(Number);
  if (!annee || !mois || !jour) return dateIso;
  const t = Date.UTC(annee, mois - 1, jour) + jours * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

const PARIS_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Paris',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Heure murale de Paris pour un instant, exprimée en millisecondes UTC. */
function heureMuraleParis(instant: Date): number {
  const parts = PARIS_FORMAT.formatToParts(instant);
  const valeur = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(valeur('year'), valeur('month') - 1, valeur('day'), valeur('hour'), valeur('minute'), valeur('second'));
}

/**
 * Instant UTC correspondant à `dateIso` à `heure` heures, heure de Paris.
 *
 * Le décalage est calculé par itération (deux passes suffisent) pour rester
 * juste de part et d'autre des changements d'heure : un `+2 h` codé en dur
 * ferait fermer le lien une heure trop tôt en hiver.
 */
export function instantParis(dateIso: string, heure: number): Date {
  const [annee, mois, jour] = dateIso.split('-').map(Number);
  if (!annee || !mois || !jour || !Number.isFinite(heure)) return new Date(Number.NaN);
  const cible = Date.UTC(annee, mois - 1, jour, heure, 0, 0);
  let instant = new Date(cible);
  for (let passe = 0; passe < 3; passe += 1) {
    const decalage = heureMuraleParis(instant) - instant.getTime();
    const suivant = new Date(cible - decalage);
    if (suivant.getTime() === instant.getTime()) break;
    instant = suivant;
  }
  return instant;
}

/** Expiration par défaut : lendemain du départ, 12 h (Paris). */
export function expirationParDefaut(depart: string): Date {
  return instantParis(ajouterJours(depart, 1), HEURE_EXPIRATION);
}

/** Expiration maximale autorisée : départ + 30 jours, 12 h (Paris). */
export function expirationMaximale(depart: string): Date {
  return instantParis(ajouterJours(depart, JOURS_MAX_APRES_DEPART), HEURE_EXPIRATION);
}

/**
 * Vrai si `candidate` est une expiration acceptable pour ce séjour.
 *
 * Refusé : date illisible, expiration passée (ou égale à maintenant), et
 * toute date postérieure à la limite de 30 jours après le départ.
 */
export function expirationAcceptee(
  depart: string,
  candidate: Date | string | null | undefined,
  maintenant: Date = new Date(),
): boolean {
  const date = candidate instanceof Date ? candidate : candidate ? new Date(candidate) : null;
  if (!date || Number.isNaN(date.getTime())) return false;
  if (date.getTime() <= maintenant.getTime()) return false;
  const max = expirationMaximale(depart);
  if (Number.isNaN(max.getTime())) return false;
  return date.getTime() <= max.getTime();
}

/** Expiration par défaut, en date seule, pour préremplir un formulaire. */
export function dateExpirationParDefaut(depart: string): string {
  return ajouterJours(depart, 1);
}

/** Expiration maximale, en date seule, pour borner un formulaire. */
export function dateExpirationMaximale(depart: string): string {
  return ajouterJours(depart, JOURS_MAX_APRES_DEPART);
}

/**
 * Expiration choisie par le propriétaire à partir d'une date seule.
 *
 * Le formulaire envoie `AAAA-MM-JJ` (input type=date) : le lien ferme ce
 * jour-là à midi, heure de Paris, comme l'expiration par défaut. Une valeur
 * qui porte déjà une heure est utilisée telle quelle.
 */
export function expirationDepuisDate(date: string | Date | null | undefined): Date {
  if (date instanceof Date) return date;
  if (!date) return new Date(Number.NaN);
  const texte = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texte)) return instantParis(texte, HEURE_EXPIRATION);
  return new Date(texte);
}

/** Session telle que lue en base, réduite aux colonnes utiles. */
export interface SessionLien {
  id?: string;
  reservation_id?: string;
  expires_at: string;
  token?: string;
}

/**
 * Session telle que l'administrateur peut la voir.
 *
 * Le jeton n'est renvoyé que tant que la session est active : une fois
 * expirée, la ligne ne sert plus qu'à afficher la date et à proposer une
 * révocation, jamais à réafficher un secret devenu inutile.
 */
export function sessionPublique<T extends SessionLien>(
  session: T,
  maintenant: Date = new Date(),
): { active: boolean; expires_at: string; token?: string } {
  const active = sessionActive(session.expires_at, maintenant);
  return active
    ? { active, expires_at: session.expires_at, token: session.token }
    : { active, expires_at: session.expires_at };
}

/** Vrai si la session est encore ouverte à l'instant donné. */
export function sessionActive(expiresAt: string | Date | null | undefined, maintenant: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() > maintenant.getTime();
}

/**
 * Jeton d'accès : 32 octets aléatoires en hexadécimal.
 *
 * `crypto.getRandomValues` est le générateur cryptographique de la
 * plateforme (Deno, Node, navigateur). Le paramètre permet de le remplacer
 * dans un test ; en production il n'est jamais fourni.
 */
export function genererJeton(
  remplir: (octets: Uint8Array) => Uint8Array = (octets) => crypto.getRandomValues(octets),
): string {
  const octets = remplir(new Uint8Array(JETON_OCTETS));
  return Array.from(octets, (octet) => octet.toString(16).padStart(2, '0')).join('');
}

/** Forme attendue d'un jeton en base : 64 caractères hexadécimaux. */
export function jetonValide(token: string | null | undefined): boolean {
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token);
}

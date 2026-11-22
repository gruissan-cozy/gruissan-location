/**
 * Logique pure du calendrier de disponibilités (chantier 2 — issue #16).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase. Toutes les
 * fonctions sont couvertes par tests/calendrier.test.ts.
 *
 * Convention hôtelière : un séjour « 10 → 17 » occupe les nuits du 10 au 16 ;
 * le jour du départ (17) libère le logement et redevient réservable. C'est la
 * même convention que `src/lib/sejours.ts` (utilisée par le back office).
 *
 * DEUX CONVENTIONS DE DATES COEXISTENT DANS CE DÉPÔT — ne jamais les mélanger
 * sans conversion :
 *
 *   | table            | colonnes          | borne de fin          |
 *   |------------------|-------------------|-----------------------|
 *   | `sejours`        | `arrivee`/`depart`| `depart` **EXCLUSIF**  |
 *   | `calendar_blocks`| `debut`/`fin`     | `fin` **INCLUSIVE**   |
 *
 * Un séjour « 10 → 17 » occupe donc 10..16, tandis qu'un blocage « 10 → 17 »
 * occupe 10..17. `plagesDepuisSejours` fait la conversion (départ exclusif →
 * veille inclusive) ; `plagesDepuisBlocages` n'en fait aucune. `plagesOccupees`
 * est le point d'entrée unique : séjours + blocages → plages occupées.
 */

import { estDateIsoValide } from './confiance';

/** États possibles d'un jour affiché dans le calendrier. */
export type EtatJour = 'libre' | 'occupe' | 'partiel';

/**
 * Priorité en cas de plages contradictoires : une réservation confirmée
 * l'emporte sur une indisponibilité partielle, qui l'emporte sur du libre.
 */
const PRIORITE: Record<EtatJour, number> = { occupe: 3, partiel: 2, libre: 1 };

const MILLISECONDE_JOUR = 86_400_000;

/** Plage de dates bornes incluses, portant l'état qu'elle impose. */
export interface Plage {
  /** Premier jour de la plage, ISO « AAAA-MM-JJ », borne incluse. */
  debut: string;
  /** Dernier jour de la plage, ISO « AAAA-MM-JJ », borne incluse. */
  fin: string;
  etat: EtatJour;
}

/** Un jour du mois affiché dans la grille du calendrier. */
export interface JourCalendrier {
  iso: string;
  /** Numéro du jour dans le mois (1 à 31). */
  jour: number;
  /** Jour de semaine : 0 = dimanche … 6 = samedi. */
  jourSemaine: number;
  weekend: boolean;
  etat: EtatJour;
  /** Jour strictement antérieur à la date de référence (déjà passé). */
  passe: boolean;
  /** Plage libre contenant ce jour, s'il est réservable (lien vers /reserver). */
  plageLibre: Plage | null;
}

/** Un mois complet, prêt à être rendu. */
export interface MoisCalendrier {
  annee: number;
  mois: number; // 1 à 12
  slug: string; // « AAAA-MM »
  jours: JourCalendrier[];
  /** Nombre de nuits libres restantes dans le mois (jours passés exclus). */
  nuitsLibres: number;
  plagesLibres: Plage[];
  plagesOccupees: Plage[];
  plagesPartielles: Plage[];
}

export interface OptionsCalendrier {
  /** Date de référence ISO (« AAAA-MM-JJ ») ; les jours antérieurs sont « passés ». */
  aujourdHui?: string;
}

// ---------------------------------------------------------------------------
// Conversion de dates (toujours en UTC : aucun décalage dû à l'heure d'été)
// ---------------------------------------------------------------------------

/** Convertit une date ISO en millisecondes UTC ; `NaN` si la date est invalide. */
function versUTC(iso: string): number {
  const [a, m, j] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, j);
}

/** Convertit des millisecondes UTC en date ISO « AAAA-MM-JJ ». */
function depuisUTC(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Ajoute `delta` jours à une date ISO (delta négatif accepté). */
export function ajouterJours(iso: string, delta: number): string {
  if (!estDateIsoValide(iso)) return iso; // aucune date valide : on renvoie telle quelle
  return depuisUTC(versUTC(iso) + delta * MILLISECONDE_JOUR);
}

/** Jour précédent une date ISO (le jour de départ d'un séjour libère le logement). */
export function moinsUnJour(iso: string): string {
  return ajouterJours(iso, -1);
}

/** Jour de semaine d'une date ISO : 0 = dimanche … 6 = samedi. */
export function jourSemaine(iso: string): number {
  if (!estDateIsoValide(iso)) return -1;
  return new Date(versUTC(iso)).getUTCDay();
}

/** Vrai si le jour tombe un samedi ou un dimanche. */
export function estWeekend(iso: string): boolean {
  const js = jourSemaine(iso);
  return js === 0 || js === 6;
}

// ---------------------------------------------------------------------------
// Mois
// ---------------------------------------------------------------------------

/** Analyse un slug « AAAA-MM » ; renvoie null si le format est invalide. */
export function parseMois(slug: string): { annee: number; mois: number } | null {
  if (typeof slug !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(slug)) return null;
  const [annee, mois] = slug.split('-').map(Number);
  return { annee, mois };
}

/** Slug « AAAA-MM » d'une année et d'un mois (1 à 12). */
export function slugMois(annee: number, mois: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

/** Slug du mois décalé de `delta` mois (delta négatif accepté). */
export function ajouterMois(slug: string, delta: number): string {
  const parsed = parseMois(slug);
  if (!parsed) return slug;
  const total = parsed.annee * 12 + (parsed.mois - 1) + delta;
  return slugMois(Math.floor(total / 12), (total % 12) + 1);
}

/** Liste de `nombre` slugs de mois à partir de `slugDepart`. */
export function listeMois(slugDepart: string, nombre: number): string[] {
  const slugs: string[] = [];
  for (let i = 0; i < nombre; i++) slugs.push(ajouterMois(slugDepart, i));
  return slugs;
}

/** Slug du mois à afficher par défaut : le mois courant. */
export function moisParDefaut(aujourdHui: string): string {
  if (!estDateIsoValide(aujourdHui)) {
    const d = new Date();
    return slugMois(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  return slugMois(Number(aujourdHui.slice(0, 4)), Number(aujourdHui.slice(5, 7)));
}

/** ISO du premier jour du mois. */
export function premierJourMois(annee: number, mois: number): string {
  return `${slugMois(annee, mois)}-01`;
}

/** ISO du dernier jour du mois (28 à 31 selon le mois et les années bissextiles). */
export function dernierJourMois(annee: number, mois: number): string {
  // `Date.UTC(annee, mois, 0)` = dernier jour du mois `mois` (index base 0).
  const nbJours = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  return `${slugMois(annee, mois)}-${String(nbJours).padStart(2, '0')}`;
}

/** Tous les jours d'un mois, en ISO, du 1er au dernier. */
export function joursDuMois(annee: number, mois: number): string[] {
  const total = Number(dernierJourMois(annee, mois).slice(8, 10));
  const jours: string[] = [];
  for (let j = 1; j <= total; j++) jours.push(`${slugMois(annee, mois)}-${String(j).padStart(2, '0')}`);
  return jours;
}

/** Grille du mois en semaines de 7 cellules (null = hors du mois). */
export function grilleSemaines(
  annee: number,
  mois: number,
  jourDebutSemaine = 1, // 1 = lundi (convention française)
): Array<Array<string | null>> {
  const jours = joursDuMois(annee, mois);
  const decalage = (jourSemaine(jours[0]) - jourDebutSemaine + 7) % 7;
  const cellules: Array<string | null> = [
    ...Array<null>(decalage).fill(null),
    ...jours,
    ...Array<null>((7 - ((decalage + jours.length) % 7)) % 7).fill(null),
  ];
  const semaines: Array<Array<string | null>> = [];
  for (let i = 0; i < cellules.length; i += 7) semaines.push(cellules.slice(i, i + 7));
  return semaines;
}

// ---------------------------------------------------------------------------
// Plages
// ---------------------------------------------------------------------------

/**
 * Intersection d'une plage avec les bornes (incluses) d'un mois.
 * Renvoie null si la plage n'est pas valide ou n'intersecte pas le mois :
 * c'est ce qui permet de borner proprement un séjour à cheval sur deux mois.
 */
export function intersectionPlageMois(plage: Plage, annee: number, mois: number): Plage | null {
  if (!plage || !estDateIsoValide(plage.debut) || !estDateIsoValide(plage.fin)) return null;
  if (plage.debut > plage.fin) return null;
  const debutMois = premierJourMois(annee, mois);
  const finMois = dernierJourMois(annee, mois);
  if (plage.fin < debutMois || plage.debut > finMois) return null;
  return {
    debut: plage.debut < debutMois ? debutMois : plage.debut,
    fin: plage.fin > finMois ? finMois : plage.fin,
    etat: plage.etat,
  };
}

/**
 * Fusionne les plages contiguës ou chevauchantes **d'un même état**.
 *
 * Les plages d'états différents ne sont pas fusionnées : elles restent
 * distinctes et c'est `etatDuJour` qui tranche, afin qu'un mois « réservé »
 * suivi d'un mois « sur demande » ne devienne pas un mois « réservé ».
 */
export function fusionnerPlages(plages: ReadonlyArray<Plage>): Plage[] {
  const triees = [...plages]
    .filter(
      (p) =>
        p &&
        estDateIsoValide(p.debut) &&
        estDateIsoValide(p.fin) &&
        p.debut <= p.fin &&
        (p.etat === 'libre' || p.etat === 'occupe' || p.etat === 'partiel'),
    )
    .sort((a, b) => a.debut.localeCompare(b.debut) || a.fin.localeCompare(b.fin));

  const resultat: Plage[] = [];
  for (const p of triees) {
    const dernier = resultat[resultat.length - 1];
    if (dernier && p.etat === dernier.etat && p.debut <= ajouterJours(dernier.fin, 1)) {
      dernier.fin = p.fin > dernier.fin ? p.fin : dernier.fin;
    } else {
      resultat.push({ ...p });
    }
  }
  return resultat;
}

// ---------------------------------------------------------------------------
// Conversion des deux sources de dates en plages occupées
//
// C'est ici que se fait l'unique conversion entre les deux conventions du
// dépôt : `sejours.depart` (exclusif) → `fin` inclusive, et `calendar_blocks`
// (`debut`/`fin` déjà inclusives) → tel quel.
// ---------------------------------------------------------------------------

/** Ligne lue dans `sejours` : seules les dates sont publiques (grant colonne). */
export interface LigneSejour {
  arrivee?: unknown;
  depart?: unknown;
}

/** Ligne lue dans `calendar_blocks` : seules les dates sont publiques. */
export interface LigneBlocage {
  debut?: unknown;
  fin?: unknown;
}

/** Extrait une date ISO d'une valeur inconnue, ou null si elle est inutilisable. */
function dateLigne(valeur: unknown): string | null {
  return typeof valeur === 'string' && estDateIsoValide(valeur) ? valeur : null;
}

/**
 * Convertit des séjours en plages occupées.
 *
 * Convention hôtelière : le jour du départ libère le logement, donc un séjour
 * « 10 → 17 » n'occupe que les jours 10 à 16 — c'est la conversion explicite
 * `depart` exclusif → `fin` inclusif (veille du départ). Les dates invalides,
 * inversées ou vides sont ignorées : une ligne malformée ne casse jamais le
 * calendrier.
 */
export function plagesDepuisSejours(lignes: ReadonlyArray<LigneSejour>): Plage[] {
  const plages: Plage[] = [];
  for (const ligne of lignes ?? []) {
    const arrivee = dateLigne(ligne?.arrivee);
    const depart = dateLigne(ligne?.depart);
    if (!arrivee || !depart) continue;
    if (depart <= arrivee) continue; // aucune nuit : aucun jour occupé
    plages.push({ debut: arrivee, fin: moinsUnJour(depart), etat: 'occupe' });
  }
  return fusionnerPlages(plages);
}

/**
 * Convertit des blocages (`calendar_blocks`) en plages occupées.
 *
 * AUCUNE conversion de borne : `debut` et `fin` sont déjà inclusives, c'est la
 * convention inverse de `sejours`. Un blocage d'un seul jour a `debut = fin`.
 */
export function plagesDepuisBlocages(lignes: ReadonlyArray<LigneBlocage>): Plage[] {
  const plages: Plage[] = [];
  for (const ligne of lignes ?? []) {
    const debut = dateLigne(ligne?.debut);
    const fin = dateLigne(ligne?.fin);
    if (!debut || !fin) continue;
    if (fin < debut) continue; // plage inversée : ignorée
    plages.push({ debut, fin, etat: 'occupe' });
  }
  return fusionnerPlages(plages);
}

/**
 * Point d'entrée unique du calendrier : séjours + blocages → plages occupées.
 *
 * Les deux sources sont fusionnées après conversion, de sorte qu'un séjour et
 * un blocage contigus n'apparaissent que comme une seule plage occupée.
 */
export function plagesOccupees(
  sejours: ReadonlyArray<LigneSejour>,
  blocages: ReadonlyArray<LigneBlocage> = [],
): Plage[] {
  return fusionnerPlages([
    ...plagesDepuisSejours(sejours),
    ...plagesDepuisBlocages(blocages),
  ]);
}

/**
 * Vrai si une demande de séjour (`arrivee` → `depart`, départ exclusif)
 * touche une plage occupée.
 *
 * Le dernier jour demandé est la veille du départ : une arrivée le jour où un
 * blocage commence est bien occupée, tandis qu'un séjour finissant la veille
 * reste libre.
 */
export function datesOccupees(
  arrivee: string,
  depart: string,
  plages: ReadonlyArray<Plage>,
): boolean {
  if (!estDateIsoValide(arrivee) || !estDateIsoValide(depart) || depart <= arrivee) return false;
  const dernierJour = moinsUnJour(depart);
  return plages.some(
    (p) => p?.etat === 'occupe' && p.debut <= dernierJour && arrivee <= p.fin,
  );
}

/** État d'un jour : l'état de la plage qui le couvre, la plus prioritaire gagne. */
export function etatDuJour(iso: string, plages: ReadonlyArray<Plage>): EtatJour {
  let etat: EtatJour = 'libre';
  for (const p of plages) {
    if (!p || !estDateIsoValide(iso)) continue;
    if (p.debut <= iso && iso <= p.fin && PRIORITE[p.etat] > PRIORITE[etat]) etat = p.etat;
  }
  return etat;
}

/** Plages d'un état donné, bornées au mois et fusionnées. */
export function plagesDuMois(
  etat: EtatJour,
  plages: ReadonlyArray<Plage>,
  annee: number,
  mois: number,
): Plage[] {
  return fusionnerPlages(
    plages
      .filter((p) => p?.etat === etat)
      .map((p) => intersectionPlageMois(p, annee, mois))
      .filter((p): p is Plage => p !== null),
  );
}

// ---------------------------------------------------------------------------
// Construction du mois
// ---------------------------------------------------------------------------

/**
 * Construit le mois affiché : état de chaque jour, plages libres contiguës,
 * nombre de nuits libres restantes.
 */
export function construireMois(
  annee: number,
  mois: number,
  plages: ReadonlyArray<Plage>,
  options: OptionsCalendrier = {},
): MoisCalendrier {
  const ref = options.aujourdHui && estDateIsoValide(options.aujourdHui) ? options.aujourdHui : null;
  const jours = joursDuMois(annee, mois).map((iso) => ({
    iso,
    jour: Number(iso.slice(8, 10)),
    jourSemaine: jourSemaine(iso),
    weekend: estWeekend(iso),
    etat: etatDuJour(iso, plages),
    passe: ref ? iso < ref : false,
    plageLibre: null as Plage | null,
  }));

  // Plages libres contiguës : on ne part d'un lien que pour des jours libres
  // et non passés, afin de ne jamais proposer une date déjà échue.
  const plagesLibres: Plage[] = [];
  let courant: Plage | null = null;
  for (const j of jours) {
    const libre = j.etat === 'libre' && !j.passe;
    if (!libre) {
      courant = null;
      continue;
    }
    if (courant && j.iso === ajouterJours(courant.fin, 1)) {
      courant.fin = j.iso;
    } else {
      courant = { debut: j.iso, fin: j.iso, etat: 'libre' };
      plagesLibres.push(courant);
    }
  }

  for (const j of jours) {
    j.plageLibre = j.etat === 'libre' && !j.passe
      ? (plagesLibres.find((p) => p.debut <= j.iso && j.iso <= p.fin) ?? null)
      : null;
  }

  return {
    annee,
    mois,
    slug: slugMois(annee, mois),
    jours,
    nuitsLibres: jours.filter((j) => j.etat === 'libre' && !j.passe).length,
    plagesLibres,
    plagesOccupees: plagesDuMois('occupe', plages, annee, mois),
    plagesPartielles: plagesDuMois('partiel', plages, annee, mois),
  };
}

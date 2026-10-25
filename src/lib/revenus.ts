/**
 * Logique pure du suivi des revenus et des exports (chantier 6 — #20).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Couvert par tests/revenus.test.ts.
 *
 * Trois familles de fonctions :
 *   1. indicateurs  — chiffre d'affaires, taux d'occupation, prix moyen ;
 *   2. répartition  — un séjour à cheval sur deux mois est réparti nuit
 *      par nuit, ce qui évite de compter 100 % du montant dans le premier
 *      mois ;
 *   3. export CSV   — séparateur « ; » (Excel français), BOM UTF-8,
 *      échappement et neutralisation des injections de formules.
 *
 * Les séjours retenus sont ceux au statut « confirme » ou « termine ».
 * Un prix absent n'est jamais inventé : il est signalé à part.
 */

// ---------------------------------------------------------------------------
// Données d'entrée (formes minimales, indépendantes du schéma Supabase)
// ---------------------------------------------------------------------------

/** Séjour réduit à ce qui sert au calcul. */
export interface SejourMetier {
  id: string;
  created_at: string;
  arrivee: string;
  depart: string;
  client_nom: string;
  client_email: string | null;
  client_telephone: string | null;
  personnes: number;
  statut: string;
  prix_total: number | null;
  note: string | null;
}

/** Demande de contact réduite à ce qui sert à l'export. */
export interface MessageMetier {
  id: string;
  created_at: string;
  nom: string;
  email: string;
  telephone: string | null;
  dates: string | null;
  message: string;
  statut: string;
  /** `lu_at` est optionnel : la colonne n'existe pas tant que la migration
   * 0005_demandes_lues.sql n'est pas appliquée. */
  lu_at?: string | null;
}

/** Une nuit, rangée par mois et par saison. */
export interface NuitRepartie {
  annee: number;
  /** Mois 1-12. */
  mois: number;
  nuits: number;
  montant?: number;
}

/** Indicateur d'un mois donné. */
export interface IndicateurMois {
  annee: number;
  mois: number;
  /** Chiffre d'affaires du mois (séjours tarifés uniquement). */
  ca: number;
  /** Nuits réellement occupées par un séjour comptable. */
  nuits: number;
  /** Nombre de séjours comptables (statut confirmé / terminé). */
  sejourComptable: number;
  /** Nombre de séjours comptables sans prix renseigné. */
  sansPrix: number;
  /** Chiffre d'affaires ventilé par saison traversée. */
  saisons: Record<SaisonId, number>;
  /** Prix moyen par nuit, ou 0 si aucune nuit. */
  prixMoyenNuit: number;
}

/** Synthèse de l'exploitation, telle qu'affichée au tableau de bord. */
export interface Revenus {
  /** Chiffre d'affaires total (confirmé + terminé). */
  total: number;
  /** Détail par mois, trié par année puis par mois croissant. */
  parMois: IndicateurMois[];
  /** Chiffre d'affaires par saison. */
  parSaison: Record<SaisonId, number>;
  /** Chiffre d'affaires par année civile. */
  parAnnee: Record<string, number>;
  /** Nuits occupées par un séjour confirmé ou terminé. */
  nuitsLoues: number;
  /** Nuits occupées par un séjour comptable **et** tarifé (base du prix moyen). */
  nuitsComptables: number;
  /** Prix moyen par nuit (0 si aucune nuit tarifée). */
  prixMoyenNuit: number;
  /** Part des séjours comptables sans prix renseigné. */
  sansPrix: { sansPrix: number; total: number; taux: number };
}

export type SaisonId = 'haute' | 'moyenne' | 'basse';

// ---------------------------------------------------------------------------
// Constantes métier
// ---------------------------------------------------------------------------

/** Statuts comptabilisés dans le chiffre d'affaires et les nuits louées. */
export const STATUTS_COMPTABLES: ReadonlyArray<string> = ['confirme', 'termine'];

/** Une nuit compte dès que le statut est confirmé ou terminé. */
export const STATUTS_LOUES: ReadonlyArray<string> = ['confirme', 'termine'];

/** Séparateur CSV : le point-virgule est attendu par Excel en français. */
export const CSV_SEPARATEUR = ';';

/** BOM UTF-8 : sans lui, Excel affiche « ÂÃ© » au lieu des accents. */
export const CSV_BOM = '\uFEFF';

/** Saut de ligne Windows : c'est ce que lit un tableur. */
export const CSV_NL = '\r\n';

/** Saison d'un mois donné : juillet/août = haute, juin/septembre = moyenne. */
export function saisonDuMois(mois: number): SaisonId {
  if (mois === 7 || mois === 8) return 'haute';
  if (mois === 6 || mois === 9) return 'moyenne';
  return 'basse';
}

/** Arrondi au centime près, robuste aux artefacts d'arithmétique flottante. */
export function arrondi2(valeur: number): number {
  if (!Number.isFinite(valeur)) return 0;
  return Math.round((valeur + Number.EPSILON) * 100) / 100;
}

/** Nombre de jours d'un mois (année, mois 1-12). */
function joursDuMois(annee: number, mois: number): number {
  if (mois < 1 || mois > 12) return 0;
  return new Date(Date.UTC(annee, mois, 0)).getUTCDate();
}

/** Horodatage UTC d'une date ISO « AAAA-MM-JJ », ou NaN si invalide. */
function timestamp(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return Number.NaN;
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Clé de regroupement d'un mois, zéro padding (« 2026-07 »). */
export function cleMois(annee: number, mois: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Statuts
// ---------------------------------------------------------------------------

/** Vrai si le séjour entre dans le chiffre d'affaires (confirmé / terminé). */
export function estSejourComptable(sejour: Pick<SejourMetier, 'statut'>): boolean {
  return STATUTS_COMPTABLES.includes(sejour.statut);
}

/** Vrai si le séjour occupe réellement les nuits (confirmé / terminé). */
export function estSejourLoue(sejour: Pick<SejourMetier, 'statut'>): boolean {
  return STATUTS_LOUES.includes(sejour.statut);
}

// ---------------------------------------------------------------------------
// Répartition au prorata des nuits
// ---------------------------------------------------------------------------

/**
 * Découpe une plage de séjour en nuits rangées par mois.
 *
 * Convention hôtelière : la nuit du « 10 au 17 » est celle du 16 au matin ;
 * le départ libère le logement le jour même. Un séjour « 29/06 → 04/07 »
 * occupe donc 2 nuits en juin et 4 en juillet.
 */
export function repartirNuits(arrivee: string, depart: string): NuitRepartie[] {
  const debut = timestamp(arrivee);
  const fin = timestamp(depart);
  if (Number.isNaN(debut) || Number.isNaN(fin) || fin <= debut) return [];

  const parts = new Map<string, NuitRepartie>();
  const curseur = new Date(debut);
  while (curseur.getTime() < fin) {
    const annee = curseur.getUTCFullYear();
    const mois = curseur.getUTCMonth() + 1;
    const cle = cleMois(annee, mois);
    const part = parts.get(cle) ?? { annee, mois, nuits: 0 };
    part.nuits += 1;
    parts.set(cle, part);
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }
  return [...parts.values()].sort((a, b) => a.annee - b.annee || a.mois - b.mois);
}

/**
 * Répartit le prix d'un séjour au prorata des nuits de chaque mois.
 *
 * Les centimes perdus par l'arrondi des premiers mois sont repris sur le
 * dernier : la somme des parts est toujours exactement égale au prix saisi.
 * Renvoie une liste vide si le prix est invalide ou les dates incohérents.
 */
export function repartirMontant(
  arrivee: string,
  depart: string,
  prix: number,
): NuitRepartie[] {
  if (!Number.isFinite(prix) || prix < 0) return [];
  const parts = repartirNuits(arrivee, depart);
  if (parts.length === 0) return [];

  let reste = prix;
  return parts.map((part, index) => {
    // Dernier mois : on prend tout ce qui reste, pour ne pas perdre de centime.
    const montant =
      index === parts.length - 1
        ? arrondi2(reste)
        : arrondi2((prix * part.nuits) / totalNuits(parts));
    reste = arrondi2(reste - montant);
    return { annee: part.annee, mois: part.mois, nuits: part.nuits, montant };
  });
}

function totalNuits(parts: ReadonlyArray<NuitRepartie>): number {
  return parts.reduce((s, p) => s + p.nuits, 0);
}

/** Nuits d'un séjour par mois, indexées par clé « AAAA-M ». */
export function compterNuitsParMois(
  sejours: ReadonlyArray<SejourMetier>,
): Map<string, number> {
  const res = new Map<string, number>();
  for (const sejour of sejours) {
    for (const part of repartirNuits(sejour.arrivee, sejour.depart)) {
      const cle = cleMois(part.annee, part.mois);
      res.set(cle, (res.get(cle) ?? 0) + part.nuits);
    }
  }
  return res;
}

/** Nuits d'un séjour par saison, pour l'affichage « par saison ». */
export function compterNuitsParSaison(
  sejours: ReadonlyArray<SejourMetier>,
): Record<SaisonId, number> {
  const res: Record<SaisonId, number> = { haute: 0, moyenne: 0, basse: 0 };
  for (const sejour of sejours) {
    for (const part of repartirNuits(sejour.arrivee, sejour.depart)) {
      res[saisonDuMois(part.mois)] += part.nuits;
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// Prix manquants
// ---------------------------------------------------------------------------

/** Vrai si le prix est exploitable (nombre fini, positif ou nul). */
export function prixExploitable(prix: unknown): prix is number {
  return typeof prix === 'number' && Number.isFinite(prix) && prix >= 0;
}

/**
 * Part des séjours comptables sans prix renseigné.
 *
 * Un séjour gratuit (prix 0) est un prix renseigné : seul un `null` ou une
 * valeur illisible est considéré comme manquant. On ne fabrique jamais de
 * tarif moyen pour compenser, ce qui fausserait le total.
 */
export function partSansPrix(sejours: ReadonlyArray<SejourMetier>): {
  sansPrix: number;
  total: number;
  taux: number;
} {
  const comptables = sejours.filter(estSejourComptable);
  const sansPrix = comptables.filter((s) => !prixExploitable(s.prix_total)).length;
  const total = comptables.length;
  return { sansPrix, total, taux: total > 0 ? sansPrix / total : 0 };
}

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

/**
 * Chiffre d'affaires ventilé par mois, un séjour à cheval étant réparti
 * au prorata des nuits. Seuls les séjours tarifés contribuent au total.
 */
export function CA_MENSUEL(sejours: ReadonlyArray<SejourMetier>): IndicateurMois[] {
  const parMois = new Map<string, IndicateurMois>();

  for (const sejour of sejours) {
    if (!estSejourComptable(sejour)) continue;
    const cleEntree = (annee: number, mois: number): IndicateurMois => {
      const cle = cleMois(annee, mois);
      const entree = parMois.get(cle) ?? {
        annee,
        mois,
        ca: 0,
        nuits: 0,
        sejourComptable: 0,
        sansPrix: 0,
        saisons: { haute: 0, moyenne: 0, basse: 0 },
        prixMoyenNuit: 0,
      };
      parMois.set(cle, entree);
      return entree;
    };

    const tarife = prixExploitable(sejour.prix_total);
    const nuits = repartirNuits(sejour.arrivee, sejour.depart);
    const touches = nuits.length > 0;

    // Un séjour sans prix reste visible : il compte dans `sansPrix`.
    if (touches) {
      const premier = cleEntree(nuits[0].annee, nuits[0].mois);
      premier.sejourComptable += 1;
      if (!tarife) premier.sansPrix += 1;
    }

    if (!tarife) continue;

    const montant = sejour.prix_total as number;
    for (const part of repartirMontant(sejour.arrivee, sejour.depart, montant)) {
      const entree = cleEntree(part.annee, part.mois);
      entree.ca = arrondi2(entree.ca + (part.montant ?? 0));
      entree.nuits += part.nuits;
      entree.saisons[saisonDuMois(part.mois)] = arrondi2(
        entree.saisons[saisonDuMois(part.mois)] + (part.montant ?? 0),
      );
    }
  }

  const indicateurs = [...parMois.values()].sort((a, b) => a.annee - b.annee || a.mois - b.mois);
  for (const entree of indicateurs) {
    entree.prixMoyenNuit = entree.nuits > 0 ? arrondi2(entree.ca / entree.nuits) : 0;
  }
  return indicateurs;
}

/** Synthèse complète des revenus (par mois, par saison, par année). */
export function aggreger(sejours: ReadonlyArray<SejourMetier>): Revenus {
  const comptables = sejours.filter(estSejourComptable);
  const parMois = CA_MENSUEL(comptables);

  const parSaison: Record<SaisonId, number> = { haute: 0, moyenne: 0, basse: 0 };
  const parAnnee: Record<string, number> = {};
  let total = 0;

  for (const mois of parMois) {
    total = arrondi2(total + mois.ca);
    parAnnee[String(mois.annee)] = arrondi2((parAnnee[String(mois.annee)] ?? 0) + mois.ca);
    for (const saison of Object.keys(mois.saisons) as SaisonId[]) {
      parSaison[saison] = arrondi2(parSaison[saison] + mois.saisons[saison]);
    }
  }

  // Nuits louées : tout séjour confirmé ou terminé, tarifé ou non.
  const nuitsLoues = comptables.reduce(
    (s, sejour) => s + totalNuits(repartirNuits(sejour.arrivee, sejour.depart)),
    0,
  );
  // Base du prix moyen : uniquement les nuits des séjours tarifés.
  const nuitsComptables = parMois.reduce((s, m) => s + m.nuits, 0);

  return {
    total,
    parMois,
    parSaison,
    parAnnee,
    nuitsLoues,
    nuitsComptables,
    prixMoyenNuit: nuitsComptables > 0 ? arrondi2(total / nuitsComptables) : 0,
    sansPrix: partSansPrix(comptables),
  };
}

/**
 * Prix moyen par nuit : chiffre d'affaires / nuits des séjours tarifés.
 * Renvoie 0 sans nuit — jamais Infinity ni NaN.
 */
export function prixMoyenNuit(sejours: ReadonlyArray<SejourMetier>): number {
  const comptables = sejours.filter(estSejourComptable).filter((s) => prixExploitable(s.prix_total));
  const ca = arrondi2(
    comptables.reduce((s, sejour) => s + (sejour.prix_total as number), 0),
  );
  const nuits = comptables.reduce(
    (s, sejour) => s + totalNuits(repartirNuits(sejour.arrivee, sejour.depart)),
    0,
  );
  return nuits > 0 ? arrondi2(ca / nuits) : 0;
}

/** Nuits disponibles sur une période (bornes incluses). */
export function nuitsDisponiblesPeriode(debut: string, fin: string): number {
  const a = timestamp(debut);
  const b = timestamp(fin);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Taux d'occupation : nuits louées / nuits disponibles sur la période.
 * Un séjour à cheval n'est compté que pour les nuits qui tombent dans la
 * période. Le taux est plafonné à 1 (une saisie aberrante ne doit pas
 * produire 200 %).
 */
export function tauxOccupation(
  sejours: ReadonlyArray<SejourMetier>,
  periode: { debut: string; fin: string },
): { nuitsLouees: number; nuitsDisponibles: number; taux: number } {
  const disponible = nuitsDisponiblesPeriode(periode.debut, periode.fin);
  const debut = timestamp(periode.debut);
  const fin = timestamp(periode.fin);
  const valide = !Number.isNaN(debut) && !Number.isNaN(fin) && fin >= debut;

  let louees = 0;
  if (valide) {
    const jour = new Date(debut);
    for (let i = 0; i < disponible; i++) {
      const iso = jour.toISOString().slice(0, 10);
      const occupe = sejours.some(
        (s) => estSejourLoue(s) && s.arrivee <= iso && iso < s.depart,
      );
      if (occupe) louees += 1;
      jour.setUTCDate(jour.getUTCDate() + 1);
    }
  }

  return {
    nuitsLouees: louees,
    nuitsDisponibles: disponible,
    taux: disponible > 0 ? Math.min(1, louees / disponible) : 0,
  };
}

/** Nuits disponibles d'une année civile (365 ou 366). */
export function nuitsDisponiblesAnnee(annee: number): number {
  return joursDuMois(annee, 2) === 29 ? 366 : 365;
}

// ---------------------------------------------------------------------------
// Dégradation : table `sejours` absente (migration 0003 non appliquée)
// ---------------------------------------------------------------------------

/** Motifs PostgREST / PostgreSQL signalant une table absente du schéma. */
const MOTIFS_TABLE_ABSENTE = [
  /does not exist/i,
  /schema cache/i,
  /PGRST205/i,
  /42P01/i,
  /relation .* does not exist/i,
];

/**
 * Vrai si l'erreur Supabase provient de l'absence de la table `sejours`
 * (migration `0003_sejours.sql` pas encore appliquée).
 *
 * Sans ce test, l'erreur remonte comme un message abscons et la page
 * laisse croire que les indicateurs sont à zéro.
 */
export function estTableSejoursAbsente(error: unknown): boolean {
  if (!error) return false;
  const texte =
    typeof error === 'string'
      ? error
      : [
          (error as { message?: unknown }).message,
          (error as { details?: unknown }).details,
          (error as { hint?: unknown }).hint,
          (error as { code?: unknown }).code,
        ]
          .filter(Boolean)
          .map(String)
          .join(' ');
  return MOTIFS_TABLE_ABSENTE.some((m) => m.test(texte));
}

/** Période d'un mois civil : « 2026-07 » → { debut, fin }. */
export function periodeDuMois(annee: number, mois: number): { debut: string; fin: string } {
  const debut = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const fin = `${annee}-${String(mois).padStart(2, '0')}-${String(joursDuMois(annee, mois)).padStart(2, '0')}`;
  return { debut, fin };
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

/** Premiers caractères qu'Excel interprète comme une formule. */
export const CSV_PREFIXES_DANGEREUX: ReadonlyArray<string> = ['=', '+', '-', '@', '\t'];

/**
 * Vrai si la valeur commence par un caractère que le tableur exécuterait
 * comme une formule (`=`, `+`, `-`, `@`, tabulation), espaces ignorées.
 * Un prix négatif « -12,50 € » n'est pas une formule : seul un tiret
 * immédiatement suivi d'un chiffre ou d'une lettre est dangereux.
 */
export function estValeurInjective(valeur: unknown): boolean {
  if (valeur === null || valeur === undefined) return false;
  const texte = String(valeur);
  const epure = texte.replace(/^[\s﻿]+/, '');
  if (!epure) return false;
  const premier = epure[0];
  if (premier === '\t' || premier === '=') return true;
  if (premier === '+' || premier === '@') return true;
  if (premier === '-' && /^[A-Za-z0-9(]/.test(epure.slice(1))) return true;
  return false;
}

/**
 * Neutralise l'injection de formules : une apostrophe initiale force le
 * tableur à traiter la cellule comme du texte brut.
 */
export function neutraliserInjection(valeur: unknown): string {
  const texte = valeur === null || valeur === undefined ? '' : String(valeur);
  return estValeurInjective(texte) ? `'${texte}` : texte;
}

/**
 * Encode une cellule CSV : échappement des guillemets, du séparateur et
 * des sauts de ligne, puis neutralisation des formules.
 */
export function champCsv(valeur: unknown): string {
  let texte = valeur === null || valeur === undefined ? '' : String(valeur);
  // La neutralisation d'abord : c'est elle qui décide du préfixe, et
  // l'apostrophe doit rester le tout premier caractère de la cellule.
  texte = neutraliserInjection(texte);
  if (/[";\r\n]/.test(texte)) texte = `"${texte.replace(/"/g, '""')}"`;
  return texte;
}

/** Assemble les lignes d'un CSV (BOM, séparateur « ; », fin de ligne Windows). */
export function construireCsv(entetes: ReadonlyArray<string>, lignes: ReadonlyArray<ReadonlyArray<unknown>>): string {
  const corps = lignes.map((ligne) => ligne.map(champCsv).join(CSV_SEPARATEUR));
  return CSV_BOM + [entetes.join(CSV_SEPARATEUR), ...corps].join(CSV_NL) + CSV_NL;
}

/** Colonnes de l'export des séjours (dans l'ordre de la table). */
export const CSV_SEJOURS_ENTETES = [
  'Id',
  'Créé le',
  'Arrivée',
  'Départ',
  'Nuits',
  'Client',
  'Email',
  'Téléphone',
  'Personnes',
  'Statut',
  'Prix total (€)',
  'Note',
  'Exporté le',
] as const;

/** Colonnes de l'export des messages. */
export const CSV_MESSAGES_ENTETES = [
  'Id',
  'Reçu le',
  'Nom',
  'Email',
  'Téléphone',
  'Dates souhaitées',
  'Message',
  'Statut',
  'Lu',
] as const;

/** Horodatage ISO courant, injecté en paramètre pour rester testable. */
/**
 * Export CSV des séjours (tous statuts), avec le nombre de nuits calculé
 * et l'horodatage de l'export.
 */
export function csvSejours(
  sejours: ReadonlyArray<SejourMetier>,
  maintenant = new Date().toISOString(),
): string {
  const lignes = sejours.map((s) => [
    s.id,
    s.created_at,
    s.arrivee,
    s.depart,
    totalNuits(repartirNuits(s.arrivee, s.depart)),
    s.client_nom,
    s.client_email,
    s.client_telephone,
    s.personnes,
    s.statut,
    prixExploitable(s.prix_total) ? String(s.prix_total) : '',
    s.note,
    maintenant,
  ]);
  return construireCsv(CSV_SEJOURS_ENTETES, lignes);
}

/** Export CSV des demandes de contact (date de réception incluse dans les lignes). */
export function csvMessages(messages: ReadonlyArray<MessageMetier>): string {
  const lignes = messages.map((m) => [
    m.id,
    m.created_at,
    m.nom,
    m.email,
    m.telephone,
    m.dates,
    m.message,
    m.statut,
    // `lu_at` absent = colonne non migrée : on ne prétend pas trancher.
    m.lu_at === undefined ? '' : m.lu_at ? 'lu' : 'non lu',
  ]);
  return construireCsv(CSV_MESSAGES_ENTETES, lignes);
}

/** Nom de fichier d'export horodaté et sûr : « sejours-20261025-140300.csv ». */
export function nomFichierExport(type: string, maintenant: string | Date = new Date()): string {
  const d = maintenant instanceof Date ? maintenant : new Date(maintenant);
  if (Number.isNaN(d.getTime())) return `${type}-${horodatageSecurise()}.csv`;
  return `${type}-${horodatageSecurise(d)}.csv`;
}

/** « 20261025-140300 » en UTC — stable quel que soit le fuseau de la machine. */
function horodatageSecurise(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

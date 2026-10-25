/**
 * Logique pure de la taxe de séjour (chantier 8 — #22).
 *
 * Module PUR : aucune dépendance au DOM, au réseau, à Supabase ni au
 * système de fichiers. Couvert par tests/taxe-sejour.test.ts.
 *
 * Montant = taux × nuits × personnes, le taux étant lu dans
 * `content/tarifs.json` (clé `taxe_sejour_par_nuit_personne`) et passé
 * en paramètre : il n'est jamais codé en dur ici.
 *
 * Trois règles de prudence, appliquées partout :
 *   1. un taux absent (null / NaN / négatif) n'est JAMAIS remplacé par un
 *      taux approchant — le montant est « non calculable » et le séjour
 *      est signalé au propriétaire ;
 *   2. un nombre de personnes ou de nuits nul ou illisible rend le
 *      montant non calculable, sauf 0 nuit qui vaut 0 € par convention
 *      (le séjour n'occupe rien) ;
 *   3. la déclaration en mairie se fait par année civile : un séjour à
 *      cheval sur deux années est ventilé nuit par nuit, chaque année
 *      étant arrondie au centime et le solde repris sur la dernière.
 *
 * ⚠️ Ce que ce module ne fait PAS (à vérifier par le propriétaire) :
 *   - il n'applique aucune exonération (résidence principale, hébergement
 *     d'urgence, convention…) : le droit applicable dépend de la commune
 *     et du statut du voyageur ;
 *   - il ne connaît pas de plafond de nuits par personne : le code
 *     communal ou le barème communal peut prévoir une exonération au-delà
 *     d'un certain nombre de nuits par personne ; il n'est PAS inventé
 *     ici (un plafond doit être ajouté à `content/tarifs.json` et au
 *     calcul, pas supposé) ;
 *   - il ne retient que les séjours « confirmé » et « terminé » : un
 *     séjour « option » n'est pas assujetti tant qu'il n'est pas confirmé.
 */

import { nuits as nombreDeNuits } from './sejours';

// ---------------------------------------------------------------------------
// Données d'entrée
// ---------------------------------------------------------------------------

/** Séjour réduit à ce qui sert au calcul de la taxe. */
export interface SejourTaxe {
  id: string;
  arrivee: string;
  depart: string;
  personnes: number;
  statut: string;
}

/** Une année civile et le montant de taxe qu'elle porte. */
export interface TaxeParAnnee {
  annee: number;
  montant: number;
  nuits: number;
}

/** Résultat du calcul de la taxe d'un séjour. */
export interface TaxeSejour {
  id: string;
  nuits: number;
  personnes: number;
  /** Taux unitaire (nuit × personne) lu dans content/tarifs.json. */
  taux: number | null;
  /** Montant total, null si le taux est absent du contenu (jamais inventé). */
  montant: number | null;
  /** Montant hors exonérations que la commune pourrait accorder. */
  montantBase: number | null;
  /** true si le taux est absent : le séjour n'a pas pu être calculé. */
  tauxAbsent: boolean;
  /** Répartition par année civile (déclaration en mairie). */
  parAnnee: TaxeParAnnee[];
  /** Signaux d'attention à remonter au propriétaire (non bloquants). */
  alertes: AlerteTaxe[];
}

/** Un cas particulier à signaler au propriétaire, sans le trancher. */
export interface AlerteTaxe {
  /** Code stable (« taux_absent », « personnes_nulles »…). */
  code: string;
  /** Précision : année, nombre de nuits, identifiant du séjour… */
  detail: string;
}

/** Synthèse annuelle, destinée à la déclaration en mairie. */
export interface RecapTaxeAnnee {
  annee: number;
  /** Montant total collecté sur l'année. */
  total: number;
  /** Montant hors exonérations (si le propriétaire en déclare). */
  base: number;
  /** Nombre de séjours assujettis (confirmé / terminé, calculables). */
  assujettis: number;
  /** Nuits assujetties sur l'année. */
  nuits: number;
}

/** Synthèse de la taxe de séjour sur une période. */
export interface RecapTaxeSejour {
  parAnnee: RecapTaxeAnnee[];
  total: number;
  base: number;
  /** Séjours confirmés / terminés sans taxe calculable (taux absent). */
  sansTaux: number;
  /** Séjours confirmés / terminés sans taxe calculable (données absentes). */
  nonCalculables: number;
  /** Signaux d'attention relevés sur les séjours assujettis. */
  alertes: AlerteTaxe[];
}

/** Codes de signalement d'un séjour. */
export type CodeAlerte =
  | 'taux_absent'
  | 'personnes_nulles'
  | 'nuits_nulles'
  | 'sejour_deux_annees'
  | 'duree_longue';

// ---------------------------------------------------------------------------
// Constantes métier
// ---------------------------------------------------------------------------

/** Statuts assujettis : un séjour confirmé ou terminé occupe réellement le logement. */
export const STATUTS_ASSUJETTIS: ReadonlyArray<string> = ['confirme', 'termine'];

/**
 * Seuil de signalement d'une durée longue, en nuits par personne.
 *
 * ⚠️ Ce seuil n'est PAS un plafond légal : il ne déclenche AUCUNE
 * exonération. Il signale au propriétaire les séjours pour lesquels le
 * barème communal prévoit éventuellement une exonération au-delà d'un
 * certain nombre de nuits par personne (à vérifier en mairie / sur le
 * code communal des communes touristiques).
 */
export const SEUIL_DUREE_LONGUE = 30;

/** Arrondi au centime près, robuste aux artefacts d'arithmétique flottante. */
export function arrondi2(valeur: number): number {
  if (!Number.isFinite(valeur)) return 0;
  return Math.round((valeur + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Prédicats
// ---------------------------------------------------------------------------

/** Vrai si le séjour est assujetti (confirmé ou terminé). */
export function estAssujetti(sejour: Pick<SejourTaxe, 'statut' | 'id'>): boolean {
  return STATUTS_ASSUJETTIS.includes(sejour.statut);
}

/** Taux unitaire exploitable : nombre fini, positif. 0 est valide (pas de taxe). */
export function tauxExploitable(taux: unknown): taux is number {
  return typeof taux === 'number' && Number.isFinite(taux) && taux >= 0;
}

/** Nombre de personnes exploitable : entier positif. */
export function personnesExploitables(personnes: unknown): boolean {
  return typeof personnes === 'number' && Number.isFinite(personnes) && personnes >= 1;
}

/** Nuits du séjour, 0 si les dates sont invalides ou inversées. */
export function nuitsDuSejour(sejour: Pick<SejourTaxe, 'arrivee' | 'depart'>): number {
  return nombreDeNuits(sejour.arrivee, sejour.depart);
}

// ---------------------------------------------------------------------------
// Répartition par année civile
// ---------------------------------------------------------------------------

/**
 * Découpe une plage de séjour en nuits rangées par année civile.
 *
 * Convention hôtelière : le jour du départ libère le logement (un séjour
 * « 30/12 → 02/01 » occupe 2 nuits en 2026 et 1 en 2027). Repris de
 * `src/lib/revenus.ts` qui porte déjà cette logique ; elle est ici
 * réimplantée pour ne pas créer de dépendance entre deux modules purs.
 */
export function repartirNuitsParAnnee(arrivee: string, depart: string): TaxeParAnnee[] {
  const debut = Date.parse(`${arrivee}T00:00:00Z`);
  const fin = Date.parse(`${depart}T00:00:00Z`);
  if (Number.isNaN(debut) || Number.isNaN(fin) || fin <= debut) return [];

  const compteurs = new Map<number, TaxeParAnnee>();
  const curseur = new Date(debut);
  while (curseur.getTime() < fin) {
    const annee = curseur.getUTCFullYear();
    const entree = compteurs.get(annee) ?? { annee, montant: 0, nuits: 0 };
    entree.nuits += 1;
    compteurs.set(annee, entree);
    curseur.setUTCDate(curseur.getUTCDate() + 1);
  }
  return [...compteurs.values()].sort((a, b) => a.annee - b.annee);
}

/**
 * Ventile la taxe d'un séjour par année civile, nuit par nuit.
 *
 * Chaque année est arrondie au centime ; les centimes perdus par les
 * premières années sont repris sur la dernière, de sorte que la somme des
 * parts est exactement égale au montant total du séjour.
 */
export function repartirTaxeParAnnee(
  sejour: Pick<SejourTaxe, 'arrivee' | 'depart' | 'personnes'>,
  taux: number,
): TaxeParAnnee[] {
  if (!tauxExploitable(taux) || !personnesExploitables(sejour.personnes)) return [];

  const parts = repartirNuitsParAnnee(sejour.arrivee, sejour.depart);
  if (parts.length === 0) return [];

  const total = parts.reduce((s: number, p: TaxeParAnnee) => s + p.nuits, 0);
  let reste = arrondi2(total * sejour.personnes * taux);

  return parts.map((part: TaxeParAnnee, index: number) => {
    // Dernière année : on prend tout ce qui reste (aucun centime perdu).
    const montant =
      index === parts.length - 1
        ? arrondi2(reste)
        : arrondi2(part.nuits * sejour.personnes * taux);
    reste = arrondi2(reste - montant);
    return { annee: part.annee, montant, nuits: part.nuits };
  });
}

// ---------------------------------------------------------------------------
// Calcul par séjour
// ---------------------------------------------------------------------------

/**
 * Taxe de séjour d'un séjour : nuits × personnes × taux.
 *
 * Renvoie un résultat complet même quand le montant est impossible à
 * calculer (`montant: null`, `tauxAbsent: true`) : l'affichage reste
 * possible et le séjour est signalé plutôt que masqué ou approximé.
 */
export function calculerTaxeSejour(
  sejour: SejourTaxe,
  taux: unknown,
): TaxeSejour {
  const nombreNuits = nuitsDuSejour(sejour);
  const personnes = typeof sejour.personnes === 'number' ? sejour.personnes : 0;
  const tauxConnu = tauxExploitable(taux);
  const alertes: AlerteTaxe[] = [];

  // Signaux d'attention : d'abord ce qui empêche ou fragilise le calcul.
  if (!tauxConnu) {
    alertes.push({
      code: 'taux_absent',
      detail: `taux absent de content/tarifs.json (${String(taux)})`,
    });
  }
  if (!personnesExploitables(sejour.personnes)) {
    alertes.push({
      code: 'personnes_nulles',
      detail: `${String(personnes)} personne(s) déclarée(s)`,
    });
  }

  // Cas particulier documenté : un séjour à cheval sur deux années civile
  // doit être déclaré dans les deux millésimes.
  const anneesDistinctes = [...new Set(repartirNuitsParAnnee(sejour.arrivee, sejour.depart).map((p: TaxeParAnnee) => p.annee))];
  if (anneesDistinctes.length > 1) {
    alertes.push({
      code: 'sejour_deux_annees',
      detail: anneesDistinctes.join(' + '),
    });
  }

  // Plafond de nuits par personne : SIGNALÉ, jamais appliqué.
  if (
    personnesExploitables(sejour.personnes) &&
    nombreNuits / Math.max(1, personnes) >= SEUIL_DUREE_LONGUE
  ) {
    alertes.push({
      code: 'duree_longue',
      detail: `${nombreNuits} nuit(s) pour ${personnes} personne(s)`,
    });
  }

  const parAnnee = repartirTaxeParAnnee(sejour, tauxConnu ? (taux as number) : 0);
  // Un séjour de 0 nuit (dates identiques) n'occupe rien : 0 €, et non
  // « non calculable » — c'est le cas limite explicite de l'issue #22.
  const calculable =
    tauxConnu && personnesExploitables(sejour.personnes) && nombreNuits >= 0;

  const montant = calculable ? arrondi2(nombreNuits * personnes * (taux as number)) : null;
  // Montant « de base » = le même montant : aucune exonération n'est appliquée.
  const montantBase = montant;

  if (nombreNuits === 0 && (sejour.arrivee || sejour.depart)) {
    alertes.push({
      code: 'nuits_nulles',
      detail: `${sejour.arrivee || '—'} → ${sejour.depart || '—'}`,
    });
  }

  return {
    id: sejour.id,
    nuits: nombreNuits,
    personnes,
    taux: tauxConnu ? (taux as number) : null,
    montant,
    montantBase,
    tauxAbsent: !tauxConnu,
    parAnnee,
    alertes,
  };
}

// ---------------------------------------------------------------------------
// Synthèse annuelle (déclaration en mairie)
// ---------------------------------------------------------------------------

/**
 * Synthèse de la taxe de séjour par année civile.
 *
 * Seuls les séjours assujettis (confirmé / terminé) et calculables
 * contribuent au total : un séjour sans taux n'est jamais remplacé par un
 * montant approchant, il est compté dans `sansTaux`.
 */
export function recapitulerTaxe(
  sejours: ReadonlyArray<SejourTaxe>,
  taux: unknown,
): RecapTaxeSejour {
  const parAnnee = new Map<number, RecapTaxeAnnee>();
  let total = 0;
  let base = 0;
  let sansTaux = 0;
  let nonCalculables = 0;
  const alertes: AlerteTaxe[] = [];

  for (const sejour of sejours) {
    if (!estAssujetti(sejour)) continue;

    const calcul = calculerTaxeSejour(sejour, taux);
    for (const alerte of calcul.alertes) alertes.push({ code: alerte.code, detail: alerte.detail });

    if (!tauxExploitable(taux)) {
      sansTaux += 1;
      continue;
    }
    if (!personnesExploitables(sejour.personnes)) {
      nonCalculables += 1;
      continue;
    }

    for (const part of calcul.parAnnee) {
      const entree =
        parAnnee.get(part.annee) ??
        { annee: part.annee, total: 0, base: 0, assujettis: 0, nuits: 0 };
      entree.total = arrondi2(entree.total + part.montant);
      entree.base = arrondi2(entree.base + part.montant);
      entree.nuits += part.nuits;
      parAnnee.set(part.annee, entree);
    }
    // Un séjour n'est compté qu'une seule fois, dans l'année de sa première
    // nuit : le total des assujettis par année reste un nombre de séjours
    // (sinon un séjour à cheval serait compté dans deux années).
    if (calcul.nuits > 0) {
      const premiereAnnee = calcul.parAnnee[0]?.annee;
      if (premiereAnnee !== undefined) {
        const entree = parAnnee.get(premiereAnnee);
        if (entree) entree.assujettis += 1;
      }
    }
    total = arrondi2(total + (calcul.montant ?? 0));
    base = arrondi2(base + (calcul.montantBase ?? 0));
  }

  return {
    parAnnee: [...parAnnee.values()].sort((a, b) => a.annee - b.annee),
    total,
    base,
    sansTaux,
    nonCalculables,
    alertes,
  };
}

/** Libellé d'une alerte (utilisé par l'affichage ; sans i18n ici). */
export function estAlerte(code: string): boolean {
  return [
    'taux_absent',
    'personnes_nulles',
    'nuits_nulles',
    'sejour_deux_annees',
    'duree_longue',
  ].includes(code);
}

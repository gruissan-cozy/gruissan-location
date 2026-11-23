/**
 * Conditions générales de vente — logique pure.
 *
 * Aucune dépendance Astro : importable par `ConditionsGenerales.astro` comme
 * par les tests Vitest.
 *
 * Principe : la page ne fabrique aucune valeur juridique. Le barème
 * d'annulation vient de `content/annulation.json` (source unique, déjà affichée
 * sur la vitrine), la caution de `content/tarifs.json`, et la version des CGV
 * de `content/cgv.json`. Une donnée absente ou marquée `a_valider` est omise
 * ou signalée, jamais remplacée par une valeur plausible.
 */
import type { Lang } from '../i18n';

/** Une ligne publiable du barème d'annulation. */
export interface LigneBareme {
  delai: string;
  remboursementPct: number;
}

/** Pourcentage de remboursement acceptable : entier de 0 à 100. */
function pourcentageValide(valeur: unknown): valeur is number {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0 && valeur <= 100;
}

/**
 * Lignes du barème affichables dans la langue demandée.
 *
 * Une ligne dont le pourcentage n'est pas un entier de 0 à 100, ou dont le
 * délai n'est pas traduit, est écartée : mieux vaut un tableau plus court
 * qu'une ligne à moitié vide ou un pourcentage illisible.
 */
export function baremeAffiche(source: unknown, lang: Lang): LigneBareme[] {
  const bareme = (source as { bareme?: unknown } | null | undefined)?.bareme;
  if (!Array.isArray(bareme)) return [];
  const lignes: LigneBareme[] = [];
  for (const ligne of bareme) {
    const pct = (ligne as { remboursement_pct?: unknown })?.remboursement_pct;
    const delai = (ligne as { delai?: Record<string, unknown> })?.delai?.[lang];
    if (!pourcentageValide(pct)) continue;
    if (typeof delai !== 'string' || !delai.trim()) continue;
    lignes.push({ delai: delai.trim(), remboursementPct: pct });
  }
  return lignes;
}

/**
 * Vrai si le barème est contractuel.
 *
 * Seul un `a_valider` explicitement faux le rend opposable. Un fichier sans
 * marqueur, ou avec un marqueur d'un autre type, reste traité comme un
 * modèle : on ne présente jamais un barème non confirmé comme un engagement.
 */
export function baremeContractuel(source: unknown): boolean {
  return (source as { a_valider?: unknown } | null | undefined)?.a_valider === false;
}

/** Texte libre du barème (`explications`, `note_proprietaire`) dans une langue. */
export function texteAnnulation(
  source: unknown,
  cle: 'explications' | 'note_proprietaire',
  lang: Lang,
): string {
  const groupe = (source as Record<string, unknown> | null | undefined)?.[cle];
  if (!groupe || typeof groupe !== 'object') return '';
  const texte = (groupe as Record<string, unknown>)[lang];
  return typeof texte === 'string' ? texte.trim() : '';
}

/**
 * Taux de taxe de séjour affichable en clair, ou `null`.
 *
 * Le dépôt porte un taux provisoire sans source officielle (`a_valider: true`).
 * Tant que le propriétaire n'a pas confirmé la délibération communale, la page
 * décrit le régime applicable sans publier de montant : un chiffre inventé
 * dans des CGV serait opposable au loueur.
 */
export function montantTaxeAffichable(tarifs: unknown): number | null {
  const source = tarifs as
    | { a_valider?: unknown; taxe_sejour_par_nuit_personne?: unknown }
    | null
    | undefined;
  if (!source || source.a_valider !== false) return null;
  const brut = source.taxe_sejour_par_nuit_personne;
  // `Number(null)` vaut 0 : un taux absent ne doit pas devenir « taxe gratuite ».
  if (typeof brut !== 'number' && typeof brut !== 'string') return null;
  if (typeof brut === 'string' && !brut.trim()) return null;
  const taux = Number(brut);
  if (!Number.isFinite(taux) || taux < 0) return null;
  return Math.round(taux * 100) / 100;
}

/**
 * Version des CGV, utilisée comme référence d'acceptation.
 * Chaîne vide si la version est absente : la page n'affiche alors aucune
 * référence, plutôt qu'une date de circonstance.
 */
export function versionCgv(source: unknown): string {
  const version = (source as { version?: unknown } | null | undefined)?.version;
  return typeof version === 'string' ? version.trim() : '';
}

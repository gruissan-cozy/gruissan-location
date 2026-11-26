/**
 * Contenu éditorial multilingue — sélection de la bonne langue avec repli.
 *
 * Aucune dépendance Astro : importable par les composants comme par les tests
 * Vitest.
 *
 * Deux fuites de français sont corrigées ici :
 *   1. les sections du guide chargées depuis Supabase ne portent souvent que
 *      `fr` (le back office n'a pas ressaisi les traductions) : le repli doit
 *      se faire **par langue vers le JSON statique**, jamais directement vers
 *      le français de la ligne distante ;
 *   2. les listes `inclus` / `options` de `content/tarifs.json` sont désormais
 *      des objets `{fr, en, es, de}` et non plus des chaînes françaises.
 */
import type { Lang } from '../i18n';

/** Texte multilingue tel qu'il apparaît dans `content/*.json` ou Supabase. */
export type TexteTraduit = Record<string, string>;

/** Section du guide, brute (ligne Supabase ou entrée de `content/guide.json`). */
export interface SectionGuideBrute {
  slug: string;
  titre?: TexteTraduit | null;
  contenu?: TexteTraduit | null;
  icone?: string | null;
  ordre?: number | null;
}

/** Section du guide prête à afficher, dans une seule langue. */
export interface SectionGuideAffichee {
  slug: string;
  titre: string;
  contenu: string;
  icone: string | null;
  ordre: number;
}

/** Valeur non vide pour une langue donnée, sinon chaîne vide. */
function valeur(source: TexteTraduit | null | undefined, lang: Lang): string {
  const brut = source?.[lang];
  return typeof brut === 'string' && brut.trim() ? brut : '';
}

/**
 * Texte d'une section dans la langue demandée.
 *
 * Ordre de repli, strictement : langue de la ligne distante, langue du JSON
 * statique, français de la ligne distante, français du JSON statique. Une
 * traduction statique `en` l'emporte donc sur un corps français venu de
 * Supabase — c'est tout l'objet du correctif.
 */
export function fusionnerTexte(
  ligne: TexteTraduit | null | undefined,
  statique: TexteTraduit | null | undefined,
  lang: Lang,
): string {
  return (
    valeur(ligne, lang) ||
    valeur(statique, lang) ||
    valeur(ligne, 'fr') ||
    valeur(statique, 'fr')
  );
}

/**
 * Fusionne les lignes du guide (Supabase) avec les sections statiques de même
 * slug, et résout chaque texte dans la langue demandée.
 *
 * L'ordre des lignes est conservé : le tri reste à la charge de l'appelant.
 */
export function fusionnerSectionsGuide(
  lignes: SectionGuideBrute[],
  statiques: SectionGuideBrute[],
  lang: Lang,
): SectionGuideAffichee[] {
  const parSlug = new Map(statiques.map((s) => [s.slug, s]));
  return lignes.map((ligne) => {
    const statique = parSlug.get(ligne.slug);
    return {
      slug: ligne.slug,
      // Une section sans aucun titre affiche son slug plutôt qu'un vide.
      titre: fusionnerTexte(ligne.titre, statique?.titre, lang) || ligne.slug,
      contenu: fusionnerTexte(ligne.contenu, statique?.contenu, lang),
      icone: ligne.icone ?? statique?.icone ?? null,
      ordre: ligne.ordre ?? statique?.ordre ?? 0,
    };
  });
}

/**
 * Libellé d'une entrée tarifaire (`inclus[]`, `options[].nom`) dans la langue
 * demandée, repli sur le français.
 *
 * Les anciennes chaînes plates (format historique, français uniquement) sont
 * rendues telles quelles : aucun texte n'est inventé ni supprimé.
 */
export function libelleTarif(source: TexteTraduit | string | null | undefined, lang: Lang): string {
  if (typeof source === 'string') return source;
  return valeur(source, lang) || valeur(source, 'fr');
}

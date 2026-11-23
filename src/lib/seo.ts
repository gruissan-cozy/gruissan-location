/**
 * Métadonnées SEO des pages : titre, adresse canonique et variantes hreflang.
 *
 * Toutes les pages partagent le même layout : sans ces fonctions, chaque
 * sous-page héritait du titre, du canonical et des hreflang de l'accueil.
 * Elles sont pures, couvertes par `tests/seo.test.ts`, et `Layout.astro` se
 * contente de les brancher sur `Astro.url.pathname`.
 */
import { LANGUAGES, type Lang } from '../i18n';

/** Préfixe de déploiement GitHub Pages (le site ne vit pas à la racine). */
export const PREFIXE_SITE = '/gruissan-location/';

const RACINE_SITE = 'gruissan-location';

/**
 * Sections publiées dans les quatre langues, en plus de l'accueil.
 * `tenant/` et `admin/` n'en font pas partie : aucun hreflang pour elles.
 */
export const SECTIONS_MULTILINGUES = [
  'conditions-generales',
  'confidentialite',
  'guide',
  'mentions-legales',
  'reserver',
] as const;

/** Découpe un chemin sous le préfixe du site ; `null` hors du site. */
function segments(chemin: unknown): string[] | null {
  if (typeof chemin !== 'string') return null;
  const brut = chemin.split(/[?#]/)[0] ?? '';
  const morceaux = brut.split('/').filter(Boolean);
  if (morceaux[0] !== RACINE_SITE) return null;
  return morceaux.slice(1);
}

/**
 * Chemin canonique normalisé : paramètres et ancre retirés, barre finale
 * ajoutée. Un chemin hors du site retombe sur l'accueil.
 */
export function normaliserChemin(chemin: unknown): string {
  const morceaux = segments(chemin);
  if (!morceaux || morceaux.length === 0) return PREFIXE_SITE;
  return `${PREFIXE_SITE}${morceaux.join('/')}/`;
}

/** Adresse absolue publiée dans `<link rel="canonical">` et `og:url`. */
export function adresseCanonique(chemin: unknown, origine: string): string {
  return `${origine.replace(/\/+$/, '')}${normaliserChemin(chemin)}`;
}

/** Langue et section déduites d'un chemin de page. */
export interface PageSeo {
  lang: Lang;
  /** `''` pour l'accueil, sinon `guide`, `mentions-legales`… */
  section: string;
  /** Vrai si la page existe vraiment dans les quatre langues. */
  multilingue: boolean;
}

/** Analyse un chemin de page ; `null` quand il sort du site. */
export function analyserChemin(chemin: unknown): PageSeo | null {
  const morceaux = segments(chemin);
  if (!morceaux) return null;
  const reste = [...morceaux];
  let lang: Lang = 'fr';
  const premier = reste[0];
  if (premier && (LANGUAGES as readonly string[]).includes(premier)) {
    lang = premier as Lang;
    reste.shift();
  }
  const section = reste.join('/');
  const multilingue =
    section === '' || (SECTIONS_MULTILINGUES as readonly string[]).includes(section);
  return { lang, section, multilingue };
}

/** Adresse d'une section dans une langue donnée. */
export function cheminLangue(lang: Lang, section = ''): string {
  const prefixeLangue = lang === 'fr' ? '' : `${lang}/`;
  return `${PREFIXE_SITE}${prefixeLangue}${section ? `${section}/` : ''}`;
}

/** Lien `hreflang` prêt à rendre. */
export interface LienLangue {
  hreflang: string;
  href: string;
}

/**
 * Variantes linguistiques d'une page : les quatre langues plus `x-default`.
 * Vide pour une page qui n'existe que dans une langue (`tenant/`, `admin/`) :
 * annoncer une traduction inexistante enverrait Google vers une 404.
 */
export function alternativesLangues(chemin: unknown): LienLangue[] {
  const page = analyserChemin(chemin);
  if (!page || !page.multilingue) return [];
  return [
    ...LANGUAGES.map((lang) => ({ hreflang: lang, href: cheminLangue(lang, page.section) })),
    { hreflang: 'x-default', href: cheminLangue('fr', page.section) },
  ];
}

/**
 * Titre du document : celui de la page quand elle en fournit un, sinon le
 * titre SEO de la langue (accueil). Une chaîne vide ou faite d'espaces ne
 * compte pas comme un titre.
 */
export function titrePage(titre: unknown, repli: string): string {
  const valeur = typeof titre === 'string' ? titre.trim() : '';
  return valeur || repli;
}

/**
 * Logique des sections de confiance — avis clients, FAQ, conditions d'annulation.
 * Aucune dépendance Astro : importable par `Vitrine.astro` comme par les tests Vitest.
 */
import type { Lang } from '../i18n';

/** Noms des mois par langue (partagés avec l'affichage des disponibilités). */
export const MOIS_PAR_LANGUE: Record<Lang, string[]> = {
  fr: ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  es: ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  de: ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
};

/** Sources d'avis reconnues (utilisées pour les libellés traduits). */
export const SOURCES_AVIS = ['airbnb', 'booking', 'abritel', 'direct', 'google'] as const;

export interface Avis {
  note: number;
  auteur: string;
  /** Date de l'avis au format YYYY-MM-DD. */
  date: string;
  /** Origine de l'avis : airbnb, booking, abritel, direct, google… */
  source: string;
  /** Texte de l'avis traduit (fr, en, es, de). */
  texte: Record<string, string>;
}

export interface FaqEntree {
  id: string;
  /** true tant que le propriétaire n'a pas confirmé la réponse. */
  a_valider: boolean;
  question: Record<string, string>;
  reponse: Record<string, string>;
}

const DATE_ISO = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Date réellement existante au format YYYY-MM-DD (rejette le 30 février). */
export function estDateIsoValide(iso: string): boolean {
  if (typeof iso !== 'string' || !DATE_ISO.test(iso)) return false;
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/**
 * Un avis n'est publiable que s'il est complet et cohérent : note entière de 1 à 5,
 * auteur non vide, date réelle, et texte présent dans la langue affichée.
 * Un avis fabriqué ou incomplet ne doit jamais apparaître en ligne.
 */
export function estAvisPubliable(avis: Avis, lang: Lang): boolean {
  const texte = avis?.texte?.[lang];
  return (
    Number.isInteger(avis?.note) &&
    avis.note >= 1 &&
    avis.note <= 5 &&
    typeof avis.auteur === 'string' &&
    avis.auteur.trim().length > 0 &&
    estDateIsoValide(avis.date) &&
    typeof texte === 'string' &&
    texte.trim().length > 0
  );
}

/** Avis publiables, du plus récent au plus ancien. */
export function avisVisibles(avis: Avis[], lang: Lang): Avis[] {
  if (!Array.isArray(avis)) return [];
  return avis
    .filter((a) => estAvisPubliable(a, lang))
    .slice()
    .sort((x, y) => y.date.localeCompare(x.date));
}

/**
 * La section « Avis clients » n'est rendue que s'il existe au moins un avis publiable.
 * Une liste vide (ou ne contenant que des avis incomplets) masque toute la section :
 * aucun avis inventé n'est jamais affiché.
 */
export function afficherSectionAvis(avis: Avis[], lang: Lang): boolean {
  return avisVisibles(avis, lang).length > 0;
}

/** Note moyenne arrondie au dixième, ou null sans avis publiable. */
export function noteMoyenne(avis: Avis[], lang: Lang): number | null {
  const visibles = avisVisibles(avis, lang);
  if (!visibles.length) return null;
  const somme = visibles.reduce((acc, a) => acc + a.note, 0);
  return Math.round((somme / visibles.length) * 10) / 10;
}

/** Date au format « 18 juillet 2026 » ; chaîne vide si la date est invalide. */
export function dateAffichee(iso: string, lang: Lang): string {
  if (!estDateIsoValide(iso)) return '';
  const [a, m, j] = iso.split('-').map(Number);
  const mois = MOIS_PAR_LANGUE[lang][m - 1] ?? '';
  return `${j} ${mois} ${a}`;
}

/** Clé i18n du libellé de source (« avis.source.direct ») ou null si la source est inconnue. */
export function cleSourceAvis(source: string): string | null {
  return (SOURCES_AVIS as readonly string[]).includes(source) ? `avis.source.${source}` : null;
}

/** Balisage structuré JSON-LD « FAQPage » construit depuis les données du site. */
export function faqJsonLd(entrees: FaqEntree[], lang: Lang) {
  const questions = (entrees ?? []).filter(
    (e) => e?.question?.[lang]?.trim() && e?.reponse?.[lang]?.trim(),
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: lang,
    mainEntity: questions.map((e) => ({
      '@type': 'Question',
      name: e.question[lang],
      acceptedAnswer: { '@type': 'Answer', text: e.reponse[lang] },
    })),
  };
}

/**
 * Balisage structuré JSON-LD des avis (« AggregateRating » + une entrée « Review » par avis).
 * Renvoie null sans avis publiable : aucune donnée d'avis n'est émise pour une liste vide.
 */
export function avisJsonLd(avis: Avis[], lang: Lang, nomBien = 'Gruissan Cozy') {
  const visibles = avisVisibles(avis, lang);
  if (!visibles.length) return null;
  const itemReviewed = { '@type': 'LodgingBusiness', name: nomBien };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AggregateRating',
        itemReviewed,
        ratingValue: noteMoyenne(avis, lang),
        bestRating: 5,
        worstRating: 1,
        reviewCount: visibles.length,
      },
      ...visibles.map((a) => ({
        '@type': 'Review',
        itemReviewed,
        author: { '@type': 'Person', name: a.auteur },
        datePublished: a.date,
        reviewBody: a.texte[lang],
        reviewRating: { '@type': 'Rating', ratingValue: a.note, bestRating: 5, worstRating: 1 },
      })),
    ],
  };
}

/**
 * Sérialisation d'un balisage JSON-LD adaptée à une injection dans le HTML :
 * les « < » sont échappés pour éviter toute fermeture prématurée de la balise <script>.
 */
export function jsonLd(donnees: unknown): string {
  return JSON.stringify(donnees).replace(/</g, '\\u003c');
}

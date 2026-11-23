/**
 * Pages légales (mentions légales et politique de confidentialité).
 *
 * Principe : le contenu éditable vit dans `content/legal.json` et les textes
 * dans `src/i18n/legal.ts`. Ce module ne contient que la logique pure :
 *
 *   - lecture des champs marqués `a_valider` : une valeur inconnue n'est
 *     JAMAIS affichée, ni remplacée par un texte d'attente. Le marqueur reste
 *     dans le fichier source mais ne franchit pas la frontière du rendu ;
 *   - construction des liens de pied de page dans les 4 langues ;
 *   - durées de conservation : elles sont importées de la purge réelle pour
 *     que la page publiée ne puisse pas annoncer un délai différent de celui
 *     que le code applique.
 */
import type { Lang } from '../i18n';
import { valeurEnregistrement } from './enregistrement';
import {
  RETENTION_DONNEES_PERSONNELLES_JOURS,
  RETENTION_PREUVE_ANNEES,
} from '../../supabase/functions/_shared/purge';

export type PageLegale = 'mentions-legales' | 'confidentialite' | 'conditions-generales';

/** Champ éditable : valeur connue, ou marqueur `a_valider` sans valeur. */
export interface ChampSource {
  valeur?: unknown;
  a_valider?: unknown;
}

/**
 * Valeur réellement publiable d'un champ.
 *
 * Une valeur absente, non textuelle ou vide donne une chaîne vide : le rendu
 * omet alors la ligne au lieu d'inventer une identité, une adresse ou une
 * assurance. Le booléen `a_valider` n'est jamais transformé en texte.
 */
export function valeurPubliee(champ: unknown): string {
  if (typeof champ === 'string') return champ.trim();
  if (!champ || typeof champ !== 'object') return '';
  const { valeur } = champ as ChampSource;
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/** Champs renseignés d'un groupe, dans l'ordre de déclaration du JSON. */
export function champsRenseignes(
  groupe: Record<string, unknown> | null | undefined,
): Array<{ cle: string; valeur: string }> {
  if (!groupe || typeof groupe !== 'object') return [];
  return Object.entries(groupe)
    .map(([cle, champ]) => ({ cle, valeur: valeurPubliee(champ) }))
    .filter(({ valeur }) => valeur !== '');
}

/** Vrai si au moins un champ du groupe porte une valeur publiable. */
export function aDesChampsRenseignes(groupe: Record<string, unknown> | null | undefined): boolean {
  return champsRenseignes(groupe).length > 0;
}

/**
 * Ligne « numéro d'enregistrement mairie » des mentions légales.
 * Chaîne vide quand le numéro n'est pas renseigné : aucune ligne d'attente.
 */
export function ligneEnregistrement(numero: unknown, libelle: string): string {
  const valeur = valeurEnregistrement(numero);
  if (!valeur) return '';
  return `${libelle} ${valeur}`;
}

/** Durées de conservation, lues depuis la purge effective des données. */
export const DUREES_CONSERVATION = {
  donneesPersonnellesJours: RETENTION_DONNEES_PERSONNELLES_JOURS,
  preuveAnnees: RETENTION_PREUVE_ANNEES,
} as const;

/** Remplace les jetons `{0}`, `{1}`… d'un libellé traduit. */
export function interpoler(modele: string, valeurs: ReadonlyArray<string | number>): string {
  return modele.replace(/\{(\d+)\}/g, (jeton, index: string) => {
    const valeur = valeurs[Number(index)];
    return valeur === undefined ? jeton : String(valeur);
  });
}

const PREFIXE_BASE = '/gruissan-location/';

/**
 * Adresse d'une page légale dans la langue demandée.
 * Le français vit à la racine du site, les autres langues sous `/en/`, etc.
 */
export function cheminPage(page: PageLegale, lang: Lang): string {
  const prefixeLangue = lang === 'fr' ? '' : `${lang}/`;
  return `${PREFIXE_BASE}${prefixeLangue}${page}/`;
}

const LOCALES: Record<Lang, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  es: 'es-ES',
  de: 'de-DE',
};

/** Date ISO (`AAAA-MM-JJ`) rendue au format local, chaîne vide si invalide. */
export function formaterDate(iso: unknown, lang: Lang): string {
  if (typeof iso !== 'string' || !iso.trim()) return '';
  const date = new Date(`${iso.trim()}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALES[lang] ?? LOCALES.fr, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

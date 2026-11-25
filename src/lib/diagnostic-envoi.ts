/**
 * Diagnostic d'un échec d'envoi de demande de réservation.
 *
 * Constat de production (2026-11-25) : le formulaire `/reserver/` affichait
 * « L'envoi a échoué » quel que soit le problème. Or les causes possibles
 * n'appellent pas la même réponse :
 *
 *   - `migration` : les migrations 0011→0014 ne sont pas appliquées en
 *     production. PostgREST répond `PGRST204` (colonne absente du cache de
 *     schéma), `PGRST205` (table absente), `42703` (colonne inexistante) ou
 *     `42501` (droit d'insertion manquant pour `anon`). Rien de ce que le
 *     visiteur peut faire n'y changera rien : il faut lui donner un vrai
 *     moyen de repli, et prévenir le propriétaire que le site est en
 *     maintenance silencieuse ;
 *   - `reseau` : coupure, wifi d'hôtel, formulaire ouvert hors ligne. Un
 *     nouvel essai suffit ;
 *   - `inconnu` : tout le reste (validation, quota, bug). Message générique.
 *
 * Module PUR : aucun DOM, aucun réseau. Le composant se contente de classer
 * l'erreur puis d'afficher le texte correspondant ; `tests/diagnostic-envoi`
 * couvre la classification et la sélection du message.
 *
 * Règle de confidentialité : le détail technique (code PostgREST, message SQL)
 * ne franchit JAMAIS la frontière du visiteur. Il part en console, où le
 * propriétaire le lira, et le visiteur ne voit qu'une phrase compréhensible.
 */

/** Cause d'un échec d'envoi, du plus probable au plus rare. */
export type CauseEnvoi = 'migration' | 'reseau' | 'inconnu';

export interface DiagnosticEnvoi {
  cause: CauseEnvoi;
  /** Code PostgREST/PostgreSQL reconnu ; chaîne vide si aucun. */
  code: string;
  /** Message technique d'origine, pour la console uniquement. */
  technique: string;
}

/**
 * Codes qui signalent une base non migrée.
 *
 * - `PGRST204` : colonne absente du cache de schéma (colonne jamais créée) ;
 * - `PGRST205` : table absente du cache de schéma (`calendar_blocks`) ;
 * - `42P01`    : `relation "…" does not exist` ;
 * - `42703`    : `column "…" does not exist` ;
 * - `42501`    : `permission denied for table …` (GRANT d'insertion manquant) ;
 * - `PGRST106` : schéma non exposé (variante PostgREST) ;
 * - `PGRST202` : fonction RPC absente (garde-fou pour les évolutions).
 */
export const CODES_MIGRATION: ReadonlyArray<string> = [
  'PGRST204',
  'PGRST205',
  'PGRST202',
  'PGRST106',
  '42P01',
  '42703',
  '42501',
];

/** Fragments de message qui trahissent une base non migrée. */
const MOTIFS_MIGRATION =
  /schema cache|does not exist|permission denied|column .* not found|could not find the .* column/i;

/** Fragments de message qui trahissent une coupure réseau. */
const MOTIFS_RESEAU =
  /failed to fetch|networkerror|network error|load failed|fetch failed|timed? ?out|econnrefused|enotfound|etimedout|offline|internet connection|network request failed/i;

/** Codes système d'une panne réseau. */
const CODES_RESEAU: ReadonlyArray<string> = [
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ECONNRESET',
  'EAI_AGAIN',
  'ERR_NETWORK',
];

/** Extrait le code d'une erreur Supabase (ou `''`). */
function codeDe(erreur: Record<string, unknown>): string {
  const brut = erreur.code ?? erreur.status ?? erreur.statusCode;
  if (typeof brut === 'string' && brut.trim()) return brut.trim();
  if (typeof brut === 'number' && Number.isFinite(brut)) return String(brut);
  return '';
}

/** Extrait le message d'une erreur quelconque, sans jamais lever. */
function messageDe(erreur: unknown): string {
  if (typeof erreur === 'string') return erreur;
  if (!erreur || typeof erreur !== 'object') return '';
  const objet = erreur as Record<string, unknown>;
  for (const cle of ['message', 'error_description', 'error', 'details', 'hint']) {
    const valeur = objet[cle];
    if (typeof valeur === 'string' && valeur.trim()) return valeur;
  }
  return '';
}

/**
 * Classe une erreur d'envoi.
 *
 * L'ordre compte : un code de migration est reconnu avant un motif réseau,
 * car PostgREST renvoie parfois un `TypeError` d'habillage pour une réponse
 * 4xx dont le corps est illisible. Le code, lui, est fiable.
 */
export function diagnostiquerEnvoi(erreur: unknown): DiagnosticEnvoi {
  const technique = messageDe(erreur);
  const code = erreur && typeof erreur === 'object' ? codeDe(erreur as Record<string, unknown>) : '';

  if (CODES_MIGRATION.includes(code) || MOTIFS_MIGRATION.test(technique)) {
    return { cause: 'migration', code, technique };
  }
  if (CODES_RESEAU.includes(code.toUpperCase()) || MOTIFS_RESEAU.test(technique)) {
    return { cause: 'reseau', code, technique };
  }
  return { cause: 'inconnu', code, technique };
}

/** Textes d'échec, par cause et selon qu'une adresse de repli existe. */
export interface TextesEchecEnvoi {
  migration: string;
  migrationSansEmail: string;
  reseau: string;
  reseauSansEmail: string;
  inconnu: string;
  inconnuSansEmail: string;
}

/**
 * Message à afficher au visiteur pour une cause donnée.
 *
 * Le texte « avec email » contient le jeton `{email}` : l'adresse réelle y est
 * substituée, et le composant la rend cliquable (`mailto:`). Sans adresse
 * utilisable, on ne promet rien : le message ne cite aucune coordonnée et
 * n'invite pas à écrire à une boîte qui n'existe pas.
 */
export function messageEchecEnvoi(
  cause: CauseEnvoi,
  textes: TextesEchecEnvoi,
  email: string,
): string {
  const adresse = typeof email === 'string' ? email.trim() : '';
  const avecEmail = adresse !== '';
  const brut =
    cause === 'migration'
      ? avecEmail
        ? textes.migration
        : textes.migrationSansEmail
      : cause === 'reseau'
        ? avecEmail
          ? textes.reseau
          : textes.reseauSansEmail
        : avecEmail
          ? textes.inconnu
          : textes.inconnuSansEmail;
  return avecEmail ? brut.replace('{email}', adresse) : brut;
}

/** Détail du séjour repris dans un éventuel email de repli. */
export interface RepliSejour {
  arrivee?: string;
  depart?: string;
  adultes?: number;
  mineurs?: number;
  nom?: string;
  message?: string;
}

/**
 * Lien `mailto:` de repli, ou `null` sans adresse utilisable.
 *
 * Quand l'enregistrement en base échoue, le visiteur doit pouvoir envoyer sa
 * demande autrement. On pré-remplit l'objet et le corps avec les dates et le
 * nombre de voyageurs déjà saisis : le propriétaire reçoit une demande
 * exploitable, pas un « bonjour » vide.
 */
export function lienMailtoRepli(email: string, sejour: RepliSejour = {}): string | null {
  const adresse = typeof email === 'string' ? email.trim() : '';
  if (!adresse) return null;

  const lignes: string[] = [];
  const dates = [sejour.arrivee, sejour.depart].filter(
    (valeur): valeur is string => typeof valeur === 'string' && valeur.trim() !== '',
  );
  if (dates.length === 2) lignes.push(`Dates : ${dates[0]} → ${dates[1]}`);
  else if (dates.length === 1) lignes.push(`Date : ${dates[0]}`);

  const adultes = Number.isFinite(sejour.adultes) ? Number(sejour.adultes) : 0;
  const mineurs = Number.isFinite(sejour.mineurs) ? Number(sejour.mineurs) : 0;
  if (adultes > 0 || mineurs > 0) {
    lignes.push(`Voyageurs : ${adultes} adulte(s), ${mineurs} mineur(s)`);
  }
  if (typeof sejour.nom === 'string' && sejour.nom.trim()) lignes.push(`Nom : ${sejour.nom.trim()}`);
  if (typeof sejour.message === 'string' && sejour.message.trim()) {
    lignes.push('', sejour.message.trim());
  }

  const sujet = 'Demande de réservation — Gruissan Cozy';
  const corps = ['Bonjour,', '', "Ma demande n'a pas pu être envoyée depuis le site.", '', ...lignes, '', 'Merci !'].join(
    '\n',
  );
  return `mailto:${adresse}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

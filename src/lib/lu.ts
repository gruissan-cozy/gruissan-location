/**
 * Logique pure du suivi LU / NON LU des demandes (chantier 4 — #18).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Couvert par tests/lu.test.ts.
 *
 * Principe : une demande est NON LUE tant que `lu_at` est nul. Le
 * marquage lu / non lu est persisté en base (colonne `messages.lu_at`,
 * migration 0005) ; ces fonctions ne font que calculer, trier et
 * préparer les écritures.
 */

/**
 * Forme minimale d'une demande pour le suivi de lecture.
 * `lu_at` est optionnel : tant que la migration 0005 n'est pas
 * appliquée, la colonne n'existe pas et Supabase ne la renvoie pas.
 */
export interface DemandeLisible {
  id: string;
  created_at?: string | null;
  lu_at?: string | null;
}

/** Écriture à envoyer pour marquer une demande lue (`at`) ou non lue (`null`). */
export function patchLu(at: string | null): { lu_at: string | null } {
  return { lu_at: at };
}

/** Horodatage courant au format ISO, utilisé pour marquer « lu maintenant ». */
export function maintenantISO(): string {
  return new Date().toISOString();
}

/** Vrai si l'horodatage de lecture est renseigné (demande lue). */
export function estHorodatageLu(luAt: unknown): boolean {
  return typeof luAt === 'string' && luAt.trim().length > 0;
}

/** Vrai si la demande est lue. Une demande sans `lu_at` est non lue. */
export function estLue<T extends DemandeLisible>(demande: T): boolean {
  return estHorodatageLu(demande.lu_at);
}

/** Vrai si la demande est non lue. */
export function estNonLue<T extends DemandeLisible>(demande: T): boolean {
  return !estLue(demande);
}

/** Nombre de demandes non lues. Tolérant à une liste vide ou mal formée. */
export function compterNonLus<T extends DemandeLisible>(demandes: ReadonlyArray<T>): number {
  return demandes.filter((d) => estNonLue(d)).length;
}

/** Nombre de demandes lues. */
export function compterLus<T extends DemandeLisible>(demandes: ReadonlyArray<T>): number {
  return demandes.length - compterNonLus(demandes);
}

/** Ne garde que les demandes non lues. */
export function filtrerNonLus<T extends DemandeLisible>(demandes: ReadonlyArray<T>): T[] {
  return demandes.filter((d) => estNonLue(d));
}

/** Identifiants des demandes non lues (utile pour l'action groupée). */
export function idsNonLus<T extends DemandeLisible>(demandes: ReadonlyArray<T>): string[] {
  return filtrerNonLus(demandes).map((d) => d.id);
}

/**
 * Copie de la liste avec `lu_at` renseigné pour `id`.
 * Renvoie la liste d'origine inchangée si l'identifiant est introuvable.
 */
export function appliquerLu<T extends DemandeLisible>(
  demandes: ReadonlyArray<T>,
  id: string,
  at: string | null,
): T[] {
  return demandes.map((d) => (d.id === id ? { ...d, lu_at: at } : d));
}

/** Copie de la liste avec toutes les demandes marquées lues à `at`. */
export function appliquerToutLu<T extends DemandeLisible>(
  demandes: ReadonlyArray<T>,
  at: string,
): T[] {
  return demandes.map((d) => ({ ...d, lu_at: at }));
}

/**
 * Ordre d'affichage par priorité : les demandes NON LUES d'abord
 * (les plus récentes en tête), puis les demandes lues (les plus
 * récentes en tête). La liste d'origine n'est pas modifiée ; les
 * demandes sans `created_at` restent en fin de groupe, et le tri est
 * stable à date égale.
 */
export function trierParPriorite<T extends DemandeLisible>(
  demandes: ReadonlyArray<T>,
): T[] {
  const rang = (d: T) => (estLue(d) ? 1 : 0);
  const horodatage = (d: T): number => {
    if (!d.created_at) return Number.NEGATIVE_INFINITY;
    const t = new Date(d.created_at).getTime();
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };
  return demandes
    .map((d, index) => ({ d, index }))
    .sort((a, b) => {
      const parStatut = rang(a.d) - rang(b.d);
      if (parStatut !== 0) return parStatut;
      const parDate = horodatage(b.d) - horodatage(a.d);
      if (parDate !== 0) return parDate;
      return a.index - b.index;
    })
    .map((x) => x.d);
}

/**
 * Vrai si la colonne `lu_at` est ABSENTE de la réponse Supabase.
 *
 * Avec `select('*')`, PostgREST omet simplement les colonnes qui
 * n'existent pas : une ligne sans la clé `lu_at` signifie donc que la
 * migration 0005 n'a pas été appliquée. Une colonne existante mais
 * nulle est renvoyée sous la forme `"lu_at": null`.
 */
export function colonneLuAbsente<T extends Partial<DemandeLisible>>(
  demandes: ReadonlyArray<T> | null | undefined,
): boolean {
  if (!demandes || demandes.length === 0) return false;
  return demandes.every((d) => !Object.prototype.hasOwnProperty.call(d, 'lu_at'));
}

/**
 * Erreur Supabase / PostgREST indiquant que la colonne `lu_at`
 * n'existe pas encore en base (migration 0005 non appliquée).
 */
const MOTIFS_COLONNE_LU = [/column/i, /pgrst204/i, /does not exist/i, /42703/i, /schema cache/i];

/** Texte d'erreur exploitable, quel que soit le type reçu (chaîne ou objet). */
function texteErreur(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  return [e.message, e.details, e.hint, e.code].filter(Boolean).map(String).join(' ');
}

/** Vrai si l'erreur provient de l'absence de la colonne `lu_at`. */
export function estErreurColonneLuAbsente(error: unknown): boolean {
  const texte = texteErreur(error);
  if (!/lu_at/i.test(texte)) return false;
  return MOTIFS_COLONNE_LU.some((m) => m.test(texte));
}

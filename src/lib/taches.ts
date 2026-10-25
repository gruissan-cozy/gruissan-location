/**
 * Logique pure des tâches entre séjours (chantier 8 — #22).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Couvert par tests/taches.test.ts.
 *
 * Une tâche est rattachée à un séjour (ménage, remise des clés, état des
 * lieux…). Elle a une case à cocher, un horodatage de réalisation et un
 * libellé issu d'une liste type ou saisi par le propriétaire.
 *
 * Les fonctions de normalisation acceptent des données dégradées (jsonb
 * incomplet, valeurs manquantes, statut inconnu) : elles ne lèvent jamais
 * et ne fabriquent jamais de tâche.
 */

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------

/** Statuts d'une tâche. */
export const TACHE_STATUTS = ['a_faire', 'fait'] as const;

export type StatutTache = (typeof TACHE_STATUTS)[number];

/** Une tâche, telle que renvoyée par la base (forme jsonb). */
export interface Tache {
  id: string;
  /** Libellé de la liste type (ménage, remise des clés…). */
  slug: string;
  /** Libellé multilingue de la liste type. */
  labels: Record<string, string>;
  /** Libellé libre saisi par le propriétaire (optionnel). */
  custom_label?: string | null;
  /** Tâche accomplie. */
  fait: boolean;
  /** Horodatage de réalisation (null tant que la case n'est pas cochée). */
  fait_le: string | null;
}

/** Tâche réduite à ce qui sert au suivi d'avancement. */
export interface TacheLecture {
  fait: boolean;
}

/** Avancement d'une liste de tâches. */
export interface Progression {
  total: number;
  faites: number;
  /** 0 si aucune tâche (jamais NaN). */
  taux: number;
  /** true dès que toutes les tâches sont faites (liste vide comprise). */
  terminee: boolean;
}

/** Forme minimale d'un séjour pour le rattachement. */
export interface SejourTaches {
  id: string;
  arrivee: string;
  depart: string;
  client_nom: string;
  statut: string;
  personnes: number;
  /** Tâches du séjour — absente si la colonne n'est pas migrée. */
  taches?: unknown;
}

// ---------------------------------------------------------------------------
// Libellés et lecture
// ---------------------------------------------------------------------------

/**
 * Libellé affiché d'une tâche : le libellé libre s'il est renseigné,
 * sinon le libellé de la liste type dans la langue demandée, avec repli
 * sur le français puis sur n'importe quelle langue disponible.
 */
export function libellerTache(
  tache: Pick<Tache, 'slug' | 'labels'> & { custom_label?: string | null },
  lang: string,
): string {
  const libre = typeof tache.custom_label === 'string' ? tache.custom_label.trim() : '';
  if (libre) return libre;
  const labels = (tache.labels ?? {}) as Record<string, unknown>;
  const candidates = [lang, 'fr', ...Object.keys(labels)];
  for (const cle of candidates) {
    const valeur = labels[cle];
    if (typeof valeur === 'string' && valeur.trim()) return valeur.trim();
  }
  return tache.slug || '—';
}

/**
 * Normalise une valeur jsonb en liste de tâches.
 *
 * Tolérant aux données dégradées : une valeur absente, non tableau, ou un
 * objet inexploitable est ignoré (aucune tâche fabriquée).
 */
export function normaliserTaches(brut: unknown): Tache[] {
  if (!Array.isArray(brut)) return [];
  const resultat: Tache[] = [];
  for (const entree of brut) {
    if (!entree || typeof entree !== 'object') continue;
    const t = entree as Record<string, unknown>;
    const slug = typeof t.slug === 'string' && t.slug.trim() ? t.slug.trim() : '';
    const id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : '';
    if (!slug) continue; // sans libellé, la tâche n'est pas affichable : on ne la retient pas

    const labelsBrut = (t.labels ?? {}) as Record<string, unknown>;
    const labels: Record<string, string> = {};
    if (labelsBrut && typeof labelsBrut === 'object') {
      for (const [cle, valeur] of Object.entries(labelsBrut)) {
        if (typeof valeur === 'string' && valeur.trim()) labels[cle] = valeur.trim();
      }
    }

    const fait = t.fait === true;
    const faitLeBrut = t.fait_le;
    const faitLe =
      typeof faitLeBrut === 'string' && faitLeBrut.trim() ? faitLeBrut.trim() : null;

    resultat.push({
      id,
      slug,
      labels,
      custom_label:
        typeof t.custom_label === 'string' && t.custom_label.trim() ? t.custom_label.trim() : null,
      fait,
      // Cohérence interne : pas d'horodatage de réalisation sans case cochée.
      fait_le: fait ? faitLe : null,
    });
  }
  return resultat;
}

/**
 * Sérialise une liste de tâches pour l'écriture en base (jsonb).
 *
 * On n'écrit que les champs utiles et on normalise les horodatages :
 * une tâche non faite n'a jamais de date de réalisation.
 */
export function serialiserTaches(taches: ReadonlyArray<Tache>): Array<Record<string, unknown>> {
  return taches
    .filter((t) => t && typeof t.slug === 'string' && t.slug.trim())
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      labels: t.labels ?? {},
      custom_label: t.custom_label ?? null,
      fait: t.fait === true,
      fait_le: t.fait === true ? (t.fait_le ?? null) : null,
    }));
}

// ---------------------------------------------------------------------------
// Avancement
// ---------------------------------------------------------------------------

/** Avancement d'une liste de tâches (0 tâche → 0 %, considérée terminée). */
export function progression(taches: ReadonlyArray<{ fait?: boolean }>): Progression {
  const total = taches.length;
  const faites = taches.filter((t) => t && t.fait === true).length;
  return {
    total,
    faites,
    taux: total > 0 ? faites / total : 0,
    terminee: total > 0 ? faites === total : true,
  };
}

/**
 * Bascule une tâche : renvoie une NOUVELLE liste, l'originale n'est pas
 * mutée. `fait` doit être booléen ; une valeur absente est traitée comme
 * `false` (case décochée) et aucun horodatage n'est inventé.
 */
export function basculerTache(
  taches: ReadonlyArray<Tache>,
  id: string,
  fait: boolean,
  maintenant = new Date().toISOString(),
): Tache[] {
  const horodatage = typeof maintenant === 'string' && maintenant.trim() ? maintenant : null;
  return taches.map((t) => {
    if (t.id !== id) return t;
    if (t.fait === fait) return t;
    return { ...t, fait: fait === true, fait_le: fait === true ? horodatage : null };
  });
}

/** Horodatage de réalisation d'une tâche, ou null si elle n'est pas faite. */
export function horodatageTache(tache: Pick<Tache, 'fait' | 'fait_le'>): string | null {
  return tache.fait === true && typeof tache.fait_le === 'string' && tache.fait_le.trim()
    ? tache.fait_le
    : null;
}

/** Vrai si la tâche est faite (tolérant une valeur absente). */
export function estFaite(tache: Pick<Tache, 'fait'>): boolean {
  return tache.fait === true;
}

// ---------------------------------------------------------------------------
// Rattachement au séjour
// ---------------------------------------------------------------------------

/**
 * Regroupe les tâches par séjour.
 *
 * Un séjour sans tâche (ou dont la colonne `taches` est absente) reçoit
 * une liste vide : la page peut afficher « aucune tâche » sans cas
 * particulier. Les tâches d'un séjour supprimé ne sont jamais reprises
 * ailleurs.
 */
export function regrouperParSejour(
  sejours: ReadonlyArray<SejourTaches>,
): Array<{ sejour: SejourTaches; taches: Tache[]; progression: Progression }> {
  return sejours.map((sejour) => {
    const taches = normaliserTaches(sejour.taches);
    return { sejour, taches, progression: progression(taches) };
  });
}

/**
 * Prépare l'écriture de la colonne `taches` d'un séjour.
 *
 * Le séjour doit être fourni : la tâche est toujours rattachée à un
 * séjour, et aucun identifiant n'est inventé ici.
 */
export function ecrireTaches(
  sejour: Pick<SejourTaches, 'id'>,
  taches: ReadonlyArray<Tache>,
): { sejour_id: string; taches: Array<Record<string, unknown>> } {
  return { sejour_id: sejour.id, taches: serialiserTaches(taches) };
}

// ---------------------------------------------------------------------------
// Dégradation : table `sejour_taches` absente (migration 0006 non appliquée)
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
 * Vrai si l'erreur Supabase provient de l'absence de la table
 * `sejour_taches` (migration `0006_sejour_taches.sql` pas encore appliquée).
 *
 * Sans ce test, l'erreur remonte comme un message abscons et la page
 * laisse croire que le suivi d'avancement fonctionne.
 */
export function estTableTachesAbsente(error: unknown): boolean {
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

/** Liste type proposée par défaut (libellés éditables dans le back office). */
export const TACHES_TYPES: ReadonlyArray<{ slug: string; labels: Record<string, string> }> = [
  { slug: 'menage', labels: { fr: 'Ménage', en: 'Cleaning', es: 'Limpieza', de: 'Reinigung' } },
  {
    slug: 'remise_cles',
    labels: { fr: 'Remise des clés', en: 'Key handover', es: 'Entrega de llaves', de: 'Schlüsselübergabe' },
  },
  {
    slug: 'etat_des_lieux',
    labels: { fr: 'État des lieux', en: 'Inventory check', es: 'Inventario', de: 'Übergabeprotokoll' },
  },
  {
    slug: 'linge',
    labels: { fr: 'Linge propre', en: 'Fresh linen', es: 'Ropa limpia', de: 'Frische Wäsche' },
  },
  {
    slug: 'inventaire',
    labels: { fr: 'Inventaire', en: 'Inventory', es: 'Existencias', de: 'Inventar' },
  },
];

/** Construit une tâche vierge (case décochée, sans horodatage). */
export function creerTache(
  slug: string,
  labels: Record<string, string> = {},
  customLabel: string | null = null,
): Tache {
  return {
    id: '',
    slug,
    labels,
    custom_label: customLabel,
    fait: false,
    fait_le: null,
  };
}

/** Vrai si le libellé de liste type existe dans les 4 langues. */
export function libellesComplets(labels: Record<string, string> | undefined): boolean {
  if (!labels || typeof labels !== 'object') return false;
  return ['fr', 'en', 'es', 'de'].every((lang) => typeof labels[lang] === 'string' && labels[lang].trim());
}

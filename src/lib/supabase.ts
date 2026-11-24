import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

/** Client Supabase, ou null si les variables d'env ne sont pas configurées. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url!, anonKey!);
  }
  return client;
}

// ---------- Types des tables ----------
export interface Message {
  id: string;
  created_at: string;
  nom: string;
  email: string;
  telephone: string | null;
  dates: string | null;
  message: string;
  // Pipeline de statuts (chantier 5 — #19) : nouveau, contacte,
  // devis_envoye, confirme, termine, refuse. Les valeurs héritées
  // (en_cours, repondu, archive) peuvent encore remonter tant que la
  // migration 0004 n'est pas appliquée : le statut reste donc `string`.
  statut: string;
  replies: Array<{ at: string; by: string; body: string }>;
  // Historique des changements de statut — même motif que
  // `bookings.historique`. Optionnel : la colonne n'existe pas tant que
  // la migration 0004_pipeline_statuts.sql n'est pas appliquée.
  historique?: Array<{ at: string; by: string; action: string; detail?: string }>;
  // Suivi LU / NON LU (chantier 4 — #18) : NULL = non lu, non NULL =
  // horodatage de lecture. Optionnel : la colonne n'existe pas tant que
  // la migration 0005_demandes_lues.sql n'est pas appliquée.
  lu_at?: string | null;
}

/**
 * Ancienne table des demandes de réservation.
 *
 * OBSOLÈTE depuis la migration 0012 : les demandes vivent dans `sejours` au
 * statut `demande`. Le type est conservé le temps de la période de lecture
 * seule (audit) ; plus aucun code applicatif ne lit ni n'écrit `bookings`.
 */
export interface Booking {
  id: string;
  created_at: string;
  check_in: string;
  check_out: string;
  guests: number;
  nom: string;
  email: string;
  telephone: string | null;
  message: string | null;
  packs: Array<{ id: string; slug: string; nom: string; prix: number; unite: string; quantite: number }>;
  total_estime: number | null;
  statut: 'demande' | 'confirmee' | 'annulee' | 'terminee';
  historique: Array<{ at: string; by: string; action: string; detail?: string }>;
  lang: string | null;
}

/** Option choisie lors d'une demande de réservation (reprise de `bookings.packs`). */
export interface SejourPack {
  id: string;
  slug: string;
  nom: string;
  prix: number;
  unite: string;
  quantite: number;
}

export interface AvailabilityRow {
  id: string;
  start_date: string;
  end_date: string;
  statut: 'libre' | 'partiel' | 'reserve';
  note: string | null;
  updated_at: string;
}

export interface Pack {
  id: string;
  slug: string;
  nom: Record<string, string>;
  description: Record<string, string>;
  prix: number;
  unite: 'par_personne' | 'par_sejour' | 'par_nuit';
  actif: boolean;
  ordre: number;
}

export interface GuideSection {
  id: string;
  slug: string;
  titre: Record<string, string>;
  contenu: Record<string, string>;
  icone: string | null;
  ordre: number;
  actif: boolean;
  /**
   * 'public' : section affichée sur le guide public /guide/.
   * 'tenant' : section réservée à l'espace locataire (codes d'accès).
   * Absente tant que la migration 0010 n'est pas appliquée.
   */
  visibilite?: 'public' | 'tenant';
}

/**
 * Séjour daté du logement — dossier de réservation unique depuis la
 * migration 0012 (`bookings` y a été fusionnée).
 *
 * Cycle de vie : `demande` → `option` → `confirme` → `termine`, ou `annule`.
 * `origine` distingue une demande du site ('site'), une saisie du back office
 * ('admin') et une ligne reprise de `bookings` ('import').
 */
export interface Sejour {
  id: string;
  created_at: string;
  arrivee: string;
  depart: string;
  client_nom: string;
  client_email: string | null;
  client_telephone: string | null;
  personnes: number;
  statut: 'demande' | 'option' | 'confirme' | 'annule' | 'termine';
  prix_total: number | null;
  note: string | null;
  /** Message libre du visiteur (ex-`bookings.message`). */
  client_message?: string | null;
  /** Détail adultes / mineurs — les mineurs sont exonérés de taxe de séjour. */
  adultes?: number | null;
  mineurs?: number | null;
  /** Options choisies à la réservation (ex-`bookings.packs`). */
  packs?: SejourPack[];
  /** Prix estimé par le formulaire (le prix négocié reste `prix_total`). */
  prix_estime?: number | null;
  /** Historique des changements de statut (ex-`bookings.historique`). */
  historique?: Array<{ at: string; by: string; action: string; detail?: string }>;
  /** Langue de la demande (fr, en, es, de). */
  lang?: string | null;
  /** Provenance de la ligne : 'admin' (saisie), 'site' (formulaire), 'import'. */
  origine?: 'admin' | 'site' | 'import';
}

/**
 * Blocage de dates (travaux, séjour personnel, futur import iCal), table
 * `calendar_blocks` — migrations/0011_calendar_blocks.sql.
 *
 * Indépendant de `Sejour` : un blocage n'a ni client ni prix, et n'apparaît
 * donc jamais dans les revenus ni le taux d'occupation.
 *
 * ATTENTION — convention de dates inverse de `Sejour` : `debut` et `fin` sont
 * des bornes INCLUSES (`fin` est le dernier jour bloqué), alors que
 * `Sejour.depart` est exclusif. La conversion vit dans `src/lib/calendrier.ts`.
 */
export interface CalendarBlock {
  id: string;
  created_at: string;
  debut: string;
  fin: string;
  source: 'direct' | 'airbnb' | 'booking';
  /** UID iCal de l'événement importé ; null pour un blocage manuel. */
  external_uid: string | null;
  note: string | null;
}

/**
 * Tâche entre séjours (chantier 8 — #22), table `sejour_taches`.
 *
 * Le libellé de la liste type est dupliqué dans `libelles` (jsonb des 4
 * langues) au moment de la création : une tâche reste lisible même si la
 * liste type est ensuite modifiée.
 */
export interface SejourTache {
  id: string;
  created_at: string;
  updated_at: string;
  sejour_id: string;
  slug: string;
  libelles: Record<string, string>;
  custom_label: string | null;
  ordre: number;
  /** Case à cocher : tâche accomplie. */
  fait: boolean;
  /** Horodatage de réalisation — null tant que la case n'est pas cochée. */
  fait_le: string | null;
}

export interface TenantSession {
  id: string;
  created_at: string;
  reservation_id: string;
  email: string;
  token: string;
  expires_at: string;
  used: boolean;
}

export interface ChecklistItem {
  id: string;
  created_at: string;
  reservation_id: string;
  moment: 'checkin' | 'checkout';
  room: string;
  item: string;
  ok: boolean;
  note: string | null;
}

export interface TenantPhoto {
  id: string;
  created_at: string;
  reservation_id: string;
  moment: 'checkin' | 'checkout';
  room: string;
  path: string;
  mime: string;
  size: number | null;
  meta: Record<string, unknown>;
}

export interface PdfReport {
  id: string;
  created_at: string;
  reservation_id: string;
  moment: 'checkin' | 'checkout';
  path: string;
  size: number | null;
  sent_to_tenant: boolean;
  sent_to_owner: boolean;
  error: string | null;
}


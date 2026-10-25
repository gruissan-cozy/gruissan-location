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
}

/** Séjour daté du logement (chantier 1 — calendrier). */
export interface Sejour {
  id: string;
  created_at: string;
  arrivee: string;
  depart: string;
  client_nom: string;
  client_email: string | null;
  client_telephone: string | null;
  personnes: number;
  statut: 'option' | 'confirme' | 'annule' | 'termine';
  prix_total: number | null;
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


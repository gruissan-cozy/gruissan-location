import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

// Le site fonctionne en JSON seul (fichiers content/ + FormSubmit par email).
// Supabase reste disponible en option : pour l'activer, créer un projet,
// exécuter migrations/0001_init.sql et définir les deux variables d'env.
// En parallèle du build CI (GitHub Actions → Settings → Secrets), les
// variables doivent être définies AVANT le build (import.meta.env est
// remplacé à la compilation).
const SUPABASE_ENABLED = false;

export const isSupabaseConfigured = Boolean(url && anonKey) && SUPABASE_ENABLED;

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
  statut: 'nouveau' | 'en_cours' | 'repondu' | 'archive';
  replies: Array<{ at: string; by: string; body: string }>;
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

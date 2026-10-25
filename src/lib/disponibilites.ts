/**
 * Alimentation du calendrier de disponibilités (chantier 2 — issue #16).
 *
 * Priorité : la table Supabase `sejours` (dates seules, lecture publique
 * limitée par les politiques RLS de migrations/0003_sejours.sql).
 *
 * Repli : `content/disponibilites.json` (statut mensuel) si Supabase n'est pas
 * configuré, si la requête échoue ou si la table n'existe pas encore — la page
 * ne doit jamais casser. La dégradation est couverte par tests/disponibilites.test.ts.
 */

import dispoData from '../../content/disponibilites.json';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';
import {
  dernierJourMois,
  fusionnerPlages,
  moinsUnJour,
  parseMois,
  premierJourMois,
  type EtatJour,
  type Plage,
} from './calendrier';
import { estDateIsoValide } from './confiance';

/** D'où viennent les dates affichées (utile pour le libellé de la note). */
export type SourceDisponibilites = 'supabase' | 'json';

export interface Source {
  plages: Plage[];
  source: SourceDisponibilites;
}

/** Lignes lues dans `sejours` : seules les dates sont publiques (grant colonne). */
export interface LigneSejour {
  arrivee?: unknown;
  depart?: unknown;
}

/** Structure de repli de content/disponibilites.json. */
export interface DisponibilitesJson {
  mois?: Array<{ mois?: unknown; statut?: unknown }>;
  legende?: Record<string, string>;
}

/**
 * Convertit les séjours en plages occupées.
 *
 * Convention hôtelière : le jour du départ libère le logement, donc un séjour
 * « 10 → 17 » n'occupe que les jours 10 à 16. Les dates invalides, inversées ou
 * vides sont ignorées (une ligne malformée ne doit jamais casser le calendrier).
 */
export function plagesDepuisSejours(lignes: ReadonlyArray<LigneSejour>): Plage[] {
  const plages: Plage[] = [];
  for (const ligne of lignes ?? []) {
    const arrivee = typeof ligne?.arrivee === 'string' ? ligne.arrivee : '';
    const depart = typeof ligne?.depart === 'string' ? ligne.depart : '';
    if (!estDateIsoValide(arrivee) || !estDateIsoValide(depart)) continue;
    if (depart <= arrivee) continue; // plage vide : aucun jour occupé
    plages.push({ debut: arrivee, fin: moinsUnJour(depart), etat: 'occupe' });
  }
  return fusionnerPlages(plages);
}

/**
 * Convertit le statut mensuel du repli JSON en plages.
 *
 * - « libre »   → rien à bloquer (aucune plage) ;
 * - « reserve » → tout le mois est occupé ;
 * - « partiel » → tout le mois est « sur demande » (indisponibilité partielle).
 *
 * Un mois sans statut reconnu n'impose rien : on ne bloque jamais par défaut.
 */
export function plagesDepuisJson(dispo: DisponibilitesJson): Plage[] {
  const plages: Plage[] = [];
  for (const m of dispo?.mois ?? []) {
    const parsed = parseMois(String(m?.mois ?? ''));
    if (!parsed) continue;
    const statut = String(m?.statut ?? '');
    let etat: EtatJour | null = null;
    if (statut === 'reserve') etat = 'occupe';
    else if (statut === 'partiel') etat = 'partiel';
    if (!etat) continue; // « libre » ou statut inconnu : aucune contrainte
    plages.push({
      debut: premierJourMois(parsed.annee, parsed.mois),
      fin: dernierJourMois(parsed.annee, parsed.mois),
      etat,
    });
  }
  return fusionnerPlages(plages);
}

/** Repli JSON, calculé une seule fois : c'est lui qu'on renvoie en cas de dégradation. */
export function plagesRepli(): Plage[] {
  return plagesDepuisJson(dispoData as DisponibilitesJson);
}

export interface OptionsChargement {
  /** Force la configuration Supabase (tests) ; défaut = variables d'environnement. */
  configure?: boolean;
  /** Client injecté (tests) ; défaut = client partagé de src/lib/supabase.ts. */
  client?: SupabaseClient | null;
}

/**
 * Charge les disponibilités : Supabase en priorité, repli JSON sinon.
 *
 * Ne lève jamais : toute erreur (table absente, réseau, configuration) retombe
 * sur le fichier statique pour que la page reste affichable.
 */
export async function chargerDisponibilites(options: OptionsChargement = {}): Promise<Source> {
  const plagesJson = plagesRepli();
  const configure = options.configure ?? isSupabaseConfigured;
  const client = options.client !== undefined ? options.client : getSupabase();

  if (!configure || !client) return { plages: plagesJson, source: 'json' };

  try {
    const { data, error } = await client.from('sejours').select('arrivee, depart');
    if (error || !data) return { plages: plagesJson, source: 'json' };
    return { plages: plagesDepuisSejours(data as LigneSejour[]), source: 'supabase' };
  } catch {
    return { plages: plagesJson, source: 'json' };
  }
}

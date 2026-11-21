/**
 * Alimentation du calendrier de disponibilités (chantier 2 — issue #16).
 *
 * Priorité : les tables Supabase `sejours` (réservations) ET `calendar_blocks`
 * (blocages de dates), lues sur DEUX sources et converties par la fonction
 * unique `plagesOccupees` de `src/lib/calendrier.ts`. La lecture publique est
 * limitée par les politiques RLS de migrations/0003_sejours.sql et
 * migrations/0011_calendar_blocks.sql : seules les dates sortent.
 *
 * Repli : `content/disponibilites.json` (statut mensuel) si Supabase n'est pas
 * configuré, si la requête échoue ou si les tables n'existent pas encore — la
 * page ne doit jamais casser. La dégradation est couverte par
 * tests/disponibilites.test.ts.
 *
 * CONVENTION DE DATES : `sejours.depart` est EXCLUSIF, `calendar_blocks.fin`
 * est INCLUSIVE. La conversion vit dans `src/lib/calendrier.ts` ; ce module ne
 * fait que transporter les lignes brutes.
 */

import dispoData from '../../content/disponibilites.json';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';
import {
  dernierJourMois,
  fusionnerPlages,
  parseMois,
  plagesDepuisBlocages,
  plagesDepuisSejours,
  premierJourMois,
  type EtatJour,
  type LigneBlocage,
  type LigneSejour,
  type Plage,
} from './calendrier';

export type { LigneSejour, LigneBlocage } from './calendrier';

/** D'où viennent les dates affichées (utile pour le libellé de la note). */
export type SourceDisponibilites = 'supabase' | 'json';

export interface Source {
  plages: Plage[];
  source: SourceDisponibilites;
}

/** Structure de repli de content/disponibilites.json. */
export interface DisponibilitesJson {
  mois?: Array<{ mois?: unknown; statut?: unknown }>;
  legende?: Record<string, string>;
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
 * Les deux sources sont lues indépendamment puis fusionnées par
 * `plagesOccupees` : un échec de `calendar_blocks` (table absente) ne doit pas
 * faire perdre les séjours, et inversement. Une source lue avec succès reste
 * donc utilisée même si l'autre échoue.
 *
 * Ne lève jamais : si les DEUX lectures échouent, on retombe sur le fichier
 * statique pour que la page reste affichable.
 */
export async function chargerDisponibilites(options: OptionsChargement = {}): Promise<Source> {
  const plagesJson = plagesRepli();
  const configure = options.configure ?? isSupabaseConfigured;
  const client = options.client !== undefined ? options.client : getSupabase();

  if (!configure || !client) return { plages: plagesJson, source: 'json' };

  const [sejours, blocages] = await Promise.all([
    lireDates(client, 'sejours', 'arrivee, depart'),
    lireDates(client, 'calendar_blocks', 'debut, fin'),
  ]);

  // Aucune des deux tables lue : repli statique (Supabase absent ou non migré).
  if (!sejours && !blocages) return { plages: plagesJson, source: 'json' };

  return {
    plages: fusionnerPlages([
      ...plagesDepuisSejours((sejours ?? []) as LigneSejour[]),
      ...plagesDepuisBlocages((blocages ?? []) as LigneBlocage[]),
    ]),
    source: 'supabase',
  };
}

/**
 * Lit les dates d'une table ; renvoie null si la lecture échoue (table absente,
 * réseau, RLS). Une lecture réussie renvoie au pire un tableau vide, ce qui
 * signifie « aucune ligne » et non « repli ».
 */
async function lireDates(
  client: SupabaseClient,
  table: 'sejours' | 'calendar_blocks',
  colonnes: string,
): Promise<unknown[] | null> {
  try {
    const { data, error } = await client.from(table).select(colonnes);
    if (error || !data) return null;
    return data as unknown[];
  } catch {
    return null;
  }
}

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
 * configuré, si les deux requêtes échouent ou si les tables n'existent pas
 * encore — la page ne doit jamais casser. La dégradation est couverte par
 * tests/disponibilites.test.ts.
 *
 * Une lecture PARTIELLE (une table lue, l'autre illisible) n'est jamais
 * assimilée à « tout est libre » : les dates lues sont conservées et les plages
 * du repli statique y sont ajoutées (elles bloquent juillet et août). C'est
 * volontairement conservateur : mieux vaut afficher « sur demande » qu'annoncer
 * libre un logement dont une source n'a pas répondu.
 *
 * CONVENTION DE DATES : `sejours.depart` est EXCLUSIF, `calendar_blocks.fin`
 * est INCLUSIVE. La conversion vit dans `src/lib/calendrier.ts`
 * (`plagesOccupees`) ; ce module ne fait que transporter les lignes brutes.
 */

import dispoData from '../../content/disponibilites.json';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from './supabase';
import {
  dernierJourMois,
  fusionnerPlages,
  parseMois,
  plagesOccupees,
  premierJourMois,
  type EtatJour,
  type LigneBlocage,
  type LigneSejour,
  type Plage,
} from './calendrier';

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
 * Les deux tables sont lues indépendamment puis fusionnées par la fonction
 * unique `plagesOccupees`. Une lecture PARTIELLE n'est jamais assimilée à
 * « tout est libre » : si `sejours` OU `calendar_blocks` échoue, les dates
 * réellement lues sont conservées ET les plages du repli statique y sont
 * ajoutées (`source: 'json'`, donc note « calendrier indicatif »). Le repli
 * bloque juillet et août : la dégradation reste conservatrice, ce qui écarte le
 * double booking qu'une table vide ferait apparaître.
 *
 * Ne lève jamais : la page reste toujours affichable.
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

  // Les deux tables sont lisibles : Supabase fait foi, même si elles sont vides.
  if (sejours && blocages) {
    return {
      plages: plagesOccupees(sejours as LigneSejour[], blocages as LigneBlocage[]),
      source: 'supabase',
    };
  }

  // Lecture partielle ou totale en échec : on garde ce qui a été lu et on y
  // ajoute le repli statique (conservateur), sans jamais conclure « libre ».
  const lues = plagesOccupees(
    (sejours ?? []) as LigneSejour[],
    (blocages ?? []) as LigneBlocage[],
  );
  return { plages: fusionnerPlages([...plagesJson, ...lues]), source: 'json' };
}

/**
 * Lit les dates d'une table ; renvoie null si la lecture échoue (table absente,
 * réseau, RLS). Une lecture réussie renvoie au pire un tableau vide, ce qui
 * signifie « aucune ligne » et non « repli ».
 *
 * DUPLIQUÉ volontairement de `lireDates` dans src/components/Reservation.astro :
 * le formulaire s'exécute dans le navigateur et ne peut pas importer ce module
 * (qui lit `import.meta.env` côté serveur). Même contrat des deux côtés
 * (`null` = échec, `[]` = aucune ligne) : garder les deux en phase.
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

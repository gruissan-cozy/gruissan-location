/**
 * Logique pure du pipeline de statuts des demandes (chantier 5 — #19).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Couvert par tests/pipeline.test.ts.
 *
 * Pipeline : nouveau → contacte → devis_envoye → confirme → termine,
 * plus « refuse » (état terminal alternatif).
 *
 * Les valeurs héritées de l'ancien schéma (`en_cours`, `repondu`,
 * `archive`) sont converties par la migration 0004. Tant que celle-ci
 * n'est pas appliquée, elles peuvent encore remonter de la base : elles
 * sont affichées telles quelles et aucune transition n'est proposée.
 */

/** Statuts du pipeline, dans l'ordre de progression. */
export const STATUTS_MESSAGE = [
  'nouveau',
  'contacte',
  'devis_envoye',
  'confirme',
  'termine',
  'refuse',
] as const;

export type StatutMessage = (typeof STATUTS_MESSAGE)[number];

/** Étapes linéaires du pipeline (« refuse » est un état terminal à part). */
export const ETAPES_PIPELINE = ['nouveau', 'contacte', 'devis_envoye', 'confirme', 'termine'] as const;

export type EtapePipeline = (typeof ETAPES_PIPELINE)[number];

/**
 * Conversion des valeurs héritées, telle qu'appliquée par
 * migrations/0004_pipeline_statuts.sql. « nouveau » est conservé.
 */
export const CONVERSION_HERITE: Readonly<Record<string, StatutMessage>> = {
  nouveau: 'nouveau',
  en_cours: 'contacte',
  repondu: 'devis_envoye',
  archive: 'termine',
};

/** Statuts sans transition sortante. */
export const STATUTS_TERMINAUX: ReadonlyArray<StatutMessage> = ['termine', 'refuse'];

/** Entrée d'historique de changement de statut (même motif que `bookings.historique`). */
export interface EntreeHistorique {
  at: string;
  by: string;
  action: string;
  detail?: string;
}

/** Vrai si la valeur fait partie du pipeline (refuse inclus). */
export function estStatutMessage(valeur: unknown): valeur is StatutMessage {
  return typeof valeur === 'string' && (STATUTS_MESSAGE as ReadonlyArray<string>).includes(valeur);
}

/** Vrai si la valeur est une étape linéaire du pipeline (hors « refuse »). */
export function estEtapePipeline(valeur: unknown): valeur is EtapePipeline {
  return typeof valeur === 'string' && (ETAPES_PIPELINE as ReadonlyArray<string>).includes(valeur);
}

/** Vrai si le statut est terminal (termine / refuse). */
export function estTerminal(valeur: unknown): boolean {
  return estStatutMessage(valeur) && (STATUTS_TERMINAUX as ReadonlyArray<string>).includes(valeur);
}

/** Vrai si le statut provient de l'ancien schéma et n'a pas encore été converti. */
export function estValeurHeritee(valeur: unknown): boolean {
  return (
    typeof valeur === 'string' &&
    Object.prototype.hasOwnProperty.call(CONVERSION_HERITE, valeur) &&
    !estStatutMessage(valeur)
  );
}

/** Position dans le pipeline, ou -1 si le statut n'est pas une étape connue. */
export function indexEtape(valeur: unknown): number {
  return (ETAPES_PIPELINE as ReadonlyArray<string>).indexOf(typeof valeur === 'string' ? valeur : '');
}

/** Étape suivante du pipeline, ou null si le statut est terminal / inconnu. */
export function etapeSuivante(valeur: unknown): StatutMessage | null {
  const i = indexEtape(valeur);
  if (i < 0 || i >= ETAPES_PIPELINE.length - 1) return null;
  return ETAPES_PIPELINE[i + 1];
}

/**
 * Statuts atteignables depuis `depuis` : toute avancée dans le pipeline
 * (sauts d'étapes autorisés) + « refuse ». Tableau vide si le statut est
 * terminal, inconnu ou hérité non converti.
 */
export function transitionsAutorisees(depuis: unknown): StatutMessage[] {
  if (!estStatutMessage(depuis)) return [];
  if (estTerminal(depuis)) return [];
  const i = indexEtape(depuis);
  const suivantes: StatutMessage[] = [];
  if (i >= 0) {
    for (let n = i + 1; n < ETAPES_PIPELINE.length; n++) suivantes.push(ETAPES_PIPELINE[n]);
  }
  suivantes.push('refuse');
  return suivantes;
}

/** Vrai si le passage de `depuis` vers `vers` respecte le pipeline. */
export function estTransitionAutorisee(depuis: unknown, vers: unknown): boolean {
  return transitionsAutorisees(depuis).includes(vers as StatutMessage);
}

/**
 * Avance à `cible` seulement si `depuis` est une étape strictement
 * antérieure du pipeline. Renvoie null si le statut ne doit pas changer
 * (déjà à ce stade ou au-delà, statut inconnu ou terminal).
 */
export function avancerSiNecessaire(depuis: unknown, cible: StatutMessage): StatutMessage | null {
  if (!estStatutMessage(depuis) || estTerminal(depuis)) return null;
  const i = indexEtape(depuis);
  const c = indexEtape(cible);
  if (c < 0 || c <= i) return null;
  return cible;
}

/**
 * Compte les messages par statut. Les statuts de `statuts` absents des
 * messages restent à 0 ; un statut inconnu est compté sous sa propre clé
 * (tolérance aux valeurs héritées).
 */
export function compterParStatut<T extends { statut: string }>(
  messages: ReadonlyArray<T>,
  statuts: ReadonlyArray<string> = STATUTS_MESSAGE,
): Record<string, number> {
  const compteurs: Record<string, number> = {};
  for (const s of statuts) compteurs[s] = 0;
  for (const m of messages) {
    if (typeof m.statut !== 'string') continue;
    compteurs[m.statut] = (compteurs[m.statut] ?? 0) + 1;
  }
  return compteurs;
}

/** Construit l'entrée d'historique d'un changement de statut. */
export function construireEntreeHistorique(depuis: string, vers: string, at: string): EntreeHistorique {
  return { at, by: 'admin', action: 'statut', detail: `${depuis} → ${vers}` };
}

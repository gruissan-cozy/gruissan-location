/**
 * Logique pure du suivi des demandes de réservation (/admin/demandes).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Couvert par tests/demandes.test.ts.
 *
 * Depuis la migration 0011, une demande envoyée depuis /reserver/ est une
 * ligne `sejours` au statut `demande`. Elle ne bloque pas le calendrier
 * (plusieurs visiteurs peuvent demander les mêmes dates) : c'est le
 * propriétaire qui la tranche en la passant en `option` (dates tenues) ou
 * en `confirme`, ou en la refusant (`annule`).
 *
 * Toutes les décisions sont horodatées et empilées dans `sejours.historique`
 * — même motif que `messages.historique` (voir src/lib/pipeline.ts). Aucune
 * action ne crée de seconde ligne : la demande EST le séjour.
 */

import {
  trouverChevauchements,
  type PlageDates,
  type StatutSejour,
} from './sejours';

/** Décisions possibles sur une demande en attente. */
export type ActionDemande = 'confirmer' | 'option' | 'refuser';

/** Les trois actions, dans l'ordre d'affichage des boutons. */
export const ACTIONS_DEMANDE: ReadonlyArray<ActionDemande> = ['confirmer', 'option', 'refuser'];

/**
 * Statut atteint par chaque action.
 *
 * `refuser` passe par `annule` (statut existant du cycle de vie) plutôt que
 * par une valeur « refuse » propre aux demandes : un seul vocabulaire de
 * statuts, et la ligne sort des revenus, de la taxe et du calendrier sans
 * condition supplémentaire.
 */
export const STATUT_CIBLE: Readonly<Record<ActionDemande, StatutSejour>> = {
  confirmer: 'confirme',
  option: 'option',
  refuser: 'annule',
};

/** Vrai si la valeur est une action connue. */
export function estActionDemande(valeur: unknown): valeur is ActionDemande {
  return typeof valeur === 'string' && (ACTIONS_DEMANDE as ReadonlyArray<string>).includes(valeur);
}

/**
 * Vrai si l'action réserve les dates dans le calendrier.
 *
 * `refuser` libère les dates : inutile de signaler un chevauchement avant de
 * refuser une demande.
 */
export function actionOccupeCalendrier(action: ActionDemande): boolean {
  return action !== 'refuser';
}

/** Entrée d'historique de décision (même forme que `messages.historique`). */
export interface EntreeHistoriqueDemande {
  at: string;
  by: string;
  action: string;
  detail?: string;
}

/**
 * Champs dont l'absence doit être signalée au propriétaire.
 *
 * Signalement, jamais blocage : une demande sans téléphone reste traitable
 * (le voyageur a peut-être une bonne raison), mais kiki doit le voir avant
 * de confirmer.
 */
export type ChampManquant = 'email' | 'telephone' | 'prix';

/** Sous-ensemble d'un séjour suffisant pour l'écran des demandes. */
export interface DemandeMinimale extends PlageDates {
  statut?: string | null;
  created_at?: string | null;
  client_email?: string | null;
  client_telephone?: string | null;
  prix_estime?: number | null;
  prix_total?: number | null;
  historique?: EntreeHistoriqueDemande[] | null;
}

/** Vrai si une valeur de prix est réellement renseignée. */
function prixRenseigne(valeur: number | null | undefined): boolean {
  return valeur !== null && valeur !== undefined && Number.isFinite(Number(valeur));
}

/**
 * Liste les informations manquantes d'une demande, dans un ordre stable.
 *
 * - `email` : pas d'adresse, impossible de répondre par écrit ;
 * - `telephone` : pas de numéro, impossible d'appeler à l'arrivée ;
 * - `prix` : ni prix estimé (formulaire) ni prix négocié (back office).
 */
export function champsManquants(demande: DemandeMinimale): ChampManquant[] {
  const manquants: ChampManquant[] = [];
  if (!demande.client_email || !String(demande.client_email).trim()) manquants.push('email');
  if (!demande.client_telephone || !String(demande.client_telephone).trim()) manquants.push('telephone');
  if (!prixRenseigne(demande.prix_estime) && !prixRenseigne(demande.prix_total)) manquants.push('prix');
  return manquants;
}

/** Vrai si au moins une information manque (badge « incomplète »). */
export function estDemandeIncomplete(demande: DemandeMinimale): boolean {
  return champsManquants(demande).length > 0;
}

/** Vrai si la ligne attend encore une décision du propriétaire. */
export function estEnAttente(demande: { statut?: string | null }): boolean {
  return demande.statut === 'demande';
}

/** Nombre de demandes encore à traiter (bandeau du tableau de bord). */
export function compterEnAttente(
  sejours: ReadonlyArray<{ statut?: string | null }>,
): number {
  return sejours.filter(estEnAttente).length;
}

/**
 * Trie les demandes de la plus urgente à la moins urgente.
 *
 * Urgent = date d'arrivée la plus proche. Départage stable : réception la
 * plus ancienne d'abord, puis l'ordre d'origine (tri stable d'Array.sort).
 */
export function trierDemandes<T extends DemandeMinimale>(demandes: ReadonlyArray<T>): T[] {
  return [...demandes].sort((a, b) => {
    if (a.arrivee !== b.arrivee) return a.arrivee < b.arrivee ? -1 : 1;
    const ca = a.created_at ?? '';
    const cb = b.created_at ?? '';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return 0;
  });
}

/**
 * Séjours déjà bloquants qui entrent en conflit avec la demande.
 *
 * Délègue à `trouverChevauchements` (convention hôtelière : le jour du
 * départ libère le logement). Une autre demande en attente ne compte pas :
 * elle ne bloque rien.
 */
export function chevauchementsDemande(
  demande: PlageDates & { id?: string },
  existants: ReadonlyArray<PlageDates & { statut?: string }>,
): Array<PlageDates & { statut?: string }> {
  return trouverChevauchements({ id: demande.id, arrivee: demande.arrivee, depart: demande.depart }, existants);
}

/**
 * Vrai s'il faut demander confirmation avant de valider.
 *
 * Une action qui occupe le calendrier sur des dates déjà prises ne doit
 * jamais écraser silencieusement : l'écran affiche le conflit et attend un
 * second clic.
 */
export function confirmationRequise(
  demande: PlageDates & { id?: string },
  existants: ReadonlyArray<PlageDates & { statut?: string }>,
  action: ActionDemande,
): boolean {
  if (!actionOccupeCalendrier(action)) return false;
  return chevauchementsDemande(demande, existants).length > 0;
}

/** Construit l'entrée d'historique d'une décision. */
export function entreeHistorique(
  depuis: string,
  vers: string,
  at: string,
  motif?: string | null,
): EntreeHistoriqueDemande {
  const base = `${depuis} → ${vers}`;
  const texte = (motif ?? '').trim();
  return {
    at,
    by: 'admin',
    action: 'statut',
    detail: texte ? `${base} — ${texte}` : base,
  };
}

/**
 * Charge utile de la mise à jour d'une demande : le statut cible et
 * l'historique complété. Rien d'autre n'est touché — aucune ressaisie,
 * aucune seconde ligne.
 */
export function construirePatchAction(
  demande: DemandeMinimale,
  action: ActionDemande,
  at: string,
  motif?: string | null,
): { statut: StatutSejour; historique: EntreeHistoriqueDemande[] } {
  const depuis = demande.statut ?? 'demande';
  const vers = STATUT_CIBLE[action];
  const historique = Array.isArray(demande.historique) ? [...demande.historique] : [];
  historique.push(entreeHistorique(depuis, vers, at, motif));
  return { statut: vers, historique };
}

/** Total des personnes d'une demande (adultes + mineurs, ou `personnes`). */
export function totalPersonnes(demande: {
  personnes?: number | null;
  adultes?: number | null;
  mineurs?: number | null;
}): number {
  const adultes = Number(demande.adultes);
  const mineurs = Number(demande.mineurs);
  if (Number.isFinite(adultes) && adultes > 0) {
    return adultes + (Number.isFinite(mineurs) && mineurs > 0 ? mineurs : 0);
  }
  const total = Number(demande.personnes);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

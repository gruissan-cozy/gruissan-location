/**
 * Alerte de nouvelle demande — module PUR (tâche 10 du Lot 1).
 *
 * Aucune dépendance au réseau, au DOM, à Supabase ou à l'horloge : ce module
 * construit uniquement le message d'alerte et expose un point d'appel qui
 * dégrade proprement quand les secrets ne sont pas configurés. Le
 * déclenchement réel sur la création d'un séjour `demande` et l'envoi via un
 * relais sont volontairement laissés à une tâche ultérieure.
 *
 * Le message est rédigé en français : il est lu par le propriétaire dans le
 * back office, jamais par un visiteur du site vitrine (aucune clé i18n à
 * ajouter). Voir docs/notifications.md §7 pour les prérequis et les limites.
 */

/** Lien du back office où le propriétaire traite la demande. */
export const LIEN_ADMIN_DEMANDES = '/admin/demandes/';

/** Noms des secrets attendus (jamais leurs valeurs). */
export const SECRETS_ALERTE_DEMANDE = [
  'ALERTE_DEMANDE_WEBHOOK_URL',
  'ALERTE_DEMANDE_WEBHOOK_SECRET',
] as const;

/**
 * Champs autorisés dans une alerte.
 *
 * Un `Sejour` complet est structurellement assignable : c'est la copie
 * explicite faite dans `construireAlerteDemande` qui garantit la
 * confidentialité. Ni l'identifiant, ni le nom, ni l'e-mail, ni le
 * téléphone, ni le message du visiteur ne peuvent sortir de ce module.
 */
export interface DemandePourAlerte {
  arrivee?: string | null;
  depart?: string | null;
  adultes?: number | null;
  mineurs?: number | null;
  prix_estime?: number | null;
}

/** Payload sans donnée personnelle, prêt à être transmis à un relais. */
export interface AlerteDemande {
  titre: string;
  message: string;
  lien: string;
}

/** Secrets lus dans l'environnement (Astro côté serveur, injection en test). */
export interface EnvironnementAlerte {
  ALERTE_DEMANDE_WEBHOOK_URL?: string | null;
  ALERTE_DEMANDE_WEBHOOK_SECRET?: string | null;
}

export type RaisonNonEnvoi = 'configuration_manquante' | 'integration_non_branchee';

export interface ResultatEnvoiAlerte {
  /** Toujours false ici : aucun envoi réel n'est branché dans cette tâche. */
  envoye: false;
  raison: RaisonNonEnvoi;
  /** NOMS des secrets absents, jamais leurs valeurs. */
  secretsManquants: readonly string[];
  /** Message construit, sans donnée personnelle. */
  alerte: AlerteDemande;
}

const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const VALEUR_INCONNUE = 'à confirmer';
const PRIX_INCONNU = 'non renseigné';

/** Date ISO `AAAA-MM-JJ` → `JJ/MM/AAAA`. Toute autre valeur est écartée. */
export function formaterDateAlerte(valeur: unknown): string {
  if (typeof valeur !== 'string') return VALEUR_INCONNUE;
  const correspondance = DATE_ISO.exec(valeur.trim());
  if (!correspondance) return VALEUR_INCONNUE;
  const [, annee, mois, jour] = correspondance;
  const moisNumerique = Number(mois);
  const jourNumerique = Number(jour);
  if (moisNumerique < 1 || moisNumerique > 12 || jourNumerique < 1 || jourNumerique > 31) {
    return VALEUR_INCONNUE;
  }
  return `${jour}/${mois}/${annee}`;
}

/** Entier positif, ou `null` si la valeur est absente ou invalide. */
function normaliserEffectif(valeur: unknown): number | null {
  if (typeof valeur === 'number') {
    return Number.isFinite(valeur) && valeur >= 0 ? Math.floor(valeur) : null;
  }
  if (typeof valeur === 'string' && valeur.trim() !== '') {
    const nombre = Number(valeur.trim());
    return Number.isFinite(nombre) && nombre >= 0 ? Math.floor(nombre) : null;
  }
  return null;
}

/** « 2 adultes et 1 mineur », ou « non renseignés » si rien n'est exploitable. */
export function formaterVoyageurs(adultes: unknown, mineurs: unknown): string {
  const adulteEffectif = normaliserEffectif(adultes);
  const mineurEffectif = normaliserEffectif(mineurs);
  if (adulteEffectif === null && mineurEffectif === null) return 'non renseignés';

  const parties: string[] = [];
  if (adulteEffectif !== null) {
    parties.push(`${adulteEffectif} ${adulteEffectif === 1 ? 'adulte' : 'adultes'}`);
  }
  if (mineurEffectif !== null) {
    parties.push(`${mineurEffectif} ${mineurEffectif === 1 ? 'mineur' : 'mineurs'}`);
  }
  return parties.join(' et ');
}

/**
 * Prix estimé en euros, ou « non renseigné ». Un prix absent ou invalide
 * n'est jamais remplacé par un montant inventé (règle du dépôt).
 */
export function formaterPrixEstime(valeur: unknown): string {
  let nombre: number;
  if (typeof valeur === 'number') {
    nombre = valeur;
  } else if (typeof valeur === 'string') {
    const propre = valeur.replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.');
    nombre = propre === '' ? Number.NaN : Number(propre);
  } else {
    nombre = Number.NaN;
  }
  if (!Number.isFinite(nombre) || nombre < 0 || nombre >= 1_000_000_000) {
    return PRIX_INCONNU;
  }

  const [entiers, decimales = '00'] = nombre.toFixed(2).split('.');
  const avecSeparateur = entiers.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${avecSeparateur},${decimales} €`;
}

/**
 * Construit l'alerte d'une nouvelle demande. Fonction totale : aucune
 * exception, même avec un séjour vide ou mal formé.
 */
export function construireAlerteDemande(sejour: DemandePourAlerte): AlerteDemande {
  const source: DemandePourAlerte = sejour ?? {};
  const message = [
    'Nouvelle demande de réservation reçue sur le site.',
    `Séjour : ${formaterDateAlerte(source.arrivee)} → ${formaterDateAlerte(source.depart)}.`,
    `Voyageurs : ${formaterVoyageurs(source.adultes, source.mineurs)}.`,
    `Prix estimé : ${formaterPrixEstime(source.prix_estime)}.`,
    `Back office : ${LIEN_ADMIN_DEMANDES}`,
  ].join('\n');

  return {
    titre: 'Nouvelle demande de réservation',
    message,
    lien: LIEN_ADMIN_DEMANDES,
  };
}

function lireTexte(valeur: unknown): string | undefined {
  if (typeof valeur !== 'string') return undefined;
  const texte = valeur.trim();
  return texte === '' ? undefined : texte;
}

/** Lit les secrets depuis l'environnement fourni par Astro/Vite. */
export function lireEnvironnementAlerte(): EnvironnementAlerte {
  const environnement = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  return {
    ALERTE_DEMANDE_WEBHOOK_URL: lireTexte(environnement.ALERTE_DEMANDE_WEBHOOK_URL),
    ALERTE_DEMANDE_WEBHOOK_SECRET: lireTexte(environnement.ALERTE_DEMANDE_WEBHOOK_SECRET),
  };
}

/**
 * Point d'appel de l'alerte. Retourne TOUJOURS un résultat « non envoyé » :
 * - secrets manquants → `configuration_manquante` ;
 * - secrets présents → `integration_non_branchee` (aucun relais câblé, aucun
 *   envoi simulé : voir docs/notifications.md §7).
 *
 * Aucune exception n'est levée, aucun secret n'est consigné : seuls leurs
 * noms peuvent apparaître dans `secretsManquants`.
 */
export function envoyerAlerteDemande(
  sejour: DemandePourAlerte,
  environnement: EnvironnementAlerte = lireEnvironnementAlerte(),
): ResultatEnvoiAlerte {
  const alerte = construireAlerteDemande(sejour);
  const env = environnement ?? {};
  const secretsManquants = SECRETS_ALERTE_DEMANDE.filter(
    (nom) => lireTexte(env[nom]) === undefined,
  );

  if (secretsManquants.length > 0) {
    return { envoye: false, raison: 'configuration_manquante', secretsManquants, alerte };
  }
  return { envoye: false, raison: 'integration_non_branchee', secretsManquants: [], alerte };
}

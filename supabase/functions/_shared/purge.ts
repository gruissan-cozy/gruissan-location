/**
 * Règles de conservation appliquées par la purge des données locataire.
 *
 * Module PUR : aucune dépendance à Deno, au DOM, au réseau ou à Supabase.
 * Il est importé par l'Edge Function `purge-tenant-data` et couvert par
 * `tests/purge-tenant-data.test.ts`.
 *
 * Principe : la purge anonymise, elle n'ampute pas la preuve. Un état des
 * lieux sert à prouver un dégât des semaines ou des mois plus tard ; le
 * supprimer avec les données personnelles prive le propriétaire de tout
 * moyen de défense en cas de caution contestée.
 *
 * Deux durées distinctes, volontairement séparées :
 *
 *   - RETENTION_DONNEES_PERSONNELLES_JOURS : email du locataire, jeton
 *     d'accès, notes libres de la checklist. Supprimés dès la purge, qui
 *     intervient au lendemain du départ (expiration de la session).
 *   - RETENTION_PREUVE_ANNEES : PDF signé et photos d'état des lieux,
 *     conservés le temps de la prescription contractuelle de droit commun.
 *
 * Le PDF signé n'est PAS réécrit par la purge : le régénérer ou le
 * ré-encoder ferait perdre l'horodatage de signature et la valeur de
 * preuve. Il est conservé tel quel, avec une justification écrite ici
 * (obligation de preuve en cas de litige) et une durée de conservation
 * propre, comptée depuis le départ du séjour. Le document généré par
 * `generate-pdf` ne porte aucune métadonnée personnelle : pdf-lib n'écrit
 * que le producteur et la date de création, jamais de titre ni d'auteur.
 * Le nom du locataire n'apparaît que dans le corps du document,
 * inséparable de la preuve elle-même.
 */

/** Durée de conservation des données personnelles du séjour (jours). */
export const RETENTION_DONNEES_PERSONNELLES_JOURS = 30;

/** Durée de conservation de la preuve d'état des lieux (années). */
export const RETENTION_PREUVE_ANNEES = 5;

/** Motif inscrit dans le rapport de purge pour chaque élément conservé. */
export const MOTIF_CONSERVATION_PREUVE =
  'preuve d’état des lieux conservée pour un éventuel litige (dégât, caution contestée)';

/** Motif inscrit quand la preuve arrive au terme de sa durée de conservation. */
export const MOTIF_SUPPRESSION_PREUVE =
  'durée de conservation de la preuve atteinte';

const MOMENTS = ['checkin', 'checkout'] as const;
const PHOTO_EXTENSIONS = ['.jpg', '.jpeg', '.png'];

export type PurgeEntry = {
  /** Éléments supprimés, avec leur nombre. Jamais de donnée personnelle. */
  deleted: string[];
  /** Éléments anonymisés (métadonnées personnelles retirées). */
  anonymized: string[];
  /** Éléments conservés comme preuve, avec la durée associée. */
  retained: string[];
  /** Pourquoi ces choix, en clair, pour le rapport de purge. */
  reason: string;
};

export type PurgeCounts = {
  deletedSessions: number;
  deletedChecklists: number;
  disposableFiles: number;
  retainedPdfReports: number;
  retainedPhotos: number;
  anonymizedPhotos?: number;
};

/** Jour ISO (AAAA-MM-JJ) à partir d'une date. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Date de fin de conservation de la preuve d'un séjour : le départ du
 * locataire plus RETENTION_PREUVE_ANNEES, en ISO AAAA-MM-JJ.
 */
export function evidenceRetentionDeadline(departure: string | Date, years = RETENTION_PREUVE_ANNEES): string {
  const start = departure instanceof Date ? departure : new Date(`${departure}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  const deadline = new Date(start.getTime());
  deadline.setUTCFullYear(deadline.getUTCFullYear() + years);
  return isoDay(deadline);
}

/**
 * Date de départ à partir de laquelle la preuve est arrivée à échéance.
 * Un séjour dont le départ est antérieur à ce jour n'a plus de preuve à
 * conserver : elle est supprimée par la purge.
 */
export function evidenceExpiryCutoff(now: Date, years = RETENTION_PREUVE_ANNEES): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return isoDay(cutoff);
}

/** Une preuve datée d'un départ est-elle arrivée au terme de sa conservation ? */
export function isEvidenceExpired(departure: string | null | undefined, now: Date, years = RETENTION_PREUVE_ANNEES): boolean {
  if (!departure) return false;
  const deadline = evidenceRetentionDeadline(departure, years);
  if (!deadline) return false;
  return deadline < isoDay(now);
}

/**
 * Un fichier du bucket est-il une preuve d'état des lieux ?
 *
 * Seuls les documents déposés sous `<reservation>/<moment>/` comptent : le
 * PDF signé et les photos. Tout le reste (fichier inconnu, profondeur
 * inattendue, autre étape) est traité comme jetable.
 */
export function isEvidenceFile(path: string, reservationId: string): boolean {
  const prefix = `${reservationId}/`;
  if (!path.startsWith(prefix)) return false;
  const segments = path.slice(prefix.length).split('/');
  if (segments.length !== 2) return false;
  const [moment, file] = segments;
  if (!(MOMENTS as readonly string[]).includes(moment)) return false;
  const lower = file.toLowerCase();
  if (lower.endsWith('.pdf')) return true;
  return PHOTO_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** Sépare les fichiers d'une réservation entre preuve et jetable. */
export function partitionReservationFiles(
  paths: readonly string[],
  reservationId: string,
): { evidence: string[]; disposable: string[] } {
  const evidence: string[] = [];
  const disposable: string[] = [];
  for (const path of paths) {
    if (isEvidenceFile(path, reservationId)) evidence.push(path);
    else disposable.push(path);
  }
  return { evidence, disposable };
}

/** Fichiers d'une réservation qui constituent la preuve à conserver. */
export function listEvidenceFiles(paths: readonly string[], reservationId: string): string[] {
  return partitionReservationFiles(paths, reservationId).evidence;
}

export type ReservationPurgePlan = {
  /** Fichiers Storage à supprimer : tout ce qui n'est pas une preuve. */
  disposablePaths: string[];
  /** Fichiers Storage conservés comme preuve, intacts. */
  evidencePaths: string[];
  /** Métadonnées libres des photos à vider (anonymisation). */
  anonymizePhotoMeta: boolean;
  /** Lignes de checklist à supprimer (notes libres). */
  deleteChecklists: boolean;
  /** Sessions locataire à supprimer (email et jeton). */
  deleteSessions: boolean;
  /** Preuve conservée jusqu'à cette date (ISO AAAA-MM-JJ). */
  retainedUntil: string;
  /** Ligne de rapport correspondante. */
  entry: PurgeEntry;
};

/**
 * Décide, pour une réservation, ce que la purge supprime, anonymise et
 * conserve. Fonction pure : la décision est testable sans Supabase, ce qui
 * garantit que le PDF signé et les photos survivent à la purge.
 */
export function planReservationPurge(input: {
  reservationId: string;
  paths: readonly string[];
  sessionCount: number;
  checklistCount: number;
  reportCount: number;
  photoCount: number;
  departure: string | null;
  now: Date;
}): ReservationPurgePlan {
  const { evidence, disposable } = partitionReservationFiles(input.paths, input.reservationId);
  return {
    disposablePaths: disposable,
    evidencePaths: evidence,
    anonymizePhotoMeta: input.photoCount > 0,
    deleteChecklists: input.checklistCount > 0,
    deleteSessions: input.sessionCount > 0,
    retainedUntil: input.departure
      ? evidenceRetentionDeadline(input.departure)
      : evidenceRetentionDeadline(input.now),
    entry: buildPurgeEntry({
      deletedSessions: input.sessionCount,
      deletedChecklists: input.checklistCount,
      disposableFiles: disposable.length,
      retainedPdfReports: input.reportCount,
      retainedPhotos: input.photoCount,
    }),
  };
}

/** Construit la ligne de rapport d'une réservation purgée. */
export function buildPurgeEntry(counts: PurgeCounts): PurgeEntry {
  const deleted: string[] = [];
  const anonymized: string[] = [];
  const retained: string[] = [];

  if (counts.deletedSessions > 0) {
    deleted.push(`tenant_sessions: ${counts.deletedSessions} (email et jeton supprimés)`);
  }
  if (counts.deletedChecklists > 0) {
    deleted.push(`checklists: ${counts.deletedChecklists} (notes libres supprimées)`);
  }
  if (counts.disposableFiles > 0) {
    deleted.push(`fichiers hors preuve: ${counts.disposableFiles}`);
  }

  if ((counts.anonymizedPhotos ?? counts.retainedPhotos) > 0) {
    anonymized.push('photos.meta vidé');
  }
  if (counts.retainedPdfReports > 0) {
    anonymized.push('pdf_reports.error effacé');
  }

  if (counts.retainedPdfReports > 0) {
    retained.push(`PDF signé: ${counts.retainedPdfReports} (${RETENTION_PREUVE_ANNEES} ans, non réécrit)`);
  }
  if (counts.retainedPhotos > 0) {
    retained.push(`photos d’état des lieux: ${counts.retainedPhotos} (${RETENTION_PREUVE_ANNEES} ans)`);
  }

  return {
    deleted,
    anonymized,
    retained,
    reason: counts.retainedPdfReports + counts.retainedPhotos > 0
      ? `${MOTIF_CONSERVATION_PREUVE} ; les données personnelles du séjour sont supprimées`
      : 'aucune preuve à conserver pour cette réservation ; les données personnelles sont supprimées',
  };
}

/** Ligne de rapport pour une preuve supprimée à l'échéance de conservation. */
export function buildEvidenceExpiryEntry(counts: {
  departure: string;
  deletedPdfReports: number;
  deletedPhotos: number;
  deletedFiles: number;
}): PurgeEntry {
  const deleted: string[] = [];
  if (counts.deletedPdfReports > 0) deleted.push(`PDF signé: ${counts.deletedPdfReports}`);
  if (counts.deletedPhotos > 0) deleted.push(`photos d’état des lieux: ${counts.deletedPhotos}`);
  if (counts.deletedFiles > 0) deleted.push(`fichiers Storage: ${counts.deletedFiles}`);
  return {
    deleted,
    anonymized: [],
    retained: [],
    reason: `${MOTIF_SUPPRESSION_PREUVE} (départ ${counts.departure}, ${RETENTION_PREUVE_ANNEES} ans)`,
  };
}

/** Agrège les lignes de rapport en un résumé journalisable. */
export function summarizePurge(entries: readonly PurgeEntry[]): {
  reservations: number;
  deleted: number;
  anonymized: number;
  retained: number;
} {
  return {
    reservations: entries.length,
    deleted: entries.reduce((total, entry) => total + entry.deleted.length, 0),
    anonymized: entries.reduce((total, entry) => total + entry.anonymized.length, 0),
    retained: entries.reduce((total, entry) => total + entry.retained.length, 0),
  };
}

/* ============================================================
 * Effacement des données de réservation (`sejours.client_*`)
 * et des messages du formulaire de contact (`messages`).
 *
 * Décision de kiki (2026-11-23) : aucune conservation au titre d'une durée
 * légale n'est retenue ici. Passé le délai ci-dessous, les coordonnées du
 * voyageur sont effacées.
 *
 * Ce que la purge ne peut pas supprimer : `sejours.client_nom` est
 * `not null` (contrainte de 0003, reprise par 0012) et ce nom est encore
 * utilisé par l'export de la taxe de séjour et par l'export comptable.
 * Il est donc REMPLACÉ par un libellé neutre, jamais mis à NULL — une
 * mise à NULL échouerait et ferait échouer toute la purge.
 *
 * L'anonymisation laisse le dossier de séjour intact (dates, montants,
 * nombre de personnes, statut) : ce sont ces champs, et non l'identité du
 * voyageur, qui servent à établir la taxe de séjour et la comptabilité.
 * ============================================================ */

/**
 * Délai après le départ au-delà duquel les coordonnées du voyageur sont
 * effacées. Volontairement court : le nécessaire pour absorber une
 * contestation de dernière minute, pas une conservation légale.
 */
export const RETENTION_COORDONNEES_JOURS = 30;

/** Libellé inscrit à la place du nom du voyageur après effacement. */
export const NOM_ANONYMISE = 'Voyageur (effacé)';

/** Date (ISO AAAA-MM-JJ) à partir de laquelle les coordonnées sont échues. */
export function coordonneesExpiryCutoff(now: Date, jours = RETENTION_COORDONNEES_JOURS): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - jours);
  return isoDay(cutoff);
}

/** Les coordonnées d'un séjour sont-elles arrivées à échéance ? */
export function coordonneesExpirees(
  depart: string | Date | null | undefined,
  now: Date,
  jours = RETENTION_COORDONNEES_JOURS,
): boolean {
  if (!depart) return false;
  const cutoff = coordonneesExpiryCutoff(now, jours);
  const jour = depart instanceof Date ? isoDay(depart) : String(depart).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return false;
  return jour < cutoff;
}

/**
 * Champs personnels d'un séjour à effacer, et ce qui reste.
 *
 * Fonction pure : elle décide QUOI écrire, l'Edge Function se contente de
 * l'appliquer. `client_nom` reçoit `NOM_ANONYMISE` ; les autres passent à
 * NULL, ce que leurs colonnes acceptent.
 */
export function anonymiserSejour(): {
  client_nom: string;
  client_email: null;
  client_telephone: null;
  client_message: null;
} {
  return {
    client_nom: NOM_ANONYMISE,
    client_email: null,
    client_telephone: null,
    client_message: null,
  };
}

/**
 * Un séjour porte-t-il encore des coordonnées à effacer ?
 *
 * Évite une écriture inutile (et une ligne de rapport) pour les séjours
 * déjà anonymisés : la purge est idempotente.
 */
export function sejourPorteDesCoordonnees(sejour: {
  client_nom?: string | null;
  client_email?: string | null;
  client_telephone?: string | null;
  client_message?: string | null;
}): boolean {
  if (sejour.client_nom !== NOM_ANONYMISE) return true;
  return Boolean(sejour.client_email || sejour.client_telephone || sejour.client_message);
}

/**
 * Décide de l'effacement d'un séjour : ses coordonnées sont-elles échues ?
 * Renvoie le patch à appliquer, ou `null` s'il n'y a rien à faire.
 */
export function planEffacementSejour(
  sejour: {
    depart?: string | null;
    client_nom?: string | null;
    client_email?: string | null;
    client_telephone?: string | null;
    client_message?: string | null;
  },
  now: Date,
  jours = RETENTION_COORDONNEES_JOURS,
): ReturnType<typeof anonymiserSejour> | null {
  if (!coordonneesExpirees(sejour.depart ?? null, now, jours)) return null;
  if (!sejourPorteDesCoordonnees(sejour)) return null;
  return anonymiserSejour();
}

/** Motif inscrit dans le rapport de purge pour un effacement de coordonnées. */
export const MOTIF_EFFACEMENT_COORDONNEES =
  'coordonnées du voyageur effacées : délai de conservation écoulé';

/** Ligne de rapport pour un séjour dont les coordonnées ont été effacées. */
export function buildEffacementCoordonneesEntry(depart: string): PurgeEntry {
  return {
    deleted: [
      'sejours: nom remplacé par un libellé neutre',
      'sejours: email, téléphone et message effacés',
    ],
    anonymized: [],
    retained: [],
    reason: `${MOTIF_EFFACEMENT_COORDONNEES} (départ ${depart}, ${RETENTION_COORDONNEES_JOURS} jours)`,
  };
}

/** Ligne de rapport pour un message de contact effacé. */
export function buildEffacementMessageEntry(nombre: number): PurgeEntry {
  return {
    deleted: [`messages: ${nombre} (nom, email, téléphone et message effacés)`],
    anonymized: [],
    retained: [],
    reason: `${MOTIF_EFFACEMENT_COORDONNEES} (${RETENTION_COORDONNEES_JOURS} jours)`,
  };
}

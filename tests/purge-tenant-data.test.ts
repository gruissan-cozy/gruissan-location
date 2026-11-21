import { describe, expect, it } from 'vitest';
import {
  MOTIF_CONSERVATION_PREUVE,
  MOTIF_SUPPRESSION_PREUVE,
  RETENTION_DONNEES_PERSONNELLES_JOURS,
  RETENTION_PREUVE_ANNEES,
  buildEvidenceExpiryEntry,
  buildPurgeEntry,
  evidenceExpiryCutoff,
  evidenceRetentionDeadline,
  isEvidenceExpired,
  isEvidenceFile,
  listEvidenceFiles,
  partitionReservationFiles,
  planReservationPurge,
  summarizePurge,
} from '../supabase/functions/_shared/purge';

const RESERVATION = '11111111-2222-3333-4444-555555555555';
const pdfPath = `${RESERVATION}/checkin/etat-des-lieux-checkin.pdf`;
const checkoutPdfPath = `${RESERVATION}/checkout/etat-des-lieux-checkout.pdf`;
const photoPath = `${RESERVATION}/checkin/photo-1.jpg`;
const photoPngPath = `${RESERVATION}/checkout/photo-2.png`;
const strayPath = `${RESERVATION}/divers/note.txt`;

describe('durées de conservation', () => {
  it('sépare la durée des données personnelles de celle de la preuve', () => {
    expect(RETENTION_DONNEES_PERSONNELLES_JOURS).toBe(30);
    expect(RETENTION_PREUVE_ANNEES).toBe(5);
    expect(RETENTION_PREUVE_ANNEES * 365).toBeGreaterThan(RETENTION_DONNEES_PERSONNELLES_JOURS);
  });

  it('calcule l’échéance de la preuve cinq ans après le départ', () => {
    expect(evidenceRetentionDeadline('2026-08-15')).toBe('2031-08-15');
    expect(evidenceRetentionDeadline(new Date('2026-01-01T00:00:00Z'))).toBe('2031-01-01');
  });

  it('calcule la date de départ au-delà de laquelle la preuve est échue', () => {
    expect(evidenceExpiryCutoff(new Date('2026-11-21T03:15:00Z'))).toBe('2021-11-21');
  });

  it('considère la preuve échue seulement après son échéance', () => {
    const now = new Date('2026-11-21T03:15:00Z');
    expect(isEvidenceExpired('2022-06-01', now)).toBe(false);
    expect(isEvidenceExpired('2021-06-01', now)).toBe(true);
    expect(isEvidenceExpired(null, now)).toBe(false);
  });
});

describe('reconnaissance des fichiers de preuve', () => {
  it('reconnaît le PDF signé et les photos d’état des lieux', () => {
    expect(isEvidenceFile(pdfPath, RESERVATION)).toBe(true);
    expect(isEvidenceFile(checkoutPdfPath, RESERVATION)).toBe(true);
    expect(isEvidenceFile(photoPath, RESERVATION)).toBe(true);
    expect(isEvidenceFile(photoPngPath, RESERVATION)).toBe(true);
  });

  it('ne prend pas un fichier hors preuve pour une preuve', () => {
    expect(isEvidenceFile(strayPath, RESERVATION)).toBe(false);
    expect(isEvidenceFile(`${RESERVATION}/inconnu/etat-des-lieux.pdf`, RESERVATION)).toBe(false);
    expect(isEvidenceFile(`${RESERVATION}/checkin/archive.zip`, RESERVATION)).toBe(false);
    expect(isEvidenceFile(`${RESERVATION}/checkin/trop/profond.pdf`, RESERVATION)).toBe(false);
    expect(isEvidenceFile(pdfPath, 'autre-reservation')).toBe(false);
  });

  it('partitionne les fichiers entre preuve et jetable', () => {
    const { evidence, disposable } = partitionReservationFiles(
      [pdfPath, photoPath, strayPath, checkoutPdfPath],
      RESERVATION,
    );
    expect(evidence).toEqual([pdfPath, photoPath, checkoutPdfPath]);
    expect(disposable).toEqual([strayPath]);
    expect(listEvidenceFiles([pdfPath, strayPath], RESERVATION)).toEqual([pdfPath]);
  });
});

describe('plan de purge d’une réservation', () => {
  const now = new Date('2026-11-21T03:15:00Z');

  it('conserve le PDF signé et les photos, supprime les données personnelles', () => {
    const plan = planReservationPurge({
      reservationId: RESERVATION,
      paths: [pdfPath, photoPath, strayPath],
      sessionCount: 1,
      checklistCount: 6,
      reportCount: 1,
      photoCount: 1,
      departure: '2026-11-15',
      now,
    });

    expect(plan.evidencePaths).toEqual([pdfPath, photoPath]);
    expect(plan.disposablePaths).toEqual([strayPath]);
    expect(plan.deleteSessions).toBe(true);
    expect(plan.deleteChecklists).toBe(true);
    expect(plan.anonymizePhotoMeta).toBe(true);
    expect(plan.retainedUntil).toBe('2031-11-15');
  });

  it('ne supprime jamais le PDF du rapport dans la liste jetable', () => {
    const plan = planReservationPurge({
      reservationId: RESERVATION,
      paths: [pdfPath, checkoutPdfPath, photoPath, photoPngPath],
      sessionCount: 1,
      checklistCount: 6,
      reportCount: 2,
      photoCount: 2,
      departure: '2026-11-15',
      now,
    });
    expect(plan.disposablePaths).toEqual([]);
    expect(plan.evidencePaths).toHaveLength(4);
  });

  it('le PDF signé et les photos survivent à la purge, pas les données personnelles', () => {
    const files = [pdfPath, checkoutPdfPath, photoPath, strayPath];
    const plan = planReservationPurge({
      reservationId: RESERVATION,
      paths: files,
      sessionCount: 1,
      checklistCount: 6,
      reportCount: 2,
      photoCount: 1,
      departure: '2026-11-15',
      now,
    });

    // Ce que la purge laisse réellement dans le bucket.
    const survivors = files.filter((path) => !plan.disposablePaths.includes(path));
    expect(survivors).toEqual([pdfPath, checkoutPdfPath, photoPath]);
    expect(survivors).toContain(pdfPath);
    expect(survivors.some((path) => path.endsWith('.pdf'))).toBe(true);

    // Et ce qu'elle retire : sessions, notes libres, fichier hors preuve.
    expect(plan.deleteSessions).toBe(true);
    expect(plan.deleteChecklists).toBe(true);
    expect(plan.anonymizePhotoMeta).toBe(true);
    expect(plan.disposablePaths).toEqual([strayPath]);
  });

  it('journalise ce qui est supprimé, anonymisé et conservé, avec le motif', () => {
    const plan = planReservationPurge({
      reservationId: RESERVATION,
      paths: [pdfPath, photoPath],
      sessionCount: 1,
      checklistCount: 6,
      reportCount: 1,
      photoCount: 1,
      departure: '2026-11-15',
      now,
    });
    expect(plan.entry.deleted.some((line) => line.startsWith('tenant_sessions'))).toBe(true);
    expect(plan.entry.deleted.some((line) => line.startsWith('checklists'))).toBe(true);
    expect(plan.entry.anonymized).toContain('photos.meta vidé');
    expect(plan.entry.retained.some((line) => line.startsWith('PDF signé'))).toBe(true);
    expect(plan.entry.retained.some((line) => line.startsWith('photos d’état des lieux'))).toBe(true);
    expect(plan.entry.reason).toContain(MOTIF_CONSERVATION_PREUVE);
  });

  it('signale l’absence de preuve sans inventer de conservation', () => {
    const plan = planReservationPurge({
      reservationId: RESERVATION,
      paths: [],
      sessionCount: 1,
      checklistCount: 0,
      reportCount: 0,
      photoCount: 0,
      departure: '2026-11-15',
      now,
    });
    expect(plan.entry.retained).toEqual([]);
    expect(plan.entry.reason).not.toContain(MOTIF_CONSERVATION_PREUVE);
  });
});

describe('rapport de purge', () => {
  it('agrège les lignes en un résumé sans donnée personnelle', () => {
    const entry = buildPurgeEntry({
      deletedSessions: 1,
      deletedChecklists: 6,
      disposableFiles: 2,
      retainedPdfReports: 1,
      retainedPhotos: 2,
    });
    const summary = summarizePurge([entry, entry]);
    expect(summary).toEqual({ reservations: 2, deleted: 6, anonymized: 4, retained: 4 });
    expect(JSON.stringify(entry)).not.toMatch(/@/);
  });

  it('documente la suppression de preuve à l’échéance', () => {
    const entry = buildEvidenceExpiryEntry({
      departure: '2021-01-10',
      deletedPdfReports: 1,
      deletedPhotos: 2,
      deletedFiles: 3,
    });
    expect(entry.deleted).toEqual([
      'PDF signé: 1',
      'photos d’état des lieux: 2',
      'fichiers Storage: 3',
    ]);
    expect(entry.retained).toEqual([]);
    expect(entry.reason).toContain(MOTIF_SUPPRESSION_PREUVE);
    expect(entry.reason).toContain('2021-01-10');
  });
});

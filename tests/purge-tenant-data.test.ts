import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MOTIF_CONSERVATION_PREUVE,
  MOTIF_SUPPRESSION_PREUVE,
  NOM_ANONYMISE,
  RETENTION_COORDONNEES_JOURS,
  RETENTION_DONNEES_PERSONNELLES_JOURS,
  RETENTION_PREUVE_ANNEES,
  anonymiserSejour,
  buildEffacementCoordonneesEntry,
  buildEffacementMessageEntry,
  buildEvidenceExpiryEntry,
  buildPurgeEntry,
  coordonneesExpirees,
  coordonneesExpiryCutoff,
  evidenceExpiryCutoff,
  evidenceRetentionDeadline,
  isEvidenceExpired,
  isEvidenceFile,
  listEvidenceFiles,
  partitionReservationFiles,
  planEffacementSejour,
  planReservationPurge,
  sejourPorteDesCoordonnees,
  summarizePurge,
} from '../supabase/functions/_shared/purge';

const ROOT = new URL('../', import.meta.url).pathname;
function lire(relatif: string): string {
  return readFileSync(join(ROOT, relatif), 'utf8');
}

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

describe('effacement des coordonnées du voyageur', () => {
  const depart = '2026-08-15';

  it('fixe le délai à 30 jours après le départ', () => {
    expect(RETENTION_COORDONNEES_JOURS).toBe(30);
    expect(coordonneesExpiryCutoff(new Date('2026-11-02T00:00:00Z'))).toBe('2026-10-03');
  });

  it('ne déclare échues que les coordonnées d’un séjour assez ancien', () => {
    const now = new Date('2026-09-20T00:00:00Z'); // 36 jours après le départ
    expect(coordonneesExpirees(depart, now)).toBe(true);
    expect(coordonneesExpirees('2026-09-01', now)).toBe(false); // 19 jours
    expect(coordonneesExpirees(null, now)).toBe(false);
    expect(coordonneesExpirees('', now)).toBe(false);
    expect(coordonneesExpirees('pas-une-date', now)).toBe(false);
  });

  it('remplace le nom, qui est `not null`, au lieu de le vider', () => {
    // `sejours.client_nom` est `not null` (migration 0003) : écrire NULL
    // ferait échouer la purge entière. Le patch doit poser un libellé.
    const patch = anonymiserSejour();
    expect(patch.client_nom).toBe(NOM_ANONYMISE);
    expect(patch.client_nom.length).toBeGreaterThan(0);
    expect(patch.client_email).toBeNull();
    expect(patch.client_telephone).toBeNull();
    expect(patch.client_message).toBeNull();
  });

  it('n’écrit rien pour un séjour déjà anonymisé', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const deja = {
      depart: '2026-08-15',
      client_nom: NOM_ANONYMISE,
      client_email: null,
      client_telephone: null,
      client_message: null,
    };
    expect(sejourPorteDesCoordonnees(deja)).toBe(false);
    expect(planEffacementSejour(deja, now)).toBeNull();
  });

  it('efface encore si le nom est neutre mais qu’un contact subsiste', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    const partiel = {
      depart: '2026-08-15',
      client_nom: NOM_ANONYMISE,
      client_email: 'reste@ailleurs.fr',
      client_telephone: null,
      client_message: null,
    };
    expect(sejourPorteDesCoordonnees(partiel)).toBe(true);
    expect(planEffacementSejour(partiel, now)?.client_email).toBeNull();
  });

  it('n’efface pas un séjour récent', () => {
    const now = new Date('2026-08-20T00:00:00Z');
    expect(
      planEffacementSejour(
        { depart, client_nom: 'Camille', client_email: 'c@d.fr' },
        now,
      ),
    ).toBeNull();
  });

  it('consigne dans le rapport ce qui a été effacé, sans redonner l’identité', () => {
    const ligne = buildEffacementCoordonneesEntry(depart);
    expect(ligne.reason).toContain(depart);
    expect(ligne.deleted.join(' ')).toContain('sejours');
    const texte = JSON.stringify(ligne);
    expect(texte).not.toContain('Camille');
    expect(texte).not.toContain('@');
  });

  it('compte les messages effacés dans le rapport', () => {
    const ligne = buildEffacementMessageEntry(4);
    expect(ligne.deleted.join(' ')).toContain('messages: 4');
    expect(ligne.reason).toContain(String(RETENTION_COORDONNEES_JOURS));
  });
});

describe('effacement — branchement dans l’Edge Function', () => {
  const source = lire('supabase/functions/purge-tenant-data/index.ts');

  it('efface bien `sejours.client_*` et `messages`', () => {
    // La politique de confidentialité annonce cet effacement : ce test
    // empêche que le texte et le code divergent de nouveau.
    const champs = ['client_nom', 'client_email', 'client_telephone', 'client_message'];
    for (const champ of champs) {
      expect(source, `${champ} non sélectionné`).toContain(champ);
    }
    expect(source).toMatch(/from\(\s*['"]messages['"]\s*\)/);
  });

  it('n’écrit jamais `client_nom` à NULL', () => {
    expect(source).toContain('NOM_ANONYMISE');
    expect(source).not.toMatch(/client_nom:\s*null/);
  });

  it('publie les compteurs d’effacement dans la réponse', () => {
    expect(source).toContain('effacedSejours');
    expect(source).toContain('effacedMessages');
    expect(source).toContain('coordonneesDays');
  });
});

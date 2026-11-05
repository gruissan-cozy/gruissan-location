import { describe, expect, it } from 'vitest';
import {
  TENANT_ROOMS,
  missingTenantAssessments,
  missingTenantPhotos,
  tenantReportPreflight,
  type TenantChecklistEntry,
  type TenantPhotoEntry,
} from '../src/lib/tenant';

const checklist = (patch: Partial<TenantChecklistEntry> = {}): TenantChecklistEntry[] =>
  TENANT_ROOMS.map((room) => ({ room, item: 'condition', ok: true, note: null, ...patch }));

const photos = (moment = 'checkin'): TenantPhotoEntry[] =>
  TENANT_ROOMS.map((room) => ({ room, moment }));

describe('prévalidation de l’état des lieux locataire', () => {
  it('refuse une pièce non évaluée', () => {
    const rows = checklist().filter((row) => row.room !== 'kitchen');
    expect(missingTenantAssessments(rows)).toEqual(['kitchen']);
    expect(tenantReportPreflight(rows, photos(), 'checkin', true)).toBe('assessment');
  });

  it('accepte une pièce marquée OK ou un problème décrit', () => {
    const rows = checklist().map((row) => row.room === 'bathroom'
      ? { ...row, ok: false, note: 'Robinet à signaler' }
      : row);
    expect(missingTenantAssessments(rows)).toEqual([]);
    expect(tenantReportPreflight(rows, photos(), 'checkin', true)).toBeNull();
  });

  it('refuse un problème non décrit', () => {
    const rows = checklist().map((row) => row.room === 'living' ? { ...row, ok: false } : row);
    expect(missingTenantAssessments(rows)).toEqual(['living']);
    expect(tenantReportPreflight(rows, photos(), 'checkin', true)).toBe('assessment');
  });

  it('exige au moins une photo par pièce pour chaque étape indépendamment', () => {
    expect(missingTenantPhotos(photos('checkin'), 'checkin')).toEqual([]);
    expect(missingTenantPhotos(photos('checkin'), 'checkout')).toEqual([...TENANT_ROOMS]);
    const incomplete = photos().filter((photo) => photo.room !== 'mezzanine');
    expect(missingTenantPhotos(incomplete, 'checkin')).toEqual(['mezzanine']);
    expect(tenantReportPreflight(checklist(), incomplete, 'checkin', true)).toBe('photos');
  });

  it('exige une signature après checklist et photos complètes', () => {
    expect(tenantReportPreflight(checklist(), photos(), 'checkin', false)).toBe('signature');
    expect(tenantReportPreflight(checklist(), photos(), 'checkin', true)).toBeNull();
  });
});

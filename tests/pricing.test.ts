import { describe, it, expect } from 'vitest';
import tarifsData from '../content/tarifs.json';
import {
  nightsBetween,
  monthsOfStay,
  seasonIdFor,
  computeStay,
  overlaps,
} from '../src/lib/pricing';

const saisons = tarifsData.saisons;

describe('nightsBetween', () => {
  it('compte les nuits entre deux dates', () => {
    expect(nightsBetween('2027-07-10', '2027-07-17')).toBe(7);
    expect(nightsBetween('2027-07-10', '2027-07-11')).toBe(1);
    expect(nightsBetween('2026-12-30', '2027-01-02')).toBe(3);
  });

  it('retourne 0 pour des dates invalides ou inversées', () => {
    expect(nightsBetween('2027-07-17', '2027-07-10')).toBe(-7);
    expect(nightsBetween('pas-une-date', '2027-07-10')).toBe(0);
    expect(nightsBetween('2027-07-10', 'pas-une-date')).toBe(0);
  });
});

describe('monthsOfStay', () => {
  it('liste les mois traversés sans doublon', () => {
    expect(monthsOfStay('2027-06-28', '2027-07-04')).toEqual([6, 7]);
    expect(monthsOfStay('2026-12-30', '2027-01-02')).toEqual([12, 1]);
    expect(monthsOfStay('2027-07-10', '2027-07-17')).toEqual([7]);
  });

  it('retourne vide pour des dates invalides', () => {
    expect(monthsOfStay('x', '2027-07-04')).toEqual([]);
  });
});

describe('seasonIdFor', () => {
  it('juillet ou août → haute saison', () => {
    expect(seasonIdFor('2027-07-10', '2027-07-17')).toBe('haute');
    expect(seasonIdFor('2027-08-01', '2027-08-08')).toBe('haute');
  });

  it('juin ou septembre (sans juillet/août) → moyenne', () => {
    expect(seasonIdFor('2027-06-10', '2027-06-17')).toBe('moyenne');
    expect(seasonIdFor('2027-09-10', '2027-09-17')).toBe('moyenne');
  });

  it('un séjour à cheval prend la saison la plus forte', () => {
    expect(seasonIdFor('2027-06-28', '2027-07-05')).toBe('haute');
    expect(seasonIdFor('2027-09-28', '2027-10-05')).toBe('moyenne');
  });

  it('le reste → basse saison', () => {
    expect(seasonIdFor('2027-10-10', '2027-10-17')).toBe('basse');
    expect(seasonIdFor('2027-01-10', '2027-01-17')).toBe('basse');
  });
});

describe('computeStay', () => {
  it('calcule semaines et prix de base (arrondi supérieur)', () => {
    const stay = computeStay('2027-07-10', '2027-07-17', saisons);
    expect(stay).not.toBeNull();
    expect(stay!.nights).toBe(7);
    expect(stay!.weeks).toBe(1);
    expect(stay!.base).toBe(1450); // haute saison
    expect(stay!.tooShort).toBe(false);
  });

  it('une semaine + 1 jour compte 2 semaines', () => {
    const stay = computeStay('2027-07-10', '2027-07-18', saisons);
    expect(stay!.nights).toBe(8);
    expect(stay!.weeks).toBe(2);
    expect(stay!.base).toBe(2900);
  });

  it('signale les séjours trop courts', () => {
    const stay = computeStay('2027-07-10', '2027-07-12', saisons);
    expect(stay!.nights).toBe(2);
    expect(stay!.tooShort).toBe(true); // haute saison : 7 nuits min
  });

  it('retourne null pour une période invalide', () => {
    expect(computeStay('2027-07-17', '2027-07-10', saisons)).toBeNull();
  });

  it('applique la basse saison hors été', () => {
    const stay = computeStay('2027-10-10', '2027-10-17', saisons);
    expect(stay!.saison.id).toBe('basse');
    expect(stay!.base).toBe(690);
  });
});

describe('overlaps (vérification disponibilités)', () => {
  it('détecte un chevauchement simple', () => {
    expect(overlaps('2027-07-01', '2027-07-31', '2027-07-10', '2027-07-17')).toBe(true);
    expect(overlaps('2027-07-10', '2027-07-17', '2027-07-01', '2027-07-31')).toBe(true);
  });

  it('accepte les périodes adjacentes (pas de chevauchement)', () => {
    expect(overlaps('2027-07-01', '2027-07-10', '2027-07-10', '2027-07-17')).toBe(true); // jour de frontière partagé
    expect(overlaps('2027-07-01', '2027-07-09', '2027-07-10', '2027-07-17')).toBe(false);
    expect(overlaps('2027-08-01', '2027-08-31', '2027-07-10', '2027-07-17')).toBe(false);
  });
});

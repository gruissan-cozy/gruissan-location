import { describe, it, expect } from 'vitest';
import tarifsData from '../content/tarifs.json';
import {
  computeQuote,
  nightlyRate,
  seasonIdForDate,
  round2,
  MAX_NUITES,
  TAUX_TAXE_SEJOUR_PAR_NUIT_PERSONNE,
  type PackSelection,
  type Saison,
} from '../src/lib/pricing';

const saisons = tarifsData.saisons as Saison[];
const CAUTION = 800;
const TAXE = TAUX_TAXE_SEJOUR_PAR_NUIT_PERSONNE;

/** Construit un devis avec des valeurs par défaut cohérentes. */
function devis(params: Partial<Parameters<typeof computeQuote>[0]>) {
  return computeQuote({
    checkIn: '',
    checkOut: '',
    adults: 2,
    minors: 0,
    saisons,
    packs: [],
    caution: CAUTION,
    taxeSejourParNuitPersonne: TAXE,
    ...params,
  });
}

describe('nightlyRate (prix_semaine / 7)', () => {
  it('dérive le tarif à la nuit du prix à la semaine', () => {
    expect(nightlyRate(saisons[0])).toBe(207.14); // 1450 / 7
    expect(nightlyRate(saisons[1])).toBe(150); // 1050 / 7
    expect(nightlyRate(saisons[2])).toBe(98.57); // 690 / 7
  });
});

describe('round2', () => {
  it('arrondit au centime près', () => {
    expect(round2(207.14285714285714)).toBe(207.14);
    expect(round2(98.57142857142857)).toBe(98.57);
    expect(round2(16.099999999999998)).toBe(16.1);
  });

  it('neutralise les valeurs non finies', () => {
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('seasonIdForDate', () => {
  it('range chaque mois dans sa saison', () => {
    expect(seasonIdForDate('2027-07-15')).toBe('haute');
    expect(seasonIdForDate('2027-08-31')).toBe('haute');
    expect(seasonIdForDate('2027-06-01')).toBe('moyenne');
    expect(seasonIdForDate('2027-09-30')).toBe('moyenne');
    expect(seasonIdForDate('2027-10-01')).toBe('basse');
    expect(seasonIdForDate('2027-01-05')).toBe('basse');
  });

  it('retombe sur la basse saison pour une date invalide', () => {
    expect(seasonIdForDate('pas-une-date')).toBe('basse');
  });
});

describe('TAUX_TAXE_SEJOUR_PAR_NUIT_PERSONNE (source unique)', () => {
  it('provient de content/tarifs.json', () => {
    expect(TAUX_TAXE_SEJOUR_PAR_NUIT_PERSONNE).toBe(tarifsData.taxe_sejour_par_nuit_personne);
    expect(TAUX_TAXE_SEJOUR_PAR_NUIT_PERSONNE).toBeGreaterThan(0);
  });
});

describe('computeQuote — chemin nominal', () => {
  it('calcule une semaine en haute saison avec taxe de séjour', () => {
    const d = devis({ checkIn: '2027-07-10', checkOut: '2027-07-17', adults: 2 });
    expect(d).not.toBeNull();
    expect(d!.nights).toBe(7);
    expect(d!.guests).toBe(2);
    expect(d!.stay).toBe(1449.98); // 7 × 207.14
    expect(d!.stayBySeason).toEqual([
      { saisonId: 'haute', periode: 'Juillet – Août', nuits: 7, prixNuit: 207.14, total: 1449.98 },
    ]);
    expect(d!.taxeSejour).toBe(16.1); // 7 × 2 adultes × 1.15
    expect(d!.taxeSejourDetail).toEqual({
      adultes: 2,
      mineurs: 0,
      nuits: 7,
      taux: TAXE,
      montant: 16.1,
    });
    expect(d!.packsTotal).toBe(0);
    expect(d!.total).toBe(1466.08);
    expect(d!.caution).toBe(800);
    expect(d!.toPay).toBe(2266.08);
    expect(d!.tooShort).toBe(false);
    expect(d!.saisonForte.id).toBe('haute');
  });

  it('calcule une semaine en basse saison', () => {
    const d = devis({ checkIn: '2027-10-10', checkOut: '2027-10-17', adults: 4 });
    expect(d!.nights).toBe(7);
    expect(d!.stay).toBe(689.99); // 7 × 98.57
    expect(d!.taxeSejour).toBe(32.2); // 7 × 4 adultes × 1.15
    expect(d!.total).toBe(722.19);
    expect(d!.tooShort).toBe(false);
    expect(d!.saisonForte.id).toBe('basse');
  });

  it('évite les artefacts flottants sur la taxe de séjour', () => {
    const d = devis({ checkIn: '2027-07-10', checkOut: '2027-07-17', adults: 3 });
    expect(d!.taxeSejour).toBe(24.15); // 7 × 3 adultes × 1.15
    expect(d!.total).toBe(1474.13); // 1449.98 + 24.15
  });
});

describe('computeQuote — mineurs exonérés de la taxe de séjour', () => {
  it('famille 2 adultes + 2 enfants : taxe = 2 × nuits × taux', () => {
    const d = devis({
      checkIn: '2027-07-10',
      checkOut: '2027-07-17',
      adults: 2,
      minors: 2,
    });
    expect(d!.adults).toBe(2);
    expect(d!.minors).toBe(2);
    expect(d!.guests).toBe(4);
    expect(d!.taxeSejour).toBe(round2(2 * 7 * TAXE)); // 16.1, pas 32.2
    expect(d!.taxeSejourDetail).toEqual({
      adultes: 2,
      mineurs: 2,
      nuits: 7,
      taux: TAXE,
      montant: round2(2 * 7 * TAXE),
    });
    expect(d!.total).toBe(1466.08); // séjour + taxe des seuls adultes
  });

  it('4 adultes : taxe = 4 × nuits × taux', () => {
    const d = devis({ checkIn: '2027-07-10', checkOut: '2027-07-17', adults: 4 });
    expect(d!.taxeSejour).toBe(round2(4 * 7 * TAXE)); // 32.2
  });

  it('les mineurs restent exonérés quel que soit leur nombre', () => {
    for (const mineurs of [1, 2, 3, 5, 10]) {
      const d = devis({
        checkIn: '2027-10-10',
        checkOut: '2027-10-17',
        adults: 1,
        minors: mineurs,
      });
      expect(d!.taxeSejour, `${mineurs} mineur(s)`).toBe(round2(1 * 7 * TAXE));
      expect(d!.taxeSejourDetail.adultes).toBe(1);
      expect(d!.taxeSejourDetail.mineurs).toBe(mineurs);
    }
  });

  it('un séjour sans adulte est refusé (0 adulte impossible)', () => {
    expect(
      devis({ checkIn: '2027-07-10', checkOut: '2027-07-17', adults: 0, minors: 3 }),
    ).toBeNull();
    expect(
      devis({ checkIn: '2027-07-10', checkOut: '2027-07-17', adults: -1, minors: 0 }),
    ).toBeNull();
  });
});

describe('computeQuote — chevauchement de deux saisons', () => {
  it('facture chaque nuit selon la saison qui la contient', () => {
    const d = devis({ checkIn: '2027-06-28', checkOut: '2027-07-04', adults: 2 });
    expect(d!.nights).toBe(6);
    expect(d!.stayBySeason).toEqual([
      { saisonId: 'moyenne', periode: 'Juin – Septembre', nuits: 3, prixNuit: 150, total: 450 },
      { saisonId: 'haute', periode: 'Juillet – Août', nuits: 3, prixNuit: 207.14, total: 621.42 },
    ]);
    expect(d!.stay).toBe(1071.42);
    expect(d!.saisonForte.id).toBe('haute');
    expect(d!.tooShort).toBe(true); // 6 nuits < 7 (min haute saison)
    expect(d!.total).toBe(1085.22); // 1071.42 + 6 × 2 adultes × 1.15
  });

  it('chevauche moyenne puis basse (fin septembre / début octobre)', () => {
    const d = devis({ checkIn: '2027-09-28', checkOut: '2027-10-05', adults: 2 });
    expect(d!.nights).toBe(7);
    expect(d!.stayBySeason.map((s) => s.saisonId)).toEqual(['moyenne', 'basse']);
    expect(d!.stay).toBe(844.28); // 3 × 150 + 4 × 98.57
    expect(d!.saisonForte.id).toBe('moyenne');
  });
});

describe('computeQuote — packs (unités)', () => {
  const packs: PackSelection[] = [
    { id: 'velo', slug: 'velo', prix: 45, unite: 'par_personne', quantite: 2 },
    { id: 'plage', slug: 'plage', prix: 70, unite: 'par_sejour', quantite: 1 },
    { id: 'nuit', slug: 'nuit', prix: 5, unite: 'par_nuit', quantite: 1 },
    { id: 'gratuit', slug: 'gratuit', prix: 0, unite: 'par_sejour', quantite: 1 },
  ];

  it('applique chaque unité : personne × qté, séjour, nuit × nuits', () => {
    const d = devis({
      checkIn: '2027-10-10',
      checkOut: '2027-10-17',
      adults: 4,
      packs,
    });
    expect(d!.packs).toEqual([
      { id: 'velo', slug: 'velo', prix: 45, unite: 'par_personne', quantite: 2, total: 360 }, // 45 × 4 × 2
      { id: 'plage', slug: 'plage', prix: 70, unite: 'par_sejour', quantite: 1, total: 70 },
      { id: 'nuit', slug: 'nuit', prix: 5, unite: 'par_nuit', quantite: 1, total: 35 }, // 5 × 7
      { id: 'gratuit', slug: 'gratuit', prix: 0, unite: 'par_sejour', quantite: 1, total: 0 },
    ]);
    expect(d!.packsTotal).toBe(465);
    expect(d!.total).toBe(1187.19); // 689.99 (séjour) + 465 + 32.2 (taxe des 4 adultes)
  });

  it('un pack « par personne » compte adultes ET mineurs', () => {
    const d = devis({
      checkIn: '2027-10-10',
      checkOut: '2027-10-17',
      adults: 2,
      minors: 2,
      packs: [{ id: 'velo', slug: 'velo', prix: 45, unite: 'par_personne', quantite: 1 }],
    });
    expect(d!.packs[0].total).toBe(180); // 45 × 4 personnes × 1
    expect(d!.taxeSejour).toBe(16.1); // seuls les 2 adultes sont taxés
  });

  it('ramène une quantité invalide à 1 pour les packs par personne', () => {
    const d = devis({
      checkIn: '2027-10-10',
      checkOut: '2027-10-17',
      adults: 4,
      packs: [{ id: 'velo', slug: 'velo', prix: 45, unite: 'par_personne', quantite: 0 }],
    });
    expect(d!.packs[0].quantite).toBe(1);
    expect(d!.packs[0].total).toBe(180); // 45 × 4 × 1
  });

  it('un pack à 0 € ne change pas le total', () => {
    const d = devis({
      checkIn: '2027-10-10',
      checkOut: '2027-10-17',
      adults: 4,
      packs: [{ id: 'gratuit', slug: 'gratuit', prix: 0, unite: 'par_sejour', quantite: 1 }],
    });
    expect(d!.packsTotal).toBe(0);
    expect(d!.total).toBe(722.19);
  });
});

describe('computeQuote — cas limites', () => {
  it('retourne null sans date de départ ou d’arrivée', () => {
    expect(devis({ checkIn: '', checkOut: '2027-07-17', adults: 2 })).toBeNull();
    expect(devis({ checkIn: '2027-07-10', checkOut: '', adults: 2 })).toBeNull();
  });

  it('retourne null pour 0 nuit (dates identiques)', () => {
    expect(devis({ checkIn: '2027-07-10', checkOut: '2027-07-10', adults: 2 })).toBeNull();
  });

  it('retourne null pour des dates inversées', () => {
    expect(devis({ checkIn: '2027-07-17', checkOut: '2027-07-10', adults: 2 })).toBeNull();
  });

  it('retourne null pour une date invalide', () => {
    expect(devis({ checkIn: 'pas-une-date', checkOut: '2027-07-17', adults: 2 })).toBeNull();
    expect(devis({ checkIn: '2027-07-10', checkOut: 'invalide', adults: 2 })).toBeNull();
  });

  it('retourne null sans saisons configurées', () => {
    expect(
      devis({ checkIn: '2027-07-10', checkOut: '2027-07-17', adults: 2, saisons: [] }),
    ).toBeNull();
  });

  it(`refuse un séjour au-delà de ${MAX_NUITES} nuits`, () => {
    expect(devis({ checkIn: '2027-01-01', checkOut: '2028-05-01', adults: 2 })).toBeNull();
  });

  it('taxe de séjour à zéro (non configurée)', () => {
    const d = devis({
      checkIn: '2027-10-10',
      checkOut: '2027-10-17',
      adults: 4,
      taxeSejourParNuitPersonne: 0,
    });
    expect(d!.taxeSejour).toBe(0);
    expect(d!.taxeSejourDetail.montant).toBe(0);
    expect(d!.total).toBe(d!.stay);
  });

  it('sans taux fourni, applique la constante du contenu', () => {
    const d = devis({
      checkIn: '2027-10-10',
      checkOut: '2027-10-17',
      adults: 4,
      taxeSejourParNuitPersonne: undefined,
    });
    expect(d!.taxeSejour).toBe(round2(4 * 7 * TAXE));
  });

  it('sans caution fournie → caution à zéro', () => {
    const d = devis({
      checkIn: '2027-10-10',
      checkOut: '2027-10-17',
      adults: 4,
      caution: undefined,
    });
    expect(d!.caution).toBe(0);
    expect(d!.toPay).toBe(d!.total);
  });

  it('signale un séjour plus court que le minimum de la saison', () => {
    const courte = devis({ checkIn: '2027-07-10', checkOut: '2027-07-12', adults: 2 });
    expect(courte!.tooShort).toBe(true);
    const unJour = devis({ checkIn: '2027-10-10', checkOut: '2027-10-11', adults: 2 });
    expect(unJour!.tooShort).toBe(true); // basse saison : 2 nuits min
  });
});

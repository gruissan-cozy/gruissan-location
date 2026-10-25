import { describe, it, expect } from 'vitest';
import {
  arrondi2,
  calculerTaxeSejour,
  estAssujetti,
  estAlerte,
  nuitsDuSejour,
  personnesExploitables,
  recapitulerTaxe,
  repartirNuitsParAnnee,
  repartirTaxeParAnnee,
  SEUIL_DUREE_LONGUE,
  tauxExploitable,
  type SejourTaxe,
} from '../src/lib/taxe-sejour';

/** Séjour minimal, écrasé par les champs fournis. */
function sejour(s: Partial<SejourTaxe> & { id: string }): SejourTaxe {
  return {
    arrivee: '2026-07-10',
    depart: '2026-07-17',
    personnes: 2,
    statut: 'confirme',
    ...s,
  };
}

const TAUX = 1.15; // valeur de content/tarifs.json (taxe_sejour_par_nuit_personne)

describe('assujettissement', () => {
  it('ne retient que les séjours confirmés et terminés', () => {
    expect(estAssujetti(sejour({ id: 'a', statut: 'confirme' }))).toBe(true);
    expect(estAssujetti(sejour({ id: 'a', statut: 'termine' }))).toBe(true);
    expect(estAssujetti(sejour({ id: 'a', statut: 'option' }))).toBe(false);
    expect(estAssujetti(sejour({ id: 'a', statut: 'annule' }))).toBe(false);
  });

  it('tolère un statut inconnu ou manquant', () => {
    expect(estAssujetti({ id: 'a', statut: 'en_cours' })).toBe(false);
    expect(estAssujetti({ id: 'a', statut: '' })).toBe(false);
    expect(estAssujetti({ id: 'a', statut: undefined as unknown as string })).toBe(false);
  });
});

describe('tauxExploitable', () => {
  it('accepte un taux positif ou nul, refuse les valeurs absconses', () => {
    expect(tauxExploitable(1.15)).toBe(true);
    expect(tauxExploitable(0)).toBe(true);
    expect(tauxExploitable(null)).toBe(false);
    expect(tauxExploitable(undefined)).toBe(false);
    expect(tauxExploitable('1.15')).toBe(false);
    expect(tauxExploitable(Number.NaN)).toBe(false);
    expect(tauxExploitable(-0.5)).toBe(false);
  });
});

describe('nuitsDuSejour', () => {
  it('compte les nuits et tolère les dates invalides', () => {
    expect(nuitsDuSejour(sejour({ id: 'a', arrivee: '2026-07-10', depart: '2026-07-17' }))).toBe(7);
    expect(nuitsDuSejour(sejour({ id: 'a', arrivee: '2026-07-17', depart: '2026-07-10' }))).toBe(0);
    expect(nuitsDuSejour(sejour({ id: 'a', arrivee: '', depart: '' }))).toBe(0);
  });
});

describe('calculerTaxeSejour — chemin nominal', () => {
  it('calcule nuits × personnes × taux', () => {
    const t = calculerTaxeSejour(sejour({ id: 'a', arrivee: '2026-07-10', depart: '2026-07-17', personnes: 2 }), TAUX);
    expect(t.nuits).toBe(7);
    expect(t.montant).toBe(16.1); // 7 × 2 × 1.15
    expect(t.taux).toBe(TAUX);
    expect(t.tauxAbsent).toBe(false);
    expect(t.alertes).toEqual([]);
  });

  it('applique le taux lu dans content/tarifs.json', async () => {
    const tarifs = (await import('../content/tarifs.json')).default;
    const tauxLu = (tarifs as { taxe_sejour_par_nuit_personne: number }).taxe_sejour_par_nuit_personne;
    const t = calculerTaxeSejour(sejour({ id: 'a', personnes: 4, arrivee: '2026-07-01', depart: '2026-07-08' }), tauxLu);
    expect(t.montant).toBe(arrondi2(7 * 4 * tauxLu));
  });
});

describe('calculerTaxeSejour — cas limites', () => {
  it('0 personne → montant non calculable, signalé', () => {
    const t = calculerTaxeSejour(sejour({ id: 'a', personnes: 0 }), TAUX);
    expect(t.montant).toBeNull();
    expect(t.personnes).toBe(0);
    expect(t.alertes.map((a) => a.code)).toContain('personnes_nulles');
  });

  it('0 nuit → 0 € (le séjour n’occupe rien), sans alerte trompeuse', () => {
    const t = calculerTaxeSejour(sejour({ id: 'a', arrivee: '2026-07-10', depart: '2026-07-10' }), TAUX);
    expect(t.nuits).toBe(0);
    expect(t.montant).toBe(0);
    expect(t.tauxAbsent).toBe(false);
  });

  it('taux absent du contenu → montant non calculable, jamais inventé', () => {
    for (const taux of [null, undefined, Number.NaN, '1.15']) {
      const t = calculerTaxeSejour(sejour({ id: 'a' }), taux);
      expect(t.montant, `taux ${String(taux)}`).toBeNull();
      expect(t.montantBase).toBeNull();
      expect(t.tauxAbsent).toBe(true);
      expect(t.taux).toBeNull();
      expect(t.alertes.map((a) => a.code)).toContain('taux_absent');
    }
  });

  it('taux à zéro : la taxe est légitimement à 0 €', () => {
    const t = calculerTaxeSejour(sejour({ id: 'a' }), 0);
    expect(t.montant).toBe(0);
    expect(t.tauxAbsent).toBe(false);
    expect(t.alertes.map((a) => a.code)).not.toContain('taux_absent');
  });

  it('personnes négatives ou non numériques : non calculable', () => {
    expect(calculerTaxeSejour(sejour({ id: 'a', personnes: -1 }), TAUX).montant).toBeNull();
    expect(
      calculerTaxeSejour(sejour({ id: 'a', personnes: Number.NaN }), TAUX).montant,
    ).toBeNull();
    expect(
      calculerTaxeSejour(sejour({ id: 'a', personnes: '2' as unknown as number }), TAUX).montant,
    ).toBeNull();
  });

  it('dates inversées : non calculable, signalé', () => {
    const t = calculerTaxeSejour(sejour({ id: 'a', arrivee: '2026-07-17', depart: '2026-07-10' }), TAUX);
    expect(t.montant).toBe(0);
    expect(t.nuits).toBe(0);
    expect(t.alertes.map((a) => a.code)).toContain('nuits_nulles');
  });
});

describe('répartition par année civile', () => {
  it('découpe un séjour à cheval sur deux années', () => {
    // 30/12/2026 → 02/01/2027 : 2 nuits en 2026, 1 en 2027.
    expect(repartirNuitsParAnnee('2026-12-30', '2027-01-02')).toEqual([
      { annee: 2026, montant: 0, nuits: 2 },
      { annee: 2027, montant: 0, nuits: 1 },
    ]);
  });

  it('ventile la taxe nuit par nuit sur les deux années', () => {
    const parts = repartirTaxeParAnnee(
      { arrivee: '2026-12-30', depart: '2027-01-02', personnes: 1 },
      TAUX,
    );
    expect(parts).toEqual([
      { annee: 2026, montant: 2.3, nuits: 2 }, // 2 × 1 × 1.15
      { annee: 2027, montant: 1.15, nuits: 1 },
    ]);
    // La somme des parts fait exactement le montant du séjour.
    expect(parts.reduce((s, p) => s + p.montant, 0)).toBeCloseTo(3.45, 2);
  });

  it('reprend les centimes perdus sur la dernière année', () => {
    // 3 nuits à 1 € : 2 nuits en 2026 (2 €), 1 nuit en 2027 (1 €) — puis
    // un taux à 0,35 € sur 3 nuits pour vérifier l’arrondi cumulé.
    const parts = repartirTaxeParAnnee(
      { arrivee: '2026-12-30', depart: '2027-01-02', personnes: 1 },
      0.35,
    );
    expect(parts.map((p) => p.montant)).toEqual([0.7, 0.35]);
    expect(parts.reduce((s, p) => s + p.montant, 0)).toBeCloseTo(1.05, 2);
  });

  it('renvoie une liste vide pour des dates invalides ou un taux absent', () => {
    expect(repartirTaxeParAnnee({ arrivee: '2026-12-30', depart: '2026-12-20', personnes: 1 }, TAUX)).toEqual([]);
    expect(repartirTaxeParAnnee({ arrivee: 'x', depart: 'y', personnes: 1 }, TAUX)).toEqual([]);
    expect(repartirTaxeParAnnee({ arrivee: '2026-12-30', depart: '2027-01-02', personnes: 1 }, null as unknown as number)).toEqual([]);
  });

  it('signale un séjour à cheval sur deux années sans l’exonérer', () => {
    const t = calculerTaxeSejour(sejour({ id: 'a', arrivee: '2026-12-30', depart: '2027-01-02', personnes: 1 }), TAUX);
    expect(t.parAnnee.map((p) => p.annee)).toEqual([2026, 2027]);
    expect(t.montant).toBe(3.45);
    expect(t.alertes.map((a) => a.code)).toContain('sejour_deux_annees');
  });
});

describe('plafond de nuits par personne (signalé, jamais appliqué)', () => {
  it(`signale au-delà de ${SEUIL_DUREE_LONGUE} nuits par personne`, () => {
    const t = calculerTaxeSejour(
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-31', personnes: 1 }),
      TAUX,
    );
    expect(t.nuits).toBe(SEUIL_DUREE_LONGUE);
    expect(t.alertes.map((a) => a.code)).toContain('duree_longue');
    // Le plafond n’est PAS appliqué : le montant reste le montant brut.
    expect(t.montant).toBe(arrondi2(SEUIL_DUREE_LONGUE * TAUX));
  });

  it('ne signale pas un séjour en dessous du seuil', () => {
    const t = calculerTaxeSejour(
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-20', personnes: 1 }),
      TAUX,
    );
    expect(t.alertes.map((a) => a.code)).not.toContain('duree_longue');
  });
});

describe('recapitulerTaxe (déclaration en mairie)', () => {
  it('produit le total collecté et le nombre de séjours assujettis par année', () => {
    const r = recapitulerTaxe(
      [
        sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', personnes: 2 }), // 7 × 2 × 1.15
        sejour({ id: 'b', arrivee: '2026-08-01', depart: '2026-08-05', personnes: 2 }), // 4 × 2 × 1.15
        sejour({ id: 'c', arrivee: '2026-12-30', depart: '2027-01-02', personnes: 1 }), // 2.3 + 1.15
      ],
      TAUX,
    );
    expect(r.parAnnee.map((a) => a.annee)).toEqual([2026, 2027]);
    const a2026 = r.parAnnee[0];
    // Les trois séjours touchent 2026 (le séjour à cheval débute le 30/12) ;
    // seul le séjour à cheval touche 2027, mais il n'est compté que dans
    // l'année de sa première nuit : 2027 n'en compte donc aucun.
    expect(a2026.assujettis).toBe(3);
    expect(r.parAnnee[1].assujettis).toBe(0);
    expect(a2026.total).toBe(arrondi2(7 * 2 * TAUX + 4 * 2 * TAUX + 2.3));
    expect(a2026.nuits).toBe(13); // 7 + 4 + 2
    expect(r.total).toBeCloseTo(28.75, 2); // 27.60 + 1.15
    expect(r.base).toBe(r.total);
  });

  it('exclut les options et les annulations du total', () => {
    const r = recapitulerTaxe(
      [
        sejour({ id: 'a', statut: 'option', personnes: 2 }),
        sejour({ id: 'b', statut: 'annule', personnes: 2 }),
        sejour({ id: 'c', statut: 'confirme', personnes: 2 }),
      ],
      TAUX,
    );
    expect(r.parAnnee.reduce((s, a) => s + a.assujettis, 0)).toBe(1);
    expect(r.total).toBe(arrondi2(7 * 2 * TAUX));
  });

  it('ne compte jamais un séjour sans taux dans le total, et le signale', () => {
    const r = recapitulerTaxe(
      [
        sejour({ id: 'a', personnes: 2 }),
        sejour({ id: 'b', personnes: 2 }),
      ],
      null,
    );
    expect(r.total).toBe(0);
    expect(r.parAnnee).toEqual([]);
    expect(r.sansTaux).toBe(2);
    expect(r.nonCalculables).toBe(0);
  });

  it('signale les séjours assujettis sans personnes déclarées', () => {
    const r = recapitulerTaxe(
      [sejour({ id: 'a', personnes: 0 }), sejour({ id: 'b', personnes: 2 })],
      TAUX,
    );
    expect(r.total).toBe(arrondi2(7 * 2 * TAUX));
    expect(r.nonCalculables).toBe(1);
    expect(r.parAnnee.reduce((s, a) => s + a.assujettis, 0)).toBe(1);
  });

  it('reste sain sur une liste vide', () => {
    expect(recapitulerTaxe([], TAUX)).toEqual({
      parAnnee: [],
      total: 0,
      base: 0,
      sansTaux: 0,
      nonCalculables: 0,
      alertes: [],
    });
  });
});

describe('arrondi2 et utilitaires', () => {
  it('arrondit au centime et neutralise les valeurs non finies', () => {
    expect(arrondi2(16.099999999999998)).toBe(16.1);
    expect(arrondi2(Number.NaN)).toBe(0);
    expect(arrondi2(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('reconnaît les codes d’alerte connus', () => {
    expect(estAlerte('taux_absent')).toBe(true);
    expect(estAlerte('personnes_nulles')).toBe(true);
    expect(estAlerte('sejour_deux_annees')).toBe(true);
    expect(estAlerte('duree_longue')).toBe(true);
    expect(estAlerte('inconnu')).toBe(false);
  });

  it('personnesExploitables refuse les valeurs absconses', () => {
    expect(personnesExploitables(2)).toBe(true);
    expect(personnesExploitables(1)).toBe(true);
    expect(personnesExploitables(0)).toBe(false);
    expect(personnesExploitables(1.5)).toBe(true);
    expect(personnesExploitables(null)).toBe(false);
    expect(personnesExploitables('2')).toBe(false);
  });
});

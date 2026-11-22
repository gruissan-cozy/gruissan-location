import { describe, it, expect } from 'vitest';
import {
  datesOccupees,
  etatDuJour,
  plagesDepuisBlocages,
  plagesDepuisSejours,
  plagesOccupees,
  type Plage,
} from '../src/lib/calendrier';

// Les blocages (`calendar_blocks`) portent des bornes INCLUSES, contrairement
// aux séjours (`sejours.depart` exclusif). Ces tests fixent la conversion.

describe('plagesDepuisBlocages', () => {
  it('blocage seul : bornes incluses, aucun décalage', () => {
    // Blocage « 3 → 8 mars » : le 3 ET le 8 sont bloqués (8 jours pleins).
    expect(plagesDepuisBlocages([{ debut: '2026-03-03', fin: '2026-03-08' }])).toEqual([
      { debut: '2026-03-03', fin: '2026-03-08', etat: 'occupe' },
    ]);
  });

  it('blocage d’un seul jour', () => {
    expect(plagesDepuisBlocages([{ debut: '2026-08-15', fin: '2026-08-15' }])).toEqual([
      { debut: '2026-08-15', fin: '2026-08-15', etat: 'occupe' },
    ]);
  });

  it('fusionne deux blocages contigus', () => {
    expect(
      plagesDepuisBlocages([
        { debut: '2026-03-03', fin: '2026-03-08' },
        { debut: '2026-03-09', fin: '2026-03-12' },
      ]),
    ).toEqual([{ debut: '2026-03-03', fin: '2026-03-12', etat: 'occupe' }]);
  });

  it('ignore les dates invalides, inversées ou manquantes', () => {
    expect(
      plagesDepuisBlocages([
        { debut: '', fin: '' },
        { debut: '2026-02-30', fin: '2026-03-02' },
        { debut: '2026-03-08', fin: '2026-03-03' }, // inversé
        { debut: '2026-03-03', fin: '2026-03-08' },
      ]),
    ).toEqual([{ debut: '2026-03-03', fin: '2026-03-08', etat: 'occupe' }]);
  });

  it('accepte une liste vide', () => {
    expect(plagesDepuisBlocages([])).toEqual([]);
  });
});

describe('plagesOccupees (séjours + blocages)', () => {
  it('blocage chevauchant un séjour : une seule plage occupée fusionnée', () => {
    // Séjour 10 → 17 juillet (nuits 10..16) ; blocage 14 → 20 juillet.
    const plages = plagesOccupees(
      [{ arrivee: '2026-07-10', depart: '2026-07-17' }],
      [{ debut: '2026-07-14', fin: '2026-07-20' }],
    );
    expect(plages).toEqual([{ debut: '2026-07-10', fin: '2026-07-20', etat: 'occupe' }]);
  });

  it('séjour et blocage contigus : fusionnés en une seule plage pour la grille', () => {
    // Séjour 10 → 17 (départ exclusif) : occupe 10..16.
    // Blocage 17 → 20 (fin inclusive) : occupe 17..20.
    const plages = plagesOccupees(
      [{ arrivee: '2026-07-10', depart: '2026-07-17' }],
      [{ debut: '2026-07-17', fin: '2026-07-20' }],
    );
    expect(plages).toEqual([{ debut: '2026-07-10', fin: '2026-07-20', etat: 'occupe' }]);
    // Le 16 est occupé par le séjour, le 17 par le blocage : aucun trou inventé.
    expect(etatDuJour('2026-07-16', plages)).toBe('occupe');
    expect(etatDuJour('2026-07-17', plages)).toBe('occupe');
  });

  it('sans blocage, se comporte exactement comme plagesDepuisSejours', () => {
    const sejours = [{ arrivee: '2026-07-10', depart: '2026-07-17' }];
    expect(plagesOccupees(sejours, [])).toEqual(plagesDepuisSejours(sejours));
  });

  it('sans séjour, se comporte exactement comme plagesDepuisBlocages', () => {
    const blocages = [{ debut: '2026-03-03', fin: '2026-03-08' }];
    expect(plagesOccupees([], blocages)).toEqual(plagesDepuisBlocages(blocages));
  });
});

describe('datesOccupees (contrôle du formulaire de réservation)', () => {
  const plages: Plage[] = [
    { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' }, // séjour
    { debut: '2026-08-03', fin: '2026-08-08', etat: 'occupe' }, // blocage
  ];

  it('refuse une demande qui chevauche un blocage', () => {
    expect(datesOccupees('2026-08-05', '2026-08-10', plages)).toBe(true);
  });

  it('refuse une arrivée le jour où un blocage commence', () => {
    expect(datesOccupees('2026-08-03', '2026-08-06', plages)).toBe(true);
  });

  it('refuse un séjour qui englobe un blocage', () => {
    expect(datesOccupees('2026-07-01', '2026-08-31', plages)).toBe(true);
  });

  it('accepte une arrivée le jour du départ d’un séjour (convention hôtelière)', () => {
    // Séjour occupe 10..16 ; une arrivée le 17 est libre.
    expect(datesOccupees('2026-07-17', '2026-07-20', plages)).toBe(false);
  });

  it('accepte un séjour qui se termine la veille d’un blocage', () => {
    // Blocage 3..8 août ; un séjour finissant le 3 (départ exclusif) occupe
    // jusqu'au 2 et ne touche donc pas le blocage.
    expect(datesOccupees('2026-08-01', '2026-08-03', plages)).toBe(false);
  });

  it('accepte des dates libres', () => {
    expect(datesOccupees('2026-09-01', '2026-09-08', plages)).toBe(false);
  });

  it('ignore une plage invalide (dates inversées ou vides)', () => {
    expect(datesOccupees('2026-09-08', '2026-09-01', plages)).toBe(false);
    expect(datesOccupees('', '', plages)).toBe(false);
  });
});

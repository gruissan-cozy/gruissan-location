import { describe, it, expect } from 'vitest';
import {
  chevauche,
  trouverChevauchements,
  nuits,
  plageValide,
  STATUTS_BLOQUANTS,
} from '../src/lib/sejours';

describe('chevauche', () => {
  it('détecte un chevauchement franc', () => {
    expect(chevauche({ arrivee: '2026-07-10', depart: '2026-07-17' }, { arrivee: '2026-07-14', depart: '2026-07-20' })).toBe(true);
  });

  it('détecte un chevauchement même si les plages sont données dans l’autre ordre', () => {
    expect(chevauche({ arrivee: '2026-07-14', depart: '2026-07-20' }, { arrivee: '2026-07-10', depart: '2026-07-17' })).toBe(true);
  });

  it('accepte deux séjours qui se touchent (départ = arrivée)', () => {
    // Convention hôtelière : le jour du départ libère le logement.
    expect(chevauche({ arrivee: '2026-07-10', depart: '2026-07-17' }, { arrivee: '2026-07-17', depart: '2026-07-24' })).toBe(false);
  });

  it('accepte deux séjours disjoints', () => {
    expect(chevauche({ arrivee: '2026-07-10', depart: '2026-07-17' }, { arrivee: '2026-08-01', depart: '2026-08-08' })).toBe(false);
  });

  it('détecte un séjour entièrement inclus dans un autre', () => {
    expect(chevauche({ arrivee: '2026-07-10', depart: '2026-07-30' }, { arrivee: '2026-07-12', depart: '2026-07-14' })).toBe(true);
  });

  it('détecte un séjour identique', () => {
    expect(chevauche({ arrivee: '2026-07-10', depart: '2026-07-17' }, { arrivee: '2026-07-10', depart: '2026-07-17' })).toBe(true);
  });
});

describe('trouverChevauchements', () => {
  const existants = [
    { id: 'a', arrivee: '2026-07-10', depart: '2026-07-17', statut: 'confirme' },
    { id: 'b', arrivee: '2026-08-01', depart: '2026-08-08', statut: 'confirme' },
    { id: 'c', arrivee: '2026-09-01', depart: '2026-09-08', statut: 'annule' },
  ];

  it('renvoie les séjours bloquants en conflit', () => {
    const res = trouverChevauchements({ arrivee: '2026-07-15', depart: '2026-07-20' }, existants);
    expect(res.map((s) => s.id)).toEqual(['a']);
  });

  it('ignore les séjours annulés', () => {
    const res = trouverChevauchements({ arrivee: '2026-09-02', depart: '2026-09-05' }, existants);
    expect(res).toEqual([]);
  });

  it('ignore le séjour en cours d’édition', () => {
    const res = trouverChevauchements({ id: 'a', arrivee: '2026-07-11', depart: '2026-07-16' }, existants);
    expect(res).toEqual([]);
  });

  it('renvoie une liste vide quand rien ne chevauche', () => {
    const res = trouverChevauchements({ arrivee: '2026-10-01', depart: '2026-10-08' }, existants);
    expect(res).toEqual([]);
  });

  it('considère une option comme bloquante', () => {
    const res = trouverChevauchements(
      { arrivee: '2026-07-15', depart: '2026-07-20' },
      [{ id: 'x', arrivee: '2026-07-10', depart: '2026-07-17', statut: 'option' }],
    );
    expect(res).toHaveLength(1);
  });

  it('les statuts bloquants sont bien option et confirme', () => {
    expect([...STATUTS_BLOQUANTS]).toEqual(['option', 'confirme']);
  });
});

describe('nuits', () => {
  it('compte les nuits d’un séjour d’une semaine', () => {
    expect(nuits('2026-07-10', '2026-07-17')).toBe(7);
  });

  it('renvoie 0 pour des dates identiques', () => {
    expect(nuits('2026-07-10', '2026-07-10')).toBe(0);
  });

  it('renvoie 0 pour des dates inversées', () => {
    expect(nuits('2026-07-17', '2026-07-10')).toBe(0);
  });

  it('renvoie 0 pour des dates invalides', () => {
    expect(nuits('', '')).toBe(0);
    expect(nuits('pas-une-date', '2026-07-10')).toBe(0);
  });

  it('gère le passage à l’heure d’hiver sans perdre une nuit', () => {
    // 25 octobre 2026 : changement d'heure en Europe.
    expect(nuits('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('plageValide', () => {
  it('accepte une plage cohérente', () => {
    expect(plageValide('2026-07-10', '2026-07-17')).toBe(true);
  });

  it('refuse une plage vide ou inversée', () => {
    expect(plageValide('2026-07-10', '2026-07-10')).toBe(false);
    expect(plageValide('2026-07-17', '2026-07-10')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  controlerDates,
  controlerLectures,
  sejoursBloquants,
  type LigneSejourStatut,
} from '../src/lib/reservation-disponibilite';
import type { LigneBlocage } from '../src/lib/calendrier';

// Une demande de séjour se valide sur les DEUX sources du calendrier public :
// `sejours` (départ exclusif) et `calendar_blocks` (fin inclusive). Ces tests
// fixent le contrat du formulaire /reserver/ ; ils remplacent l'ancien contrôle
// mensuel sur `availability`.

const SEJOUR_CONFIRME: LigneSejourStatut = {
  arrivee: '2026-07-10',
  depart: '2026-07-17',
  statut: 'confirme',
};

const BLOCAGE_TEST: LigneBlocage = { debut: '2026-08-03', fin: '2026-08-08' };

describe('sejoursBloquants', () => {
  it('garde option et confirme', () => {
    expect(
      sejoursBloquants([
        { arrivee: '2026-07-01', depart: '2026-07-08', statut: 'option' },
        SEJOUR_CONFIRME,
      ]),
    ).toHaveLength(2);
  });

  it('écarte un séjour annulé ou terminé', () => {
    expect(
      sejoursBloquants([
        { arrivee: '2026-07-01', depart: '2026-07-08', statut: 'annule' },
        { arrivee: '2026-08-01', depart: '2026-08-08', statut: 'termine' },
      ]),
    ).toEqual([]);
  });

  it('considère bloquante une ligne sans statut (jamais de libération par défaut)', () => {
    expect(sejoursBloquants([{ arrivee: '2026-07-01', depart: '2026-07-08' }])).toHaveLength(1);
  });

  it('accepte null (lecture en échec) sans lever', () => {
    expect(sejoursBloquants(null)).toEqual([]);
  });
});

describe('controlerDates — séjours', () => {
  it('refuse un chevauchement partiel avec un séjour confirmé', () => {
    const res = controlerDates('2026-07-12', '2026-07-20', [SEJOUR_CONFIRME], []);
    expect(res.verdict).toBe('occupe');
  });

  it('refuse un séjour en option', () => {
    const res = controlerDates(
      '2026-07-12',
      '2026-07-20',
      [{ arrivee: '2026-07-10', depart: '2026-07-17', statut: 'option' }],
      [],
    );
    expect(res.verdict).toBe('occupe');
  });

  it('accepte une arrivée le jour du départ (convention hôtelière)', () => {
    // Le séjour occupe 10..16 ; une arrivée le 17 est libre.
    const res = controlerDates('2026-07-17', '2026-07-20', [SEJOUR_CONFIRME], []);
    expect(res.verdict).toBe('libre');
  });

  it('ignore un séjour annulé', () => {
    const res = controlerDates(
      '2026-07-12',
      '2026-07-20',
      [{ arrivee: '2026-07-10', depart: '2026-07-17', statut: 'annule' }],
      [],
    );
    expect(res.verdict).toBe('libre');
  });

  it('ignore un séjour terminé', () => {
    const res = controlerDates(
      '2026-07-12',
      '2026-07-20',
      [{ arrivee: '2026-07-10', depart: '2026-07-17', statut: 'termine' }],
      [],
    );
    expect(res.verdict).toBe('libre');
  });
});

describe('controlerDates — blocages', () => {
  const BLOCAGE: LigneBlocage = { debut: '2026-08-03', fin: '2026-08-08' };

  it('refuse une demande qui chevauche un blocage actif', () => {
    expect(controlerDates('2026-08-05', '2026-08-10', [], [BLOCAGE]).verdict).toBe('occupe');
  });

  it('refuse une arrivée le jour où le blocage commence (fin inclusive)', () => {
    expect(controlerDates('2026-08-03', '2026-08-06', [], [BLOCAGE]).verdict).toBe('occupe');
  });

  it('refuse une demande qui se termine le dernier jour bloqué', () => {
    // Arrivée le 5, départ le 8 : la nuit du 7 est encore bloquée.
    expect(controlerDates('2026-08-05', '2026-08-08', [], [BLOCAGE]).verdict).toBe('occupe');
  });

  it('accepte une arrivée le lendemain du dernier jour bloqué', () => {
    expect(controlerDates('2026-08-09', '2026-08-12', [], [BLOCAGE]).verdict).toBe('libre');
  });

  it('accepte un séjour qui se termine la veille du blocage', () => {
    expect(controlerDates('2026-08-01', '2026-08-03', [], [BLOCAGE]).verdict).toBe('libre');
  });
});

describe('controlerDates — lecture partielle et repli', () => {
  it('annonce « à confirmer » quand une table est illisible, sans bloquer', () => {
    const res = controlerDates('2026-09-01', '2026-09-08', null, []);
    expect(res.verdict).toBe('a_confirmer');
    expect(res.lecturePartielle).toBe(true);
  });

  it('annonce « à confirmer » quand calendar_blocks manque encore (0011 non appliquée)', () => {
    const res = controlerDates('2026-09-01', '2026-09-08', [], null);
    expect(res.verdict).toBe('a_confirmer');
  });

  it('bloque quand même un conflit détecté sur la source réellement lue', () => {
    // sejours illisible, mais un blocage lisible couvre les dates : on refuse.
    const res = controlerDates('2026-08-05', '2026-08-10', null, [
      { debut: '2026-08-03', fin: '2026-08-08' },
    ]);
    expect(res.verdict).toBe('occupe');
    expect(res.lecturePartielle).toBe(true);
  });

  it('deux listes vides signifient « libre » (tables lues, aucune ligne)', () => {
    expect(controlerDates('2026-09-01', '2026-09-08', [], []).verdict).toBe('libre');
  });

  it('refuse les dates invalides ou inversées sans lever', () => {
    // Pas de plage : le devis et la validation de dates du formulaire s'en
    // chargent (message d'erreur dédié). Ici on ne bloque pas par accident.
    expect(controlerDates('2026-09-08', '2026-09-01', [], []).verdict).toBe('libre');
    expect(controlerDates('', '', [], []).verdict).toBe('libre');
  });
});

describe('controlerLectures — câblage du formulaire (null préservé)', () => {
  // Ces cas reproduisent EXACTEMENT l'appel du composant : les tableaux rendus
  // par la lecture Supabase, `null` compris. Le bug corrigé était un `?? []`
  // dans Reservation.astro qui transformait « lecture en échec » en « vide »,
  // rendant le verdict `a_confirmer` inatteignable.

  it('calendar_blocks illisible + sejours vide → « à confirmer »', () => {
    const res = controlerLectures('2026-09-01', '2026-09-08', [], null);
    expect(res.verdict).toBe('a_confirmer');
    expect(res.lecturePartielle).toBe(true);
  });

  it('les deux tables illisibles → « à confirmer »', () => {
    const res = controlerLectures('2026-09-01', '2026-09-08', null, null);
    expect(res.verdict).toBe('a_confirmer');
    expect(res.lecturePartielle).toBe(true);
  });

  it('sejours illisible seul → « à confirmer »', () => {
    expect(controlerLectures('2026-09-01', '2026-09-08', null, []).verdict).toBe('a_confirmer');
  });

  it('un conflit lisible bloque même si l’autre source est illisible', () => {
    const res = controlerLectures('2026-07-12', '2026-07-20', null, []);
    expect(res.verdict).toBe('a_confirmer');
    expect(controlerLectures('2026-08-05', '2026-08-10', null, [BLOCAGE_TEST]).verdict).toBe(
      'occupe',
    );
    expect(
      controlerLectures('2026-07-12', '2026-07-20', [SEJOUR_CONFIRME], null).verdict,
    ).toBe('occupe');
  });

  it('les deux lectures complètes et vides → « libre »', () => {
    expect(controlerLectures('2026-09-01', '2026-09-08', [], []).verdict).toBe('libre');
  });
});

describe('controlerDates — cohérence avec le calendrier public', () => {
  it('ne peut pas contredire la vitrine sur une même donnée', () => {
    // Le calendrier affiche le 10..16 occupé et le 17 libre ; le formulaire
    // doit rendre exactement le même verdict, puisqu'il lit la même fonction.
    const sejours = [SEJOUR_CONFIRME];
    expect(controlerDates('2026-07-15', '2026-07-18', sejours, []).verdict).toBe('occupe');
    expect(controlerDates('2026-07-17', '2026-07-18', sejours, []).verdict).toBe('libre');
  });
});

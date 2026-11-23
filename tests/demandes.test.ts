import { describe, it, expect } from 'vitest';
import {
  ACTIONS_DEMANDE,
  STATUT_CIBLE,
  estActionDemande,
  actionOccupeCalendrier,
  champsManquants,
  estDemandeIncomplete,
  estEnAttente,
  compterEnAttente,
  trierDemandes,
  chevauchementsDemande,
  confirmationRequise,
  entreeHistorique,
  construirePatchAction,
  totalPersonnes,
  type DemandeMinimale,
} from '../src/lib/demandes';

function demande(over: Partial<DemandeMinimale> = {}): DemandeMinimale {
  return {
    id: 'd1',
    arrivee: '2026-07-10',
    depart: '2026-07-17',
    statut: 'demande',
    created_at: '2026-06-01T10:00:00Z',
    client_email: 'kiki@example.com',
    client_telephone: '0600000000',
    prix_estime: 500,
    prix_total: null,
    historique: [],
    ...over,
  };
}

describe('actions sur une demande', () => {
  it('expose les trois actions dans l’ordre attendu', () => {
    expect([...ACTIONS_DEMANDE]).toEqual(['confirmer', 'option', 'refuser']);
  });

  it('associe chaque action à un statut du cycle de vie', () => {
    expect(STATUT_CIBLE.confirmer).toBe('confirme');
    expect(STATUT_CIBLE.option).toBe('option');
    expect(STATUT_CIBLE.refuser).toBe('annule');
  });

  it('reconnaît une action connue et rejette le reste', () => {
    expect(estActionDemande('confirmer')).toBe(true);
    expect(estActionDemande('supprimer')).toBe(false);
    expect(estActionDemande(null)).toBe(false);
  });

  it('seul le refus ne réserve pas les dates', () => {
    expect(actionOccupeCalendrier('confirmer')).toBe(true);
    expect(actionOccupeCalendrier('option')).toBe(true);
    expect(actionOccupeCalendrier('refuser')).toBe(false);
  });
});

describe('complétude d’une demande', () => {
  it('ne signale rien quand tout est renseigné', () => {
    expect(champsManquants(demande())).toEqual([]);
    expect(estDemandeIncomplete(demande())).toBe(false);
  });

  it('signale un e-mail absent ou vide', () => {
    expect(champsManquants(demande({ client_email: null }))).toEqual(['email']);
    expect(champsManquants(demande({ client_email: '   ' }))).toEqual(['email']);
  });

  it('signale un téléphone absent', () => {
    expect(champsManquants(demande({ client_telephone: null }))).toEqual(['telephone']);
  });

  it('signale l’absence de tout prix, estimé comme négocié', () => {
    expect(champsManquants(demande({ prix_estime: null, prix_total: null }))).toEqual(['prix']);
  });

  it('accepte un prix négocié même sans prix estimé', () => {
    expect(champsManquants(demande({ prix_estime: null, prix_total: 0 }))).toEqual([]);
  });

  it('accepte un prix estimé à zéro (offre, geste commercial)', () => {
    expect(champsManquants(demande({ prix_estime: 0 }))).toEqual([]);
  });

  it('cumule les manques dans un ordre stable', () => {
    expect(champsManquants(demande({ client_email: null, client_telephone: null, prix_estime: null }))).toEqual([
      'email',
      'telephone',
      'prix',
    ]);
  });
});

describe('demandes en attente', () => {
  it('seul le statut « demande » attend une décision', () => {
    expect(estEnAttente({ statut: 'demande' })).toBe(true);
    expect(estEnAttente({ statut: 'option' })).toBe(false);
    expect(estEnAttente({ statut: 'confirme' })).toBe(false);
    expect(estEnAttente({ statut: null })).toBe(false);
  });

  it('compte les demandes à traiter et ignore les autres statuts', () => {
    expect(
      compterEnAttente([
        { statut: 'demande' },
        { statut: 'demande' },
        { statut: 'confirme' },
        { statut: 'annule' },
      ]),
    ).toBe(2);
    expect(compterEnAttente([])).toBe(0);
  });
});

describe('tri par urgence', () => {
  it('place la date d’arrivée la plus proche en premier', () => {
    const liste = [
      demande({ id: 'a', arrivee: '2026-08-01' }),
      demande({ id: 'c', arrivee: '2026-07-01' }),
      demande({ id: 'b', arrivee: '2026-07-15' }),
    ];
    expect(trierDemandes(liste).map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('départage deux arrivées identiques par réception la plus ancienne', () => {
    const liste = [
      demande({ id: 'recente', arrivee: '2026-07-01', created_at: '2026-06-10T00:00:00Z' }),
      demande({ id: 'ancienne', arrivee: '2026-07-01', created_at: '2026-05-01T00:00:00Z' }),
    ];
    expect(trierDemandes(liste).map((d) => d.id)).toEqual(['ancienne', 'recente']);
  });

  it('ne modifie pas le tableau d’origine', () => {
    const liste = [demande({ id: 'a', arrivee: '2026-08-01' }), demande({ id: 'b', arrivee: '2026-07-01' })];
    trierDemandes(liste);
    expect(liste.map((d) => d.id)).toEqual(['a', 'b']);
  });
});

describe('chevauchement avant décision', () => {
  const existants = [
    { id: 's1', arrivee: '2026-07-10', depart: '2026-07-17', statut: 'confirme' },
    { id: 's2', arrivee: '2026-08-01', depart: '2026-08-08', statut: 'option' },
    { id: 'd2', arrivee: '2026-07-10', depart: '2026-07-17', statut: 'demande' },
    { id: 's3', arrivee: '2026-07-10', depart: '2026-07-17', statut: 'annule' },
  ];

  it('ignore la demande elle-même et les autres demandes', () => {
    expect(chevauchementsDemande(demande(), existants).map((s) => s.id)).toEqual(['s1']);
  });

  it('accepte deux plages qui se touchent (départ = arrivée)', () => {
    const collee = demande({ id: 'x', arrivee: '2026-07-17', depart: '2026-07-20' });
    expect(chevauchementsDemande(collee, existants)).toEqual([]);
  });

  it('demande confirmation pour confirmer ou mettre en option', () => {
    expect(confirmationRequise(demande(), existants, 'confirmer')).toBe(true);
    expect(confirmationRequise(demande(), existants, 'option')).toBe(true);
  });

  it('ne demande jamais confirmation pour un refus (les dates sont libérées)', () => {
    expect(confirmationRequise(demande(), existants, 'refuser')).toBe(false);
  });

  it('ne demande rien quand les dates sont libres', () => {
    const libre = demande({ id: 'y', arrivee: '2026-09-01', depart: '2026-09-08' });
    expect(confirmationRequise(libre, existants, 'confirmer')).toBe(false);
  });
});

describe('historique et mise à jour', () => {
  it('horodate chaque décision avec le motif éventuel', () => {
    const sansMotif = entreeHistorique('demande', 'confirme', '2026-06-02T09:00:00Z');
    expect(sansMotif).toEqual({ at: '2026-06-02T09:00:00Z', by: 'admin', action: 'statut', detail: 'demande → confirme' });

    const avecMotif = entreeHistorique('demande', 'annule', '2026-06-02T09:00:00Z', '  dates déjà prises  ');
    expect(avecMotif.detail).toBe('demande → annule — dates déjà prises');
  });

  it('traite un motif vide comme absent', () => {
    expect(entreeHistorique('demande', 'annule', '2026-06-02T09:00:00Z', '   ').detail).toBe('demande → annule');
    expect(entreeHistorique('demande', 'annule', '2026-06-02T09:00:00Z', null).detail).toBe('demande → annule');
  });

  it('construit le patch d’une confirmation sans ressaisie', () => {
    const patch = construirePatchAction(demande(), 'confirmer', '2026-06-02T09:00:00Z');
    expect(patch.statut).toBe('confirme');
    expect(patch.historique).toHaveLength(1);
    expect(Object.keys(patch).sort()).toEqual(['historique', 'statut']);
  });

  it('empile l’historique existant sans l’écraser', () => {
    const deja = demande({
      historique: [{ at: '2026-06-01T10:00:00Z', by: 'admin', action: 'creation' }],
    });
    const patch = construirePatchAction(deja, 'option', '2026-06-02T09:00:00Z');
    expect(patch.historique.map((e) => e.action)).toEqual(['creation', 'statut']);
  });

  it('part du statut « demande » quand le statut est absent', () => {
    const patch = construirePatchAction(demande({ statut: null }), 'refuser', '2026-06-02T09:00:00Z', 'complet');
    expect(patch.statut).toBe('annule');
    expect(patch.historique[0].detail).toBe('demande → annule — complet');
  });
});

describe('total des personnes', () => {
  it('additionne adultes et mineurs quand le détail est renseigné', () => {
    expect(totalPersonnes({ personnes: 4, adultes: 2, mineurs: 2 })).toBe(4);
  });

  it('retombe sur le total saisi à la main sans détail', () => {
    expect(totalPersonnes({ personnes: 3 })).toBe(3);
  });

  it('renvoie 0 si rien n’est exploitable', () => {
    expect(totalPersonnes({})).toBe(0);
  });
});

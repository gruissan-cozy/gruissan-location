import { describe, it, expect } from 'vitest';
import {
  STATUTS_MESSAGE,
  ETAPES_PIPELINE,
  CONVERSION_HERITE,
  STATUTS_TERMINAUX,
  estStatutMessage,
  estEtapePipeline,
  estTerminal,
  estValeurHeritee,
  indexEtape,
  etapeSuivante,
  transitionsAutorisees,
  estTransitionAutorisee,
  avancerSiNecessaire,
  compterParStatut,
  construireEntreeHistorique,
} from '../src/lib/pipeline';

describe('pipeline — définition', () => {
  it('définit le pipeline dans le bon ordre, avec « refuse »', () => {
    expect([...ETAPES_PIPELINE]).toEqual([
      'nouveau',
      'contacte',
      'devis_envoye',
      'confirme',
      'termine',
    ]);
    expect([...STATUTS_MESSAGE]).toEqual([
      'nouveau',
      'contacte',
      'devis_envoye',
      'confirme',
      'termine',
      'refuse',
    ]);
  });

  it('a deux statuts terminaux', () => {
    expect([...STATUTS_TERMINAUX]).toEqual(['termine', 'refuse']);
  });

  it('convertit les valeurs héritées comme prévu', () => {
    expect(CONVERSION_HERITE).toEqual({
      nouveau: 'nouveau',
      en_cours: 'contacte',
      repondu: 'devis_envoye',
      archive: 'termine',
    });
  });
});

describe('reconnaissance des statuts', () => {
  it('accepte les statuts du pipeline', () => {
    for (const s of STATUTS_MESSAGE) expect(estStatutMessage(s)).toBe(true);
  });

  it('accepte « refuse » comme statut (mais pas comme étape)', () => {
    expect(estStatutMessage('refuse')).toBe(true);
    expect(estEtapePipeline('refuse')).toBe(false);
  });

  it('refuse les valeurs inconnues, vides et non-chaînes', () => {
    expect(estStatutMessage('en_cours')).toBe(false);
    expect(estStatutMessage('')).toBe(false);
    expect(estStatutMessage(null)).toBe(false);
    expect(estStatutMessage(42)).toBe(false);
  });

  it('identifie les valeurs héritées non converties', () => {
    expect(estValeurHeritee('en_cours')).toBe(true);
    expect(estValeurHeritee('repondu')).toBe(true);
    expect(estValeurHeritee('archive')).toBe(true);
    // « nouveau » est à la fois hérité et valide : il n'est pas illisible.
    expect(estValeurHeritee('nouveau')).toBe(false);
    expect(estValeurHeritee('contacte')).toBe(false);
    expect(estValeurHeritee('inconnu')).toBe(false);
  });
});

describe('progression dans le pipeline', () => {
  it('donne la position de chaque étape', () => {
    expect(indexEtape('nouveau')).toBe(0);
    expect(indexEtape('devis_envoye')).toBe(2);
    expect(indexEtape('termine')).toBe(4);
    expect(indexEtape('refuse')).toBe(-1);
    expect(indexEtape('en_cours')).toBe(-1);
    expect(indexEtape('nimporte quoi')).toBe(-1);
  });

  it('donne l’étape suivante, null pour les terminaux et les inconnus', () => {
    expect(etapeSuivante('nouveau')).toBe('contacte');
    expect(etapeSuivante('contacte')).toBe('devis_envoye');
    expect(etapeSuivante('devis_envoye')).toBe('confirme');
    expect(etapeSuivante('confirme')).toBe('termine');
    expect(etapeSuivante('termine')).toBeNull();
    expect(etapeSuivante('refuse')).toBeNull();
    expect(etapeSuivante('en_cours')).toBeNull();
  });

  it('détecte les statuts terminaux', () => {
    expect(estTerminal('termine')).toBe(true);
    expect(estTerminal('refuse')).toBe(true);
    expect(estTerminal('confirme')).toBe(false);
    expect(estTerminal('en_cours')).toBe(false);
  });
});

describe('transitions autorisées', () => {
  it('depuis « nouveau » : toutes les étapes suivantes + refuse', () => {
    expect(transitionsAutorisees('nouveau')).toEqual([
      'contacte',
      'devis_envoye',
      'confirme',
      'termine',
      'refuse',
    ]);
  });

  it('depuis « devis_envoye » : confirme, termine, refuse', () => {
    expect(transitionsAutorisees('devis_envoye')).toEqual(['confirme', 'termine', 'refuse']);
  });

  it('depuis « termine » ou « refuse » : aucune transition', () => {
    expect(transitionsAutorisees('termine')).toEqual([]);
    expect(transitionsAutorisees('refuse')).toEqual([]);
  });

  it('depuis une valeur héritée ou inconnue : aucune transition (migration requise)', () => {
    expect(transitionsAutorisees('en_cours')).toEqual([]);
    expect(transitionsAutorisees('archive')).toEqual([]);
    expect(transitionsAutorisees('inconnu')).toEqual([]);
    expect(transitionsAutorisees(undefined)).toEqual([]);
  });

  it('valide ou refuse des transitions précises', () => {
    expect(estTransitionAutorisee('nouveau', 'contacte')).toBe(true);
    expect(estTransitionAutorisee('nouveau', 'confirme')).toBe(true);
    expect(estTransitionAutorisee('contacte', 'refuse')).toBe(true);
    expect(estTransitionAutorisee('contacte', 'nouveau')).toBe(false);
    expect(estTransitionAutorisee('termine', 'refuse')).toBe(false);
    expect(estTransitionAutorisee('refuse', 'nouveau')).toBe(false);
  });
});

describe('avancerSiNecessaire (marquage « contacté »)', () => {
  it('avance depuis « nouveau »', () => {
    expect(avancerSiNecessaire('nouveau', 'contacte')).toBe('contacte');
  });

  it('ne régresse jamais : statut déjà avancé ou terminal', () => {
    expect(avancerSiNecessaire('devis_envoye', 'contacte')).toBeNull();
    expect(avancerSiNecessaire('termine', 'contacte')).toBeNull();
    expect(avancerSiNecessaire('refuse', 'contacte')).toBeNull();
  });

  it('ne fait rien pour une valeur héritée ou inconnue', () => {
    expect(avancerSiNecessaire('en_cours', 'contacte')).toBeNull();
    expect(avancerSiNecessaire('inconnu', 'contacte')).toBeNull();
  });
});

describe('compterParStatut', () => {
  const messages = [
    { statut: 'nouveau' },
    { statut: 'nouveau' },
    { statut: 'contacte' },
    { statut: 'devis_envoye' },
    { statut: 'devis_envoye' },
    { statut: 'devis_envoye' },
    { statut: 'confirme' },
    { statut: 'termine' },
    { statut: 'refuse' },
  ];

  it('compte exactement chaque étape', () => {
    expect(compterParStatut(messages)).toEqual({
      nouveau: 2,
      contacte: 1,
      devis_envoye: 3,
      confirme: 1,
      termine: 1,
      refuse: 1,
    });
  });

  it('renvoie des compteurs à zéro pour les étapes vides', () => {
    expect(compterParStatut([{ statut: 'nouveau' }])).toEqual({
      nouveau: 1,
      contacte: 0,
      devis_envoye: 0,
      confirme: 0,
      termine: 0,
      refuse: 0,
    });
  });

  it('tolère les valeurs héritées et les entrées vides', () => {
    const compteurs = compterParStatut([
      { statut: 'nouveau' },
      { statut: 'en_cours' },
      { statut: 'archive' },
      { statut: 'valeur_inconnue' },
      { statut: '' },
    ]);
    expect(compteurs.nouveau).toBe(1);
    expect(compteurs.en_cours).toBe(1);
    expect(compteurs.archive).toBe(1);
    expect(compteurs.valeur_inconnue).toBe(1);
    expect(compteurs['']).toBe(1);
    expect(compteurs.contacte).toBe(0);
  });

  it('gère une liste vide', () => {
    expect(compterParStatut([])).toEqual({
      nouveau: 0,
      contacte: 0,
      devis_envoye: 0,
      confirme: 0,
      termine: 0,
      refuse: 0,
    });
  });
});

describe('construireEntreeHistorique', () => {
  it('construit une entrée horodatée lisible', () => {
    expect(construireEntreeHistorique('nouveau', 'contacte', '2026-10-25T10:15:00.000Z')).toEqual({
      at: '2026-10-25T10:15:00.000Z',
      by: 'admin',
      action: 'statut',
      detail: 'nouveau → contacte',
    });
  });
});

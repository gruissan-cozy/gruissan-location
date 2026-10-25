import { describe, it, expect } from 'vitest';
import {
  patchLu,
  maintenantISO,
  estHorodatageLu,
  estLue,
  estNonLue,
  compterNonLus,
  compterLus,
  filtrerNonLus,
  idsNonLus,
  appliquerLu,
  appliquerToutLu,
  trierParPriorite,
  colonneLuAbsente,
  estErreurColonneLuAbsente,
  type DemandeLisible,
} from '../src/lib/lu';

/** Demande minimaliste pour les tests. */
function demande(params: Partial<DemandeLisible> & { id: string }): DemandeLisible {
  return { created_at: '2026-10-25T10:00:00.000Z', lu_at: null, ...params };
}

describe('patchLu / maintenantISO', () => {
  it('construit l’écriture de marquage lu', () => {
    expect(patchLu('2026-10-25T12:00:00.000Z')).toEqual({ lu_at: '2026-10-25T12:00:00.000Z' });
  });

  it('construit l’écriture de marquage non lu (null)', () => {
    expect(patchLu(null)).toEqual({ lu_at: null });
  });

  it('renvoie un horodatage ISO valide', () => {
    expect(maintenantISO()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('estLue / estNonLue', () => {
  it('considère une demande sans lu_at comme NON lue', () => {
    expect(estLue(demande({ id: 'a' }))).toBe(false);
    expect(estNonLue(demande({ id: 'a' }))).toBe(true);
  });

  it('considère une demande avec lu_at renseigné comme lue', () => {
    expect(estLue(demande({ id: 'a', lu_at: '2026-10-25T09:00:00.000Z' }))).toBe(true);
    expect(estNonLue(demande({ id: 'a', lu_at: '2026-10-25T09:00:00.000Z' }))).toBe(false);
  });

  it('tolère undefined, null et chaîne vide', () => {
    expect(estHorodatageLu(null)).toBe(false);
    expect(estHorodatageLu(undefined)).toBe(false);
    expect(estHorodatageLu('')).toBe(false);
    expect(estHorodatageLu('   ')).toBe(false);
    expect(estHorodatageLu('2026-10-25T09:00:00.000Z')).toBe(true);
  });

  it('ignore un lu_at non chaîné (colonne absente ou valeur inattendue)', () => {
    expect(estLue({ id: 'a', lu_at: undefined })).toBe(false);
    expect(estLue({ id: 'a', lu_at: 12345 } as unknown as DemandeLisible)).toBe(false);
  });
});

describe('comptage lu / non lu', () => {
  const liste = [
    demande({ id: 'a', lu_at: null }),
    demande({ id: 'b', lu_at: '2026-10-25T09:00:00.000Z' }),
    demande({ id: 'c', lu_at: null }),
    demande({ id: 'd', lu_at: '2026-10-24T09:00:00.000Z' }),
  ];

  it('compte les non lus et les lus', () => {
    expect(compterNonLus(liste)).toBe(2);
    expect(compterLus(liste)).toBe(2);
    expect(compterNonLus(liste) + compterLus(liste)).toBe(liste.length);
  });

  it('gère une liste vide et une liste tout en lu', () => {
    expect(compterNonLus([])).toBe(0);
    expect(compterLus([])).toBe(0);
    expect(compterNonLus([demande({ id: 'x', lu_at: '2026-10-25T09:00:00.000Z' })])).toBe(0);
    expect(compterLus([demande({ id: 'x', lu_at: null })])).toBe(0);
  });
});

describe('filtrage et identifiants', () => {
  const liste = [
    demande({ id: 'a', lu_at: null }),
    demande({ id: 'b', lu_at: '2026-10-25T09:00:00.000Z' }),
    demande({ id: 'c', lu_at: null }),
  ];

  it('ne garde que les non lues, dans l’ordre d’origine', () => {
    expect(filtrerNonLus(liste).map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('donne les identifiants des non lues (action groupée)', () => {
    expect(idsNonLus(liste)).toEqual(['a', 'c']);
    expect(idsNonLus([])).toEqual([]);
  });
});

describe('application du marquage (listes immuables)', () => {
  const liste = [demande({ id: 'a' }), demande({ id: 'b', lu_at: '2026-10-25T09:00:00.000Z' })];

  it('marque une demande lue sans muter la liste d’origine', () => {
    const next = appliquerLu(liste, 'a', '2026-10-25T12:00:00.000Z');
    expect(next[0].lu_at).toBe('2026-10-25T12:00:00.000Z');
    expect(next[1].lu_at).toBe('2026-10-25T09:00:00.000Z');
    // La liste d'origine n'a pas bougé.
    expect(liste[0].lu_at).toBeNull();
    expect(next).not.toBe(liste);
  });

  it('remet une demande en non lu', () => {
    const next = appliquerLu(liste, 'b', null);
    expect(next[1].lu_at).toBeNull();
    expect(liste[1].lu_at).toBe('2026-10-25T09:00:00.000Z');
  });

  it("renvoie une liste équivalente si l'identifiant est introuvable", () => {
    const next = appliquerLu(liste, 'introuvable', '2026-10-25T12:00:00.000Z');
    expect(next).not.toBe(liste);
    expect(next.map((d) => d.lu_at)).toEqual(liste.map((d) => d.lu_at));
  });

  it('marque toutes les demandes lues à la même heure', () => {
    const next = appliquerToutLu(liste, '2026-10-25T12:00:00.000Z');
    expect(next.every((d) => d.lu_at === '2026-10-25T12:00:00.000Z')).toBe(true);
    expect(liste[0].lu_at).toBeNull();
  });
});

describe('trierParPriorite (non lues d’abord)', () => {
  it('place les non lues avant les lues', () => {
    const trie = trierParPriorite([
      demande({ id: 'lue-1', lu_at: '2026-10-25T09:00:00.000Z', created_at: '2026-10-25T08:00:00.000Z' }),
      demande({ id: 'non-lue-1', lu_at: null, created_at: '2026-10-25T07:00:00.000Z' }),
    ]);
    expect(trie.map((d) => d.id)).toEqual(['non-lue-1', 'lue-1']);
  });

  it('trie chaque groupe par date décroissante', () => {
    const trie = trierParPriorite([
      demande({ id: 'a', lu_at: null, created_at: '2026-10-20T00:00:00.000Z' }),
      demande({ id: 'b', lu_at: null, created_at: '2026-10-22T00:00:00.000Z' }),
      demande({ id: 'c', lu_at: null, created_at: '2026-10-21T00:00:00.000Z' }),
      demande({ id: 'd', lu_at: '2026-10-25T09:00:00.000Z', created_at: '2026-10-19T00:00:00.000Z' }),
      demande({ id: 'e', lu_at: '2026-10-25T09:00:00.000Z', created_at: '2026-10-18T00:00:00.000Z' }),
    ]);
    expect(trie.map((d) => d.id)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });

  it('reste stable à date égale (ordre d’origine conservé)', () => {
    const trie = trierParPriorite([
      demande({ id: 'a', lu_at: null, created_at: '2026-10-22T00:00:00.000Z' }),
      demande({ id: 'b', lu_at: null, created_at: '2026-10-22T00:00:00.000Z' }),
    ]);
    expect(trie.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('rejette les dates absentes ou invalides en fin de groupe', () => {
    const trie = trierParPriorite([
      demande({ id: 'sans-date', lu_at: null, created_at: null }),
      demande({ id: 'date-invalide', lu_at: null, created_at: 'pas-une-date' }),
      demande({ id: 'ok', lu_at: null, created_at: '2026-10-22T00:00:00.000Z' }),
    ]);
    expect(trie.map((d) => d.id)).toEqual(['ok', 'sans-date', 'date-invalide']);
  });

  it('gère une liste vide et ne modifie pas la liste d’origine', () => {
    expect(trierParPriorite([])).toEqual([]);
    const source = [demande({ id: 'a' })];
    const trie = trierParPriorite(source);
    expect(trie).not.toBe(source);
    expect(source.map((d) => d.id)).toEqual(['a']);
  });
});

describe('colonneLuAbsente (dégradation sans migration 0005)', () => {
  it('détecte une réponse sans la clé lu_at', () => {
    expect(colonneLuAbsente([{ id: 'a', nom: 'x' }])).toBe(true);
    expect(colonneLuAbsente([{ id: 'a' }, { id: 'b' }])).toBe(true);
  });

  it('ne signale rien dès qu’une ligne porte la colonne (même nulle)', () => {
    expect(colonneLuAbsente([demande({ id: 'a' })])).toBe(false);
    expect(colonneLuAbsente([demande({ id: 'a', lu_at: '2026-10-25T09:00:00.000Z' })])).toBe(false);
  });

  it('ne conclut rien sur une liste vide ou absente', () => {
    expect(colonneLuAbsente([])).toBe(false);
    expect(colonneLuAbsente(null)).toBe(false);
    expect(colonneLuAbsente(undefined)).toBe(false);
  });
});

describe('estErreurColonneLuAbsente', () => {
  it('reconnaît les erreurs PostgREST / PostgreSQL sur lu_at', () => {
    expect(estErreurColonneLuAbsente('column "lu_at" does not exist')).toBe(true);
    expect(estErreurColonneLuAbsente({ message: 'column lu_at does not exist', code: '42703' })).toBe(true);
    expect(estErreurColonneLuAbsente({ message: 'Could not find the column lu_at', code: 'PGRST204' })).toBe(true);
  });

  it('n’accuse pas une erreur sans rapport', () => {
    expect(estErreurColonneLuAbsente('permission denied for table messages')).toBe(false);
    expect(estErreurColonneLuAbsente({ message: 'relation does not exist', code: '42P01' })).toBe(false);
    expect(estErreurColonneLuAbsente(null)).toBe(false);
  });
});

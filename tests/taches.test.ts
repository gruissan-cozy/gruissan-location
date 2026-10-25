import { describe, it, expect } from 'vitest';
import {
  basculerTache,
  creerTache,
  ecrireTaches,
  estFaite,
  estTableTachesAbsente,
  horodatageTache,
  libellerTache,
  libellesComplets,
  normaliserTaches,
  progression,
  regrouperParSejour,
  serialiserTaches,
  TACHES_TYPES,
  type SejourTaches,
  type Tache,
} from '../src/lib/taches';

/** Tâche minimaliste, écrasée par les champs fournis. */
function tache(s: Partial<Tache> & { id: string }): Tache {
  return {
    slug: 'menage',
    labels: { fr: 'Ménage', en: 'Cleaning', es: 'Limpieza', de: 'Reinigung' },
    custom_label: null,
    fait: false,
    fait_le: null,
    ...s,
  };
}

function sejour(s: Partial<SejourTaches> & { id: string }): SejourTaches {
  return {
    arrivee: '2026-07-10',
    depart: '2026-07-17',
    client_nom: 'Client',
    statut: 'confirme',
    personnes: 2,
    taches: [],
    ...s,
  };
}

describe('normaliserTaches — données dégradées', () => {
  it('lit une liste de tâches complète', () => {
    const taches = normaliserTaches([
      {
        id: 't1',
        slug: 'menage',
        labels: { fr: 'Ménage', en: 'Cleaning' },
        custom_label: null,
        fait: true,
        fait_le: '2026-07-17T10:00:00.000Z',
      },
    ]);
    expect(taches).toHaveLength(1);
    expect(taches[0].fait).toBe(true);
    expect(taches[0].fait_le).toBe('2026-07-17T10:00:00.000Z');
    expect(taches[0].labels.fr).toBe('Ménage');
  });

  it('renvoie une liste vide pour une valeur absente ou non tableau', () => {
    expect(normaliserTaches(undefined)).toEqual([]);
    expect(normaliserTaches(null)).toEqual([]);
    expect(normaliserTaches('[]')).toEqual([]);
    expect(normaliserTaches({})).toEqual([]);
    expect(normaliserTaches([])).toEqual([]);
  });

  it('ignore les entrées inexploitables sans en fabriquer', () => {
    const taches = normaliserTaches([
      null,
      'menage',
      42,
      {},
      { fait: true },
      { slug: '   ', id: '   ' },
      { slug: 'remise_cles' },
    ]);
    expect(taches).toHaveLength(1);
    expect(taches[0].slug).toBe('remise_cles');
  });

  it('neutralise un horodatage de réalisation sans case cochée', () => {
    const taches = normaliserTaches([{ id: 'a', slug: 'menage', fait: false, fait_le: '2026-07-17' }]);
    expect(taches[0].fait).toBe(false);
    expect(taches[0].fait_le).toBeNull();
  });

  it('tolère des libellés absents ou mal formés', () => {
    const taches = normaliserTaches([
      { id: 'a', slug: 'menage', labels: null },
      { id: 'b', slug: 'menage', labels: { fr: '  Ménage  ', en: 42 } },
    ]);
    expect(taches[0].labels).toEqual({});
    expect(taches[1].labels).toEqual({ fr: 'Ménage' });
    expect(taches[1].custom_label).toBeNull();
  });
});

describe('serialiserTaches', () => {
  it('n’écrit que les champs utiles', () => {
    const brut = serialiserTaches([tache({ id: 'a', fait: true, fait_le: '2026-07-17T10:00:00.000Z' })]);
    expect(brut).toEqual([
      {
        id: 'a',
        slug: 'menage',
        labels: { fr: 'Ménage', en: 'Cleaning', es: 'Limpieza', de: 'Reinigung' },
        custom_label: null,
        fait: true,
        fait_le: '2026-07-17T10:00:00.000Z',
      },
    ]);
  });

  it('n’écrit jamais de date pour une tâche non faite', () => {
    const brut = serialiserTaches([tache({ id: 'a', fait: false, fait_le: '2026-07-17' })]);
    expect(brut[0].fait_le).toBeNull();
  });

  it('écarte les tâches sans slug ni identifiant', () => {
    expect(serialiserTaches([{ id: '', slug: '', fait: true } as Tache])).toEqual([]);
    expect(serialiserTaches([tache({ id: '', slug: '' })])).toEqual([]);
    // Un identifiant seul ne suffit pas : le libellé est ce qui est affiché.
    expect(serialiserTaches([tache({ id: 'a', slug: '' })])).toEqual([]);
  });

  it('produit une liste vide pour une entrée vide', () => {
    expect(serialiserTaches([])).toEqual([]);
  });

  it('arrête la perte de données : normalisation puis sérialisation est stable', () => {
    const entree = [tache({ id: 'a', fait: true, fait_le: '2026-07-17T10:00:00.000Z' })];
    const aller = serialiserTaches(normaliserTaches(entree));
    const retour = normaliserTaches(aller);
    expect(retour[0].fait).toBe(true);
    expect(retour[0].fait_le).toBe('2026-07-17T10:00:00.000Z');
  });
});

describe('colonne/ table absente (dégradation sans migration 0006)', () => {
  it('reconnaît les erreurs PostgREST / PostgreSQL d’absence de table', () => {
    expect(estTableTachesAbsente("Could not find the table 'public.sejour_taches' in the schema cache")).toBe(true);
    expect(estTableTachesAbsente({ code: '42P01', message: 'relation "sejour_taches" does not exist' })).toBe(true);
    expect(estTableTachesAbsente({ details: 'PGRST205' })).toBe(true);
  });

  it('n’accuse pas une erreur sans rapport (droits, réseau, colonne)', () => {
    expect(estTableTachesAbsente({ message: 'JWT expired' })).toBe(false);
    expect(estTableTachesAbsente({ message: 'new row violates row-level security' })).toBe(false);
    expect(estTableTachesAbsente({ message: 'column "fait_le" does not exist' })).toBe(true);
    expect(estTableTachesAbsente(null)).toBe(false);
    expect(estTableTachesAbsente(undefined)).toBe(false);
    expect(estTableTachesAbsente('')).toBe(false);
  });
});

describe('progression', () => {
  it('compte les tâches faites et le taux', () => {
    const p = progression([tache({ id: 'a', fait: true }), tache({ id: 'b', fait: false }), tache({ id: 'c', fait: true })]);
    expect(p.total).toBe(3);
    expect(p.faites).toBe(2);
    expect(p.taux).toBeCloseTo(2 / 3, 6);
    expect(p.terminee).toBe(false);
  });

  it('considère une liste vide comme terminée, à 0 % (jamais NaN)', () => {
    expect(progression([])).toEqual({ total: 0, faites: 0, taux: 0, terminee: true });
  });

  it('une liste tout faite est terminée à 100 %', () => {
    const p = progression([tache({ id: 'a', fait: true }), tache({ id: 'b', fait: true })]);
    expect(p.taux).toBe(1);
    expect(p.terminee).toBe(true);
  });

  it('tolère une tâche mal formée (valeur manquante = non faite)', () => {
    const p = progression([{ fait: true }, { id: 'b' } as Tache]);
    expect(p.faites).toBe(1);
    expect(p.total).toBe(2);
  });
});

describe('basculerTache', () => {
  const liste = [tache({ id: 'a' }), tache({ id: 'b', fait: true, fait_le: '2026-07-01T09:00:00.000Z' })];

  it('coche une tâche et horodate la réalisation', () => {
    const next = basculerTache(liste, 'a', true, '2026-07-17T10:00:00.000Z');
    expect(next[0].fait).toBe(true);
    expect(next[0].fait_le).toBe('2026-07-17T10:00:00.000Z');
    // L’originale n’a pas bougé (immutabilité).
    expect(liste[0].fait).toBe(false);
    expect(next).not.toBe(liste);
  });

  it('décoche une tâche et retire l’horodatage', () => {
    const next = basculerTache(liste, 'b', false, '2026-07-17T10:00:00.000Z');
    expect(next[1].fait).toBe(false);
    expect(next[1].fait_le).toBeNull();
  });

  it('renvoie une liste équivalente pour un identifiant inconnu', () => {
    const next = basculerTache(liste, 'introuvable', true, '2026-07-17T10:00:00.000Z');
    expect(next).not.toBe(liste);
    expect(next.map((t) => t.fait)).toEqual([false, true]);
  });

  it('ne change rien si la case est déjà dans l’état demandé', () => {
    const next = basculerTache(liste, 'b', true, '2026-07-17T10:00:00.000Z');
    expect(next[1].fait_le).toBe('2026-07-01T09:00:00.000Z');
  });

  it('ne fabrique pas d’horodatage absurde', () => {
    const next = basculerTache(liste, 'a', true, '   ');
    expect(next[0].fait).toBe(true);
    expect(next[0].fait_le).toBeNull();
  });
});

describe('libellerTache', () => {
  it('privilégie le libellé libre', () => {
    const t = tache({ id: 'a', custom_label: 'Grand ménage' });
    expect(libellerTache(t, 'fr')).toBe('Grand ménage');
    expect(libellerTache(t, 'en')).toBe('Grand ménage');
  });

  it('retombe sur la langue demandée, puis le français, puis toute langue', () => {
    expect(libellerTache(tache({ id: 'a' }), 'de')).toBe('Reinigung');
    expect(libellerTache(tache({ id: 'a', labels: { en: 'Cleaning' } }), 'fr')).toBe('Cleaning');
    expect(libellerTache(tache({ id: 'a', labels: {} }), 'fr')).toBe('menage');
  });

  it('tolère des libellés vides ou un slug vide', () => {
    expect(libellerTache({ slug: '', labels: {} }, 'fr')).toBe('—');
    expect(libellerTache({ slug: 'menage', labels: { fr: '   ' } }, 'fr')).toBe('menage');
    expect(libellerTache({ slug: 'menage', labels: undefined as unknown as Record<string, string> }, 'fr')).toBe('menage');
  });
});

describe('regrouperParSejour / ecrireTaches', () => {
  it('rattache chaque tâche à son séjour et donne une progression par séjour', () => {
    const groupes = regrouperParSejour([
      sejour({ id: 's1', taches: [{ id: 'a', slug: 'menage', fait: true, fait_le: 'x' }, { id: 'b', slug: 'linge', fait: false }] }),
      sejour({ id: 's2', taches: [] }),
      sejour({ id: 's3' }), // colonne absente (migration non appliquée)
    ]);
    expect(groupes).toHaveLength(3);
    expect(groupes[0].taches).toHaveLength(2);
    expect(groupes[0].progression).toEqual({ total: 2, faites: 1, taux: 0.5, terminee: false });
    expect(groupes[1].taches).toEqual([]);
    expect(groupes[2].taches).toEqual([]);
    expect(groupes[2].progression.total).toBe(0);
  });

  it('prépare une écriture rattachée au séjour, sans inventer d’identifiant de séjour', () => {
    const ecriture = ecrireTaches({ id: 's1' }, [tache({ id: 'a' })]);
    expect(ecriture.sejour_id).toBe('s1');
    expect(ecriture.taches).toHaveLength(1);
    expect(ecriture.taches[0].id).toBe('a');
  });
});

describe('estFaite / horodatageTache / creerTache', () => {
  it('reconnaît l’état d’une tâche', () => {
    expect(estFaite(tache({ id: 'a', fait: true }))).toBe(true);
    expect(estFaite(tache({ id: 'a', fait: false }))).toBe(false);
    expect(estFaite({ id: 'a' } as Tache)).toBe(false);
  });

  it("n'expose un horodatage que pour une tâche faite", () => {
    expect(horodatageTache(tache({ id: 'a', fait: true, fait_le: '2026-07-17T10:00:00.000Z' }))).toBe('2026-07-17T10:00:00.000Z');
    expect(horodatageTache(tache({ id: 'a', fait: false, fait_le: '2026-07-17' }))).toBeNull();
    expect(horodatageTache(tache({ id: 'a', fait: true, fait_le: null }))).toBeNull();
  });

  it('crée une tâche vierge (case décochée, sans horodatage)', () => {
    const t = creerTache('menage', { fr: 'Ménage' }, 'Grand ménage');
    expect(t.fait).toBe(false);
    expect(t.fait_le).toBeNull();
    expect(t.custom_label).toBe('Grand ménage');
  });

  it('vérifie la complétude des libellés de la liste type', () => {
    expect(libellesComplets({ fr: 'a', en: 'b', es: 'c', de: 'd' })).toBe(true);
    expect(libellesComplets({ fr: 'a', en: 'b' })).toBe(false);
    expect(libellesComplets(undefined)).toBe(false);
    expect(TACHES_TYPES.every((t) => libellesComplets(t.labels))).toBe(true);
    expect(TACHES_TYPES.length).toBeGreaterThanOrEqual(4);
  });
});

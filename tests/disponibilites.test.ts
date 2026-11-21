import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  chargerDisponibilites,
  plagesDepuisJson,
  plagesRepli,
} from '../src/lib/disponibilites';
import { plagesDepuisSejours } from '../src/lib/calendrier';

describe('plagesDepuisSejours', () => {
  it('occupe les nuits du séjour, jour de départ exclu', () => {
    // Séjour « 10 → 17 » : nuits du 10 au 16 ; le 17 redevient réservable.
    expect(plagesDepuisSejours([{ arrivee: '2026-07-10', depart: '2026-07-17' }])).toEqual([
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' },
    ]);
  });

  it('traite une seule nuit', () => {
    expect(plagesDepuisSejours([{ arrivee: '2026-07-10', depart: '2026-07-11' }])).toEqual([
      { debut: '2026-07-10', fin: '2026-07-10', etat: 'occupe' },
    ]);
  });

  it('couvre tout un mois quand le séjour le chevauche entièrement', () => {
    expect(plagesDepuisSejours([{ arrivee: '2026-06-20', depart: '2026-08-01' }])).toEqual([
      { debut: '2026-06-20', fin: '2026-07-31', etat: 'occupe' },
    ]);
  });

  it('n’occupe rien quand le séjour se termine le 1er du mois', () => {
    expect(plagesDepuisSejours([{ arrivee: '2026-06-20', depart: '2026-07-01' }])).toEqual([
      { debut: '2026-06-20', fin: '2026-06-30', etat: 'occupe' },
    ]);
  });

  it('fusionne deux séjours contigus', () => {
    const plages = plagesDepuisSejours([
      { arrivee: '2026-07-10', depart: '2026-07-17' },
      { arrivee: '2026-07-17', depart: '2026-07-24' },
    ]);
    expect(plages).toEqual([{ debut: '2026-07-10', fin: '2026-07-23', etat: 'occupe' }]);
  });

  it('ignore les dates invalides, inversées ou manquantes', () => {
    expect(
      plagesDepuisSejours([
        { arrivee: '', depart: '' },
        { arrivee: 'pas-une-date', depart: '2026-07-10' },
        { arrivee: '2026-07-20', depart: '2026-07-10' }, // aucune nuit
        { arrivee: '2026-07-20', depart: '2026-07-10' },
        { arrivee: '2026-02-30', depart: '2026-03-05' }, // date inexistante
        { arrivee: '2026-07-10', depart: '2026-07-17' },
      ]),
    ).toEqual([{ debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' }]);
  });

  it('accepte une liste vide ou des lignes incomplètes', () => {
    expect(plagesDepuisSejours([])).toEqual([]);
    expect(plagesDepuisSejours([{}, { arrivee: null, depart: undefined } as never])).toEqual([]);
  });
});

describe('plagesDepuisJson (repli)', () => {
  it('ne bloque rien pour les mois « libre »', () => {
    expect(
      plagesDepuisJson({
        mois: [
          { mois: '2026-04', statut: 'libre' },
          { mois: '2026-05', statut: 'libre' },
        ],
      }),
    ).toEqual([]);
  });

  it('occupe tout le mois « reserve »', () => {
    expect(plagesDepuisJson({ mois: [{ mois: '2026-07', statut: 'reserve' }] })).toEqual([
      { debut: '2026-07-01', fin: '2026-07-31', etat: 'occupe' },
    ]);
  });

  it('marque « sur demande » tout le mois « partiel »', () => {
    expect(plagesDepuisJson({ mois: [{ mois: '2026-06', statut: 'partiel' }] })).toEqual([
      { debut: '2026-06-01', fin: '2026-06-30', etat: 'partiel' },
    ]);
  });

  it('gère les mois de 30 jours et février', () => {
    expect(plagesDepuisJson({ mois: [{ mois: '2026-04', statut: 'reserve' }] })).toEqual([
      { debut: '2026-04-01', fin: '2026-04-30', etat: 'occupe' },
    ]);
    expect(plagesDepuisJson({ mois: [{ mois: '2028-02', statut: 'reserve' }] })).toEqual([
      { debut: '2028-02-01', fin: '2028-02-29', etat: 'occupe' },
    ]);
  });

  it('ignore les mois mal formés et les statuts inconnus', () => {
    expect(
      plagesDepuisJson({
        mois: [
          { mois: '2026-13', statut: 'reserve' },
          { mois: '', statut: 'reserve' },
          { mois: '2026-07', statut: 'inconnu' },
        ],
      }),
    ).toEqual([]);
  });

  it('ne fusionne pas deux états différents', () => {
    expect(
      plagesDepuisJson({
        mois: [
          { mois: '2026-06', statut: 'reserve' },
          { mois: '2026-07', statut: 'partiel' },
        ],
      }),
    ).toEqual([
      { debut: '2026-06-01', fin: '2026-06-30', etat: 'occupe' },
      { debut: '2026-07-01', fin: '2026-07-31', etat: 'partiel' },
    ]);
  });
});

describe('plagesRepli (content/disponibilites.json)', () => {
  it('produit des plages cohérentes avec le fichier de repli', () => {
    expect(plagesRepli()).toEqual([
      { debut: '2026-06-01', fin: '2026-06-30', etat: 'partiel' },
      { debut: '2026-07-01', fin: '2026-08-31', etat: 'occupe' },
      { debut: '2026-12-01', fin: '2026-12-31', etat: 'partiel' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Repli et priorité Supabase
// ---------------------------------------------------------------------------

interface ReponseTable {
  data?: unknown;
  error?: unknown;
  throws?: boolean;
}

/**
 * Façonne un client Supabase minimal lisant DEUX tables (`sejours` et
 * `calendar_blocks`). Chaque table peut répondre, échouer (`error`) ou lever.
 */
function fauxClient(tables: Record<string, ReponseTable | Error>): SupabaseClient {
  return {
    from: (table: string) => ({
      select: () => {
        const reponse = tables[table];
        if (!reponse) return Promise.resolve({ data: null, error: { message: `relation "${table}" does not exist` } });
        if (reponse instanceof Error) return Promise.reject(reponse);
        if (reponse.throws) return Promise.reject(new Error('réseau indisponible'));
        return Promise.resolve({ data: reponse.data ?? null, error: reponse.error ?? null });
      },
    }),
  } as unknown as SupabaseClient;
}

/** Réponse standard : la table n'existe pas encore (migration non appliquée). */
const TABLE_ABSENTE: ReponseTable = { data: null, error: { message: 'relation does not exist' } };

describe('chargerDisponibilites', () => {
  it('retombe sur le JSON sans Supabase configuré', async () => {
    const res = await chargerDisponibilites({ configure: false, client: null });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual(plagesRepli());
  });

  it('retombe sur le JSON si aucun client n’est disponible', async () => {
    const res = await chargerDisponibilites({ configure: true, client: null });
    expect(res.source).toBe('json');
  });

  it('utilise les deux tables quand Supabase répond', async () => {
    const client = fauxClient({
      sejours: { data: [{ arrivee: '2026-07-10', depart: '2026-07-17' }], error: null },
      calendar_blocks: { data: [{ debut: '2026-08-03', fin: '2026-08-08' }], error: null },
    });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('supabase');
    expect(res.plages).toEqual([
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' },
      // Blocage : `fin` inclusive, donc le 8 août est bien bloqué.
      { debut: '2026-08-03', fin: '2026-08-08', etat: 'occupe' },
    ]);
  });

  it('garde les séjours quand calendar_blocks n’existe pas encore, et ajoute le repli', async () => {
    // Cas réel : 0011_calendar_blocks.sql pas encore appliquée. Une source est
    // illisible : on ne peut pas affirmer que le reste est libre, donc les
    // plages du repli statique (juin partiel, juillet-août occupés, décembre
    // partiel) s'ajoutent aux séjours réellement lus.
    const client = fauxClient({
      sejours: { data: [{ arrivee: '2026-07-10', depart: '2026-07-17' }], error: null },
      calendar_blocks: TABLE_ABSENTE,
    });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual([
      { debut: '2026-06-01', fin: '2026-06-30', etat: 'partiel' },
      { debut: '2026-07-01', fin: '2026-08-31', etat: 'occupe' },
      { debut: '2026-12-01', fin: '2026-12-31', etat: 'partiel' },
    ]);
  });

  it('garde les blocages quand sejours n’existe pas encore, et ajoute le repli', async () => {
    const client = fauxClient({
      sejours: TABLE_ABSENTE,
      calendar_blocks: { data: [{ debut: '2026-03-03', fin: '2026-03-08' }], error: null },
    });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual([
      { debut: '2026-03-03', fin: '2026-03-08', etat: 'occupe' },
      { debut: '2026-06-01', fin: '2026-06-30', etat: 'partiel' },
      { debut: '2026-07-01', fin: '2026-08-31', etat: 'occupe' },
      { debut: '2026-12-01', fin: '2026-12-31', etat: 'partiel' },
    ]);
  });

  it('ne conclut jamais « libre » quand sejours échoue et calendar_blocks est vide', async () => {
    // Le défaut corrigé : avant, cette combinaison renvoyait `supabase` + `[]`,
    // c'est-à-dire « tout est libre », alors que juillet et août sont réservés.
    const client = fauxClient({
      sejours: new Error('réseau'),
      calendar_blocks: { data: [], error: null },
    });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual(plagesRepli());
    expect(res.plages).not.toEqual([]);
  });

  it('retombe sur le JSON quand les deux tables sont absentes', async () => {
    const client = fauxClient({ sejours: TABLE_ABSENTE, calendar_blocks: TABLE_ABSENTE });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual(plagesRepli());
  });

  it('retombe sur le JSON quand les deux requêtes lèvent une exception', async () => {
    const client = fauxClient({ sejours: new Error('réseau'), calendar_blocks: new Error('réseau') });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual(plagesRepli());
  });

  it('une liste vide sur les deux tables signifie « tout libre » (pas de repli JSON)', async () => {
    // Supabase est joignable et les tables existent : on leur fait confiance,
    // même si rien n'est encore saisi dans le back office.
    const client = fauxClient({
      sejours: { data: [], error: null },
      calendar_blocks: { data: [], error: null },
    });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('supabase');
    expect(res.plages).toEqual([]);
  });
});

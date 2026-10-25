import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  chargerDisponibilites,
  plagesDepuisJson,
  plagesDepuisSejours,
  plagesRepli,
} from '../src/lib/disponibilites';

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

/** Façonne un client Supabase minimal : `from('sejours').select(...)` suffit. */
function fauxClient(reponse: { data: unknown; error: unknown } | Error): SupabaseClient {
  const erreur = reponse instanceof Error ? reponse : null;
  const valeur = reponse instanceof Error ? { data: null, error: { message: 'erreur' } } : reponse;
  return {
    from: () => ({
      select: () => (erreur ? Promise.reject(erreur) : Promise.resolve(valeur)),
    }),
  } as unknown as SupabaseClient;
}

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

  it('utilise la table sejours quand Supabase répond', async () => {
    const client = fauxClient({
      data: [{ arrivee: '2026-07-10', depart: '2026-07-17' }],
      error: null,
    });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('supabase');
    expect(res.plages).toEqual([{ debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' }]);
  });

  it('retombe sur le JSON quand la table sejours n’existe pas encore', async () => {
    // Cas réel : migrations/0003_sejours.sql pas encore appliquée sur le projet.
    const client = fauxClient({ data: null, error: { message: 'relation "sejours" does not exist' } });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual(plagesRepli());
  });

  it('retombe sur le JSON quand la requête lève une exception', async () => {
    const res = await chargerDisponibilites({
      configure: true,
      client: fauxClient(new Error('réseau indisponible')),
    });
    expect(res.source).toBe('json');
    expect(res.plages).toEqual(plagesRepli());
  });

  it('retombe sur le JSON quand la réponse ne contient pas de données', async () => {
    const res = await chargerDisponibilites({ configure: true, client: fauxClient({ data: null, error: null }) });
    expect(res.source).toBe('json');
  });

  it('une liste de séjours vide signifie « tout libre » (pas de repli JSON)', async () => {
    // Supabase est joignable et la table existe : on lui fait confiance,
    // même si aucun séjour n'est encore saisi dans le back office.
    const client = fauxClient({ data: [], error: null });
    const res = await chargerDisponibilites({ configure: true, client });
    expect(res.source).toBe('supabase');
    expect(res.plages).toEqual([]);
  });
});

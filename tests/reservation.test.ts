import { describe, expect, it } from 'vitest';
import {
  STATUTS_HERITES,
  STATUTS_LOCATAIRE,
  STATUTS_UNIFIES,
  estReservationAutorisee,
  sejourDepuisBooking,
  statutUnifie,
  type BookingHerite,
} from '../supabase/functions/_shared/reservation';

/**
 * Règle partagée par les quatre Edge Functions locataire.
 *
 * Le piège que ces tests verrouillent : les fonctions comparaient le statut à
 * `['confirmee', 'terminee']` (vocabulaire de `bookings`). Après la fusion
 * dans `sejours`, cette comparaison ne correspond plus à rien et l'état des
 * lieux casserait silencieusement. Une seule règle, testée ici, évite la
 * divergence entre `tenant-upload`, `generate-pdf`, `send-email` et
 * `purge-tenant-data`.
 */

const booking = (patch: Partial<BookingHerite> = {}): BookingHerite => ({
  id: '11111111-2222-3333-4444-555555555555',
  created_at: '2026-06-01T10:00:00Z',
  check_in: '2026-07-10',
  check_out: '2026-07-17',
  guests: 3,
  nom: 'Dupont',
  email: 'dupont@example.com',
  telephone: '0600000000',
  message: 'Bonjour',
  packs: [{ id: 'p1', slug: 'velo', nom: 'Vélos', prix: 45, unite: 'par_personne', quantite: 2 }],
  total_estime: 1250,
  statut: 'demande',
  historique: [],
  lang: 'fr',
  ...patch,
});

describe('autorisation locataire', () => {
  it('accepte les statuts unifiés confirmé et terminé', () => {
    expect(estReservationAutorisee('confirme')).toBe(true);
    expect(estReservationAutorisee('termine')).toBe(true);
  });

  it('refuse une demande, une option et une annulation', () => {
    expect(estReservationAutorisee('demande')).toBe(false);
    expect(estReservationAutorisee('option')).toBe(false);
    expect(estReservationAutorisee('annule')).toBe(false);
  });

  it("refuse l'ancien vocabulaire de bookings (piège historique)", () => {
    // Ces valeurs ne doivent plus jamais ouvrir l'espace locataire : elles
    // n'existent plus dans `sejours`, et les accepter masquerait une
    // régression de la migration.
    expect(estReservationAutorisee('confirmee')).toBe(false);
    expect(estReservationAutorisee('terminee')).toBe(false);
    expect(estReservationAutorisee('annulee')).toBe(false);
  });

  it('refuse une valeur absente ou vide', () => {
    expect(estReservationAutorisee(null)).toBe(false);
    expect(estReservationAutorisee(undefined)).toBe(false);
    expect(estReservationAutorisee('')).toBe(false);
  });

  it('la liste autorisée est exactement confirme et termine', () => {
    expect([...STATUTS_LOCATAIRE]).toEqual(['confirme', 'termine']);
  });
});

describe('vocabulaire unifié', () => {
  it('expose les cinq statuts du cycle de vie', () => {
    expect([...STATUTS_UNIFIES]).toEqual(['demande', 'option', 'confirme', 'annule', 'termine']);
  });

  it('traduit les statuts hérités de bookings', () => {
    expect(statutUnifie('demande')).toBe('demande');
    expect(statutUnifie('confirmee')).toBe('confirme');
    expect(statutUnifie('annulee')).toBe('annule');
    expect(statutUnifie('terminee')).toBe('termine');
  });

  it('accepte le vocabulaire de sejours (idempotence)', () => {
    expect(statutUnifie('option')).toBe('option');
    expect(statutUnifie('confirme')).toBe('confirme');
    expect(statutUnifie('annule')).toBe('annule');
    expect(statutUnifie('termine')).toBe('termine');
  });

  it('ramène une valeur inconnue à demande (jamais bloquante)', () => {
    expect(statutUnifie('brouillon')).toBe('demande');
    expect(statutUnifie('')).toBe('demande');
    expect(statutUnifie(null)).toBe('demande');
    expect(statutUnifie(undefined)).toBe('demande');
  });

  it('la table de correspondance couvre tout le vocabulaire hérité', () => {
    for (const statut of ['demande', 'confirmee', 'annulee', 'terminee']) {
      expect(STATUTS_HERITES[statut]).toBeDefined();
    }
  });
});

describe('sejourDepuisBooking — migration sans perte', () => {
  it('conserve l’identifiant (les liens locataire restent valides)', () => {
    expect(sejourDepuisBooking(booking()).id).toBe(booking().id);
  });

  it('renomme les colonnes sans perdre de valeur', () => {
    const sejour = sejourDepuisBooking(booking());
    expect(sejour.arrivee).toBe('2026-07-10');
    expect(sejour.depart).toBe('2026-07-17');
    expect(sejour.client_nom).toBe('Dupont');
    expect(sejour.client_email).toBe('dupont@example.com');
    expect(sejour.client_telephone).toBe('0600000000');
    expect(sejour.client_message).toBe('Bonjour');
    expect(sejour.lang).toBe('fr');
    expect(sejour.created_at).toBe('2026-06-01T10:00:00Z');
  });

  it('reporte le nombre de personnes sur personnes ET adultes', () => {
    const sejour = sejourDepuisBooking(booking({ guests: 4 }));
    expect(sejour.personnes).toBe(4);
    expect(sejour.adultes).toBe(4);
    expect(sejour.mineurs).toBe(0);
  });

  it('reporte le prix estimé sans inventer de prix négocié', () => {
    const sejour = sejourDepuisBooking(booking({ total_estime: 1250 }));
    expect(sejour.prix_estime).toBe(1250);
    // `prix_total` n'est pas repris : il se négocie, il ne se déduit pas.
    expect('prix_total' in sejour).toBe(false);
  });

  it('conserve les options et l’historique', () => {
    const packs = [{ id: 'p1', slug: 'velo', nom: 'Vélos', prix: 45, unite: 'par_personne', quantite: 2 }];
    const historique = [{ at: '2026-06-02T10:00:00Z', by: 'admin', action: 'statut' }];
    const sejour = sejourDepuisBooking(booking({ packs, historique }));
    expect(sejour.packs).toEqual(packs);
    expect(sejour.historique).toEqual(historique);
  });

  it('marque la provenance import', () => {
    expect(sejourDepuisBooking(booking()).origine).toBe('import');
  });

  it('traduit le statut dans le vocabulaire unifié', () => {
    expect(sejourDepuisBooking(booking({ statut: 'demande' })).statut).toBe('demande');
    expect(sejourDepuisBooking(booking({ statut: 'confirmee' })).statut).toBe('confirme');
    expect(sejourDepuisBooking(booking({ statut: 'annulee' })).statut).toBe('annule');
    expect(sejourDepuisBooking(booking({ statut: 'terminee' })).statut).toBe('termine');
  });

  it('n’ajoute aucune note quand les dates sont cohérentes', () => {
    expect(sejourDepuisBooking(booking()).note).toBeNull();
  });

  it('ramène une plage incohérente à une nuit et conserve les dates d’origine', () => {
    const sejour = sejourDepuisBooking(booking({ check_in: '2026-07-10', check_out: '2026-07-10' }));
    expect(sejour.arrivee).toBe('2026-07-10');
    expect(sejour.depart).toBe('2026-07-11');
    expect(sejour.note).toContain('2026-07-10');
    expect(sejour.note).toContain('dates incohérentes');
  });

  it('traite aussi une plage inversée', () => {
    const sejour = sejourDepuisBooking(booking({ check_in: '2026-07-20', check_out: '2026-07-10' }));
    expect(sejour.depart).toBe('2026-07-21');
    expect(sejour.note).toContain('2026-07-20');
    expect(sejour.note).toContain('2026-07-10');
  });

  it('remplit les valeurs absentes par des valeurs sûres', () => {
    const sejour = sejourDepuisBooking(booking({
      telephone: undefined,
      message: null,
      packs: undefined,
      total_estime: null,
      historique: undefined,
      lang: null,
    }));
    expect(sejour.client_telephone).toBeNull();
    expect(sejour.client_message).toBeNull();
    expect(sejour.packs).toEqual([]);
    expect(sejour.prix_estime).toBeNull();
    expect(sejour.historique).toEqual([]);
    expect(sejour.lang).toBeNull();
  });

  it('est idempotent : deux passages donnent le même séjour', () => {
    const b = booking();
    expect(sejourDepuisBooking(b)).toEqual(sejourDepuisBooking(b));
  });
});

import { describe, expect, it } from 'vitest';
import {
  CODES_MIGRATION,
  diagnostiquerEnvoi,
  lienMailtoRepli,
  messageEchecEnvoi,
  type TextesEchecEnvoi,
} from '../src/lib/diagnostic-envoi';

/**
 * Diagnostic d'échec du formulaire `/reserver/`.
 *
 * Le 2026-11-25, une demande envoyée en production échouait sur
 * `PGRST204: Could not find the 'adultes' column of 'sejours' in the schema
 * cache`, et le visiteur ne voyait que « L'envoi a échoué ». Ces tests
 * verrouillent la classification des causes et le contrat de repli :
 *
 *   - une base non migrée est reconnue (code OU message) ;
 *   - une coupure réseau est reconnue ;
 *   - le reste tombe dans « inconnu », jamais dans un message trompeur ;
 *   - sans adresse de contact valide, aucun message ne promet un email ;
 *   - le lien `mailto:` de repli reprend les dates et les voyageurs.
 */

const TEXTES: TextesEchecEnvoi = {
  migration: 'maintenance : écrivez-nous à {email}',
  migrationSansEmail: 'maintenance : réessayez plus tard',
  reseau: 'connexion interrompue : écrivez-nous à {email}',
  reseauSansEmail: 'connexion interrompue : réessayez',
  inconnu: 'échec : écrivez-nous à {email}',
  inconnuSansEmail: 'échec : réessayez',
};

describe('diagnostiquerEnvoi — base non migrée', () => {
  it('reconnaît les codes PostgREST et PostgreSQL attendus', () => {
    for (const code of ['PGRST204', 'PGRST205', '42501', '42703', '42P01']) {
      const diagnostic = diagnostiquerEnvoi({ code, message: 'peu importe' });
      expect(diagnostic.cause, code).toBe('migration');
      expect(diagnostic.code).toBe(code);
    }
  });

  it('couvre la liste complète des codes de migration', () => {
    expect(CODES_MIGRATION).toContain('PGRST204'); // colonne absente
    expect(CODES_MIGRATION).toContain('PGRST205'); // table absente
    expect(CODES_MIGRATION).toContain('42501'); // permission denied
  });

  it('reconnaît le message exact de la production', () => {
    const diagnostic = diagnostiquerEnvoi({
      code: 'PGRST204',
      message:
        "Could not find the 'adultes' column of 'sejours' in the schema cache",
    });
    expect(diagnostic.cause).toBe('migration');
    expect(diagnostic.technique).toContain('adultes');
  });

  it('reconnaît « permission denied » même sans code', () => {
    expect(
      diagnostiquerEnvoi({ message: 'permission denied for table sejours' }).cause,
    ).toBe('migration');
  });

  it('reconnaît « relation does not exist » sans code', () => {
    expect(
      diagnostiquerEnvoi({ message: 'relation "public.calendar_blocks" does not exist' })
        .cause,
    ).toBe('migration');
  });

  it('privilégie le code sur un message réseau trompeur', () => {
    // PostgREST renvoie parfois un habillage « fetch » pour une réponse 4xx
    // dont le corps est illisible : le code reste la source fiable.
    const diagnostic = diagnostiquerEnvoi({
      code: '42501',
      message: 'Failed to fetch',
    });
    expect(diagnostic.cause).toBe('migration');
  });
});

describe('diagnostiquerEnvoi — réseau', () => {
  it('reconnaît les erreurs de fetch du navigateur', () => {
    for (const message of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'fetch failed',
      'The operation timed out',
    ]) {
      expect(diagnostiquerEnvoi({ message }).cause, message).toBe('reseau');
    }
  });

  it('reconnaît les codes système', () => {
    for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND']) {
      expect(diagnostiquerEnvoi({ code }).cause, code).toBe('reseau');
    }
  });

  it('accepte une TypeError brute (navigateur hors ligne)', () => {
    const erreur = new TypeError('Failed to fetch');
    expect(diagnostiquerEnvoi(erreur).cause).toBe('reseau');
  });
});

describe('diagnostiquerEnvoi — cas inconnus', () => {
  it('classe le reste en « inconnu » sans lever', () => {
    for (const valeur of [
      { code: '23514', message: 'new row violates check constraint' },
      { message: 'invalid input syntax' },
      null,
      undefined,
      '',
      42,
      {},
    ]) {
      const diagnostic = diagnostiquerEnvoi(valeur);
      expect(diagnostic.cause, JSON.stringify(valeur)).toBe('inconnu');
      expect(typeof diagnostic.technique).toBe('string');
    }
  });

  it('accepte une erreur qui n’a que des champs secondaires', () => {
    const diagnostic = diagnostiquerEnvoi({ details: 'column "packs" does not exist' });
    expect(diagnostic.cause).toBe('migration');
  });
});

describe('messageEchecEnvoi — texte montré au visiteur', () => {
  it('substitue l’adresse quand elle est utilisable', () => {
    expect(messageEchecEnvoi('migration', TEXTES, 'vrai@gruissan-cozy.fr')).toBe(
      'maintenance : écrivez-nous à vrai@gruissan-cozy.fr',
    );
    expect(messageEchecEnvoi('reseau', TEXTES, 'vrai@gruissan-cozy.fr')).toContain(
      'vrai@gruissan-cozy.fr',
    );
    expect(messageEchecEnvoi('inconnu', TEXTES, 'vrai@gruissan-cozy.fr')).toContain(
      'vrai@gruissan-cozy.fr',
    );
  });

  it('ne promet aucun email sans adresse utilisable', () => {
    for (const cause of ['migration', 'reseau', 'inconnu'] as const) {
      for (const email of ['', '   ']) {
        const message = messageEchecEnvoi(cause, TEXTES, email);
        expect(message, `${cause}/${email}`).not.toContain('{email}');
        expect(message, `${cause}/${email}`).not.toContain('@');
      }
    }
  });

  it('n’expose jamais un code technique dans le message', () => {
    for (const cause of ['migration', 'reseau', 'inconnu'] as const) {
      const message = messageEchecEnvoi(cause, TEXTES, 'vrai@gruissan-cozy.fr');
      expect(message).not.toMatch(/PGRST|42\d{3}|schema cache|permission denied/i);
    }
  });
});

describe('lienMailtoRepli — ne pas perdre la demande', () => {
  it('renvoie null sans adresse utilisable', () => {
    expect(lienMailtoRepli('')).toBeNull();
    expect(lienMailtoRepli('   ')).toBeNull();
  });

  it('pré-remplit les dates et les voyageurs', () => {
    const lien = lienMailtoRepli('vrai@gruissan-cozy.fr', {
      arrivee: '2026-08-01',
      depart: '2026-08-08',
      adultes: 2,
      mineurs: 1,
    });
    expect(lien).not.toBeNull();
    expect(lien!.startsWith('mailto:vrai@gruissan-cozy.fr?')).toBe(true);
    const corps = decodeURIComponent(lien!.split('&body=')[1] ?? '');
    expect(corps).toContain('2026-08-01 → 2026-08-08');
    expect(corps).toContain('2 adulte(s), 1 mineur(s)');
  });

  it('échappe les caractères réservés (message libre du visiteur)', () => {
    const lien = lienMailtoRepli('vrai@gruissan-cozy.fr', {
      message: 'Bonjour & merci ? #1',
    });
    expect(lien).toContain('%26');
    expect(decodeURIComponent(lien!)).toContain('Bonjour & merci ? #1');
  });

  it('reste valide sans détail de séjour', () => {
    const lien = lienMailtoRepli('vrai@gruissan-cozy.fr');
    expect(lien).toContain('mailto:vrai@gruissan-cozy.fr');
    expect(decodeURIComponent(lien!)).toContain('Demande de réservation');
  });
});

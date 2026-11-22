import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  JETON_OCTETS,
  JOURS_MAX_APRES_DEPART,
  STATUTS_LIEN,
  ajouterJours,
  dateExpirationMaximale,
  dateExpirationParDefaut,
  expirationAcceptee,
  expirationMaximale,
  expirationParDefaut,
  genererJeton,
  instantParis,
  jetonValide,
  sessionActive,
  sessionPublique,
  statutAccepteLien,
} from '../supabase/functions/_shared/lien';
import { construireLienLocataire } from '../src/lib/lien-locataire';
import { STATUTS_LOCATAIRE } from '../supabase/functions/_shared/reservation';

const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string): string => readFileSync(join(ROOT, chemin), 'utf8');

describe('statut d’un séjour qui peut recevoir un lien', () => {
  it('accepte un séjour confirmé ou terminé', () => {
    expect(statutAccepteLien('confirme')).toBe(true);
    expect(statutAccepteLien('termine')).toBe(true);
  });

  it('refuse une demande, une option, un séjour annulé ou un statut absent', () => {
    for (const statut of ['demande', 'option', 'annule', null, undefined, '', 'inconnu']) {
      expect(statutAccepteLien(statut), String(statut)).toBe(false);
    }
  });

  it('reste aligné sur les statuts locataire des Edge Functions', () => {
    expect([...STATUTS_LIEN]).toEqual([...STATUTS_LOCATAIRE]);
  });
});

describe('calcul de l’expiration', () => {
  it('ajoute des jours à une date ISO sans fuseau', () => {
    expect(ajouterJours('2026-07-10', 1)).toBe('2026-07-11');
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('expire le lendemain du départ à midi, heure de Paris (heure d’été)', () => {
    // 11 juillet 2026 : CEST (UTC+2) → 12 h Paris = 10 h UTC.
    expect(expirationParDefaut('2026-07-10').toISOString()).toBe('2026-07-11T10:00:00.000Z');
  });

  it('expire le lendemain du départ à midi, heure de Paris (heure d’hiver)', () => {
    // 11 janvier 2026 : CET (UTC+1) → 12 h Paris = 11 h UTC.
    expect(expirationParDefaut('2026-01-10').toISOString()).toBe('2026-01-11T11:00:00.000Z');
  });

  it('gère le changement d’heure entre le départ et l’expiration', () => {
    // Départ le 24 octobre 2026 (CEST), lendemain 25 octobre : passage à CET.
    expect(instantParis('2026-10-25', 12).toISOString()).toBe('2026-10-25T11:00:00.000Z');
    expect(instantParis('2026-03-29', 12).toISOString()).toBe('2026-03-29T10:00:00.000Z');
  });

  it('expose les dates de repli et la limite de 30 jours pour le formulaire', () => {
    expect(dateExpirationParDefaut('2026-07-10')).toBe('2026-07-11');
    expect(dateExpirationMaximale('2026-07-10')).toBe('2026-08-09');
    expect(JOURS_MAX_APRES_DEPART).toBe(30);
    expect(expirationMaximale('2026-07-10').toISOString()).toBe('2026-08-09T10:00:00.000Z');
  });

  it('refuse une expiration illisible, passée ou au-delà de 30 jours', () => {
    const maintenant = new Date('2026-07-01T00:00:00Z');
    expect(expirationAcceptee('2026-07-10', '2026-07-11T10:00:00Z', maintenant)).toBe(true);
    expect(expirationAcceptee('2026-07-10', '2026-08-09T10:00:00Z', maintenant)).toBe(true);
    expect(expirationAcceptee('2026-07-10', '2026-08-10T10:00:00Z', maintenant)).toBe(false);
    expect(expirationAcceptee('2026-07-10', '2026-06-30T10:00:00Z', maintenant)).toBe(false);
    expect(expirationAcceptee('2026-07-10', null, maintenant)).toBe(false);
    expect(expirationAcceptee('2026-07-10', 'pas-une-date', maintenant)).toBe(false);
  });

  it('distingue une session active d’une session expirée', () => {
    const maintenant = new Date('2026-07-11T09:00:00Z');
    expect(sessionActive('2026-07-11T10:00:00Z', maintenant)).toBe(true);
    expect(sessionActive('2026-07-11T08:00:00Z', maintenant)).toBe(false);
    expect(sessionActive(null, maintenant)).toBe(false);
    expect(sessionActive('pas-une-date', maintenant)).toBe(false);
  });
});

describe('jeton d’accès', () => {
  it('produit 64 caractères hexadécimaux (32 octets)', () => {
    const jeton = genererJeton();
    expect(jeton).toMatch(/^[0-9a-f]{64}$/);
    expect(JETON_OCTETS).toBe(32);
    expect(jetonValide(jeton)).toBe(true);
  });

  it('ne répète jamais le même jeton', () => {
    const jetons = new Set(Array.from({ length: 50 }, () => genererJeton()));
    expect(jetons.size).toBe(50);
  });

  it('n’accepte que la forme attendue en base', () => {
    expect(jetonValide(genererJeton())).toBe(true);
    expect(jetonValide('abc')).toBe(false);
    expect(jetonValide('Z'.repeat(64))).toBe(false);
    expect(jetonValide(null)).toBe(false);
    expect(jetonValide(undefined)).toBe(false);
  });

  it('n’est jamais dérivé d’une donnée du séjour (identifiant, email)', () => {
    // Le générateur ne reçoit que le tableau d'octets à remplir : aucune
    // graine issue du séjour ne peut l'influencer.
    let recu: Uint8Array | null = null;
    genererJeton((octets) => {
      recu = octets;
      return octets.fill(1);
    });
    expect(recu).not.toBeNull();
    expect((recu as unknown as Uint8Array).length).toBe(JETON_OCTETS);
  });
});

describe('session renvoyée à l’administrateur', () => {
  const session = { id: 's1', reservation_id: 'r1', expires_at: '2026-07-11T10:00:00Z', token: 'a'.repeat(64) };

  it('affiche le jeton tant que la session est active', () => {
    const vue = sessionPublique(session, new Date('2026-07-10T12:00:00Z'));
    expect(vue.active).toBe(true);
    expect(vue.token).toBe('a'.repeat(64));
  });

  it('masque le jeton d’une session expirée', () => {
    const vue = sessionPublique(session, new Date('2026-07-12T12:00:00Z'));
    expect(vue.active).toBe(false);
    expect(vue.token).toBeUndefined();
    expect(vue.expires_at).toBe('2026-07-11T10:00:00Z');
  });
});

describe('URL du lien locataire', () => {
  it('construit l’adresse avec la langue du séjour', () => {
    const jeton = 'b'.repeat(64);
    expect(construireLienLocataire('/gruissan-location/', jeton, 'en'))
      .toBe(`/gruissan-location/tenant/?lang=en&token=${jeton}`);
  });

  it('retombe sur le français pour une langue inconnue ou absente', () => {
    const jeton = 'c'.repeat(64);
    expect(construireLienLocataire('/gruissan-location/', jeton, 'xx'))
      .toBe(`/gruissan-location/tenant/?lang=fr&token=${jeton}`);
    expect(construireLienLocataire('/gruissan-location/', jeton, null))
      .toBe(`/gruissan-location/tenant/?lang=fr&token=${jeton}`);
  });

  it('ajoute la barre oblique de base et encode le jeton', () => {
    expect(construireLienLocataire('/site', 'a+b/c', 'fr')).toBe('/site/tenant/?lang=fr&token=a%2Bb%2Fc');
  });
});

describe('Edge Function tenant-link', () => {
  const source = lire('supabase/functions/tenant-link/index.ts');

  it('réutilise les règles pures du module partagé', () => {
    expect(source).toContain("from '../_shared/lien.ts'");
    expect(source).toContain('statutAccepteLien(');
    expect(source).toContain('genererJeton(');
    expect(source).toContain('expirationAcceptee(');
  });

  it('réserve l’action au propriétaire identifié par son JWT', () => {
    expect(source).toContain('auth.getUser(');
    expect(source).toContain('ADMIN_EMAIL');
  });

  it('ne journalise jamais le jeton', () => {
    const appelsConsole = source.match(/console\.[a-z]+\([\s\S]*?\);/g) ?? [];
    expect(appelsConsole.length).toBeGreaterThan(0);
    for (const appel of appelsConsole) {
      expect(appel).not.toMatch(/token/);
      expect(appel).not.toMatch(/expires_at/);
    }
  });

  it('ne renvoie pas de redirection et ne fabrique pas d’URL côté serveur', () => {
    expect(source).not.toMatch(/Response\.redirect/);
    expect(source).not.toContain('tenant/?lang=');
  });
});

describe('migration 0012 — lien locataire', () => {
  const sql = lire('migrations/0012_tenant_links.sql');

  it('autorise un séjour sans email à recevoir un lien', () => {
    expect(sql).toMatch(/alter column email drop not null/i);
  });

  it('révoque le lien quand le séjour passe à annulé', () => {
    expect(sql).toContain("new.statut = 'annule'");
    expect(sql).toMatch(/delete from public\.tenant_sessions/i);
    expect(sql).toMatch(/create trigger/i);
  });

  it('est idempotente', () => {
    expect(sql).toMatch(/create or replace function/i);
    expect(sql).toMatch(/drop trigger if exists/i);
  });

  it('ne supprime ni n’affaiblit la politique admin', () => {
    expect(sql).not.toMatch(/drop policy/i);
    expect(sql).not.toMatch(/revoke/i);
  });
});

describe('page /admin/sejours — bouton « lien locataire »', () => {
  const page = lire('src/pages/admin/sejours.astro');

  it('appelle l’Edge Function et construit l’URL côté client', () => {
    expect(page).toContain("functions.invoke('tenant-link'");
    expect(page).toContain('construireLienLocataire(');
  });

  it('n’écrit aucun jeton dans le HTML servi', () => {
    // Le jeton n'existe qu'à l'exécution, jamais dans le rendu statique.
    expect(page).not.toMatch(/[0-9a-f]{64}/);
    expect(page).not.toContain('token=');
  });

  it('propose copie, modification d’expiration et révocation', () => {
    expect(page).toContain("AT['sejours.linkCopy']");
    expect(page).toContain("AT['sejours.linkSaveExpiry']");
    expect(page).toContain("AT['sejours.linkRevoke']");
    expect(page).toContain('navigator.clipboard');
  });
});

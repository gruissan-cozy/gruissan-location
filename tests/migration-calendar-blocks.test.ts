import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Contrôles statiques de migrations/0011_calendar_blocks.sql.
//
// La migration n'est pas exécutée par les tests (pas de PostgreSQL en CI) :
// on vérifie ici les invariants qui, s'ils disparaissaient, casseraient
// silencieusement le calendrier ou la sécurité.

const SQL = readFileSync(
  new URL('../migrations/0011_calendar_blocks.sql', import.meta.url).pathname,
  'utf8',
);

/** Retire les commentaires SQL pour ne tester que le code exécutable. */
const CODE = SQL.replace(/--[^\n]*/g, '');

describe('migration 0011 — table calendar_blocks', () => {
  it('crée la table de façon idempotente', () => {
    expect(CODE).toMatch(/create table if not exists public\.calendar_blocks/i);
  });

  it('déclare les colonnes attendues', () => {
    for (const colonne of ['id uuid primary key', 'created_at', 'debut date not null', 'fin date not null', 'source text', 'external_uid text', 'note text']) {
      expect(CODE, `colonne manquante : ${colonne}`).toContain(colonne);
    }
  });

  it('impose fin >= debut', () => {
    expect(CODE).toMatch(/check\s*\(\s*fin\s*>=\s*debut\s*\)/i);
  });

  it('borne source à direct / airbnb / booking, avec direct par défaut', () => {
    expect(CODE).toMatch(/source text not null default 'direct'/i);
    expect(CODE).toMatch(/check\s*\(\s*source in \('direct', 'airbnb', 'booking'\)\s*\)/i);
  });

  it('crée un index unique PARTIEL sur (source, external_uid)', () => {
    // Sans le `where external_uid is not null`, deux blocages manuels (NULL)
    // seraient refusés : PostgreSQL considère deux NULL égaux dans un index unique.
    expect(CODE).toMatch(
      /create unique index if not exists calendar_blocks_external_uid_uidx\s+on public\.calendar_blocks \(source, external_uid\)\s+where external_uid is not null/i,
    );
  });

  it('n’ajoute AUCUNE clé étrangère (blocage indépendant des réservations)', () => {
    expect(CODE).not.toMatch(/references\s+public\.sejours/i);
    expect(CODE).not.toMatch(/foreign key/i);
  });
});

describe('migration 0011 — sécurité (RLS)', () => {
  it('active la RLS', () => {
    expect(CODE).toMatch(/alter table public\.calendar_blocks enable row level security/i);
  });

  it('réserve tous les droits à l’admin par email', () => {
    expect(CODE).toMatch(/create policy "admin_all_calendar_blocks" on public\.calendar_blocks/i);
    expect(CODE).toMatch(/auth\.jwt\(\)\s*->>\s*'email'\s*=\s*'gruissancozy@gmail\.com'/i);
  });

  it('ne laisse au public que la lecture, via un GRANT de colonnes', () => {
    expect(CODE).toMatch(/revoke all on public\.calendar_blocks from anon/i);
    expect(CODE).toMatch(/grant select \(debut, fin\) on public\.calendar_blocks to anon/i);
    // `note` et `external_uid` ne doivent jamais figurer dans le GRANT public.
    expect(CODE).not.toMatch(/grant select \([^)]*note[^)]*\) on public\.calendar_blocks to anon/i);
    expect(CODE).not.toMatch(/grant select \([^)]*external_uid[^)]*\) on public\.calendar_blocks to anon/i);
  });
});

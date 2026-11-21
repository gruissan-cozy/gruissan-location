import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde sur la migration de fusion `bookings` → `sejours` (0011).
 *
 * Le fichier SQL n'est pas exécuté par Vitest (il s'applique à la main dans
 * le SQL Editor Supabase). On vérifie donc les invariants qui, s'ils
 * disparaissaient, casseraient la production ou affaibliraient la sécurité :
 *
 *   - idempotence (relançable sans effet de bord) ;
 *   - statut `demande` ajouté au domaine ;
 *   - reprise des lignes de `bookings` sans perte d'identifiant ;
 *   - RLS publique INCHANGÉE (dates seules, séjours bloquants seulement) ;
 *   - `bookings` en lecture seule, jamais supprimée dans cette tâche.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const sql = readFileSync(join(ROOT, 'migrations/0011_unifier_bookings_sejours.sql'), 'utf8');

describe('migration 0011 — idempotence', () => {
  it('ajoute les colonnes avec `if not exists`', () => {
    const ajouts = sql.match(/add column[^,;]*/g) ?? [];
    expect(ajouts.length).toBeGreaterThan(0);
    for (const ajout of ajouts) {
      expect(ajout, ajout).toMatch(/add column if not exists/);
    }
  });

  it('garde les contraintes derrière un test d’existence', () => {
    expect(sql).toContain('conname = \'sejours_statut_check\'');
    expect(sql).toMatch(/not exists \(\s*select 1 from pg_constraint/);
  });

  it('crée les index avec `if not exists`', () => {
    for (const index of sql.match(/create index[^;]*/g) ?? []) {
      expect(index).toMatch(/create index if not exists/);
    }
  });

  it('reprend les lignes avec `on conflict (id) do nothing`', () => {
    const inserts = sql.match(/insert into public\.sejours[\s\S]*?on conflict \(id\) do nothing;/g) ?? [];
    expect(inserts).toHaveLength(2);
  });
});

describe('migration 0011 — cycle de vie', () => {
  it('ajoute demande au domaine de statut', () => {
    expect(sql).toMatch(/check \(statut in \('demande', 'option', 'confirme', 'annule', 'termine'\)\)/);
  });

  it('retire l’ancienne contrainte avant de recréer', () => {
    expect(sql).toContain('alter table public.sejours drop constraint if exists');
  });

  it('traduit les quatre statuts hérités', () => {
    expect(sql).toContain("when 'confirmee' then 'confirme'");
    expect(sql).toContain("when 'annulee'   then 'annule'");
    expect(sql).toContain("when 'terminee'  then 'termine'");
    expect(sql).toMatch(/else 'demande'/);
  });
});

describe('migration 0011 — reprise sans perte', () => {
  it('conserve l’identifiant des lignes bookings', () => {
    expect(sql).toMatch(/insert into public\.sejours \(\s*id,/);
    expect(sql).toMatch(/select\s+b\.id,/);
  });

  it('reprend les coordonnées, options, prix et historique', () => {
    for (const colonne of ['client_message', 'packs', 'prix_estime', 'historique', 'lang']) {
      expect(sql).toContain(colonne);
    }
    expect(sql).toContain('b.nom');
    expect(sql).toContain('b.email');
    expect(sql).toContain('b.telephone');
    expect(sql).toContain('b.total_estime');
  });

  it('traite les lignes dégénérées sans les perdre', () => {
    expect(sql).toContain('where b.check_out <= b.check_in');
    expect(sql).toContain("b.check_in + 1");
    expect(sql).toContain('dates incohérentes');
  });

  it('reporte le nombre de personnes sur personnes et adultes', () => {
    expect(sql).toMatch(/b\.guests,\s*b\.guests,\s*0,/);
  });
});

describe('migration 0011 — liens locataire', () => {
  it('rebase les clés étrangères sur sejours', () => {
    expect(sql).toContain("array['tenant_sessions', 'checklists', 'photos', 'pdf_reports']");
    expect(sql).toContain('references public.sejours(id) on delete cascade');
  });

  it('ne casse pas la migration sur un orphelin hérité', () => {
    expect(sql).toContain('not valid');
    expect(sql).toContain('validate constraint');
  });
});

describe('migration 0011 — RLS publique non affaiblie', () => {
  it('ne touche pas à la politique de lecture publique des séjours', () => {
    expect(sql).not.toContain('drop policy if exists "public_read_sejours_dates"');
    expect(sql).not.toContain('drop policy if exists "admin_all_sejours"');
  });

  it('ne rouvre pas la lecture des colonnes au public', () => {
    // Le seul GRANT accordé au public est celui de l'INSERTION d'une demande ;
    // la lecture reste limitée aux colonnes de 0003.
    const grants = sql.match(/grant [^;]*to anon;/g) ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/grant insert \(/);
    expect(grants[0]).not.toMatch(/select/);
  });

  it('restreint l’insertion publique à une demande non confirmée', () => {
    expect(sql).toContain('create policy "public_insert_sejours"');
    expect(sql).toContain("statut = 'demande'");
    expect(sql).toContain("origine = 'site'");
    expect(sql).toContain("historique = '[]'::jsonb");
    expect(sql).toContain('depart > arrivee');
  });

  it('n’ouvre jamais la note interne ni le prix négocié à l’insertion', () => {
    const grant = (sql.match(/grant insert \([\s\S]*?\) on public\.sejours to anon;/) ?? [''])[0];
    expect(grant).not.toMatch(/\bnote\b/);
    expect(grant).not.toMatch(/prix_total/);
  });
});

describe('migration 0011 — bookings en lecture seule', () => {
  it('ne supprime pas la table', () => {
    expect(sql).not.toMatch(/drop table[^;]*bookings/i);
  });

  it('retire l’écriture anonyme et authentifiée', () => {
    expect(sql).toContain('drop policy if exists "public_insert_bookings"');
    expect(sql).toContain('revoke insert, update, delete on public.bookings from anon;');
    expect(sql).toMatch(/revoke insert, update, delete on public\.bookings from authenticated/);
  });

  it('documente son obsolescence', () => {
    expect(sql).toContain('comment on table public.bookings');
    expect(sql).toContain('OBSOLÈTE');
  });
});

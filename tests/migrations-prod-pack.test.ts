import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { genererPack, separateur, transactionsEquilibrees } from '../scripts/generate-migrations-prod.mjs';

/**
 * Garde sur le pack de migrations de production.
 *
 * Le propriétaire applique les migrations à la main, en collant
 * `docs/migrations-prod-0011-0014.sql` en une seule fois. Si une migration
 * évolue sans que le pack soit régénéré, il exécute une version périmée — le
 * pire des cas, puisque rien ne le signale. Ces tests comparent donc le
 * fichier livré aux quatre migrations du dépôt, **octet pour octet**.
 *
 * La comparaison est volontairement indépendante du générateur : elle relit
 * les migrations et reconstruit l'attendu, puis découpe le fichier livré sur
 * ses séparateurs. Un bug du générateur ne peut pas se cacher derrière son
 * propre code.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const DOSSIER_MIGRATIONS = join(ROOT, 'migrations');
const FICHIER_PACK = join(ROOT, 'docs/migrations-prod-0011-0014.sql');

const MIGRATIONS = [
  '0011_calendar_blocks.sql',
  '0012_unifier_bookings_sejours.sql',
  '0013_tenant_links.sql',
  '0014_purge_coordonnees.sql',
];

const pack = readFileSync(FICHIER_PACK, 'utf8');

/** Contenu d'une migration, tel qu'il doit apparaître dans le pack. */
function migration(nom: string): string {
  return readFileSync(join(DOSSIER_MIGRATIONS, nom), 'utf8');
}

/**
 * Découpe le pack sur ses séparateurs : en-tête d'un côté, puis un bloc par
 * migration. Échoue si un séparateur manque, est dupliqué ou survient dans le
 * désordre.
 */
function decouper(contenu: string): { entete: string; blocs: { nom: string; corps: string }[] } {
  const positions = MIGRATIONS.map((nom) => ({ nom, marqueur: separateur(nom) }));
  const index = positions.map(({ nom, marqueur }) => {
    const position = contenu.indexOf(marqueur);
    expect(position, `séparateur absent pour ${nom}`).toBeGreaterThan(-1);
    expect(contenu.indexOf(marqueur, position + 1), `séparateur dupliqué pour ${nom}`).toBe(-1);
    return position;
  });
  const tries = [...index].sort((a, b) => a - b);
  expect(index, 'les séparateurs ne suivent pas l’ordre 0011 → 0014').toEqual(tries);

  const entete = contenu.slice(0, index[0]);
  const blocs = positions.map(({ nom }, i) => {
    const debut = index[i] + separateur(nom).length;
    const fin = i + 1 < index.length ? index[i + 1] : contenu.length;
    return { nom, corps: contenu.slice(debut, fin) };
  });
  return { entete, blocs };
}

describe('docs/migrations-prod-0011-0014.sql — pack livré', () => {
  it('existe et n’est pas vide', () => {
    expect(pack.length).toBeGreaterThan(0);
  });

  it('reprend chaque migration octet pour octet, dans l’ordre', () => {
    const { blocs } = decouper(pack);
    expect(blocs.map((b) => b.nom)).toEqual(MIGRATIONS);
    for (const { nom, corps } of blocs) {
      expect(corps, `${nom} diverge du fichier migrations/ : régénérer le pack`).toBe(migration(nom));
    }
  });

  it('n’ajoute rien entre les migrations : l’en-tête seul précède le premier bloc', () => {
    const { entete } = decouper(pack);
    expect(entete.startsWith('-- '), 'l’en-tête doit être un commentaire SQL').toBe(true);
    for (const ligne of entete.split('\n')) {
      expect(ligne === '' || ligne.startsWith('--'), `ligne non commentée dans l’en-tête : ${ligne}`).toBe(true);
    }
  });

  it('porte la mention « fichier généré », le mode d’emploi et l’ordre', () => {
    const { entete } = decouper(pack);
    expect(entete).toMatch(/FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN/);
    expect(entete).toContain('docs/runbook-migrations-production.md');
    const positions = MIGRATIONS.map((nom) => entete.indexOf(nom));
    for (const [i, position] of positions.entries()) {
      expect(position, `${MIGRATIONS[i]} absent de l’en-tête`).toBeGreaterThan(-1);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('s’exécute d’un seul bloc : aucune transaction laissée ouverte', () => {
    for (const nom of MIGRATIONS) {
      expect(transactionsEquilibrees(migration(nom)), `${nom} laisse une transaction ouverte`).toBe(true);
    }
    // Les migrations gèrent elles-mêmes leurs transactions : le pack n'en
    // ajoute aucune (aucun `begin`/`commit` entre deux blocs).
    const { blocs } = decouper(pack);
    for (const { nom, corps } of blocs) {
      expect(corps).toBe(migration(nom));
    }
  });

  it('aucun secret en clair dans le pack versionné', () => {
    expect(pack).not.toMatch(/sbp_[A-Za-z0-9]{20,}/);
    expect(pack).not.toMatch(/service_role["']?\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/);
    expect(pack).not.toMatch(/eyJ[A-Za-z0-9_-]{40,}/);
  });
});

describe('scripts/generate-migrations-prod.mjs — générateur', () => {
  it('produit exactement le fichier livré', () => {
    expect(genererPack(DOSSIER_MIGRATIONS)).toBe(pack);
  });

  it('échoue bruyamment quand une migration manque', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'pack-migrations-'));
    try {
      for (const nom of MIGRATIONS.slice(0, 3)) {
        writeFileSync(join(dossier, nom), migration(nom), 'utf8');
      }
      expect(() => genererPack(dossier)).toThrow(/0014_purge_coordonnees\.sql/);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('refuse une migration sans saut de ligne final (séparateur collé)', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'pack-migrations-'));
    try {
      for (const nom of MIGRATIONS) {
        const contenu = nom === MIGRATIONS[1] ? migration(nom).trimEnd() : migration(nom);
        writeFileSync(join(dossier, nom), contenu, 'utf8');
      }
      expect(() => genererPack(dossier)).toThrow(/saut de ligne/);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('refuse une migration qui laisse une transaction ouverte', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'pack-migrations-'));
    try {
      for (const nom of MIGRATIONS) {
        const contenu = nom === MIGRATIONS[2] ? `${migration(nom)}begin;\n` : migration(nom);
        writeFileSync(join(dossier, nom), contenu, 'utf8');
      }
      expect(() => genererPack(dossier)).toThrow(/transaction/);
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it('ignore les `begin` présents dans les commentaires SQL', () => {
    expect(transactionsEquilibrees('-- begin; sans commit\nselect 1;\n')).toBe(true);
    expect(transactionsEquilibrees('/* begin; */\nselect 1;\n')).toBe(true);
    expect(transactionsEquilibrees('begin;\nselect 1;\ncommit;\n')).toBe(true);
    expect(transactionsEquilibrees('begin;\nselect 1;\n')).toBe(false);
  });
});

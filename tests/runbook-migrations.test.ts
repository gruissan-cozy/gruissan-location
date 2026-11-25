import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde sur le runbook de mise en service des migrations.
 *
 * Les migrations Supabase de ce dépôt s'appliquent **à la main**, dans le SQL
 * Editor. Un runbook incomplet (étape manquante, ordre flou, secret recopié)
 * est pire que pas de runbook : il donne le sentiment que le travail est fait
 * alors que la production reste cassée. Ces tests verrouillent :
 *
 *   - la présence des quatre migrations, dans l'ordre imposé ;
 *   - la mention du redéploiement des Edge Functions APRÈS les migrations ;
 *   - l'absence de secret en clair (le runbook est versionné) ;
 *   - le rappel que la production est cassée tant que ce n'est pas fait.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const CHEMIN = 'docs/runbook-migrations-production.md';
const doc = readFileSync(join(ROOT, CHEMIN), 'utf8');

describe('runbook des migrations — contenu', () => {
  it('existe et décrit les quatre migrations dans l’ordre', () => {
    const ordre = [
      '0011_calendar_blocks.sql',
      '0012_unifier_bookings_sejours.sql',
      '0013_tenant_links.sql',
      '0014_purge_coordonnees.sql',
    ];
    const positions = ordre.map((nom) => doc.indexOf(nom));
    for (const [index, position] of positions.entries()) {
      expect(position, `${ordre[index]} absent du runbook`).toBeGreaterThan(-1);
    }
    const triees = [...positions].sort((a, b) => a - b);
    expect(positions, 'les migrations ne sont pas présentées dans l’ordre').toEqual(triees);
  });

  it('dit explicitement que l’application est manuelle', () => {
    expect(doc).toMatch(/à la main|manuel/i);
    expect(doc).toMatch(/SQL Editor/);
  });

  it('place le redéploiement des Edge Functions après les migrations', () => {
    const finMigrations = doc.indexOf('0014_purge_coordonnees.sql');
    const deploy = doc.indexOf('supabase functions deploy');
    expect(deploy, 'déploiement des Edge Functions absent').toBeGreaterThan(finMigrations);
  });

  it('rappelle que le formulaire reste cassé sans ces migrations', () => {
    expect(doc).toMatch(/n’enregistre aucune demande|n'enregistre aucune demande/i);
  });

  it('donne les requêtes de contrôle attendues', () => {
    for (const extrait of [
      'information_schema.columns',
      'information_schema.column_privileges',
      'pg_policy',
      'calendar_blocks',
    ]) {
      expect(doc, `contrôle « ${extrait} » absent`).toContain(extrait);
    }
  });

  it('ne contient aucun secret en clair', () => {
    // Les NOMS des secrets sont attendus ; leurs valeurs ne doivent jamais
    // apparaître, même en exemple.
    expect(doc).not.toMatch(/sbp_[A-Za-z0-9]{20,}/);
    expect(doc).not.toMatch(/re_[A-Za-z0-9]{20,}/);
    expect(doc).not.toMatch(/eyJ[A-Za-z0-9_-]{40,}/);
    expect(doc).not.toMatch(/service_role["']?\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/);
  });

  it('nomme l’action qui reste au propriétaire (adresse de contact)', () => {
    expect(doc).toContain('content/site.json');
    expect(doc).toMatch(/adresse/i);
    expect(doc).toContain('adresseContact');
  });
});

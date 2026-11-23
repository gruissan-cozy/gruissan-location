import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde sur la numérotation des migrations.
 *
 * Les migrations Supabase de ce dépôt sont appliquées **à la main**, dans
 * l'ordre de leur nom, par un humain qui lit le dossier `migrations/`. Deux
 * fichiers portant le même préfixe numérique rendent cet ordre indéterminé :
 * rien ne dit lequel doit passer en premier.
 *
 * C'est arrivé une fois : `0011_calendar_blocks.sql` (arrivé sur `main` en
 * premier) et `0011_unifier_bookings_sejours.sql` (cette branche) coexistaient.
 * La fusion a été renumérotée en 0012 ; ce test empêche la récidive.
 *
 * Il ne vérifie volontairement pas que les numéros sont contigus : une branche
 * peut légitimement préparer un numéro que `main` n'a pas encore.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const DOSSIER = join(ROOT, 'migrations');

function migrations(): string[] {
  return readdirSync(DOSSIER)
    .filter((nom) => nom.endsWith('.sql'))
    .sort();
}

describe('migrations — numérotation', () => {
  it('le dossier contient au moins une migration', () => {
    expect(migrations().length).toBeGreaterThan(0);
  });

  it('aucun préfixe numérique n’est utilisé deux fois', () => {
    const parNumero = new Map<string, string[]>();
    for (const nom of migrations()) {
      const numero = nom.slice(0, 4);
      parNumero.set(numero, [...(parNumero.get(numero) ?? []), nom]);
    }
    const collisions = [...parNumero.entries()].filter(([, noms]) => noms.length > 1);
    expect(
      collisions.map(([numero, noms]) => `${numero} → ${noms.join(', ')}`),
      'deux migrations partagent le même numéro : l’ordre d’application devient indéterminé',
    ).toEqual([]);
  });

  it('chaque nom respecte le format `NNNN_sujet.sql`', () => {
    for (const nom of migrations()) {
      expect(nom, nom).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
    }
  });

  it('les numéros croissent avec les noms de fichiers', () => {
    const numeros = migrations().map((nom) => Number(nom.slice(0, 4)));
    for (let i = 1; i < numeros.length; i += 1) {
      expect(numeros[i]).toBeGreaterThanOrEqual(numeros[i - 1]);
    }
  });
});

describe('migrations — ordre d’application sur `main`', () => {
  // La collision 0011 a été tranchée : `calendar_blocks` garde 0011 (déjà
  // appliquée sur `main`), la fusion prend 0012, les liens locataire 0013.
  it('la fusion bookings → sejours est la 0012', () => {
    expect(migrations()).toContain('0012_unifier_bookings_sejours.sql');
    expect(migrations()).not.toContain('0011_unifier_bookings_sejours.sql');
  });

  it('les liens locataire sont la 0013', () => {
    expect(migrations()).toContain('0013_tenant_links.sql');
    expect(migrations()).not.toContain('0012_tenant_links.sql');
  });

  it('0011 reste calendar_blocks, sans doublon', () => {
    expect(migrations().filter((nom) => nom.startsWith('0011_'))).toEqual(['0011_calendar_blocks.sql']);
  });
});

describe('migrations — les tests pointent vers des fichiers existants', () => {
  // Un test qui lit un fichier renommé échoue à l'exécution, mais autant le
  // dire ici avec un message clair plutôt qu'avec un ENOENT.
  it('chaque `migrations/NNNN_*.sql` cité dans tests/ existe', () => {
    const fichiers = migrations();
    const references = new Set<string>();
    for (const test of readdirSync(join(ROOT, 'tests')).filter((n) => n.endsWith('.ts'))) {
      const source = readFileSync(join(ROOT, 'tests', test), 'utf8');
      for (const m of source.matchAll(/migrations\/(\d{4}_[a-z0-9_]+\.sql)/g)) {
        references.add(m[1]);
      }
    }
    expect([...references].filter((nom) => !fichiers.includes(nom))).toEqual([]);
  });
});

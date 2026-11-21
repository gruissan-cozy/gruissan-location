import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde de non-régression sur les scripts client des composants.
 *
 * `define:vars` implique `is:inline` : Astro recopie le corps du script tel
 * quel dans la page, sans passer par le bundler. Un `import` y devient une
 * instruction ESM dans un script classique → `SyntaxError: Cannot use import
 * statement outside a module`, et TOUT le script de la page cesse de
 * s'exécuter (c'est ce qui empêchait le devis de /reserver de s'afficher).
 *
 * Règle : un `<script>` qui contient un `import` ne doit jamais porter
 * `define:vars`. La configuration passe alors par une balise JSON dédiée.
 */

const SRC = new URL('../src/', import.meta.url).pathname;

function fichiersAstro(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) fichiersAstro(full, out);
    else if (full.endsWith('.astro')) out.push(full);
  }
  return out;
}

/** Découpe le fichier en balises `<script ...>…</script>`. */
function scripts(code: string): { attrs: string; body: string }[] {
  const list: { attrs: string; body: string }[] = [];
  for (const m of code.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    list.push({ attrs: m[1], body: m[2] });
  }
  return list;
}

describe('scripts client des composants Astro', () => {
  const fichiers = fichiersAstro(SRC);

  it('aucun script `define:vars` ne contient d’import (SyntaxError garanti)', () => {
    const fautifs: string[] = [];
    for (const fichier of fichiers) {
      for (const { attrs, body } of scripts(readFileSync(fichier, 'utf8'))) {
        if (!attrs.includes('define:vars')) continue;
        if (/^\s*import\s/m.test(body)) {
          fautifs.push(`${fichier.replace(SRC, 'src/')} — ${attrs.trim()}`);
        }
      }
    }
    expect(fautifs, 'utiliser une balise JSON + script module').toEqual([]);
  });

  it('la page /reserver sérialise sa configuration en JSON et charge un module', () => {
    const code = readFileSync(join(SRC, 'components/Reservation.astro'), 'utf8');
    expect(code).toContain('type="application/json"');
    expect(code).toContain('id="booking-cfg"');
    expect(code).toMatch(/<script>\s*\n\s*import \{ computeQuote/);
  });

  it('le calendrier de la vitrine sérialise sa configuration en JSON', () => {
    const code = readFileSync(join(SRC, 'components/Vitrine.astro'), 'utf8');
    expect(code).toContain('id="calendrier-cfg"');
    expect(code).toMatch(/<script>\s*\nimport \{ ajouterMois/);
  });
});

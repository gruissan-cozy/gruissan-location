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

  it('/reserver passe les lectures brutes au contrôle, sans écraser null par []', () => {
    // `controlerLectures` distingue null (lecture en échec → « à confirmer »)
    // de [] (aucune ligne → « libre »). Un `?? []` dans le composant efface
    // cette distinction et affiche « libre » alors que rien n'a été vérifié.
    const code = readFileSync(join(SRC, 'components/Reservation.astro'), 'utf8');
    expect(code).toContain('controlerLectures(');
    expect(code).not.toContain('sejours ?? []');
    expect(code).not.toContain('blocages ?? []');
  });

  it('/reserver rend les trois verdicts de disponibilité atteignables', () => {
    // libre → available · occupe → unavailable · a_confirmer (et absence de
    // Supabase) → toConfirm. Aucun des trois ne doit disparaître du script.
    const code = readFileSync(join(SRC, 'components/Reservation.astro'), 'utf8');
    for (const cle of ['s.available', 's.unavailable', 's.toConfirm']) {
      expect(code, `${cle} doit rester affiché`).toContain(cle);
    }
    expect(code).toContain("verdict === 'a_confirmer'");
    expect(code).toContain("verdict === 'occupe'");
  });
});

/**
 * Garde sur la page taxe de séjour : depuis la fusion `bookings` → `sejours`,
 * une simple DEMANDE arrive dans `sejours` et s'affiche dans ce tableau. Le
 * rendu doit passer par `ligneTaxe()` (qui neutralise taux et montant d'un
 * séjour non assujetti), sinon il affiche une taxe due sur une demande et
 * contredit le récapitulatif annuel.
 */
describe('page /admin/taxe-sejour — aucune taxe sur une demande', () => {
  const code = readFileSync(join(SRC, 'pages/admin/taxe-sejour.astro'), 'utf8');

  it('calcule ses lignes avec `ligneTaxe`, pas directement', () => {
    expect(code).toContain('ligneTaxe(s as SejourTaxe, TAUX)');
    expect(code).not.toContain('calculerTaxeSejour(s as SejourTaxe');
  });

  it('affiche le libellé « non assujetti » quand il n’y a pas de montant', () => {
    expect(code).toContain("AT['taxe.notApplicable']");
    expect(code).toContain("AT['taxe.notCalculable']");
  });

  it('n’exporte ni taux ni montant sans assujettissement', () => {
    const exportLignes = (code.match(/const lignes = sejoursDuPerimetre\(\)[\s\S]*?\n    \}\);/) ?? [''])[0];
    expect(exportLignes).toContain('ligneTaxe(');
    expect(exportLignes).toMatch(/ligne\.taux === null \? '' : String\(ligne\.taux\)/);
    expect(exportLignes).toMatch(/ligne\.montant === null \? '' : String\(ligne\.montant\)/);
  });

  it('libelle la colonne « Pers. » comme l’assiette adultes', () => {
    expect(code).toContain("AT['taxe.colAdults']");
    expect(code).not.toContain("AT['taxe.colPeople']");
  });
});

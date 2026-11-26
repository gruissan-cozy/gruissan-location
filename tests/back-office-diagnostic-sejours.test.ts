import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contrat du back office sur la lecture de `sejours`.
 *
 * Constat de production (2026-11-26) : Supabase répond `42501 permission
 * denied for table sejours` (GRANT de 0012 manquant). Le tableau de bord
 * masquait alors la carte CA en silence. Chaque écran qui lit `sejours` doit
 * donc distinguer « table absente » (0003) de « droits manquants » (0011→0014)
 * et afficher le bon message.
 *
 * Ces pages sont des scripts client Astro : Vitest ne les exécute pas. On
 * verrouille les invariants à la source, comme pour /admin/demandes.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(ROOT, chemin), 'utf8');

const ECRANS = [
  'src/pages/admin/index.astro',
  'src/pages/admin/demandes.astro',
  'src/pages/admin/sejours.astro',
  'src/pages/admin/revenus.astro',
  'src/pages/admin/taxe-sejour.astro',
  'src/pages/admin/taches.astro',
];

describe('back office — diagnostic de la lecture de sejours', () => {
  for (const ecran of ECRANS) {
    it(`${ecran} classe l’erreur au lieu d’un simple booléen`, () => {
      const source = lire(ecran);
      expect(source).toContain('diagnosticLectureSejours');
      expect(source).toContain('messageDiagnosticSejours');
      expect(source).toContain('common.sejoursDroitsMissing');
    });

    it(`${ecran} garde le message 0003 pour une table réellement absente`, () => {
      const source = lire(ecran);
      expect(source).toMatch(/tableAbsente:\s*AT\[/);
    });
  }

  it('le tableau de bord ne masque plus la carte CA sans explication', () => {
    const dashboard = lire('src/pages/admin/index.astro');
    expect(dashboard).toContain("document.getElementById('dash-ca-migration')");
    expect(dashboard).toMatch(/bandeau\.textContent = texte/);
    // Cause inconnue (réseau, JWT expiré) : le bandeau porte le message
    // générique, il ne se contente pas d'un toast transitoire.
    expect(dashboard).toMatch(/bandeau\.textContent = AT\['common\.errorGeneric'\]/);
  });

  it('la clé de bandeau existe dans les 4 langues', async () => {
    const { adminT } = await import('../src/i18n/admin');
    for (const lang of ['fr', 'en', 'es', 'de'] as const) {
      const texte = adminT[lang]['common.sejoursDroitsMissing'];
      expect(texte, `common.sejoursDroitsMissing manquant en ${lang}`).toBeTruthy();
      // Le diagnostic doit nommer la vraie cause, pas renvoyer à 0003.
      expect(texte).toContain('0012');
      expect(texte).not.toContain('0003');
    }
  });

  it('les clés historiques de bandeau restent intactes', async () => {
    const { adminT } = await import('../src/i18n/admin');
    for (const lang of ['fr', 'en', 'es', 'de'] as const) {
      // Ces textes ne changent pas : ils renvoient toujours à une migration.
      expect(adminT[lang]['dash.migrationSejoursMissing']).toContain('migrations/0003');
      expect(adminT[lang]['sejours.tableMissing']).toContain('migrations/0003');
      expect(adminT[lang]['demandes.tableMissing']).toContain('migrations/0012');
    }
  });
});

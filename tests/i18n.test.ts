import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LANGUAGES, t, seo } from '../src/i18n';
import { adminT } from '../src/i18n/admin';
import { guideT } from '../src/i18n/guide';
import { booking } from '../src/i18n/booking';
import { calendrier } from '../src/i18n/calendrier';

/** Racine du dépôt (le test vit dans `tests/`). */
const ROOT = new URL('../', import.meta.url).pathname;

/** Liste récursivement les fichiers `.astro` sous `racine`. */
function fichiersAstro(racine: string): string[] {
  const trouves: string[] = [];
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree);
    if (statSync(chemin).isDirectory()) trouves.push(...fichiersAstro(chemin));
    else if (chemin.endsWith('.astro')) trouves.push(chemin);
  }
  return trouves;
}

/** Vérifie qu'un dictionnaire a exactement les mêmes clés dans les 4 langues, sans valeur vide. */
function expectParity(dict: Record<string, Record<string, string>>, label: string): void {
  const ref = Object.keys(dict.fr).sort();
  expect(ref.length, `${label} : le dictionnaire fr ne doit pas être vide`).toBeGreaterThan(0);
  for (const lang of LANGUAGES) {
    const keys = Object.keys(dict[lang]).sort();
    const missing = ref.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !ref.includes(k));
    expect(missing, `${label} [${lang}] : clés manquantes`).toEqual([]);
    expect(extra, `${label} [${lang}] : clés en trop`).toEqual([]);
    for (const [k, v] of Object.entries(dict[lang])) {
      expect(v && v.trim(), `${label} [${lang}] : valeur vide pour « ${k} »`).toBeTruthy();
    }
  }
}

describe('i18n.ts (vitrine)', () => {
  it('a les 4 langues déclarées', () => {
    expect(LANGUAGES).toEqual(['fr', 'en', 'es', 'de']);
  });

  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(t as never, 'i18n.ts');
  });

  it('contient les clés de navigation critiques', () => {
    for (const lang of LANGUAGES) {
      expect(t[lang]['nav.guide'], `nav.guide manquant en ${lang}`).toBeTruthy();
      expect(t[lang]['nav.reserver'], `nav.reserver manquant en ${lang}`).toBeTruthy();
      expect(t[lang]['proxi.title'], `proxi.title manquant en ${lang}`).toBeTruthy();
    }
  });

  it('expose des métadonnées SEO traduites', () => {
    for (const lang of LANGUAGES) {
      expect(seo[lang].title.length, `seo.title trop court en ${lang}`).toBeGreaterThan(10);
      expect(seo[lang].description.length, `seo.description trop courte en ${lang}`).toBeGreaterThan(30);
      expect(seo[lang].ogLocale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });
});

describe('i18n/admin.ts (back office)', () => {
  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(adminT as never, 'admin.ts');
  });

  it('contient les libellés des sections et de l’auth', () => {
    for (const lang of LANGUAGES) {
      expect(adminT[lang]['auth.loginTitle'], `auth.loginTitle manquant en ${lang}`).toBeTruthy();
      expect(adminT[lang]['auth.submit'], `auth.submit manquant en ${lang}`).toBeTruthy();
      expect(adminT[lang]['common.backToSite'], `common.backToSite manquant en ${lang}`).toBeTruthy();
      // Message d'erreur générique : référencé par 28 appels, sans repli dans
      // deux d'entre eux (index.astro, disponibilites.astro). Sa suppression
      // produit un toast vide — la parité seule ne l'aurait pas vu.
      expect(adminT[lang]['common.errorGeneric'], `common.errorGeneric manquant en ${lang}`).toBeTruthy();
    }
  });

  /**
   * Garde d'usage : chaque `AT['clé']` littéral écrit dans le code doit exister
   * dans le dictionnaire. `validate:i18n` ne vérifie que la parité entre
   * langues ; une clé supprimée des 4 blocs garde une parité parfaite tout en
   * cassant silencieusement tous ses appels (`AT` est un objet littéral, donc
   * l'accès vaut `undefined` à l'exécution et `astro check` ne le type pas).
   */
  it('ne référence que des clés existantes dans le code (AT[\'…\'])', () => {
    const fichiers = fichiersAstro(join(ROOT, 'src'));
    expect(fichiers.length, 'aucun fichier .astro trouvé : le scan est cassé').toBeGreaterThan(20);

    const cles = new Set(Object.keys(adminT.fr));
    const manquantes: string[] = [];
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, 'utf8');
      for (const m of source.matchAll(/\bAT\[['"]([^'"]+)['"]\]/g)) {
        if (!cles.has(m[1])) manquantes.push(`${fichier.slice(ROOT.length)} → AT['${m[1]}']`);
      }
    }
    expect(manquantes, 'clés AT référencées mais absentes de adminT').toEqual([]);
  });
});

describe('i18n/guide.ts (page /guide)', () => {
  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(guideT as never, 'guide.ts');
  });
});

describe('i18n/booking.ts (page /reserver)', () => {
  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(booking as never, 'booking.ts');
  });

  it('contient les libellés clés du formulaire', () => {
    for (const lang of LANGUAGES) {
      expect(booking[lang]['booking.checkin'], `booking.checkin manquant en ${lang}`).toBeTruthy();
      expect(booking[lang]['booking.submit'] ?? booking[lang]['booking.send'], `bouton de soumission manquant en ${lang}`).toBeTruthy();
    }
  });
});

describe('i18n/calendrier.ts (calendrier de disponibilités)', () => {
  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(calendrier as never, 'calendrier.ts');
  });

  it('contient les libellés indispensables du calendrier', () => {
    for (const lang of LANGUAGES) {
      for (const cle of [
        'calendrier.precedent',
        'calendrier.suivant',
        'calendrier.legende.libre',
        'calendrier.legende.occupe',
        'calendrier.legende.partiel',
        'calendrier.nuitsLibres',
        'calendrier.choisirAccessible',
      ]) {
        expect(calendrier[lang][cle], `${cle} manquant en ${lang}`).toBeTruthy();
      }
    }
  });
});

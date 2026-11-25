import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  LANGUES,
  ORIGINE,
  PREFIXE,
  adressesSitemap,
  cheminPage,
  construireSitemap,
  echapperXml,
  pagesDepuisDisque,
} from '../scripts/generate-sitemap.mjs';

/**
 * Garde sur le `sitemap.xml` généré au build.
 *
 * Le fichier était statique et ne listait que les quatre accueils : le guide,
 * le formulaire de réservation et les pages légales répondaient 200 sans être
 * annoncés, et aucune variante `hreflang` n'était déclarée. Ces tests
 * verrouillent trois propriétés :
 *
 *   1. toute page réellement présente dans `src/pages` figure au sitemap ;
 *   2. `admin/` et `tenant/` n'y figurent jamais (pages privées) ;
 *   3. chaque entrée porte ses alternates linguistiques et un `x-default`.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const PAGES = join(ROOT, 'src/pages');

const sections = pagesDepuisDisque(PAGES);
const xml = construireSitemap(sections);
const adresses = adressesSitemap(sections);

/** Sections attendues d'après le disque, hors pages privées. */
function sectionsAttendues(): Map<string, Set<string>> {
  const attendues = new Map<string, Set<string>>();
  const ajouter = (section: string, lang: string) => {
    if (!attendues.has(section)) attendues.set(section, new Set());
    attendues.get(section)!.add(lang);
  };
  for (const entree of readdirSync(PAGES)) {
    const complet = join(PAGES, entree);
    if (statSync(complet).isDirectory()) {
      if (['admin', 'tenant', '404'].includes(entree)) continue;
      if (!LANGUES.includes(entree)) continue;
      for (const fichier of readdirSync(complet)) {
        if (!fichier.endsWith('.astro')) continue;
        const base = fichier.replace(/\.astro$/, '');
        ajouter(base === 'index' ? '' : base, entree);
      }
      continue;
    }
    if (!entree.endsWith('.astro')) continue;
    const base = entree.replace(/\.astro$/, '');
    ajouter(base === 'index' ? '' : base, 'fr');
  }
  return attendues;
}

describe('scripts/generate-sitemap.mjs — inventaire des pages', () => {
  it('trouve les sections publiques du dépôt', () => {
    for (const section of [
      '',
      'guide',
      'reserver',
      'mentions-legales',
      'confidentialite',
      'conditions-generales',
    ]) {
      expect(sections.has(section), `section « ${section} » absente`).toBe(true);
    }
  });

  it('n’inclut jamais le back office ni l’espace locataire', () => {
    expect(sections.has('admin')).toBe(false);
    expect(sections.has('tenant')).toBe(false);
    expect(adresses.some((url) => url.includes('/admin/'))).toBe(false);
    expect(adresses.some((url) => url.includes('/tenant/'))).toBe(false);
  });

  it('couvre exactement les pages présentes sur le disque', () => {
    const attendues = sectionsAttendues();
    expect([...sections.keys()].sort()).toEqual([...attendues.keys()].sort());
    for (const [section, langues] of attendues) {
      expect([...(sections.get(section) ?? [])].sort(), `section « ${section} »`).toEqual(
        [...langues].sort(),
      );
    }
  });
});

describe('sitemap généré — contenu', () => {
  it('annonce chaque page dans chacune de ses langues', () => {
    for (const [section, langues] of sections) {
      for (const lang of langues) {
        expect(adresses, `${section || 'accueil'} [${lang}] absent`).toContain(
          `${ORIGINE}${cheminPage(section, lang)}`,
        );
      }
    }
  });

  it('déclare les quatre langues de chaque page multilingue', () => {
    for (const [section, langues] of sections) {
      if (!langues.has('fr')) continue;
      for (const lang of LANGUES) {
        expect(adresses, `${section || 'accueil'} [${lang}] absent`).toContain(
          `${ORIGINE}${cheminPage(section, lang)}`,
        );
      }
    }
  });

  it('porte un bloc hreflang complet et un x-default par entrée', () => {
    const blocs = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
    expect(blocs.length).toBe(adresses.length);
    for (const bloc of blocs) {
      expect(bloc).toContain('hreflang="fr"');
      expect(bloc).toContain('hreflang="en"');
      expect(bloc).toContain('hreflang="es"');
      expect(bloc).toContain('hreflang="de"');
      expect(bloc).toContain('hreflang="x-default"');
    }
  });

  it('respecte les adresses du site (préfixe /gruissan-location/)', () => {
    expect(adresses.every((url) => url.startsWith(`${ORIGINE}${PREFIXE}`))).toBe(true);
    expect(cheminPage('', 'fr')).toBe(PREFIXE);
    expect(cheminPage('guide', 'de')).toBe(`${PREFIXE}de/guide/`);
  });

  it('est un document XML bien formé, aux accents échappés', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
    expect(echapperXml('a & b <c>')).toBe('a &amp; b &lt;c&gt;');
  });

  it('reste stable : deux générations donnent le même fichier', () => {
    expect(construireSitemap(pagesDepuisDisque(PAGES))).toBe(xml);
  });

  it('n’est plus servi depuis public/ (le build le génère)', () => {
    // `public/sitemap.xml` masquerait le fichier généré dans `dist/` : Astro
    // copie `public/` après coup et écraserait le sitemap complet par
    // l'ancien, à quatre entrées.
    const dansPublic = (() => {
      try {
        return statSync(join(ROOT, 'public/sitemap.xml')).isFile();
      } catch {
        return false;
      }
    })();
    expect(dansPublic).toBe(false);
  });
});

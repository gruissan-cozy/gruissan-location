import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PREFIXE_SITE,
  SECTIONS_MULTILINGUES,
  adresseCanonique,
  alternativesLangues,
  analyserChemin,
  cheminLangue,
  descriptionPage,
  normaliserChemin,
  titrePage,
} from '../src/lib/seo';
import { seo } from '../src/i18n';

const ORIGINE = 'https://gruissan-cozy.github.io';
const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(ROOT, chemin), 'utf8');

describe('lib/seo.ts — normalisation des chemins', () => {
  it('conserve le préfixe du site et ajoute la barre finale', () => {
    expect(normaliserChemin('/gruissan-location')).toBe('/gruissan-location/');
    expect(normaliserChemin('/gruissan-location/guide')).toBe('/gruissan-location/guide/');
    expect(normaliserChemin('/gruissan-location/guide/')).toBe('/gruissan-location/guide/');
    expect(normaliserChemin('/gruissan-location/en/guide/')).toBe('/gruissan-location/en/guide/');
  });

  it('ignore les paramètres de requête et l’ancre', () => {
    expect(normaliserChemin('/gruissan-location/reserver/?arrivee=2026-08-01#form')).toBe(
      '/gruissan-location/reserver/',
    );
  });

  it('retombe sur l’accueil pour un chemin absent ou hors du site', () => {
    for (const chemin of ['', '/', '/autre-repo/', undefined, null, 12]) {
      expect(normaliserChemin(chemin), String(chemin)).toBe(PREFIXE_SITE);
    }
    expect(adresseCanonique(null, ORIGINE)).toBe(`${ORIGINE}${PREFIXE_SITE}`);
  });
});

describe('lib/seo.ts — adresse canonique', () => {
  it('préfixe le chemin par l’origine, sans double barre', () => {
    expect(adresseCanonique('/gruissan-location/mentions-legales/', ORIGINE)).toBe(
      'https://gruissan-cozy.github.io/gruissan-location/mentions-legales/',
    );
    expect(adresseCanonique('/gruissan-location/en/guide/', `${ORIGINE}/`)).toBe(
      'https://gruissan-cozy.github.io/gruissan-location/en/guide/',
    );
  });

  it('donne une adresse canonique différente par page et par langue', () => {
    const pages = [
      '/gruissan-location/',
      '/gruissan-location/en/',
      '/gruissan-location/confidentialite/',
      '/gruissan-location/de/confidentialite/',
      '/gruissan-location/reserver/',
    ].map((chemin) => adresseCanonique(chemin, ORIGINE));
    expect(new Set(pages).size).toBe(pages.length);
  });
});

describe('lib/seo.ts — analyse d’une page', () => {
  it('reconnaît la langue et la section', () => {
    expect(analyserChemin('/gruissan-location/')).toEqual({
      lang: 'fr',
      section: '',
      multilingue: true,
    });
    expect(analyserChemin('/gruissan-location/en/')).toEqual({
      lang: 'en',
      section: '',
      multilingue: true,
    });
    expect(analyserChemin('/gruissan-location/de/conditions-generales/')).toEqual({
      lang: 'de',
      section: 'conditions-generales',
      multilingue: true,
    });
  });

  it('marque comme non multilingues les pages propres à une langue', () => {
    expect(analyserChemin('/gruissan-location/tenant/')?.multilingue).toBe(false);
    expect(analyserChemin('/gruissan-location/admin/')?.multilingue).toBe(false);
    expect(analyserChemin('/autre-site/guide/')).toBeNull();
  });

  it('couvre toutes les sections réellement publiées dans les quatre langues', () => {
    expect([...SECTIONS_MULTILINGUES].sort()).toEqual(
      ['conditions-generales', 'confidentialite', 'guide', 'mentions-legales', 'reserver'].sort(),
    );
  });
});

describe('lib/seo.ts — translations hreflang', () => {
  it('renvoie les quatre langues plus x-default pour une section', () => {
    expect(alternativesLangues('/gruissan-location/guide/')).toEqual([
      { hreflang: 'fr', href: '/gruissan-location/guide/' },
      { hreflang: 'en', href: '/gruissan-location/en/guide/' },
      { hreflang: 'es', href: '/gruissan-location/es/guide/' },
      { hreflang: 'de', href: '/gruissan-location/de/guide/' },
      { hreflang: 'x-default', href: '/gruissan-location/guide/' },
    ]);
  });

  it('conserve la section des pages légales dans chaque langue', () => {
    const liens = alternativesLangues('/gruissan-location/es/mentions-legales/');
    expect(liens.map((l) => l.href)).toEqual([
      '/gruissan-location/mentions-legales/',
      '/gruissan-location/en/mentions-legales/',
      '/gruissan-location/es/mentions-legales/',
      '/gruissan-location/de/mentions-legales/',
      '/gruissan-location/mentions-legales/',
    ]);
  });

  it('n’annonce aucune traduction pour une page monolingue', () => {
    expect(alternativesLangues('/gruissan-location/tenant/')).toEqual([]);
    expect(alternativesLangues('/gruissan-location/admin/')).toEqual([]);
    expect(alternativesLangues(null)).toEqual([]);
  });

  it('construit le chemin d’une section par langue', () => {
    expect(cheminLangue('fr', 'reserver')).toBe('/gruissan-location/reserver/');
    expect(cheminLangue('de', 'reserver')).toBe('/gruissan-location/de/reserver/');
    expect(cheminLangue('fr')).toBe('/gruissan-location/');
  });
});

describe('lib/seo.ts — titre de la page', () => {
  it('garde le titre fourni par la page', () => {
    expect(titrePage('Mentions légales', seo.fr.title)).toBe('Mentions légales');
    expect(titrePage('  Guide d’accueil  ', seo.fr.title)).toBe('Guide d’accueil');
  });

  it('retombe sur le titre SEO de la langue, sans hériter de l’accueil', () => {
    for (const valeur of [undefined, null, '', '   ', 12]) {
      expect(titrePage(valeur, seo.fr.title), String(valeur)).toBe(seo.fr.title);
    }
    expect(titrePage('', seo.en.title)).toBe(seo.en.title);
  });
});

describe('lib/seo.ts — description de la page', () => {
  it('suit la même règle de repli que le titre', () => {
    expect(descriptionPage('Informations sur l’éditeur du site.', seo.fr.description)).toBe(
      'Informations sur l’éditeur du site.',
    );
    for (const valeur of [undefined, null, '', '  ']) {
      expect(descriptionPage(valeur, seo.de.description), String(valeur)).toBe(seo.de.description);
    }
  });
});

describe('Layout.astro — métadonnées branchées sur la page courante', () => {
  const layout = lire('src/layouts/Layout.astro');

  it('lit la prop title et la transmet à titrePage', () => {
    expect(layout).toContain('titrePage(');
    expect(layout).toMatch(/const\s*\{[^}]*title/);
  });

  it('calcule le canonical et les hreflang depuis Astro.url.pathname', () => {
    expect(layout).toContain('Astro.url.pathname');
    expect(layout).toContain('adresseCanonique(');
    expect(layout).toContain('alternativesLangues(');
  });

  it('n’écrit plus d’hreflang figés sur la racine', () => {
    expect(layout).not.toMatch(/hreflang="fr"\s+href=\{`\$\{siteUrl\}\/gruissan-location\/`\}/);
  });
});

describe('layout de la page — la prop title est optionnelle', () => {
  it('les composants qui l’utilisent fournissent toujours un titre', () => {
    for (const fichier of [
      'src/components/Guide.astro',
      'src/components/Reservation.astro',
      'src/components/LegalPage.astro',
      'src/pages/tenant/index.astro',
    ]) {
      expect(lire(fichier), `${fichier} : prop title absente`).toMatch(/<Layout[^>]*title=/);
    }
  });

  it('l’accueil garde le titre SEO de la langue (repli du layout)', () => {
    expect(lire('src/components/Vitrine.astro')).toMatch(/<Layout lang=\{lang\}>/);
  });

  it('chaque page fournit sa propre description, pas celle de l’accueil', () => {
    expect(lire('src/components/LegalPage.astro')).toMatch(/description=\{sousTitre\}/);
    expect(lire('src/components/Guide.astro')).toMatch(/description=\{tr\['guide.subtitle'\]\}/);
    expect(lire('src/components/Reservation.astro')).toMatch(
      /description=\{b\['booking.subtitle'\]\}/,
    );
    expect(lire('src/layouts/Layout.astro')).toContain('descriptionPage(');
  });
});

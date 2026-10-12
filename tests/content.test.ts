import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES } from '../src/i18n';

const CONTENT = new URL('../content/', import.meta.url).pathname;

function loadJson(name: string): any {
  const raw = readFileSync(`${CONTENT}${name}`, 'utf8');
  return JSON.parse(raw); // lève si le JSON est cassé
}

describe('fichiers content/*.json', () => {
  const files = readdirSync(CONTENT).filter((f) => f.endsWith('.json'));

  it('contient tous les fichiers attendus', () => {
    for (const expected of ['site.json', 'tarifs.json', 'disponibilites.json', 'galerie.json', 'packs.json', 'guide.json', 'proximite.json']) {
      expect(files, `${expected} manquant dans content/`).toContain(expected);
    }
  });

  it('sont tous du JSON valide', () => {
    for (const f of files) {
      expect(() => JSON.parse(readFileSync(`${CONTENT}${f}`, 'utf8')), `${f} : JSON invalide`).not.toThrow();
    }
  });
});

describe('content/site.json', () => {
  const site = loadJson('site.json');

  it('a les champs obligatoires remplis', () => {
    for (const field of ['nom', 'ville', 'region', 'telephone', 'email', 'adresse_ligne', 'code_postal']) {
      expect(site[field], `champ « ${field} » vide`).toBeTruthy();
    }
  });

  it('a une capacité et des coordonnées cohérentes', () => {
    expect(site.capacite).toBeGreaterThan(0);
    expect(site.capacite).toBeLessThanOrEqual(8);
    expect(site.chambres).toBeGreaterThan(0);
    expect(site.latitude).toBeGreaterThan(42);
    expect(site.latitude).toBeLessThan(44);
    expect(site.longitude).toBeGreaterThan(2);
    expect(site.longitude).toBeLessThan(4);
  });

  it('a un email au format valide', () => {
    expect(site.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });
});

describe('content/tarifs.json', () => {
  const tarifs = loadJson('tarifs.json');

  it('définit les 3 saisons avec prix et minimums', () => {
    expect(tarifs.saisons.map((s: any) => s.id)).toEqual(['haute', 'moyenne', 'basse']);
    for (const s of tarifs.saisons) {
      expect(s.prix_semaine, `${s.id} : prix_semaine`).toBeGreaterThan(0);
      expect(s.nuits_min, `${s.id} : nuits_min`).toBeGreaterThan(0);
      expect(s.prix_nuit_min, `${s.id} : prix_nuit_min`).toBeGreaterThan(0);
    }
  });

  it('classe les saisons du plus cher au moins cher', () => {
    const prix = tarifs.saisons.map((s: any) => s.prix_semaine);
    expect(prix).toEqual([...prix].sort((a, b) => b - a));
  });
});

describe('content/disponibilites.json', () => {
  const dispo = loadJson('disponibilites.json');

  it('a des mois au format YYYY-MM et des statuts connus', () => {
    for (const m of dispo.mois) {
      expect(m.mois, `« ${m.mois} » : format attendu YYYY-MM`).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
      expect(['libre', 'partiel', 'reserve']).toContain(m.statut);
    }
  });

  it('a une légende pour chaque statut', () => {
    for (const statut of ['libre', 'partiel', 'reserve']) {
      expect(dispo.legende[statut], `légende « ${statut} » manquante`).toBeTruthy();
    }
  });
});

describe('content/galerie.json', () => {
  const galerie = loadJson('galerie.json');

  it('liste des photos avec src et alt multilingues', () => {
    expect(galerie.photos.length).toBeGreaterThan(0);
    for (const p of galerie.photos) {
      expect(p.src, 'src manquant').toMatch(/^\/gruissan-location\/images\//);
      for (const lang of LANGUAGES) {
        expect(p.alt[lang], `alt[${lang}] manquant pour ${p.src}`).toBeTruthy();
      }
    }
  });
});

describe('content/proximite.json', () => {
  const proxi = loadJson('proximite.json');

  it('a des points avec itinéraires pied/vélo/voiture complets', () => {
    expect(proxi.points.length).toBeGreaterThan(0);
    for (const p of proxi.points) {
      for (const lang of LANGUAGES) {
        expect(p.nom[lang], `nom[${lang}] manquant pour ${p.id}`).toBeTruthy();
        expect(p.detail[lang], `detail[${lang}] manquant pour ${p.id}`).toBeTruthy();
      }
      for (const mode of ['walking', 'cycling', 'driving']) {
        expect(p.routes[mode], `${p.id} : route ${mode} manquante`).toBeTruthy();
        expect(p.routes[mode].distance_m, `${p.id} ${mode} : distance_m`).toBeGreaterThan(0);
        expect(p.routes[mode].duration_min, `${p.id} ${mode} : duration_min`).toBeGreaterThan(0);
      }
    }
  });
});

describe('content/guide.json', () => {
  const guide = loadJson('guide.json');

  it('a des sections avec titre et contenu dans les 4 langues', () => {
    expect(guide.sections.length).toBeGreaterThanOrEqual(10);
    for (const s of guide.sections) {
      expect(s.slug, 'slug manquant').toBeTruthy();
      for (const lang of LANGUAGES) {
        expect(s.titre[lang], `titre[${lang}] manquant pour ${s.slug}`).toBeTruthy();
        expect(s.contenu[lang], `contenu[${lang}] manquant pour ${s.slug}`).toBeTruthy();
      }
    }
  });
});

describe('content/packs.json', () => {
  const packs = loadJson('packs.json');

  it('a des packs valides (prix, unité, 4 langues)', () => {
    expect(packs.packs.length).toBeGreaterThan(0);
    for (const p of packs.packs) {
      expect(p.prix, `${p.slug} : prix`).toBeGreaterThanOrEqual(0);
      expect(['par_personne', 'par_sejour', 'par_nuit']).toContain(p.unite);
      for (const lang of LANGUAGES) {
        expect(p.nom[lang], `nom[${lang}] manquant pour ${p.slug}`).toBeTruthy();
        expect(p.description[lang], `description[${lang}] manquante pour ${p.slug}`).toBeTruthy();
      }
    }
  });
});

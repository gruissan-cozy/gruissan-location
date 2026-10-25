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
    for (const field of ['nom', 'ville', 'region', 'email', 'adresse_ligne', 'code_postal']) {
      expect(site[field], `champ « ${field} » vide`).toBeTruthy();
    }
  });

  it('existe pour chaque coordonnée optionnelle (téléphone, WhatsApp)', () => {
    // Les champs doivent exister pour être éditables par le propriétaire ;
    // ils peuvent rester vides tant qu’aucune vraie coordonnée n’est fournie.
    expect(site).toHaveProperty('telephone');
    expect(site).toHaveProperty('telephone_display');
    expect(site).toHaveProperty('whatsapp');
    for (const field of ['telephone', 'telephone_display', 'whatsapp']) {
      expect(typeof site[field], `champ « ${field } » : chaîne attendue`).toBe('string');
    }
  });

  it('n’expose pas de numéro fabriqué', () => {
    // Un faux numéro (0 répété, séquence triviale) ne doit jamais être publié :
    // sans coordonnée réelle, les boutons d’appel et WhatsApp sont masqués.
    for (const field of ['telephone', 'telephone_display', 'whatsapp']) {
      const valeur = String(site[field] ?? '');
      if (valeur.trim() === '') continue;
      const chiffres = valeur.replace(/\D/g, '');
      expect(chiffres.length, `${field} : numéro trop court pour être réel`).toBeGreaterThanOrEqual(8);
      expect(new Set(chiffres).size, `${field} : numéro composé d’un chiffre répété`).toBeGreaterThan(2);
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
  // Les photos sont regroupées par pièce : on lit `categories` (optionnel) et `photos`.
  const photos: any[] = Array.isArray(galerie.photos) ? galerie.photos : galerie.categories ?? [];

  it('liste des photos avec src et légende multilingue', () => {
    expect(photos.length).toBeGreaterThan(0);
    for (const p of photos) {
      expect(p.src, 'src manquant').toMatch(/^\/gruissan-location\/images\//);
      for (const lang of LANGUAGES) {
        expect(p.alt?.[lang] ?? p.legende?.[lang], `légende[${lang}] manquante pour ${p.src}`).toBeTruthy();
      }
    }
  });

  it('ne perd aucune photo : le nombre de photos est inchangé', () => {
    // Référence : 6 photos fournies à l’origine (01-sejour … 06-vue-ensemble).
    expect(photos.length).toBe(6);
  });

  it('chaque photo est rangée dans une pièce déclarée', () => {
    const ids = (galerie.categories ?? []).map((c: any) => c.id);
    for (const p of photos) {
      expect(p.categorie, `${p.src} : catégorie absente`).toBeTruthy();
      expect(ids, `${p.src} : catégorie « ${p.categorie} » non déclarée`).toContain(p.categorie);
    }
  });

  it('chaque pièce déclarée a un titre dans les 4 langues', () => {
    expect(galerie.categories.length).toBeGreaterThan(0);
    for (const c of galerie.categories) {
      expect(c.id, 'id manquant').toBeTruthy();
      for (const lang of LANGUAGES) {
        expect(c.titre[lang], `titre[${lang}] manquant pour ${c.id}`).toBeTruthy();
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

describe('content/modeles-reponse.json', () => {
  const donnees = loadJson('modeles-reponse.json');
  const modeles: any[] = Array.isArray(donnees.modeles) ? donnees.modeles : [];

  it('a des modèles avec texte, identifiant, catégorie et 4 langues', () => {
    expect(modeles.length).toBeGreaterThanOrEqual(3);
    for (const m of modeles) {
      expect(m.id, 'id manquant').toBeTruthy();
      expect(m.categorie, `${m.id} : catégorie`).toBeTruthy();
      expect(m.texte.trim(), `${m.id} : texte vide`).toBeTruthy();
      for (const lang of LANGUAGES) {
        expect(m.nom[lang], `nom[${lang}] manquant pour ${m.id}`).toBeTruthy();
      }
    }
  });

  it('n’utilise que des variables déclarées, toutes présentes dans le texte', () => {
    for (const m of modeles) {
      const variables = new Set(
        [...String(m.texte).matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((x) => x[1]),
      );
      expect(variables.size, `${m.id} : aucune variable`).toBeGreaterThan(0);
      for (const v of m.variables ?? []) {
        expect(variables.has(v), `${m.id} : variable déclarée absente du texte (${v})`).toBe(true);
      }
    }
  });

  it('a des identifiants uniques', () => {
    const ids = modeles.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
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

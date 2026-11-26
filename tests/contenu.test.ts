import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  fusionnerSectionsGuide,
  fusionnerTexte,
  libelleTarif,
  type SectionGuideBrute,
} from '../src/lib/contenu';
import { LANGUAGES } from '../src/i18n';

const CONTENT = new URL('../content/', import.meta.url).pathname;
const guide = JSON.parse(readFileSync(`${CONTENT}guide.json`, 'utf8'));
const tarifs = JSON.parse(readFileSync(`${CONTENT}tarifs.json`, 'utf8'));

/** Ligne Supabase telle que la prod la renvoie : titres traduits, corps fr seul. */
const ligneProd: SectionGuideBrute = {
  slug: 'bienvenue',
  titre: { fr: 'Bienvenue & check-in', en: 'Welcome & check-in', es: 'Bienvenida y check-in', de: 'Willkommen & Check-in' },
  contenu: { fr: '<p>Bienvenue à Gruissan Plage !</p>' },
  icone: '👋',
  ordre: 1,
};

const statiques: SectionGuideBrute[] = guide.sections;

/** Section statique connue, avec ses textes garantis par content/guide.json. */
function statiqueDe(slug: string) {
  const section = statiques.find((s) => s.slug === slug);
  if (!section?.titre || !section.contenu) throw new Error(`section ${slug} incomplète`);
  return { titre: section.titre, contenu: section.contenu };
}

describe('fusionnerTexte', () => {
  it('prend la langue de la ligne distante quand elle existe', () => {
    expect(fusionnerTexte({ fr: 'fr', en: 'en' }, { fr: 'autre', en: 'statique' }, 'en')).toBe('en');
  });

  it('retombe sur le JSON statique de la même langue quand la ligne ne l’a pas', () => {
    const statique = statiqueDe('bienvenue');
    const attendu = statique.contenu.en;
    expect(fusionnerTexte({ fr: '<p>Bienvenue à Gruissan Plage !</p>' }, statique.contenu, 'en')).toBe(attendu);
    expect(attendu).not.toContain('Bienvenue');
  });

  it('ne retombe jamais sur le français de la ligne si le statique a la langue', () => {
    const statique = statiqueDe('bienvenue');
    const resultat = fusionnerTexte({ fr: 'FR LIGNE' }, statique.contenu, 'de');
    expect(resultat).toBe(statique.contenu.de);
    expect(resultat).not.toBe('FR LIGNE');
  });

  it('retombe sur le français quand ni la ligne ni le statique n’ont la langue', () => {
    expect(fusionnerTexte({ fr: 'fr ligne' }, { fr: 'fr statique' }, 'es')).toBe('fr ligne');
    expect(fusionnerTexte({}, { fr: 'fr statique' }, 'es')).toBe('fr statique');
  });

  it('renvoie une chaîne vide sans aucune donnée', () => {
    expect(fusionnerTexte(undefined, undefined, 'en')).toBe('');
    expect(fusionnerTexte({ en: '   ' }, null, 'en')).toBe('');
  });
});

describe('fusionnerSectionsGuide', () => {
  it('rend le corps de chaque section dans la langue demandée', () => {
    const affichees = fusionnerSectionsGuide([ligneProd], statiques, 'en');
    expect(affichees).toHaveLength(1);
    expect(affichees[0].slug).toBe('bienvenue');
    expect(affichees[0].contenu).toBe(statiqueDe('bienvenue').contenu.en);
    expect(affichees[0].titre).toBe('Welcome & check-in');
  });

  it('conserve l’ordre reçu et l’icône distante', () => {
    const affichees = fusionnerSectionsGuide(
      [
        { ...ligneProd, slug: 'wifi', icone: '📶', ordre: 2 },
        { ...ligneProd, icone: '👋', ordre: 1 },
      ],
      statiques,
      'fr',
    );
    expect(affichees.map((s) => s.slug)).toEqual(['wifi', 'bienvenue']);
    expect(affichees[0].icone).toBe('📶');
  });

  it('reprend le statique pour une section absente du JSON', () => {
    const affichees = fusionnerSectionsGuide(
      [{ slug: 'inconnue', contenu: { fr: 'corps' }, ordre: 9 }],
      statiques,
      'en',
    );
    expect(affichees[0].titre).toBe('inconnue');
    expect(affichees[0].contenu).toBe('corps');
  });
});

describe('libelleTarif', () => {
  it('rend la langue demandée d’un libellé multilingue', () => {
    expect(libelleTarif({ fr: 'Draps', en: 'Linen', es: 'Ropa de cama', de: 'Bettwäsche' }, 'de')).toBe('Bettwäsche');
  });

  it('retombe sur le français quand la langue manque', () => {
    expect(libelleTarif({ fr: 'Draps' }, 'es')).toBe('Draps');
  });

  it('rend une ancienne chaîne plate telle quelle', () => {
    expect(libelleTarif('Ménage de fin de séjour', 'en')).toBe('Ménage de fin de séjour');
  });
});

describe('content/tarifs.json multilingue', () => {
  it('porte les inclus dans les 4 langues', () => {
    expect(Array.isArray(tarifs.inclus)).toBe(true);
    expect(tarifs.inclus.length).toBeGreaterThan(0);
    for (const item of tarifs.inclus) {
      expect(typeof item, 'chaîne plate interdite').toBe('object');
      for (const lang of LANGUAGES) {
        expect(item[lang], `inclus[${lang}] manquant`).toBeTruthy();
      }
    }
  });

  it('porte les options dans les 4 langues sans changer les prix', () => {
    expect(tarifs.options.map((o: any) => o.prix)).toEqual([65, 45, 70]);
    for (const opt of tarifs.options) {
      expect(typeof opt.nom, 'chaîne plate interdite').toBe('object');
      for (const lang of LANGUAGES) {
        expect(opt.nom[lang], `option ${opt.prix} : nom[${lang}] manquant`).toBeTruthy();
      }
    }
  });

  it('aucune traduction anglaise ne laisse une phrase française des listes', () => {
    const en = JSON.stringify(tarifs.inclus.map((i: any) => i.en));
    expect(en).not.toMatch(/Ménage|Draps|Location|Forfait/);
  });

  it('porte aussi périodes et notes de saison dans les 4 langues', () => {
    for (const saison of tarifs.saisons) {
      for (const champ of ['periode_i18n', 'note_i18n']) {
        for (const lang of LANGUAGES) {
          expect(saison[champ]?.[lang], `${saison.id}.${champ}[${lang}] manquant`).toBeTruthy();
        }
        // La clé française d'origine reste en place (rétrocompatibilité).
        expect(saison[champ].fr).toBe(saison[champ === 'periode_i18n' ? 'periode' : 'note']);
      }
    }
  });
});

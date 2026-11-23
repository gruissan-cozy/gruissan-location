/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import site from '../content/site.json';
import { LANGUAGES, t } from '../src/i18n';
import { htmlEnregistrement, libelleEnregistrement, valeurEnregistrement } from '../src/lib/enregistrement';

/** Parse le fragment renvoyé par le helper exactement comme le navigateur le ferait. */
function rendre(html: string): HTMLElement {
  const conteneur = document.createElement('div');
  conteneur.innerHTML = html;
  return conteneur;
}

describe('numéro d’enregistrement mairie — champ dans content/site.json', () => {
  it('existe et reste vide par défaut (aucun numéro inventé)', () => {
    expect(site).toHaveProperty('numero_enregistrement_mairie');
    expect(site.numero_enregistrement_mairie).toBe('');
  });
});

describe('htmlEnregistrement — aucun élément rendu sans numéro', () => {
  it('ne rend rien pour une chaîne vide, absente ou seulement blanche', () => {
    for (const lang of LANGUAGES) {
      for (const valeur of ['', '   ', undefined, null]) {
        const html = htmlEnregistrement(valeur, lang);
        expect(html, `[${lang}] valeur ${JSON.stringify(valeur)}`).toBe('');
        const dom = rendre(html);
        expect(dom.children, `[${lang}] aucun élément attendu`).toHaveLength(0);
        expect(dom.textContent, `[${lang}] aucun texte attendu`).toBe('');
      }
    }
  });

  it('ne laisse aucune mention « à compléter » ni placeholder', () => {
    for (const lang of LANGUAGES) {
      const html = htmlEnregistrement('', lang);
      expect(html).not.toMatch(/compl|placeholder|à remplir|to be filled|pendiente|ergänzen/i);
    }
  });
});

describe('htmlEnregistrement — mention affichée dès que le numéro est renseigné', () => {
  it('affiche la mention traduite dans les 4 langues', () => {
    for (const lang of LANGUAGES) {
      const html = htmlEnregistrement('11430 1234 5678', lang);
      const mention = rendre(html).querySelector('[data-enregistrement-mairie]');
      expect(mention, `[${lang}] mention absente du HTML`).not.toBeNull();
      expect(mention!.textContent, `[${lang}] mention incomplète`).toBe(
        `${t[lang]['footer.enregistrement']} 11430 1234 5678`,
      );
    }
  });

  it('libellés spécifiques attendus dans chaque langue', () => {
    const attendu: Record<string, string> = {
      fr: 'Numéro d\'enregistrement :',
      en: 'Registration number:',
      es: 'Número de registro:',
      de: 'Registrierungsnummer:',
    };
    for (const lang of LANGUAGES) {
      expect(libelleEnregistrement(lang), `[${lang}] libellé`).toBe(attendu[lang]);
      expect(rendre(htmlEnregistrement('123', lang)).textContent).toContain(attendu[lang]);
    }
  });

  it('unchiffre : la valeur lue est affichée telle quelle, sans invention', () => {
    expect(valeurEnregistrement('  ABC-2026  ')).toBe('ABC-2026');
    expect(valeurEnregistrement(12345 as unknown)).toBe('');
    expect(valeurEnregistrement(undefined)).toBe('');
  });

  it('échappe le HTML injecté dans le champ numéro', () => {
    const html = htmlEnregistrement('<script>alert(1)</script>', 'fr');
    const dom = rendre(html);
    expect(dom.querySelector('script')).toBeNull();
    expect(dom.textContent).toContain('<script>alert(1)</script>');
  });
});

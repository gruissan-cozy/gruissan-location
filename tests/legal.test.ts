import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import legal from '../content/legal.json';
import site from '../content/site.json';
import { LANGUAGES, t } from '../src/i18n';
import { legalT } from '../src/i18n/legal';
import {
  DUREES_CONSERVATION,
  aDesChampsRenseignes,
  champsRenseignes,
  cheminPage,
  formaterDate,
  interpoler,
  ligneEnregistrement,
  valeurPubliee,
} from '../src/lib/legal';
import {
  RETENTION_DONNEES_PERSONNELLES_JOURS,
  RETENTION_PREUVE_ANNEES,
} from '../supabase/functions/_shared/purge';

const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(ROOT, chemin), 'utf8');

const PAGES = {
  'mentions-legales': 'MentionsLegales',
  confidentialite: 'PolitiqueConfidentialite',
} as const;

type Groupe = Record<string, { valeur: string; a_valider: boolean }>;
const groupes: Array<[string, Groupe]> = [
  ['exploitant', legal.exploitant as Groupe],
  ['assurance', legal.assurance as Groupe],
  ['hebergeur', legal.hebergeur as Groupe],
];

describe('content/legal.json — valeurs inconnues marquées, jamais inventées', () => {
  it('déclare un marqueur booléen et une valeur texte pour chaque champ', () => {
    for (const [nom, groupe] of groupes) {
      for (const [cle, champ] of Object.entries(groupe)) {
        expect(typeof champ.valeur, `${nom}.${cle} : valeur texte attendue`).toBe('string');
        expect(typeof champ.a_valider, `${nom}.${cle} : booléen a_valider attendu`).toBe('boolean');
      }
    }
  });

  it('ne renseigne aucune valeur encore à valider (identité, assurance)', () => {
    for (const [nom, groupe] of groupes) {
      for (const [cle, champ] of Object.entries(groupe)) {
        if (!champ.a_valider) continue;
        expect(champ.valeur.trim(), `${nom}.${cle} : valeur inventée alors qu'elle est à valider`).toBe('');
      }
    }
  });

  it('garde l’hébergeur réel, vérifiable et publié', () => {
    const hebergeur = legal.hebergeur as Groupe;
    expect(hebergeur.nom.a_valider).toBe(false);
    expect(hebergeur.nom.valeur).toContain('GitHub');
    expect(hebergeur.adresse.valeur.length).toBeGreaterThan(10);
    expect(hebergeur.site.valeur).toMatch(/^https:\/\//);
  });
});

describe('lib/legal.ts — lecture stricte des champs', () => {
  it('ne restitue rien pour un champ vide, absent ou mal typé', () => {
    for (const champ of ['', '   ', undefined, null, 12, {}, { valeur: '  ' }, { a_valider: true }]) {
      expect(valeurPubliee(champ), JSON.stringify(champ)).toBe('');
    }
  });

  it('restitue la valeur renseignée, sans le marqueur', () => {
    expect(valeurPubliee({ valeur: '  Gruissan Cozy  ', a_valider: true })).toBe('Gruissan Cozy');
    expect(valeurPubliee('  Texte  ')).toBe('Texte');
  });

  it('liste uniquement les champs renseignés, dans l’ordre du fichier', () => {
    const champs = champsRenseignes({
      a: { valeur: '', a_valider: true },
      b: { valeur: 'B', a_valider: false },
      c: { valeur: 'C', a_valider: true },
      d: { valeur: '   ', a_valider: true },
    });
    expect(champs).toEqual([
      { cle: 'b', valeur: 'B' },
      { cle: 'c', valeur: 'C' },
    ]);
    expect(aDesChampsRenseignes({ a: { valeur: '', a_valider: true } })).toBe(false);
    expect(aDesChampsRenseignes(null)).toBe(false);
  });

  it('interpole les jetons sans laisser de gabarit visible', () => {
    expect(interpoler('Écrivez à {0} avant le {1}.', ['a@b.fr', '1er mai'])).toBe(
      'Écrivez à a@b.fr avant le 1er mai.',
    );
    expect(interpoler('Rien à remplacer', [])).toBe('Rien à remplacer');
  });

  it('construit l’adresse des deux pages dans les quatre langues', () => {
    expect(cheminPage('mentions-legales', 'fr')).toBe('/gruissan-location/mentions-legales/');
    expect(cheminPage('confidentialite', 'fr')).toBe('/gruissan-location/confidentialite/');
    for (const lang of ['en', 'es', 'de'] as const) {
      expect(cheminPage('mentions-legales', lang)).toBe(
        `/gruissan-location/${lang}/mentions-legales/`,
      );
      expect(cheminPage('confidentialite', lang)).toBe(
        `/gruissan-location/${lang}/confidentialite/`,
      );
    }
  });

  it('formate la date de mise à jour selon la langue', () => {
    expect(formaterDate('2026-11-23', 'fr')).toBe('23/11/2026');
    expect(formaterDate('2026-11-23', 'de')).toBe('23.11.2026');
    expect(formaterDate('pas une date', 'fr')).toBe('');
    expect(formaterDate('', 'fr')).toBe('');
  });
});

describe('durées de conservation — celles du code, pas une promesse séparée', () => {
  it('reprend exactement les constantes de la purge', () => {
    expect(DUREES_CONSERVATION.donneesPersonnellesJours).toBe(RETENTION_DONNEES_PERSONNELLES_JOURS);
    expect(DUREES_CONSERVATION.preuveAnnees).toBe(RETENTION_PREUVE_ANNEES);
    expect(DUREES_CONSERVATION.donneesPersonnellesJours).toBe(30);
    expect(DUREES_CONSERVATION.preuveAnnees).toBe(5);
  });

  it('insère ces durées dans le texte publié, jamais un nombre en dur', () => {
    for (const lang of LANGUAGES) {
      const donnees = interpoler(legalT[lang]['confidentialite.durees.donnees'], [30]);
      const preuve = interpoler(legalT[lang]['confidentialite.durees.preuve'], [5]);
      expect(donnees).toContain('30');
      expect(preuve).toContain('5');
      expect(donnees).not.toContain('{0}');
      expect(preuve).not.toContain('{0}');
    }
  });
});

describe('numéro d’enregistrement mairie', () => {
  it('n’affiche aucune ligne tant que le champ est vide', () => {
    expect(ligneEnregistrement('', t.fr['footer.enregistrement'])).toBe('');
    expect(ligneEnregistrement(undefined, t.fr['footer.enregistrement'])).toBe('');
    expect(ligneEnregistrement('   ', t.fr['footer.enregistrement'])).toBe('');
  });

  it('apparaît dès que le numéro est renseigné, dans les quatre langues', () => {
    for (const lang of LANGUAGES) {
      const ligne = ligneEnregistrement('11430 1234 5678', t[lang]['footer.enregistrement']);
      expect(ligne, `[${lang}] numéro absent`).toContain('11430 1234 5678');
      expect(ligne, `[${lang}] libellé absent`).toContain(t[lang]['footer.enregistrement']);
    }
  });

  it('est bien branché sur content/site.json dans les mentions légales', () => {
    const page = lire('src/components/MentionsLegales.astro');
    expect(page).toContain('site.numero_enregistrement_mairie');
    expect(page).toContain('ligneEnregistrement(');
    expect(page).toMatch(/\{enregistrement &&/);
    expect(site).toHaveProperty('numero_enregistrement_mairie');
  });
});

describe('les deux pages existent dans les quatre langues', () => {
  for (const [page, composant] of Object.entries(PAGES)) {
    for (const lang of LANGUAGES) {
      it(`/${lang}/${page}/ est construite et passe lang="${lang}"`, () => {
        const dossier = lang === 'fr' ? '' : `${lang}/`;
        const chemin = `src/pages/${dossier}${page}.astro`;
        expect(existsSync(join(ROOT, chemin)), `${chemin} absent`).toBe(true);
        const source = lire(chemin);
        expect(source, `${chemin} : composant ${composant} non importé`).toContain(
          `import ${composant} from`,
        );
        expect(source, `${chemin} : langue non transmise`).toContain(`<${composant} lang="${lang}" />`);
      });
    }

    it(`le composant ${composant} utilise le gabarit commun et le dictionnaire légal`, () => {
      const source = lire(`src/components/${composant}.astro`);
      expect(source).toContain("import LegalPage from './LegalPage.astro'");
      expect(source).toContain('legalT[lang]');
      expect(source).toContain('<LegalPage');
    });
  }
});

describe('pied de page — liens vers les deux pages dans les quatre langues', () => {
  const layout = lire('src/layouts/Layout.astro');

  it('utilise cheminPage pour les deux liens', () => {
    expect(layout).toContain("cheminPage('mentions-legales', lang)");
    expect(layout).toContain("cheminPage('confidentialite', lang)");
  });

  it('affiche les libellés traduits fournis par i18n.ts', () => {
    expect(layout).toContain("tr['footer.legal']");
    expect(layout).toContain("tr['footer.confidentialite']");
    for (const lang of LANGUAGES) {
      expect(t[lang]['footer.legal'], `footer.legal vide en ${lang}`).toBeTruthy();
      expect(t[lang]['footer.confidentialite'], `footer.confidentialite vide en ${lang}`).toBeTruthy();
    }
  });
});

describe('contenu réel — aucun texte d’attente visible en production', () => {
  const ATTENTE = /a_valider|à compléter|a completer|à remplir|todo|lorem ipsum|placeholder|\bxxx\b/i;

  it('n’expose aucun marqueur ni placeholder dans les quatre langues', () => {
    for (const lang of LANGUAGES) {
      for (const [cle, valeur] of Object.entries(legalT[lang])) {
        expect(valeur, `[${lang}] ${cle} contient un texte d’attente`).not.toMatch(ATTENTE);
        expect(valeur.trim().length, `[${lang}] ${cle} est vide`).toBeGreaterThan(0);
      }
    }
  });

  it('couvre les sujets attendus de la politique de confidentialité', () => {
    for (const lang of LANGUAGES) {
      for (const cle of [
        'confidentialite.donnees.reservation',
        'confidentialite.donnees.etat',
        'confidentialite.donnees.techniques',
        'confidentialite.durees.donnees',
        'confidentialite.durees.preuve',
        'confidentialite.droits.acces',
        'confidentialite.droits.exercer',
        'confidentialite.destinataires.supabase',
        'confidentialite.destinataires.resend',
      ]) {
        expect(legalT[lang][cle], `[${lang}] ${cle} manquant`).toBeTruthy();
      }
    }
  });

  it('respecte la parité des clés entre les quatre langues', () => {
    const reference = Object.keys(legalT.fr).sort();
    expect(reference.length).toBeGreaterThan(30);
    for (const lang of LANGUAGES) {
      const cles = Object.keys(legalT[lang]).sort();
      expect(cles, `[${lang}] clés manquantes`).toEqual(reference);
    }
  });
});

describe('aucune mention de classement, de notation ni de distinction', () => {
  const INTERDIT = /class[ée]|classement|classification|clasificaci|klassifizier|étoile|estrellas?|sterne?|stars?|label/i;
  const fichiers = [
    'content/legal.json',
    'src/i18n/legal.ts',
    'src/components/MentionsLegales.astro',
    'src/components/PolitiqueConfidentialite.astro',
    'src/components/LegalPage.astro',
  ];

  for (const fichier of fichiers) {
    it(`${fichier} reste neutre sur le statut du logement`, () => {
      expect(lire(fichier)).not.toMatch(INTERDIT);
    });
  }
});

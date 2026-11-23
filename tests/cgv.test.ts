import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import cgv from '../content/cgv.json';
import annulation from '../content/annulation.json';
import tarifs from '../content/tarifs.json';
import site from '../content/site.json';
import { LANGUAGES, t } from '../src/i18n';
import { cgvT } from '../src/i18n/cgv';
import { cheminPage, interpoler } from '../src/lib/legal';
import {
  baremeAffiche,
  baremeContractuel,
  montantTaxeAffichable,
  texteAnnulation,
  versionCgv,
} from '../src/lib/cgv';

const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(ROOT, chemin), 'utf8');

describe('lib/cgv.ts — barème d’annulation', () => {
  it('reprend les lignes du fichier de contenu, traduites', () => {
    const lignes = baremeAffiche(annulation, 'fr');
    expect(lignes).toHaveLength(4);
    expect(lignes[0]).toEqual({ delai: "Plus de 30 jours avant l'arrivée", remboursementPct: 100 });
    expect(lignes[3].remboursementPct).toBe(0);
    for (const lang of LANGUAGES) {
      const traduites = baremeAffiche(annulation, lang);
      expect(traduites, `[${lang}] barème incomplet`).toHaveLength(4);
      for (const ligne of traduites) {
        expect(ligne.delai.trim().length, `[${lang}] délai vide`).toBeGreaterThan(0);
      }
    }
  });

  it('écarte une ligne au pourcentage illisible plutôt que de l’afficher', () => {
    const bancal = {
      bareme: [
        { delai: { fr: 'Plus de 30 jours' }, remboursement_pct: 100 },
        { delai: { fr: 'Entre 30 et 15 jours' }, remboursement_pct: 'cinquante' },
        { delai: { fr: 'Moins de 7 jours' }, remboursement_pct: 140 },
        { delai: { fr: 'De 14 à 7 jours' }, remboursement_pct: 25.5 },
        { delai: { fr: 'Dernier jour' }, remboursement_pct: -5 },
        { delai: { en: 'No French label' }, remboursement_pct: 10 },
      ],
    };
    expect(baremeAffiche(bancal, 'fr')).toEqual([{ delai: 'Plus de 30 jours', remboursementPct: 100 }]);
  });

  it('ne renvoie rien pour une source absente ou mal formée', () => {
    for (const source of [null, undefined, {}, { bareme: null }, { bareme: 'x' }]) {
      expect(baremeAffiche(source, 'fr'), JSON.stringify(source)).toEqual([]);
    }
  });

  it('ne considère le barème contractuel que si `a_valider` vaut explicitement false', () => {
    expect(baremeContractuel(annulation)).toBe(false);
    expect(baremeContractuel({ a_valider: false })).toBe(true);
    expect(baremeContractuel({ a_valider: 'false' })).toBe(false);
    expect(baremeContractuel({})).toBe(false);
    expect(baremeContractuel(null)).toBe(false);
  });

  it('lit les textes libres dans la langue demandée', () => {
    for (const lang of LANGUAGES) {
      expect(texteAnnulation(annulation, 'explications', lang).length).toBeGreaterThan(20);
      expect(texteAnnulation(annulation, 'note_proprietaire', lang).length).toBeGreaterThan(20);
    }
    expect(texteAnnulation(annulation, 'explications', 'it' as never)).toBe('');
    expect(texteAnnulation(null, 'explications', 'fr')).toBe('');
  });
});

describe('lib/cgv.ts — taxe de séjour', () => {
  it('ne publie aucun montant tant que le taux n’est pas validé', () => {
    expect(tarifs.a_valider).toBe(true);
    expect(montantTaxeAffichable(tarifs)).toBeNull();
  });

  it('publie le taux dès qu’il est validé, arrondi au centime', () => {
    expect(montantTaxeAffichable({ a_valider: false, taxe_sejour_par_nuit_personne: 1.15 })).toBe(1.15);
    expect(montantTaxeAffichable({ a_valider: false, taxe_sejour_par_nuit_personne: '2.3' })).toBe(2.3);
  });

  it('refuse un taux illisible ou négatif même validé', () => {
    for (const taux of [null, undefined, 'beaucoup', -1, Number.NaN]) {
      expect(montantTaxeAffichable({ a_valider: false, taxe_sejour_par_nuit_personne: taux })).toBeNull();
    }
    expect(montantTaxeAffichable(null)).toBeNull();
  });
});

describe('lib/cgv.ts — version des CGV', () => {
  it('rend la version déclarée dans le fichier de contenu', () => {
    expect(versionCgv(cgv)).toBe(cgv.version);
    expect(versionCgv(cgv)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rend une chaîne vide plutôt qu’une référence inventée', () => {
    for (const source of [null, undefined, {}, { version: '' }, { version: 12 }]) {
      expect(versionCgv(source), JSON.stringify(source)).toBe('');
    }
  });
});

describe('content/cgv.json — rien d’inventé', () => {
  it('laisse le médiateur vide tant que le propriétaire n’a pas adhéré', () => {
    for (const [cle, champ] of Object.entries(cgv.mediateur)) {
      expect(typeof champ.valeur, `mediateur.${cle}`).toBe('string');
      expect(typeof champ.a_valider, `mediateur.${cle}`).toBe('boolean');
      if (champ.a_valider) {
        expect(champ.valeur.trim(), `mediateur.${cle} : coordonnée inventée`).toBe('');
      }
    }
  });

  it('marque l’ensemble du document comme à valider', () => {
    expect(cgv.a_valider).toBe(true);
  });
});

describe('i18n/cgv.ts — parité et absence de valeur juridique en dur', () => {
  it('respecte la parité des clés entre les quatre langues', () => {
    const reference = Object.keys(cgvT.fr).sort();
    expect(reference.length).toBeGreaterThan(35);
    for (const lang of LANGUAGES) {
      expect(Object.keys(cgvT[lang]).sort(), `[${lang}] clés divergentes`).toEqual(reference);
      for (const [cle, valeur] of Object.entries(cgvT[lang])) {
        expect(valeur.trim().length, `[${lang}] ${cle} vide`).toBeGreaterThan(0);
      }
    }
  });

  it('ne laisse aucun gabarit non interpolé dans les textes à trous', () => {
    const aTrous = [
      'cgv.objet.texte',
      'cgv.logement.texte',
      'cgv.prix.caution',
      'cgv.reglement.texte',
      'cgv.mediateur.texte',
      'cgv.version.texte',
    ];
    for (const lang of LANGUAGES) {
      for (const cle of aTrous) {
        expect(cgvT[lang][cle], `[${lang}] ${cle} sans jeton {0}`).toContain('{0}');
        expect(interpoler(cgvT[lang][cle], ['x']), `[${lang}] ${cle} laisse un gabarit`).not.toContain('{0}');
      }
    }
  });

  it('n’écrit aucun montant en dur : le taux vient du fichier de contenu', () => {
    for (const lang of LANGUAGES) {
      for (const [cle, valeur] of Object.entries(cgvT[lang])) {
        expect(valeur, `[${lang}] ${cle} : montant en euros codé en dur`).not.toMatch(/\d+[,.]\d{2}\s*€/);
        expect(valeur, `[${lang}] ${cle} : pourcentage de barème codé en dur`).not.toMatch(/\b\d{1,3}\s?%/);
      }
    }
  });
});

describe('exigences de la roadmap sur le contenu des CGV', () => {
  it('affirme le statut « meublé de tourisme non classé » dans les quatre langues', () => {
    const attendus = {
      fr: /non classé/i,
      en: /unclassified/i,
      es: /sin clasificaci/i,
      de: /nicht eingestuft/i,
    } as const;
    for (const lang of LANGUAGES) {
      expect(cgvT[lang]['cgv.logement.nonClasse'], `[${lang}] statut absent`).toMatch(attendus[lang]);
    }
  });

  it('n’évoque un classement, des étoiles ou un label que pour les exclure', () => {
    // Le statut « non classé » doit être affirmé (exigence de la roadmap), mais
    // aucune page ne doit laisser croire à un classement obtenu : toute
    // occurrence de ces mots doit se trouver dans une phrase de négation.
    const MOTS = /\b(?:classement|classé|clasificación|clasificado|einstufung|eingestuft|étoiles?|stars?|sterne?n?|estrellas?|label)\b/i;
    const NEGATION =
      /\b(?:non|aucun|aucune|sans|ni|no|not|never|kein|keine|ohne|nicht|ningún|ninguna|sin|ni)\b/i;
    for (const lang of LANGUAGES) {
      for (const [cle, valeur] of Object.entries(cgvT[lang])) {
        for (const phrase of valeur.split(/[.;:!?]\s+/)) {
          if (!MOTS.test(phrase)) continue;
          expect(phrase, `[${lang}] ${cle} : mention positive d’un classement — « ${phrase} »`).toMatch(
            NEGATION,
          );
        }
      }
    }
  });

  it('couvre les sujets exigés : prix, annulation, caution, médiation, droit applicable', () => {
    const sujets = [
      'cgv.prix.titre',
      'cgv.annulation.titre',
      'cgv.etat.titre',
      'cgv.mediateur.titre',
      'cgv.droit.titre',
      'cgv.prix.taxe',
      'cgv.reservation.paiement',
    ];
    for (const lang of LANGUAGES) {
      for (const cle of sujets) {
        expect(cgvT[lang][cle], `[${lang}] ${cle} manquant`).toBeTruthy();
      }
    }
  });

  it('présente la taxe au régime non classé, avec exonération des mineurs', () => {
    const attendus = {
      fr: /mineurs/i,
      en: /minors/i,
      es: /menores/i,
      de: /minderjährige/i,
    } as const;
    for (const lang of LANGUAGES) {
      expect(cgvT[lang]['cgv.prix.taxe'], `[${lang}] exonération absente`).toMatch(attendus[lang]);
    }
  });

  it('ne promet aucun encaissement en ligne', () => {
    expect(cgvT.fr['cgv.reservation.paiement']).toMatch(/aucun paiement/i);
    expect(cgvT.en['cgv.reservation.paiement']).toMatch(/no payment/i);
  });
});

describe('les pages existent dans les quatre langues et sont reliées au pied de page', () => {
  const layout = lire('src/layouts/Layout.astro');

  it('construit /conditions-generales/ dans les quatre langues', () => {
    expect(cheminPage('conditions-generales', 'fr')).toBe('/gruissan-location/conditions-generales/');
    for (const lang of ['en', 'es', 'de'] as const) {
      expect(cheminPage('conditions-generales', lang)).toBe(
        `/gruissan-location/${lang}/conditions-generales/`,
      );
    }
  });

  for (const lang of LANGUAGES) {
    it(`/${lang}/conditions-generales/ existe et passe lang="${lang}"`, () => {
      const dossier = lang === 'fr' ? '' : `${lang}/`;
      const chemin = `src/pages/${dossier}conditions-generales.astro`;
      expect(existsSync(join(ROOT, chemin)), `${chemin} absent`).toBe(true);
      const source = lire(chemin);
      expect(source).toContain('import ConditionsGenerales from');
      expect(source).toContain(`<ConditionsGenerales lang="${lang}" />`);
    });
  }

  it('relie la page depuis le pied de page, avec un libellé traduit', () => {
    expect(layout).toContain("cheminPage('conditions-generales', lang)");
    expect(layout).toContain("tr['footer.cgv']");
    for (const lang of LANGUAGES) {
      expect(t[lang]['footer.cgv'], `footer.cgv vide en ${lang}`).toBeTruthy();
    }
  });
});

describe('composant — aucune donnée juridique fabriquée à l’affichage', () => {
  const composant = lire('src/components/ConditionsGenerales.astro');

  it('lit le barème, la caution et la version depuis les fichiers de contenu', () => {
    expect(composant).toContain("import annulation from '../../content/annulation.json'");
    expect(composant).toContain("import tarifs from '../../content/tarifs.json'");
    expect(composant).toContain("import cgv from '../../content/cgv.json'");
    expect(composant).toContain('baremeAffiche(');
    expect(composant).toContain('montantTaxeAffichable(');
  });

  it('signale le barème non contractuel au lieu de le présenter comme acquis', () => {
    expect(composant).toContain('baremeContractuel(');
    expect(composant).toContain('cgv.annulation.modele');
  });

  it('n’affiche la version que si elle est renseignée', () => {
    expect(composant).toMatch(/versionTexte &&/);
  });

  it('renvoie vers la politique de confidentialité et le guide', () => {
    expect(composant).toContain("cheminPage('confidentialite', lang)");
    expect(composant).toContain('guideHref');
  });

  it('n’expose aucune coordonnée de médiateur inventée', () => {
    expect(composant).toContain('champsRenseignes(cgv.mediateur)');
    expect(composant).toContain('cgv.mediateur.absent');
  });

  it('reprend le numéro d’enregistrement quand il est renseigné', () => {
    // Le numéro vit dans les mentions légales, déjà reliées depuis cette page.
    expect(site).toHaveProperty('numero_enregistrement_mairie');
    expect(composant).toContain("cheminPage('mentions-legales', lang)");
  });
});

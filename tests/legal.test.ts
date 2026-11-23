import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import legal from '../content/legal.json';
import site from '../content/site.json';
import { LANGUAGES, t } from '../src/i18n';
import { legalT } from '../src/i18n/legal';
import {
  DUREES_CONSERVATION,
  adresseContact,
  aDesChampsRenseignes,
  champsRenseignes,
  cheminPage,
  formaterDate,
  interpoler,
  ligneEnregistrement,
  valeurPubliee,
} from '../src/lib/legal';
import {
  RETENTION_COORDONNEES_JOURS,
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

  it('ne présente pas la borne de session comme une durée de conservation du séjour', () => {
    // La purge ne supprime que les sessions expirées, les notes et les fichiers
    // hors preuve. Les données de réservation (`sejours.client_*`) ne sont
    // purgées par rien : la page ne doit donc pas annoncer leur effacement.
    for (const lang of LANGUAGES) {
      const texte = legalT[lang]['confidentialite.durees.sejour'];
      expect(texte, `[${lang}] durée du séjour absente`).toBeTruthy();
      expect(texte, `[${lang}] annonce une suppression à 30 jours`).toMatch(/\{0\}/);
    }
  });

  it('distingue explicitement session, notes et dossier de séjour', () => {
    for (const lang of LANGUAGES) {
      for (const cle of [
        'confidentialite.durees.session',
        'confidentialite.durees.notes',
        'confidentialite.durees.sejour',
        'confidentialite.durees.preuve',
      ]) {
        expect(legalT[lang][cle], `[${lang}] ${cle} manquant`).toBeTruthy();
      }
      // Aucune clé ne doit plus prétendre purger les données de réservation.
      expect(legalT[lang]).not.toHaveProperty('confidentialite.durees.donnees');
    }
  });

  it('reste aligné sur la purge réelle : les coordonnées sont bien effacées', () => {
    // Sens inversé depuis la décision de kiki (2026-11-23) : les coordonnées
    // du voyageur ne sont plus conservées, elles sont effacées. La page doit
    // donc pouvoir l'affirmer — et si la purge cessait de le faire, ce test
    // tomberait pour forcer à corriger le texte dans le même commit.
    const purge = lire('supabase/functions/purge-tenant-data/index.ts');
    for (const colonne of ['client_email', 'client_nom', 'client_telephone', 'client_message']) {
      expect(purge, `la purge n'efface plus ${colonne} : la page devient fausse`).toContain(colonne);
    }
    // `client_nom` est `not null` : elle doit être remplacée, jamais vidée.
    expect(purge).toContain('NOM_ANONYMISE');
    expect(purge).not.toMatch(/client_nom:\s*null/);
    // Les messages du formulaire de contact suivent la même règle.
    expect(purge).toMatch(/from\(\s*['"]messages['"]\s*\)/);
  });

  it('annonce le délai réel des coordonnées, importé de la purge', () => {
    // Le nombre affiché ne doit pas être recopié : il vient de la constante
    // que la purge applique.
    expect(DUREES_CONSERVATION.coordonneesJours).toBe(RETENTION_COORDONNEES_JOURS);
    for (const lang of LANGUAGES) {
      const sejour = interpoler(legalT[lang]['confidentialite.durees.sejour'], [
        DUREES_CONSERVATION.coordonneesJours,
      ]);
      const messages = interpoler(legalT[lang]['confidentialite.durees.messages'], [
        DUREES_CONSERVATION.coordonneesJours,
      ]);
      expect(sejour, `[${lang}] séjour sans le délai`).toContain(
        String(DUREES_CONSERVATION.coordonneesJours),
      );
      expect(messages, `[${lang}] messages sans le délai`).toContain(
        String(DUREES_CONSERVATION.coordonneesJours),
      );
      expect(sejour).not.toContain('{0}');
      expect(messages).not.toContain('{0}');
    }
  });

  it('insère ces durées dans le texte publié, jamais un nombre en dur', () => {
    for (const lang of LANGUAGES) {
      const session = interpoler(legalT[lang]['confidentialite.durees.session'], [30]);
      const sejour = interpoler(legalT[lang]['confidentialite.durees.sejour'], [30]);
      const preuve = interpoler(legalT[lang]['confidentialite.durees.preuve'], [5]);
      expect(session, `[${lang}] session sans la borne`).toContain('30');
      expect(sejour, `[${lang}] séjour sans la borne`).toContain('30');
      expect(preuve, `[${lang}] preuve sans la durée`).toContain('5');
      for (const texte of [session, sejour, preuve]) {
        expect(texte).not.toContain('{0}');
      }
    }
  });
});

describe('sous-traitants — chaque hôte externe réellement appelé est déclaré', () => {
  // Une page RGPD qui omet un destinataire est fausse, même si elle est bien
  // écrite. Ce test relève les hôtes `https://…` des pages qui chargent des
  // ressources, et exige que chacun soit couvert par une clé
  // `confidentialite.destinataires.*`.
  const PAGES = [
    'src/layouts/Layout.astro',
    'src/components/Vitrine.astro',
    'src/components/Reservation.astro',
    'src/pages/tenant/index.astro',
  ];

  /**
   * Hôtes qui ne sont pas des sous-traitants, avec la raison.
   * - le site lui-même (URL canonique, images, liens internes) ;
   * - `schema.org` n'est pas appelé : c'est un identifiant de vocabulaire
   *   JSON-LD, inscrit en texte dans la page, sans requête réseau.
   */
  const EXCEPTIONS: Record<string, string> = {
    'gruissan-cozy.github.io': 'le site lui-même',
    'schema.org': 'identifiant de vocabulaire JSON-LD, aucune requête réseau',
  };

  /** Hôte → clé i18n censée le décrire. */
  const COUVERTURE: Record<string, string> = {
    'formsubmit.co': 'confidentialite.destinataires.formsubmit',
    'fonts.googleapis.com': 'confidentialite.destinataires.googlefonts',
    'fonts.gstatic.com': 'confidentialite.destinataires.googlefonts',
    'supabase.co': 'confidentialite.destinataires.supabase',
    'resend.com': 'confidentialite.destinataires.resend',
  };

  function hotes(): string[] {
    const trouves = new Set<string>();
    for (const page of PAGES) {
      if (!existsSync(join(ROOT, page))) continue;
      for (const m of lire(page).matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) {
        trouves.add(m[1].toLowerCase());
      }
    }
    return [...trouves].sort();
  }

  it('ne laisse aucun hôte non déclaré ni justifié', () => {
    const orphelins = hotes().filter(
      (hote) => !(hote in EXCEPTIONS) && !(hote in COUVERTURE),
    );
    expect(orphelins, `hôtes externes non déclarés dans la politique : ${orphelins.join(', ')}`).toEqual([]);
  });

  it('déclare les deux sous-traitants qui transmettent des données visiteurs', () => {
    // FormSubmit reçoit le contenu des formulaires, Google Fonts l'IP.
    const liste = hotes();
    expect(liste).toContain('formsubmit.co');
    expect(liste.some((h) => h.startsWith('fonts.'))).toBe(true);
    for (const lang of LANGUAGES) {
      for (const cle of [
        'confidentialite.destinataires.formsubmit',
        'confidentialite.destinataires.googlefonts',
      ]) {
        expect(legalT[lang][cle], `[${lang}] ${cle} manquant`).toBeTruthy();
      }
    }
  });

  it('chaque hôte couvert renvoie à une clé réellement présente dans les 4 langues', () => {
    for (const [hote, cle] of Object.entries(COUVERTURE)) {
      for (const lang of LANGUAGES) {
        expect(legalT[lang][cle], `[${hote}] ${cle} absent en ${lang}`).toBeTruthy();
      }
    }
  });

  it('les sous-traitants déclarés sont affichés par la page', () => {
    const composant = lire('src/components/PolitiqueConfidentialite.astro');
    for (const cle of ['formsubmit', 'googlefonts', 'supabase', 'resend']) {
      expect(composant, `destinataire « ${cle} » non rendu`).toContain(
        `confidentialite.destinataires.${cle}`,
      );
    }
  });
});

describe('adresse de contact — aucune adresse d’exemple publiée', () => {
  it('n’affiche jamais un domaine réservé à la documentation', () => {
    // `contact@exemple.com` ne reçoit aucun courrier : la publier comme moyen
    // d'exercer ses droits RGPD serait une fausse information.
    expect(adresseContact('contact@exemple.com')).toBe('');
    expect(adresseContact('contact@example.com')).toBe('');
    expect(adresseContact('quelquun@exemple.com')).toBe('');
    for (const invalide of ['', '   ', 'sans-arobase', '@exemple.com', 'a@', null, 42]) {
      expect(adresseContact(invalide), JSON.stringify(invalide)).toBe('');
    }
    expect(adresseContact('  vrai@gruissan-cozy.fr  ')).toBe('vrai@gruissan-cozy.fr');
  });

  it('passe l’adresse affichée par le filtre, dans les trois pages légales', () => {
    // Si un composant affichait `site.email` en direct, l'adresse réservée
    // redeviendrait visible : on exige le passage par `adresseContact`.
    for (const composant of [
      'src/components/MentionsLegales.astro',
      'src/components/PolitiqueConfidentialite.astro',
      'src/components/ConditionsGenerales.astro',
    ]) {
      const source = lire(composant);
      expect(source, `${composant} : adresse non filtrée`).toContain('adresseContact(');
    }
  });

  it('aucun composant ne publie `site.email` en direct', () => {
    // Le pied de page, le JSON-LD, le formulaire de contact et le formulaire de
    // réservation passaient tous `site.email` brut : `contact@exemple.com`
    // finissait dans le HTML et `formsubmit.co/contact@exemple.com` ne recevait
    // rien. Tout affichage doit passer par `adresseContact`.
    const FICHIERS = [
      'src/layouts/Layout.astro',
      'src/components/Vitrine.astro',
      'src/components/Reservation.astro',
      'src/components/MentionsLegales.astro',
      'src/components/PolitiqueConfidentialite.astro',
      'src/components/ConditionsGenerales.astro',
    ];
    for (const fichier of FICHIERS) {
      const source = lire(fichier);
      const directs = [
        ...source.matchAll(/(?:mailto:\$\{site\.email\}|formsubmit\.co\/\$\{site\.email\}|email: site\.email)/g),
      ].map((m) => m[0]);
      expect(directs, `${fichier} publie site.email sans filtre`).toEqual([]);
    }
  });

  it('aucun formulaire ne poste vers une adresse non utilisable', () => {
    // Sans adresse de réception, `action` doit être conditionnelle : un
    // formulaire qui poste vers un domaine réservé accepte la saisie puis la
    // perd. Mais le formulaire de contact reste rendu si Supabase est
    // configuré : le script client écrit alors dans `messages` et n'a pas
    // besoin de l'email (qui ne sert qu'au repli FormSubmit).
    const vitrine = lire('src/components/Vitrine.astro');
    expect(vitrine).toContain(
      'action={emailContact ? `https://formsubmit.co/${emailContact}` : undefined}',
    );
    expect(vitrine).toContain('formulaireContactUtilisable');
    expect(vitrine).toContain("tr['contact.indisponible']");
    const reservation = lire('src/components/Reservation.astro');
    expect(reservation).toContain('action={emailContact ?');
    expect(reservation).toContain('errorSansEmail');
  });

  it('remplace l’adresse absente par un texte honnête, dans les quatre langues', () => {
    for (const lang of LANGUAGES) {
      expect(legalT[lang]['legal.contactNonPublie'], `[${lang}] texte de repli manquant`).toBeTruthy();
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

  it('n’affiche aucun domaine réservé à la documentation', () => {
    // `exemple.com` / `example.com` ne reçoivent aucun courrier : les publier
    // dans un texte légal, c'est publier une adresse qui n'existe pas. La garde
    // porte sur TOUS les textes légaux, pas seulement sur `site.email`.
    const RESERVE = /exemple\.(com|fr|org)|example\.(com|fr|org)/i;
    for (const lang of LANGUAGES) {
      for (const [cle, valeur] of Object.entries(legalT[lang])) {
        expect(valeur, `[${lang}] ${cle} publie un domaine d'exemple`).not.toMatch(RESERVE);
      }
    }
    for (const composant of [
      'src/components/MentionsLegales.astro',
      'src/components/PolitiqueConfidentialite.astro',
      'src/components/ConditionsGenerales.astro',
    ]) {
      // Les commentaires d'explication citent volontairement « exemple.com » :
      // on ne teste que le code rendu, lignes de commentaire retirées.
      const code = lire(composant)
        .split('\n')
        .filter((ligne) => !/^\s*(\/\/|\*|\/\*)/.test(ligne))
        .join('\n');
      expect(code, `${composant} : domaine d'exemple en dur`).not.toMatch(RESERVE);
    }
  });

  it('couvre les sujets attendus de la politique de confidentialité', () => {
    for (const lang of LANGUAGES) {
      for (const cle of [
        'confidentialite.donnees.reservation',
        'confidentialite.donnees.etat',
        'confidentialite.donnees.techniques',
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

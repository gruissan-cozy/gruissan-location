import { describe, it, expect } from 'vitest';
import modelesData from '../content/modeles-reponse.json';
import {
  anomaliesModele,
  curseurApresInsertion,
  echapperVariable,
  extraireIntervalle,
  extraireVariables,
  insererDansChamp,
  libellerModele,
  modeleValide,
  preparerInsertion,
  rendreModele,
  selectionnerModeles,
  variablesDeclaresInutiles,
  type ModeleReponse,
} from '../src/lib/modeles';

const NOMS = { fr: 'Disponibilité', en: 'Availability', es: 'Disponibilidad', de: 'Verfügbarkeit' };

/** Modèle minimal, écrasé par les champs fournis. */
function modele(s: Partial<ModeleReponse> & { id: string }): ModeleReponse {
  return { categorie: 'disponibilite', nom: { ...NOMS }, texte: 'Bonjour {nom},', ...s };
}

describe('extraireVariables', () => {
  it('trouve les variables dans l’ordre d’apparition, sans doublon', () => {
    expect(extraireVariables('Bonjour {nom}, du {dates} au {dates}.')).toEqual(['nom', 'dates']);
    expect(extraireVariables('Prix : {prix_total} € pour {sejour}')).toEqual(['prix_total', 'sejour']);
  });

  it('ignore tout ce qui n’est pas une variable', () => {
    expect(extraireVariables('Pas de variable')).toEqual([]);
    expect(extraireVariables('{{nom}}')).toEqual(['nom']);
    expect(extraireVariables('{ nom }')).toEqual([]);
    expect(extraireVariables('{1}')).toEqual([]);
    expect(extraireVariables('{}')).toEqual([]);
    expect(extraireVariables('{_}')).toEqual([]);
    expect(extraireVariables('')).toEqual([]);
    expect(extraireVariables(null)).toEqual([]);
    expect(extraireVariables(42)).toEqual([]);
  });
});

describe('rendreModele — substitution', () => {
  it('remplace les variables fournies', () => {
    const r = rendreModele(modele({ id: 'a', texte: 'Bonjour {nom}, du {dates}.' }), {
      nom: 'Durand',
      dates: '10 → 17 juillet',
    });
    expect(r.texte).toBe('Bonjour Durand, du 10 → 17 juillet.');
    expect(r.remplacees).toEqual(['nom', 'dates']);
    expect(r.manquantes).toEqual([]);
  });

  it('laisse une variable absente inchangée et la signale (jamais inventée)', () => {
    const r = rendreModele(modele({ id: 'a', texte: 'Bonjour {nom}, du {dates}.' }), { nom: 'Durand' });
    expect(r.texte).toBe('Bonjour Durand, du {dates}.');
    expect(r.manquantes).toEqual(['dates']);
    expect(r.remplacees).toEqual(['nom']);
  });

  it('ne remplace pas une variable fournie avec une valeur vide', () => {
    const r = rendreModele(modele({ id: 'a', texte: 'Bonjour {nom}.' }), { nom: '' });
    expect(r.texte).toBe('Bonjour .');
    expect(r.remplacees).toEqual(['nom']);
  });

  it('tolère un contexte absent et un texte vide', () => {
    expect(rendreModele(modele({ id: 'a' }), undefined as never).texte).toBe('Bonjour {nom},');
    expect(rendreModele(modele({ id: 'a', texte: '' })).texte).toBe('');
    expect(rendreModele(modele({ id: 'a', texte: null as unknown as string })).texte).toBe('');
  });

  it('convertit les valeurs non chaînes (nombre, booléen)', () => {
    const r = rendreModele(modele({ id: 'a', texte: '{personnes} pers. : {confirme}' }), {
      personnes: 4,
      confirme: true,
    });
    expect(r.texte).toBe('4 pers. : true');
  });

  it('échappe les accolades contenues dans une valeur', () => {
    expect(echapperVariable('{nom}')).toBe('\\{nom\\}');
    const r = rendreModele(modele({ id: 'a', texte: 'Bonjour {nom}.' }), { nom: '{nom}' });
    expect(r.texte).toBe('Bonjour \\{nom\\}.');
  });

  it('produit un texte brut : aucune balise HTML n’est ajoutée', () => {
    const r = rendreModele(modele({ id: 'a', texte: 'Bonjour <b>{nom}</b>' }), { nom: '<script>' });
    expect(r.texte).toContain('<b>');
    expect(r.texte).toContain('<script>');
  });
});

describe('validation des modèles', () => {
  it('accepte un modèle complet', () => {
    expect(modeleValide(modele({ id: 'a', texte: 'Bonjour {nom}.' }))).toBe(true);
    expect(anomaliesModele(modele({ id: 'a', texte: 'Bonjour {nom}.' }))).toEqual([]);
  });

  it('signale un texte vide, un identifiant manquant et des langues absentes', () => {
    expect(anomaliesModele(modele({ id: '', texte: '' }))).toEqual(
      expect.arrayContaining(['id_manquant', 'texte_vide']),
    );
    expect(anomaliesModele(modele({ id: 'a', texte: 'x', nom: { fr: 'x' } }))).toEqual(
      expect.arrayContaining(['nom_en_vide', 'nom_es_vide', 'nom_de_vide']),
    );
  });

  it('signale une variable déclarée absente du texte', () => {
    expect(variablesDeclaresInutiles({ texte: 'Bonjour {nom}.', variables: ['nom', 'dates'] })).toEqual(['dates']);
    expect(variablesDeclaresInutiles({ texte: 'Bonjour {nom}.', variables: ['nom'] })).toEqual([]);
    expect(variablesDeclaresInutiles({ texte: 'Bonjour.', variables: undefined })).toEqual([]);
    expect(anomaliesModele(modele({ id: 'a', texte: 'x', variables: ['nom'] }))).toContain('variable_inutilisee:nom');
  });

  it('exige les 4 langues dans le libellé', () => {
    expect(anomaliesModele(modele({ id: 'a', texte: 'x', nom: { fr: 'a', en: '', es: 'c', de: 'd' } }))).toEqual(['nom_en_vide']);
  });
});

describe('selectionnerModeles (contenu réel)', () => {
  const modeles = selectionnerModeles((modelesData as { modeles: ModeleReponse[] }).modeles);

  it('charge les modèles de content/modeles-reponse.json', () => {
    expect(modeles.length).toBeGreaterThanOrEqual(3);
    expect(modeles.every((m) => m.valide)).toBe(true);
  });

  it('chaque modèle a un texte, un identifiant et les 4 langues', () => {
    for (const { modele: m } of modeles) {
      expect(m.id).toBeTruthy();
      expect(m.texte.trim()).toBeTruthy();
      expect(m.categorie).toBeTruthy();
      for (const lang of ['fr', 'en', 'es', 'de']) {
        expect(m.nom[lang], `${m.id} : nom[${lang}]`).toBeTruthy();
      }
      expect(extraireVariables(m.texte).length).toBeGreaterThan(0);
    }
  });

  it('désactive un modèle cassé au lieu de l’insérer', () => {
    const selection = selectionnerModeles([
      modele({ id: 'ok', texte: 'Bonjour {nom}.' }),
      modele({ id: 'casse', texte: '' }),
      null as unknown as Partial<ModeleReponse>,
    ]);
    expect(selection).toHaveLength(2);
    expect(selection[0].valide).toBe(true);
    expect(selection[1].valide).toBe(false);
  });

  it('tolère une liste vide ou absente', () => {
    expect(selectionnerModeles([])).toEqual([]);
    expect(selectionnerModeles(undefined as unknown as ModeleReponse[])).toEqual([]);
  });
});

describe('libellerModele', () => {
  it('retombe sur le français puis sur le premier libellé disponible', () => {
    expect(libellerModele(modele({ id: 'a' }), 'de')).toBe('Verfügbarkeit');
    expect(libellerModele(modele({ id: 'a', nom: { en: 'Availability' } }), 'de')).toBe('Availability');
    expect(libellerModele(modele({ id: 'a', nom: {} }), 'fr')).toBe('a');
  });
});

describe('insererDansChamp', () => {
  it('insère au début quand le curseur est à 0', () => {
    expect(insererDansChamp('le texte', 'Bonjour', { debut: 0, fin: 0 })).toBe('Bonjour\nle texte');
  });

  it('insère en fin de champ quand aucune position n’est fournie', () => {
    expect(insererDansChamp('Bonjour', 'le texte')).toBe('Bonjour\nle texte');
  });

  it('insère au milieu en conservant les deux morceaux', () => {
    expect(insererDansChamp('Bonjour le monde', 'cher', { debut: 8, fin: 8 })).toBe('Bonjour \ncher\nle monde');
  });

  it('remplace tout le champ quand il est vide', () => {
    expect(insererDansChamp('', 'Bonjour')).toBe('Bonjour');
  });

  it('ne double pas le saut de ligne si le champ se termine déjà par un retour', () => {
    expect(insererDansChamp('Bonjour\n', 'le texte')).toBe('Bonjour\nle texte');
  });

  it('ne change rien pour un texte vide', () => {
    expect(insererDansChamp('Bonjour', '')).toBe('Bonjour');
    expect(insererDansChamp('Bonjour', '   ')).toBe('Bonjour');
  });

  it('ramène une position aberrante à la fin du champ', () => {
    expect(insererDansChamp('Bonjour', 'X', { debut: -5, fin: -1 })).toBe('X\nBonjour');
    expect(insererDansChamp('Bonjour', 'X', { debut: 99, fin: 99 })).toBe('Bonjour\nX');
    expect(insererDansChamp('Bonjour', 'X', { debut: 4, fin: 2 })).toBe('Bonj\nX\nour');
    expect(insererDansChamp('Bonjour', 'X', { debut: Number.NaN, fin: Number.NaN })).toBe('Bonjour\nX');
  });

  it('tolère un contenu absent', () => {
    expect(insererDansChamp(null as unknown as string, 'X')).toBe('X');
    expect(insererDansChamp(undefined as unknown as string, 'X')).toBe('X');
  });

  it('ne perd pas la saisie existante (idempotence du contenu)', () => {
    const champ = 'Merci pour votre message.';
    const avec = insererDansChamp(champ, 'Bonjour {nom},');
    expect(avec.startsWith(champ)).toBe(true);
    expect(avec).toContain('Bonjour {nom},');
  });
});

describe('preparerInsertion', () => {
  it('rend le modèle, l’insère et remonte les variables manquantes', () => {
    const r = preparerInsertion(
      modele({ id: 'a', texte: 'Bonjour {nom}, du {dates}.' }),
      'Merci pour votre message.',
      { nom: 'Durand' },
      { debut: 0, fin: 0 },
    );
    expect(r.manquantes).toEqual(['dates']);
    expect(r.contenu).toBe('Bonjour Durand, du {dates}.\nMerci pour votre message.');
  });

  it('insère sans position fournie (fin du champ)', () => {
    const r = preparerInsertion(modele({ id: 'a', texte: 'Bonjour {nom}.' }), '', { nom: 'Durand' });
    expect(r.contenu).toBe('Bonjour Durand.');
    expect(r.manquantes).toEqual([]);
  });
});

describe('curseurApresInsertion / extraireIntervalle', () => {
  it('place le curseur après le texte inséré', () => {
    expect(curseurApresInsertion('', 'Bonjour')).toBe(7);
    expect(curseurApresInsertion('abc', 'X', { debut: 1, fin: 1 })).toBe(2);
  });

  it('renvoie la longueur du champ sans insertion', () => {
    expect(curseurApresInsertion('abc', '')).toBe(3);
    expect(curseurApresInsertion('abc', '   ')).toBe(3);
  });

  it('lit le contenu entre deux bornes, bornes incluses et bornées', () => {
    expect(extraireIntervalle('Bonjour', 0, 6)).toBe('Bonjour');
    expect(extraireIntervalle('Bonjour', 0, 99)).toBe('Bonjour');
    expect(extraireIntervalle('Bonjour', 2, 4)).toBe('njo');
    expect(extraireIntervalle('Bonjour', -3, 1)).toBe('Bo');
    expect(extraireIntervalle('', 0, 5)).toBe('');
    expect(extraireIntervalle('abc', 5, 1)).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import {
  ajouterJours,
  ajouterMois,
  construireMois,
  dernierJourMois,
  etatDuJour,
  estWeekend,
  fusionnerPlages,
  grilleSemaines,
  intersectionPlageMois,
  joursDuMois,
  jourSemaine,
  listeMois,
  moinsUnJour,
  moisParDefaut,
  parseMois,
  plagesDuMois,
  premierJourMois,
  slugMois,
  type Plage,
} from '../src/lib/calendrier';

const OCCUPE: Plage = { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' };

describe('parseMois / slugMois', () => {
  it('analyse un slug « AAAA-MM » valide', () => {
    expect(parseMois('2026-07')).toEqual({ annee: 2026, mois: 7 });
    expect(parseMois('2027-01')).toEqual({ annee: 2027, mois: 1 });
  });

  it('refuse les slugs malformés', () => {
    for (const slug of ['', 'pas-un-slug', '2026-13', '2026-00', '2026-7', '26-07', '2026/07']) {
      expect(parseMois(slug), `« ${slug} » devrait être refusé`).toBeNull();
    }
  });

  it('produit un slug sur deux chiffres', () => {
    expect(slugMois(2026, 7)).toBe('2026-07');
    expect(slugMois(2026, 12)).toBe('2026-12');
  });
});

describe('navigation entre mois', () => {
  it('passe de décembre à janvier', () => {
    expect(ajouterMois('2026-12', 1)).toBe('2027-01');
  });

  it('revient de janvier à décembre', () => {
    expect(ajouterMois('2027-01', -1)).toBe('2026-12');
  });

  it('reste inchangé pour un slug invalide', () => {
    expect(ajouterMois('nul', 3)).toBe('nul');
  });

  it('liste les mois qui suivent', () => {
    expect(listeMois('2026-11', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('retombe sur le mois courant par défaut', () => {
    expect(moisParDefaut('2026-07-15')).toBe('2026-07');
    expect(moisParDefaut('2026-12-31')).toBe('2026-12');
  });
});

describe('bornes de mois', () => {
  it('connaît le nombre de jours de chaque mois', () => {
    expect(dernierJourMois(2026, 1)).toBe('2026-01-31');
    expect(dernierJourMois(2026, 4)).toBe('2026-04-30');
    expect(dernierJourMois(2026, 7)).toBe('2026-07-31');
  });

  it('gère février des années bissextiles', () => {
    expect(dernierJourMois(2028, 2)).toBe('2028-02-29');
    expect(joursDuMois(2028, 2).length).toBe(29);
  });

  it('gère février des années non bissextiles', () => {
    expect(dernierJourMois(2026, 2)).toBe('2026-02-28');
    expect(joursDuMois(2026, 2).length).toBe(28);
  });

  it('énumère tous les jours du mois', () => {
    expect(premierJourMois(2026, 7)).toBe('2026-07-01');
    const jours = joursDuMois(2026, 7);
    expect(jours).toHaveLength(31);
    expect(jours[0]).toBe('2026-07-01');
    expect(jours[30]).toBe('2026-07-31');
  });
});

describe('jours de semaine et week-ends', () => {
  it('identifie le jour de semaine (0 = dimanche)', () => {
    // 2026-07-06 est un lundi.
    expect(jourSemaine('2026-07-06')).toBe(1);
    expect(jourSemaine('2026-07-05')).toBe(0);
    expect(jourSemaine('2026-07-11')).toBe(6);
  });

  it('renvoie -1 pour une date invalide', () => {
    expect(jourSemaine('2026-02-30')).toBe(-1);
    expect(jourSemaine('pas-une-date')).toBe(-1);
  });

  it('repère les samedis et dimanches', () => {
    expect(estWeekend('2026-07-04')).toBe(true); // samedi
    expect(estWeekend('2026-07-05')).toBe(true); // dimanche
    expect(estWeekend('2026-07-06')).toBe(false); // lundi
    expect(estWeekend('2026-07-10')).toBe(false); // vendredi
  });
});

describe('arithmétique de dates', () => {
  it('ajoute et retire des jours', () => {
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2026-01-01', -1)).toBe('2025-12-31');
    expect(ajouterJours('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('renvoie la date telle quelle si elle est invalide', () => {
    expect(ajouterJours('pas-une-date', 5)).toBe('pas-une-date');
  });

  it('libère le jour de départ', () => {
    expect(moinsUnJour('2026-07-17')).toBe('2026-07-16');
  });
});

describe('intersectionPlageMois', () => {
  it('bine une plage à cheval sur deux mois', () => {
    const plage: Plage = { debut: '2026-06-28', fin: '2026-07-04', etat: 'occupe' };
    expect(intersectionPlageMois(plage, 2026, 7)).toEqual({
      debut: '2026-07-01',
      fin: '2026-07-04',
      etat: 'occupe',
    });
    expect(intersectionPlageMois(plage, 2026, 6)).toEqual({
      debut: '2026-06-28',
      fin: '2026-06-30',
      etat: 'occupe',
    });
  });

  it('renvoie null quand la plage ne touche pas le mois', () => {
    expect(intersectionPlageMois({ debut: '2026-08-01', fin: '2026-08-10', etat: 'occupe' }, 2026, 7)).toBeNull();
  });

  it('renvoie null pour une plage invalide ou inversée', () => {
    expect(intersectionPlageMois({ debut: '2026-07-20', fin: '2026-07-10', etat: 'occupe' }, 2026, 7)).toBeNull();
    expect(intersectionPlageMois({ debut: '', fin: '2026-07-10', etat: 'occupe' }, 2026, 7)).toBeNull();
  });
});

describe('fusionnerPlages', () => {
  it('fusionne deux plages contiguës du même état', () => {
    const resultat = fusionnerPlages([
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' },
      { debut: '2026-07-17', fin: '2026-07-23', etat: 'occupe' },
    ]);
    expect(resultat).toEqual([{ debut: '2026-07-10', fin: '2026-07-23', etat: 'occupe' }]);
  });

  it('fusionne deux plages qui se chevauchent', () => {
    const resultat = fusionnerPlages([
      { debut: '2026-07-10', fin: '2026-07-20', etat: 'occupe' },
      { debut: '2026-07-15', fin: '2026-07-25', etat: 'occupe' },
    ]);
    expect(resultat).toEqual([{ debut: '2026-07-10', fin: '2026-07-25', etat: 'occupe' }]);
  });

  it('ne fusionne jamais deux états différents', () => {
    const resultat = fusionnerPlages([
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' },
      { debut: '2026-07-17', fin: '2026-07-23', etat: 'partiel' },
    ]);
    expect(resultat).toEqual([
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' },
      { debut: '2026-07-17', fin: '2026-07-23', etat: 'partiel' },
    ]);
  });

  it('écarte les dates invalides, inversées ou incomplètes', () => {
    expect(
      fusionnerPlages([
        { debut: '2026-07-10', fin: 'pas-une-date', etat: 'occupe' },
        { debut: '2026-07-20', fin: '2026-07-10', etat: 'occupe' },
        { debut: '', fin: '', etat: 'occupe' },
      ]),
    ).toEqual([]);
  });

  it('accepte une liste vide', () => {
    expect(fusionnerPlages([])).toEqual([]);
  });
});

describe('etatDuJour', () => {
  it('renvoie « libre » sans plage', () => {
    expect(etatDuJour('2026-07-15', [])).toBe('libre');
  });

  it("renvoie l'état de la plage couvrante", () => {
    expect(etatDuJour('2026-07-15', [OCCUPE])).toBe('occupe');
    expect(etatDuJour('2026-07-20', [OCCUPE])).toBe('libre');
  });

  it('laisse le jour du départ libre', () => {
    expect(etatDuJour('2026-07-17', [OCCUPE])).toBe('libre');
  });

  it('fait primer une réservation sur une indisponibilité partielle', () => {
    const plages: Plage[] = [
      { debut: '2026-07-01', fin: '2026-07-31', etat: 'partiel' },
      OCCUPE,
    ];
    expect(etatDuJour('2026-07-15', plages)).toBe('occupe');
    expect(etatDuJour('2026-07-25', plages)).toBe('partiel');
  });
});

describe('plagesDuMois', () => {
  it('isole les plages occupées bornées au mois', () => {
    const plages: Plage[] = [
      { debut: '2026-06-28', fin: '2026-07-04', etat: 'occupe' },
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'partiel' },
    ];
    expect(plagesDuMois('occupe', plages, 2026, 7)).toEqual([
      { debut: '2026-07-01', fin: '2026-07-04', etat: 'occupe' },
    ]);
    expect(plagesDuMois('partiel', plages, 2026, 7)).toEqual([
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'partiel' },
    ]);
  });

  it('ne renvoie rien pour un mois sans plage de cet état', () => {
    expect(plagesDuMois('occupe', [], 2026, 7)).toEqual([]);
  });
});

describe('grilleSemaines', () => {
  it('commence au lundi et complète la dernière semaine', () => {
    // Juillet 2026 : le 1er est un mercredi → 2 cases vides, 5 semaines.
    const semaines = grilleSemaines(2026, 7, 1);
    expect(semaines).toHaveLength(5);
    expect(semaines[0][0]).toBeNull();
    expect(semaines[0][1]).toBeNull();
    expect(semaines[0][2]).toBe('2026-07-01');
    expect(semaines[4][4]).toBe('2026-07-31');
    expect(semaines[4][5]).toBeNull();
  });

  it('n’a pas de case vide quand le mois commence un lundi', () => {
    // Juin 2026 : le 1er est un lundi.
    const semaines = grilleSemaines(2026, 6, 1);
    expect(semaines[0][0]).toBe('2026-06-01');
    expect(semaines).toHaveLength(5);
  });

  it('garde 7 colonnes par semaine', () => {
    for (const semaine of grilleSemaines(2028, 2, 1)) {
      expect(semaine).toHaveLength(7);
    }
  });
});

describe('construireMois', () => {
  it('marque tous les jours libres quand il n’y a aucun séjour', () => {
    const mois = construireMois(2026, 10, [], { aujourdHui: '2026-10-01' });
    expect(mois.jours).toHaveLength(31);
    expect(mois.jours.every((j) => j.etat === 'libre')).toBe(true);
    expect(mois.nuitsLibres).toBe(31);
    expect(mois.plagesOccupees).toEqual([]);
    expect(mois.plagesLibres).toEqual([
      { debut: '2026-10-01', fin: '2026-10-31', etat: 'libre' },
    ]);
  });

  it('marque tout le mois occupé quand un séjour le couvre entièrement', () => {
    const mois = construireMois(2026, 3, [
      { debut: '2026-03-01', fin: '2026-03-31', etat: 'occupe' },
    ]);
    expect(mois.jours.every((j) => j.etat === 'occupe')).toBe(true);
    expect(mois.nuitsLibres).toBe(0);
    expect(mois.plagesLibres).toEqual([]);
  });

  it('traite un séjour à cheval sur deux mois', () => {
    const mois = construireMois(2026, 7, [
      { debut: '2026-06-28', fin: '2026-07-04', etat: 'occupe' },
    ]);
    expect(mois.jours[0].etat).toBe('occupe'); // 1er juillet
    expect(mois.jours[3].etat).toBe('occupe'); // 4 juillet
    expect(mois.jours[4].etat).toBe('libre'); // 5 juillet : jour de départ
    expect(mois.plagesOccupees).toEqual([
      { debut: '2026-07-01', fin: '2026-07-04', etat: 'occupe' },
    ]);
    expect(mois.plagesLibres).toEqual([
      { debut: '2026-07-05', fin: '2026-07-31', etat: 'libre' },
    ]);
    expect(mois.nuitsLibres).toBe(27);
  });

  it('libère le jour de départ même quand il tombe dans le mois affiché', () => {
    const mois = construireMois(2026, 7, [OCCUPE]);
    const jour17 = mois.jours.find((j) => j.iso === '2026-07-17');
    expect(jour17?.etat).toBe('libre');
    expect(mois.plagesLibres[1]).toEqual({ debut: '2026-07-17', fin: '2026-07-31', etat: 'libre' });
    expect(jour17?.plageLibre?.debut).toBe('2026-07-17');
  });

  it('découpe les plages libres en plusieurs tronçons séparés par un séjour', () => {
    const mois = construireMois(2026, 7, [OCCUPE]);
    expect(mois.plagesLibres).toEqual([
      { debut: '2026-07-01', fin: '2026-07-09', etat: 'libre' },
      { debut: '2026-07-17', fin: '2026-07-31', etat: 'libre' },
    ]);
  });

  it('exclut les jours déjà passés du décompte des nuits libres', () => {
    const mois = construireMois(2026, 10, [], { aujourdHui: '2026-10-20' });
    expect(mois.nuitsLibres).toBe(12); // du 20 au 31 octobre
    expect(mois.jours.find((j) => j.iso === '2026-10-19')?.passe).toBe(true);
    expect(mois.jours.find((j) => j.iso === '2026-10-20')?.passe).toBe(false);
    expect(mois.plagesLibres[0].debut).toBe('2026-10-20');
  });

  it('ne propose jamais de lien sur un jour passé', () => {
    const mois = construireMois(2026, 10, [], { aujourdHui: '2026-10-20' });
    expect(mois.jours.find((j) => j.iso === '2026-10-19')?.plageLibre).toBeNull();
    expect(mois.jours.find((j) => j.iso === '2026-10-20')?.plageLibre).not.toBeNull();
  });

  it('ignore les séjours aux dates invalides sans casser le mois', () => {
    const mois = construireMois(2026, 7, [
      { debut: '2026-07-10', fin: 'pas-une-date', etat: 'occupe' },
      { debut: '2026-07-20', fin: '2026-07-10', etat: 'occupe' },
      OCCUPE,
    ]);
    expect(mois.plagesOccupees).toEqual([OCCUPE]);
    expect(mois.jours.find((j) => j.iso === '2026-07-15')?.etat).toBe('occupe');
  });

  it('tient compte des années bissextiles', () => {
    const mois = construireMois(2028, 2, [], { aujourdHui: '2028-02-01' });
    expect(mois.jours).toHaveLength(29);
    expect(mois.jours[28].iso).toBe('2028-02-29');
  });

  it('fusionne deux séjours contigus en une seule plage', () => {
    const mois = construireMois(2026, 7, [
      { debut: '2026-07-10', fin: '2026-07-16', etat: 'occupe' },
      { debut: '2026-07-17', fin: '2026-07-23', etat: 'occupe' },
    ]);
    expect(mois.plagesOccupees).toEqual([
      { debut: '2026-07-10', fin: '2026-07-23', etat: 'occupe' },
    ]);
  });

  it('joint chaque jour libre à sa plage (pour le lien de réservation)', () => {
    const mois = construireMois(2026, 7, [OCCUPE]);
    const jour = mois.jours.find((j) => j.iso === '2026-07-05');
    expect(jour?.plageLibre).toEqual({
      debut: '2026-07-01',
      fin: '2026-07-09',
      etat: 'libre',
    });
  });
});

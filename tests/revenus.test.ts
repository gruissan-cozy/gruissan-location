import { describe, it, expect } from 'vitest';
import {
  CA_MENSUEL,
  type SejourMetier,
  aggreger,
  champCsv,
  compterNuitsParMois,
  compterNuitsParSaison,
  csvSejours,
  csvMessages,
  estSejourComptable,
  estSejourLoue,
  estValeurInjective,
  estTableSejoursAbsente,
  nomFichierExport,
  partSansPrix,
  prixMoyenNuit,
  repartirNuits,
  repartirMontant,
  tauxOccupation,
  type MessageMetier,
} from '../src/lib/revenus';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function sejour(s: Partial<SejourMetier> & { arrivee: string; depart: string }): SejourMetier {
  return {
    // Le défaut est d'abord posé, puis écrasé par les champs fournis :
    // un `...s` placé avant les défauts annulerait toute surcharge.
    id: `id-${s.arrivee}`,
    created_at: '2026-01-01T10:00:00Z',
    client_nom: 'Client',
    client_email: null,
    client_telephone: null,
    personnes: 2,
    statut: 'confirme',
    prix_total: 0,
    note: null,
    ...s,
  };
}

describe('repartition au prorata des nuits', () => {
  it('répartit un séjour à cheval sur deux mois', () => {
    // 2026-06-29 → 2026-07-04 : 2 nuits en juin (29, 30), 4 en juillet (1, 2, 3).
    expect(repartirNuits('2026-06-29', '2026-07-04')).toEqual([
      { annee: 2026, mois: 6, nuits: 2 },
      { annee: 2026, mois: 7, nuits: 3 },
    ]);
  });

  it('tient compte de la saison de chaque nuit', () => {
    // 2026-06-29 → 2026-07-04 : juin = moyenne, juillet = haute.
    expect(repartirMontant('2026-06-29', '2026-07-04', 700)).toEqual([
      { annee: 2026, mois: 6, nuits: 2, montant: 280 },
      { annee: 2026, mois: 7, nuits: 3, montant: 420 },
    ]);
  });

  it('rentre dans l’année sans déborder', () => {
    expect(repartirNuits('2026-12-30', '2027-01-02')).toEqual([
      { annee: 2026, mois: 12, nuits: 2 },
      { annee: 2027, mois: 1, nuits: 1 },
    ]);
  });

  it('ne découpe pas un séjour inclus dans un mois', () => {
    expect(repartirNuits('2026-07-10', '2026-07-17')).toEqual([
      { annee: 2026, mois: 7, nuits: 7 },
    ]);
    expect(repartirMontant('2026-07-10', '2026-07-17', 1450)).toEqual([
      { annee: 2026, mois: 7, nuits: 7, montant: 1450 },
    ]);
  });

  it('renvoie une liste vide pour des dates invalides ou inversées', () => {
    expect(repartirNuits('2026-07-17', '2026-07-10')).toEqual([]);
    expect(repartirNuits('pas-une-date', '2026-07-10')).toEqual([]);
    expect(repartirNuits('2026-07-10', '2026-07-10')).toEqual([]);
    expect(repartirMontant('2026-07-17', '2026-07-10', 100)).toEqual([]);
  });

  it('conserve le total du séjour malgré les arrondis', () => {
    // 10 nuits à 333 € : 4 nuits puis 6 nuits, l’arrondi du dernier mois
    // reprend les centimes perdus pour que la somme fasse exactement 333.
    const parts = repartirMontant('2026-06-25', '2026-07-05', 333);
    expect(parts.reduce((s, p) => s + (p.montant ?? 0), 0)).toBeCloseTo(333, 2);
    expect(parts.reduce((s, p) => s + p.nuits, 0)).toBe(10);
  });
});

describe('comptage des nuits par mois / par saison', () => {
  it('compte les nuits d’un séjour à cheval', () => {
    const res = compterNuitsParMois([sejour({ arrivee: '2026-06-29', depart: '2026-07-04' })]);
    expect(res.get('2026-06')).toBe(2);
    expect(res.get('2026-07')).toBe(3);
    expect(res.size).toBe(2);
  });

  it('additionne plusieurs séjours sur le même mois', () => {
    const res = compterNuitsParMois([
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08' }),
      sejour({ id: 'b', arrivee: '2026-07-10', depart: '2026-07-14' }),
    ]);
    expect(res.get('2026-07')).toBe(11);
  });

  it('classe les nuits par saison (juillet-août / juin-septembre / reste)', () => {
    const res = compterNuitsParSaison([sejour({ arrivee: '2026-06-29', depart: '2026-07-04' })]);
    expect(res.haute).toBe(3);
    expect(res.moyenne).toBe(2);
    expect(res.basse).toBe(0);
  });

  it('range une nuit de septembre en saison moyenne', () => {
    const res = compterNuitsParSaison([sejour({ arrivee: '2026-09-01', depart: '2026-09-04' })]);
    expect(res.moyenne).toBe(3);
    expect(res.haute).toBe(0);
  });

  it('renvoie des compteurs à zéro sans séjour ni avec des dates invalides', () => {
    expect(compterNuitsParSaison([])).toEqual({ haute: 0, moyenne: 0, basse: 0 });
    expect(compterNuitsParSaison([sejour({ arrivee: 'x', depart: 'y' })])).toEqual({
      haute: 0,
      moyenne: 0,
      basse: 0,
    });
    expect(compterNuitsParMois([]).size).toBe(0);
  });
});

describe('statuts comptables', () => {
  it('ne compte en chiffre d’affaires que confirmé et terminé', () => {
    expect(estSejourComptable(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'confirme' }))).toBe(true);
    expect(estSejourComptable(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'termine' }))).toBe(true);
    expect(estSejourComptable(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'option' }))).toBe(false);
    expect(estSejourComptable(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'annule' }))).toBe(false);
  });

  it('considère comme loué tout séjour confirmé ou terminé', () => {
    expect(estSejourLoue(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'confirme' }))).toBe(true);
    expect(estSejourLoue(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'termine' }))).toBe(true);
    expect(estSejourLoue(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'option' }))).toBe(false);
    expect(estSejourLoue(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'annule' }))).toBe(false);
  });

  it('tolère un statut inconnu ou manquant (hérité)', () => {
    expect(estSejourComptable(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'en_cours' }))).toBe(false);
    expect(estSejourComptable(sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: '' }))).toBe(false);
  });
});

describe('part des séjours sans prix', () => {
  it('signale la part de séjours comptables sans prix renseigné', () => {
    const sansPrix = partSansPrix([
      sejour({ arrivee: '2026-07-01', depart: '2026-07-08', id: 'a', statut: 'confirme', prix_total: null }),
      sejour({ arrivee: '2026-07-01', depart: '2026-07-08', id: 'b', statut: 'confirme', prix_total: 700 }),
      sejour({ arrivee: '2026-07-01', depart: '2026-07-08', id: 'c', statut: 'annule', prix_total: null }),
    ]);
    expect(sansPrix.sansPrix).toBe(1);
    expect(sansPrix.total).toBe(2);
    expect(sansPrix.taux).toBe(0.5);
  });

  it('reste à zéro sans séjour comptable', () => {
    expect(partSansPrix([])).toEqual({ sansPrix: 0, total: 0, taux: 0 });
    expect(partSansPrix([sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'option', prix_total: null })])).toEqual({
      sansPrix: 0,
      total: 0,
      taux: 0,
    });
  });

  it('traite un prix nul comme renseigné (séjour gratuit), pas comme absent', () => {
    const res = partSansPrix([sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'confirme', prix_total: 0 })]);
    expect(res.sansPrix).toBe(0);
    expect(res.taux).toBe(0);
  });
});

describe('prix moyen par nuit', () => {
  it('divise le chiffre d’affaires par les nuits louées', () => {
    // 7 nuits à 700 € + 4 nuits à 400 € = 1100 € / 11 nuits.
    expect(
      prixMoyenNuit([
        sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', prix_total: 700 }),
        sejour({ id: 'b', arrivee: '2026-08-01', depart: '2026-08-05', prix_total: 400 }),
      ]),
    ).toBe(100);
  });

  it('renvoie 0 sans nuit louée (division par zéro neutralisée)', () => {
    expect(prixMoyenNuit([])).toBe(0);
    expect(prixMoyenNuit([sejour({ arrivee: '2026-07-01', depart: '2026-07-08', statut: 'option' })])).toBe(0);
  });

  it('arrondit à deux décimales', () => {
    expect(prixMoyenNuit([sejour({ arrivee: '2026-07-01', depart: '2026-07-04', prix_total: 100 })])).toBe(
      33.33,
    );
  });
});

describe('taux d’occupation', () => {
  it('calcule nuits louées / nuits disponibles', () => {
    // Juillet 2026 = 31 nuits disponibles ; 7 nuits louées.
    const res = tauxOccupation(
      [sejour({ arrivee: '2026-07-01', depart: '2026-07-08' })],
      { debut: '2026-07-01', fin: '2026-07-31' },
    );
    expect(res.nuitsLouees).toBe(7);
    expect(res.nuitsDisponibles).toBe(31);
    expect(res.taux).toBeCloseTo(7 / 31, 4);
  });

  it('répartit un séjour à cheval sur deux mois', () => {
    const res = tauxOccupation(
      [sejour({ arrivee: '2026-06-29', depart: '2026-07-04' })],
      { debut: '2026-06-01', fin: '2026-07-31' },
    );
    expect(res.nuitsLouees).toBe(5);
    expect(res.nuitsDisponibles).toBe(61);
  });

  it('renvoie 0 sans nuit disponible (période vide ou invalide)', () => {
    expect(tauxOccupation([], { debut: '2026-07-31', fin: '2026-07-01' }).taux).toBe(0);
    expect(tauxOccupation([], { debut: '', fin: '' }).nuitsDisponibles).toBe(0);
  });

  it('plafonne à 100 % même si les nuits louées dépassent la période', () => {
    const res = tauxOccupation(
      [sejour({ arrivee: '2026-07-01', depart: '2026-08-31' })],
      { debut: '2026-07-01', fin: '2026-07-31' },
    );
    expect(res.taux).toBe(1);
    expect(res.nuitsLouees).toBe(31);
  });

  it('exclut les séjours option et annulé', () => {
    const res = tauxOccupation(
      [
        sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', statut: 'option' }),
        sejour({ id: 'b', arrivee: '2026-07-10', depart: '2026-07-14', statut: 'annule' }),
      ],
      { debut: '2026-07-01', fin: '2026-07-31' },
    );
    expect(res.nuitsLouees).toBe(0);
    expect(res.taux).toBe(0);
  });
});

describe('agrégation (issue #20)', () => {
  it('produit les indicateurs par mois, par saison et par année', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', prix_total: 1450 }),
      sejour({ id: 'b', arrivee: '2026-07-15', depart: '2026-07-22', prix_total: 1450 }),
      sejour({ id: 'c', arrivee: '2026-08-01', depart: '2026-08-05', prix_total: 800 }),
      sejour({ id: 'd', arrivee: '2026-08-20', depart: '2026-08-24', prix_total: 620 }),
    ]);
    expect(r.parMois.length).toBe(2);
    const juillet = r.parMois.find((m) => m.annee === 2026 && m.mois === 7)!;
    expect(juillet.ca).toBe(2900);
    expect(juillet.nuits).toBe(14);
    expect(juillet.sejourComptable).toBe(2);
    expect(juillet.prixMoyenNuit).toBeCloseTo(2900 / 14, 2);
    expect(juillet.saisons).toEqual({ haute: 2900, moyenne: 0, basse: 0 });

    const aout = r.parMois.find((m) => m.annee === 2026 && m.mois === 8)!;
    expect(aout.ca).toBe(1420);
    expect(aout.nuits).toBe(8);

    expect(r.parSaison).toEqual({ haute: 4320, moyenne: 0, basse: 0 });
    expect(r.parAnnee).toEqual({ 2026: 4320 });
    expect(r.nuitsLoues).toBe(22);
    expect(r.nuitsComptables).toBe(22);
    expect(r.prixMoyenNuit).toBeCloseTo(4320 / 22, 2);
    expect(r.total).toBe(4320);
  });

  it('détaille le chiffre d’affaires par saison y compris sur une année entière', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', prix_total: 1450 }),
      sejour({ id: 'b', arrivee: '2026-09-01', depart: '2026-09-04', prix_total: 560 }),
      sejour({ id: 'c', arrivee: '2026-11-01', depart: '2026-11-05', prix_total: 480 }),
    ]);
    expect(r.parSaison).toEqual({ haute: 1450, moyenne: 560, basse: 480 });
    expect(r.total).toBe(2490);
  });

  it('ne compte ni nuits ni chiffre d’affaires pour les options et annulations', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', prix_total: 1450, statut: 'option' }),
      sejour({ id: 'b', arrivee: '2026-08-01', depart: '2026-08-08', prix_total: 900, statut: 'annule' }),
    ]);
    expect(r.total).toBe(0);
    expect(r.nuitsComptables).toBe(0);
    expect(r.nuitsLoues).toBe(0);
    expect(r.parSaison).toEqual({ haute: 0, moyenne: 0, basse: 0 });
    expect(r.parMois.length).toBe(0);
  });

  it('ne invente pas de prix : signale la part sans prix et ne la compte pas', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', prix_total: 1450 }),
      sejour({ id: 'b', arrivee: '2026-07-15', depart: '2026-07-22', prix_total: null }),
    ]);
    expect(r.total).toBe(1450);
    expect(r.sansPrix.sansPrix).toBe(1);
    expect(r.sansPrix.total).toBe(2);
    expect(r.sansPrix.taux).toBe(0.5);
    expect(r.nuitsLoues).toBe(14);
    // Le prix moyen porte sur les nuits des séjours tarifés uniquement.
    expect(r.prixMoyenNuit).toBeCloseTo(1450 / 7, 2);
  });

  it('répartit au prorata un séjour à cheval sur deux mois', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2026-06-29', depart: '2026-07-04', prix_total: 700 }),
    ]);
    const juin = r.parMois.find((m) => m.mois === 6)!;
    const juillet = r.parMois.find((m) => m.mois === 7)!;
    expect(juin.nuits).toBe(2);
    expect(juillet.nuits).toBe(3);
    expect(juin.ca).toBe(280);
    expect(juillet.ca).toBe(420);
    expect(r.total).toBe(700);
  });

  it('regroupe plusieurs années', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2025-08-01', depart: '2025-08-08', prix_total: 1450 }),
      sejour({ id: 'b', arrivee: '2026-08-01', depart: '2026-08-08', prix_total: 1450 }),
    ]);
    expect(r.parAnnee).toEqual({ 2025: 1450, 2026: 1450 });
    expect(r.total).toBe(2900);
  });

  it('trie les mois par année puis par numéro de mois', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2026-08-01', depart: '2026-08-08' }),
      sejour({ id: 'b', arrivee: '2025-08-01', depart: '2025-08-08' }),
      sejour({ id: 'c', arrivee: '2026-01-01', depart: '2026-01-08' }),
    ]);
    // Tri chronologique, indépendamment du formatage du mois.
    expect(r.parMois.map((m) => `${m.annee}-${String(m.mois).padStart(2, '0')}`)).toEqual(['2025-08', '2026-01', '2026-08']);
  });

  it('renvoie des indicateurs vides et sains sur une liste vide', () => {
    const r = aggreger([]);
    expect(r.total).toBe(0);
    expect(r.nuitsLoues).toBe(0);
    expect(r.nuitsComptables).toBe(0);
    expect(r.prixMoyenNuit).toBe(0);
    expect(r.parMois).toEqual([]);
    expect(r.parSaison).toEqual({ haute: 0, moyenne: 0, basse: 0 });
    expect(r.parAnnee).toEqual({});
    expect(r.sansPrix).toEqual({ sansPrix: 0, total: 0, taux: 0 });
  });

  it('produit les mêmes totaux que CA_MENSUEL pour un jeu simple', () => {
    const sejours = [
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', prix_total: 1450 }),
      sejour({ id: 'b', arrivee: '2026-08-01', depart: '2026-08-05', prix_total: 800 }),
    ];
    const parMois = new Map(CA_MENSUEL(sejours).map((m) => [`${m.annee}-${m.mois}`, m]));
    const r = aggreger(sejours);
    expect(r.parMois.length).toBe(parMois.size);
    for (const m of r.parMois) {
      expect(parMois.get(`${m.annee}-${m.mois}`)?.ca).toBe(m.ca);
      expect(parMois.get(`${m.annee}-${m.mois}`)?.nuits).toBe(m.nuits);
    }
    expect(r.total).toBe(2250);
  });

  it('gère des prix non numériques ou aberrants sans casser', () => {
    const r = aggreger([
      sejour({ id: 'a', arrivee: '2026-07-01', depart: '2026-07-08', prix_total: 'pff' as never }),
      sejour({ id: 'b', arrivee: '2026-07-10', depart: '2026-07-12', prix_total: Number.NaN }),
      sejour({ id: 'c', arrivee: '2026-07-15', depart: '2026-07-17', prix_total: -50 }),
    ]);
    expect(r.total).toBe(0);
    expect(r.sansPrix.sansPrix).toBe(3);
    expect(r.sansPrix.total).toBe(3);
  });
});

describe('CSV — format et neutralisation', () => {
  it('neutralise les valeurs commençant par =, +, -, @ ou une tabulation', () => {
    expect(estValeurInjective('=1+1')).toBe(true);
    expect(estValeurInjective('+1+1')).toBe(true);
    expect(estValeurInjective('-1+1')).toBe(true);
    expect(estValeurInjective('@SUM(A1)')).toBe(true);
    expect(estValeurInjective('\t=1+1')).toBe(true);
    expect(estValeurInjective('  =1+1')).toBe(true); // espaces ignorées
    expect(estValeurInjective('=HYPERLINK("http://x")')).toBe(true);
    expect(estValeurInjective('Durand')).toBe(false);
    expect(estValeurInjective('12 rue de la Paix')).toBe(false);
    // Un nombre négatif est un préfixe « - » valide : on le neutralise
    // aussi (l'apostrophe initiale est invisible et inoffensive).
    expect(estValeurInjective('-12,50 €')).toBe(true);
    expect(estValeurInjective('')).toBe(false);
    expect(estValeurInjective(null)).toBe(false);
    expect(estValeurInjective(undefined)).toBe(false);
    expect(estValeurInjective(42)).toBe(false);
  });

  it('préfixe d’une apostrophe les cellules injectives', () => {
    expect(champCsv('=1+1')).toBe("'=1+1");
    expect(champCsv('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(champCsv('-5')).toBe("'-5");
  });

  it('échappe une tabulation initiale sans l’exécuter', () => {
    // La tabulation est un préfixe dangereux : elle doit disparaître du
    // début de cellule, quelle que soit la stratégie retenue.
    const champ = champCsv('\t=1+1');
    expect(champ.startsWith('\t')).toBe(false);
    expect(champ).toContain('1+1');
    expect(champ.startsWith("'\t") || champ.startsWith('"\'\t')).toBe(true);
  });

  it('échappe guillemets et séparateur', () => {
    expect(champCsv('Durand "Jean"')).toBe('"Durand ""Jean"""');
    expect(champCsv('a;b')).toBe('"a;b"');
    expect(champCsv('retour\nà la ligne')).toBe('"retour\nà la ligne"');
    expect(champCsv(null)).toBe('');
    expect(champCsv(undefined)).toBe('');
    expect(champCsv(42)).toBe('42');
  });

  it('produit un CSV avec BOM UTF-8 et en-têtes', () => {
    const csv = csvSejours([sejour({ arrivee: '2026-07-01', depart: '2026-07-08' })]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lignes = csv.split('\r\n');
    expect(lignes[0]).toContain('Id');
    expect(lignes[0]).toContain('Arrivée');
    expect(lignes[0]).toContain('Exporté le');
    expect(lignes[0].split(';').length).toBe(13);
    expect(lignes.filter(Boolean)).toHaveLength(2);
  });

  it('utilise le séparateur ; et le saut de ligne Windows', () => {
    const csv = csvSejours([
      sejour({ id: 'x', arrivee: '2026-07-01', depart: '2026-07-08', client_nom: 'Durand' }),
    ]);
    const [entete, ligne] = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(entete).toContain(';');
    expect(entete).not.toContain('\n');
    expect(ligne.split(';')[0]).toBe('x');
    expect(ligne).toContain('Durand');
  });

  it('neutralise le nom d’un client saisi comme formule', () => {
    const csv = csvSejours([
      sejour({ arrivee: '2026-07-01', depart: '2026-07-08', client_nom: '=HYPERLINK("http://evil")' }),
    ]);
    expect(csv).toContain("'=HYPERLINK");
  });

  it('ne renvoie que l’en-tête sans séjour', () => {
    const csv = csvSejours([]);
    expect(csv.replace(/^\uFEFF/, '').split('\r\n').filter(Boolean)).toHaveLength(1);
  });

  it('exporte les messages avec leurs statuts', () => {
    const messages: MessageMetier[] = [
      {
        id: 'm1',
        created_at: '2026-07-01T09:00:00Z',
        nom: 'Durand',
        email: 'a@b.fr',
        telephone: '06 00 00 00 00',
        dates: '10 → 17 juillet',
        message: 'Bonjour',
        statut: 'nouveau',
        lu_at: null,
      },
    ];
    const csv = csvMessages(messages);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lignes = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lignes[0].split(';').length).toBe(9);
    expect(lignes[1]).toContain('m1');
    expect(lignes[1]).toContain('nouveau');
    expect(lignes[1]).toContain('non lu');
  });

  it('neutralise aussi les champs des messages', () => {
    const csv = csvMessages([
      {
        id: 'm1',
        created_at: '2026-07-01T09:00:00Z',
        nom: '@SUM(A1)',
        email: 'a@b.fr',
        telephone: null,
        dates: null,
        message: 'Bonjour',
        statut: 'nouveau',
        lu_at: null,
      },
    ]);
    expect(csv).toContain("'@SUM(A1)");
  });
});

describe('détection de l’absence de la table sejours', () => {
  it('reconnait les erreurs PostgREST / PostgreSQL d’absence de table', () => {
    expect(estTableSejoursAbsente("Could not find the table 'public.sejours' in the schema cache")).toBe(true);
    expect(estTableSejoursAbsente({ code: '42P01', message: 'relation "sejours" does not exist' })).toBe(true);
    expect(estTableSejoursAbsente({ message: 'schema cache' })).toBe(true);
    expect(estTableSejoursAbsente({ details: 'PGRST205' })).toBe(true);
  });

  it('ne confond pas avec une autre erreur (droits, réseau, colonne)', () => {
    expect(estTableSejoursAbsente({ message: 'JWT expired' })).toBe(false);
    expect(estTableSejoursAbsente({ message: 'new row violates row-level security' })).toBe(false);
    expect(estTableSejoursAbsente({ message: 'column "lu_at" does not exist' })).toBe(true);
    expect(estTableSejoursAbsente('')).toBe(false);
    expect(estTableSejoursAbsente(null)).toBe(false);
    expect(estTableSejoursAbsente(undefined)).toBe(false);
  });
});

describe('noms de fichiers d’export', () => {
  it('est horodaté et sûr pour un nom de fichier', () => {
    expect(nomFichierExport('sejours', '2026-10-25T14:03:00.000Z')).toBe('sejours-20261025-140300.csv');
    expect(nomFichierExport('messages', '2026-01-05T09:07:11.000Z')).toBe('messages-20260105-090711.csv');
  });

  it('tolère une date invalide', () => {
    expect(nomFichierExport('sejours', 'pas une date')).toMatch(/^sejours-\d{8}-\d{6}\.csv$/);
  });
});

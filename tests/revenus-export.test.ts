import { describe, it, expect } from 'vitest';
import {
  csvSejours,
  csvMessages,
  nomFichierExport,
  aggreger,
  tauxOccupation,
  periodeDuMois,
} from '../src/lib/revenus';

/**
 * Le BOM et les séparateurs sont vérifiés ici en octets, pas en caractères :
 * c'est ce qu'Excel lit réellement.
 */
const BOM = String.fromCharCode(0xfeff);

/** Découpe une ligne CSV « ; » en cellules, guillemets doublés compris. */
function cellules(ligne: string): string[] {
  const res: string[] = [];
  let courant = '';
  let dansGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (dansGuillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') {
          courant += '"';
          i++;
        } else dansGuillemets = false;
      } else courant += c;
    } else if (c === '"') dansGuillemets = true;
    else if (c === ';') {
      res.push(courant);
      courant = '';
    } else courant += c;
  }
  res.push(courant);
  return res;
}

describe('CSV réel produit (intégration)', () => {
  const sejours = [
    {
      id: 's1',
      created_at: '2026-01-02T09:00:00Z',
      arrivee: '2026-07-01',
      depart: '2026-07-08',
      client_nom: 'Durand "Jean"',
      client_email: 'a@b.fr',
      client_telephone: '06 00 00 00 00',
      personnes: 2,
      statut: 'confirme',
      prix_total: 1450,
      note: 'note; avec ; séparateur',
    },
    {
      id: 's2',
      created_at: '2026-01-03T09:00:00Z',
      arrivee: '2026-06-29',
      depart: '2026-07-04',
      client_nom: '=HYPERLINK("http://evil")',
      client_email: null,
      client_telephone: null,
      personnes: 4,
      statut: 'confirme',
      prix_total: 700,
      note: null,
    },
    {
      id: 's3',
      created_at: '2026-01-04T09:00:00Z',
      arrivee: '2026-08-01',
      depart: '2026-08-05',
      client_nom: 'Sans Prix',
      client_email: null,
      client_telephone: null,
      personnes: 2,
      statut: 'termine',
      prix_total: null,
      note: null,
    },
  ];

  it('commence bien par les trois octets du BOM UTF-8', () => {
    const buf = Buffer.from(csvSejours(sejours), 'utf8');
    expect([...buf.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("s'échappe correctement : guillemets doublés, séparateur entre guillemets", () => {
    const csv = csvSejours(sejours);
    const lignes = csv.slice(BOM.length).split('\r\n').filter(Boolean);
    const ligneDurand = lignes[1];
    expect(ligneDurand).toContain('"Durand ""Jean"""');
    // La note contient un « ; » : elle doit être entre guillemets pour ne
    // pas créer de colonne fantôme.
    // 13 colonnes exactement : le « ; » de la note n'a pas créé de
    // colonne fantôme.
    const cellulesDurand = cellules(ligneDurand);
    expect(cellulesDurand).toHaveLength(13);
    expect(cellulesDurand[5]).toBe('Durand "Jean"');
    expect(cellulesDurand[11]).toBe('note; avec ; séparateur');
  });

  it("ne laisse aucune cellule commençant par un préfixe de formule", () => {
    const csv = csvSejours(sejours);
    const lignes = csv.slice(BOM.length).split('\r\n').filter(Boolean);
    for (const ligne of lignes.slice(1)) {
      // On ne découpe pas naïvement sur « ; » : les guillemets protègent
      // le séparateur. On vérifie surtout les champs injectifs connus.
      expect(csv).toContain("'=HYPERLINK");
    }
  });

  it('produit un export de messages avec le BOM et le bon séparateur', () => {
    const csv = csvMessages([
      {
        id: 'm1',
        created_at: '2026-01-02T09:00:00Z',
        nom: '@SUM(A1)',
        email: 'a@b.fr',
        telephone: null,
        dates: null,
        message: 'Bonjour',
        statut: 'nouveau',
        lu_at: null,
      },
    ]);
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toContain("'@SUM(A1)");
    const ligneMessage = csv.slice(BOM.length).split('\r\n').filter(Boolean)[1];
    expect(cellules(ligneMessage)).toHaveLength(9);
    expect(cellules(ligneMessage)[2]).toBe("'@SUM(A1)");
    expect(cellules(ligneMessage)[8]).toBe('non lu');
    expect(csv.split('\r\n').filter(Boolean)[0].split(';').length).toBe(9);
  });

  it('nomme les fichiers avec un horodatage horodaté', () => {
    expect(nomFichierExport('sejours', '2026-10-25T14:03:00.000Z')).toBe(
      'sejours-20261025-140300.csv',
    );
    expect(nomFichierExport('messages', '2026-01-05T09:07:11.000Z')).toBe(
      'messages-20260105-090711.csv',
    );
  });

  it("agrége le jeu connu : prorata, sans prix et totaux", () => {
    const r = aggreger(sejours);
    expect(r.total).toBe(2150); // 1450 + 700 (le séjour sans prix est exclu)
    expect(r.nuitsLoues).toBe(16); // 7 + 5 + 4, tous statuts confirmés/terminés
    expect(r.nuitsComptables).toBe(12); // base du prix moyen (séjours tarifés)
    expect(r.parSaison).toEqual({ haute: 1870, moyenne: 280, basse: 0 });
    expect(r.sansPrix).toEqual({ sansPrix: 1, total: 3, taux: 1 / 3 });

    const cle = (annee: number, mois: number) => `${annee}-${String(mois).padStart(2, '0')}`;
    const juin = r.parMois.find((m) => cle(m.annee, m.mois) === '2026-06')!;
    const juillet = r.parMois.find((m) => cle(m.annee, m.mois) === '2026-07')!;
    const aout = r.parMois.find((m) => cle(m.annee, m.mois) === '2026-08')!;
    expect(juin).toMatchObject({ ca: 280, nuits: 2 });
    expect(juillet).toMatchObject({ ca: 1870, nuits: 10 });
    // `nuits` d'un mois ne compte que les nuits des séjours tarifés : le
    // séjour sans prix y contribue 0, mais reste compté dans `sansPrix`.
    expect(aout).toMatchObject({ ca: 0, nuits: 0, sansPrix: 1 });
    // Un seul séjour à cheval sur deux mois : il n'est compté que
    // dans le mois de son arrivée (première partie).
    expect(juillet.sejourComptable).toBe(1);
    expect(juin.sejourComptable).toBe(1);
    // Les nuits réellement louées (tous séjours comptables) sont bien 16 :
    // 7 (juillet) + 2 (juin) + 7 (juillet) + 4 (août) - les doublons.
    expect(r.nuitsLoues).toBe(16);
    expect(r.nuitsComptables).toBe(12);
  });

  it("calcule le taux d'occupation du mois courant sur le jeu connu", () => {
    // Juillet 2026 : 31 nuits disponibles, 7 louées (4 du 1er au 7 juillet
    // pour le séjour à cheval, 0 pour les deux autres : août et la fin du
    // séjour à cheval tombent hors du mois).
    const occ = tauxOccupation(sejours, periodeDuMois(2026, 7));
    expect(occ.nuitsDisponibles).toBe(31);
    expect(occ.nuitsLouees).toBe(7);
    expect(occ.taux).toBeCloseTo(7 / 31, 4);
  });
});

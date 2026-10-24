import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ALT_PAR_DEFAUT,
  CATEGORIE_PAR_DEFAUT,
  categorieInconnue,
  chargerGalerie,
  extraitNumeroAppel,
  legendePhoto,
  lienWhatsApp,
  numeroAppel,
  peutAppeler,
  peutUtiliserWhatsApp,
  photosParCategorie,
  visionneuseDonnees,
  visionneuseTraductions,
  type GalerieBrute,
} from '../src/lib/contact';

const lireSite = (): Record<string, any> => JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));
const lireGalerie = (): { photos: any[] } =>
  JSON.parse(readFileSync(new URL('../content/galerie.json', import.meta.url), 'utf8'));

const photo = (src: string, surcharge: Record<string, unknown> = {}) => ({
  src,
  alt: { fr: 'Légende', en: 'Caption', es: 'Pie de foto', de: 'Bildunterschrift' },
  ...surcharge,
});

describe('extraitNumeroAppel — normalisation du numéro pour tel:', () => {
  it('retire les espaces, points, tirets, parenthèses et le « + »', () => {
    expect(extraitNumeroAppel('+33 6 12 34 56 78')).toBe('33612345678');
    expect(extraitNumeroAppel('06.12.34.56.78')).toBe('0612345678');
    expect(extraitNumeroAppel('06-12-34-56-78')).toBe('0612345678');
    expect(extraitNumeroAppel('+33(0)6 12 34 56 78')).toBe('330612345678');
    expect(extraitNumeroAppel('+1 (555) 010-2030')).toBe('15550102030');
  });

  it('renvoie une chaîne vide pour une valeur absente ou sans chiffre', () => {
    expect(extraitNumeroAppel('')).toBe('');
    expect(extraitNumeroAppel('   ')).toBe('');
    expect(extraitNumeroAppel('Pas de numéro')).toBe('');
    expect(extraitNumeroAppel(undefined)).toBe('');
    expect(extraitNumeroAppel(null)).toBe('');
  });

  it('tolère un numéro déjà en chiffres seuls', () => {
    expect(extraitNumeroAppel('33612345678')).toBe('33612345678');
  });
});

describe('numeroAppel / lienWhatsApp — aucun faux numéro n’est fabriqué', () => {
  it('compose un lien tel: propre', () => {
    expect(numeroAppel('+33 6 12 34 56 78')).toBe('tel:+33612345678');
  });

  it('compose un lien wa.me à chiffres seuls, indicatif compris', () => {
    expect(lienWhatsApp('+33 6 12 34 56 78')).toBe('https://wa.me/33612345678');
  });

  it('renvoie null sans numéro réel (boutons masqués, jamais de « wa.me/ » vide)', () => {
    expect(numeroAppel('')).toBeNull();
    expect(numeroAppel(undefined)).toBeNull();
    expect(lienWhatsApp('')).toBeNull();
    expect(lienWhatsApp('inconnu')).toBeNull();
  });

  it('utilise le champ dédié « whatsapp » s’il est rempli', () => {
    expect(lienWhatsApp('+33 6 12 34 56 78', '+33 7 99 88 77 66')).toBe('https://wa.me/33799887766');
  });

  it('retombe sur le téléphone quand le champ whatsapp est vide ou absent', () => {
    expect(lienWhatsApp('+33 6 12 34 56 78', '')).toBe('https://wa.me/33612345678');
    expect(lienWhatsApp('+33 6 12 34 56 78', undefined)).toBe('https://wa.me/33612345678');
  });
});

describe('peutAppeler / peutUtiliserWhatsApp', () => {
  it('n’exigent aucun faux remplissage : un champ vide masque le bouton', () => {
    expect(peutAppeler({ telephone: '+33 6 12 34 56 78' })).toBe(true);
    expect(peutAppeler({ telephone: '' })).toBe(false);
    expect(peutAppeler({})).toBe(false);
    expect(peutUtiliserWhatsApp({ whatsapp: '+33 6 12 34 56 78' })).toBe(true);
    expect(peutUtiliserWhatsApp({ whatsapp: '' })).toBe(false);
    expect(peutUtiliserWhatsApp({})).toBe(false);
  });
});

describe('photosParCategorie — aucune photo perdue', () => {
  it('retrouve chaque photo, y compris sans pièce renseignée', () => {
    const photos = [
      photo('/gruissan-location/images/galerie/01-sejour.jpg', { categorie: 'sejour' }),
      photo('/gruissan-location/images/galerie/02-cuisine.jpg', { categorie: 'cuisine' }),
      photo('/gruissan-location/images/galerie/03-non-classee.jpg'),
    ];
    const groupes = photosParCategorie(photos);
    const tousLesChemins = groupes.flatMap((g) => g.photos.map((p) => p.src));
    expect(tousLesChemins).toHaveLength(3);
    expect(new Set(tousLesChemins).size).toBe(3);
    expect(groupes.map((g) => g.categorie.id)).toEqual(['autre', 'sejour', 'cuisine']);
  });

  it('regroupe plusieurs photos d’une même pièce', () => {
    const photos = [photo('/a.jpg', { categorie: 'sejour' }), photo('/b.jpg', { categorie: 'sejour' })];
    const groupes = photosParCategorie(photos);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].photos.map((p) => p.src)).toEqual(['/a.jpg', '/b.jpg']);
  });

  it('retombe sur la catégorie par défaut pour une pièce inconnue', () => {
    const groupes = photosParCategorie([photo('/a.jpg', { categorie: 'piscine' })]);
    expect(groupes).toHaveLength(1);
    expect(groupes[0].categorie.id).toBe(CATEGORIE_PAR_DEFAUT);
  });

  it('accepte une photo héritée du format plat (aucune pièce, aucune légende)', () => {
    const groupes = photosParCategorie([{ src: '/legacy.jpg' } as never]);
    expect(groupes[0].photos).toHaveLength(1);
    expect(groupes[0].photos[0].src).toBe('/legacy.jpg');
    expect(legendePhoto(groupes[0].photos[0], 'fr')).toBe(ALT_PAR_DEFAUT.fr);
  });

  it('ne retourne rien sans photo', () => {
    expect(photosParCategorie([])).toEqual([]);
  });
});

describe('categorieInconnue', () => {
  it('renvoie la catégorie par défaut quand l’identifiant n’existe pas', () => {
    expect(categorieInconnue('nulle').id).toBe(CATEGORIE_PAR_DEFAUT);
    expect(categorieInconnue(undefined).id).toBe(CATEGORIE_PAR_DEFAUT);
    expect(categorieInconnue('cuisine').id).toBe('cuisine');
  });
});

describe('legendePhoto — jamais d’attribut alt vide', () => {
  it('retombe sur une autre langue si la langue affichée est absente', () => {
    const photoSansFr = photo('/a.jpg', { alt: { en: 'Only English' } });
    expect(legendePhoto(photoSansFr, 'fr')).toBe('Only English');
  });

  it('retombe sur la légende par défaut si aucune langue n’est renseignée', () => {
    expect(legendePhoto(photo('/a.jpg', { alt: {} }), 'de')).toBe(ALT_PAR_DEFAUT.de);
  });
});

describe('visionneuseDonnees — navigation clavier et repères ARIA', () => {
  const photos = [
    photo('/a.jpg', { categorie: 'sejour' }),
    photo('/b.jpg', { categorie: 'cuisine' }),
    photo('/c.jpg', { categorie: 'cuisine' }),
  ];

  it('débute sur la photo ouverte, avec sa pièce et sa légende', () => {
    const donnees = visionneuseDonnees(photos, 1, 'en');
    expect(donnees.categorie).toBe('Kitchen');
    expect(donnees.alt).toBe('Caption');
    expect(donnees.photo!.src).toBe('/b.jpg');
  });

  it('démarre sur la photo ouverte et reste bornée', () => {
    const donnees = visionneuseDonnees(photos, 1);
    expect(donnees.index).toBe(1);
    expect(donnees.total).toBe(3);
    expect(donnees.photo!.src).toBe('/b.jpg');
  });

  it('boucle au-delà des extrémités', () => {
    expect(visionneuseDonnees(photos, -1).index).toBe(2);
    expect(visionneuseDonnees(photos, 3).index).toBe(0);
  });

  it('reboucle correctement pour une seule photo', () => {
    const uneSeule = visionneuseDonnees([photo('/a.jpg')], 0);
    expect(uneSeule.index).toBe(0);
    expect(uneSeule.total).toBe(1);
  });

  it('retombe sur une visionneuse vide sans photo', () => {
    const vide = visionneuseDonnees([], 0);
    expect(vide.total).toBe(0);
    expect(vide.photo).toBeNull();
  });

  it('expose les libellés traduits de la visionneuse', () => {
    for (const lang of ['fr', 'en', 'es', 'de'] as const) {
      const tr = visionneuseTraductions(lang);
      for (const cle of ['fermer', 'precedent', 'suivant', 'compteur', 'legende', 'titre', 'ouvrir']) {
        expect(tr[`visionneuse.${cle}`], `[${lang}] clé « visionneuse.${cle} » manquante`).toBeTruthy();
      }
      expect(tr['visionneuse.compteur'], `[${lang}] compteur sans espace réservé`).toContain('{0}');
    }
  });

  it('reprend le français pour une langue inconnue', () => {
    expect(visionneuseTraductions('it' as never)['visionneuse.fermer']).toContain('visionneuse');
  });

  it('produit un tableau de positions pour la navigation au clavier', () => {
    const donnees = visionneuseDonnees(photos, 1);
    expect(donnees.positions).toHaveLength(3);
    expect(donnees.positions[1].actif).toBe(true);
    expect(donnees.positions[1].index).toBe(1);
  });
});

describe('chargerGalerie — le contenu reste le seul maître', () => {
  it('accepte le format par catégories et le format plat historique', () => {
    const groupes = chargerGalerie({ categories: [{ id: 'cuisine', titre: { fr: 'Cuisine', en: 'Kitchen', es: 'Cocina', de: 'Küche' } }], photos: [photo('/a.jpg', { categorie: 'cuisine' })] });
    expect(groupes).toHaveLength(1);
    expect(groupes[0].categorie.titre.fr).toBe('Cuisine');

    const plat = chargerGalerie({ photos: [photo('/a.jpg', { categorie: 'cuisine' })] });
    expect(plat[0].categorie.id).toBe('cuisine'); // pièce reconnue même sans liste déclarée
    expect(plat[0].photos).toHaveLength(1);
  });

  it('range les photos sans pièce dans la catégorie de repli', () => {
    const groupes = chargerGalerie({
      categories: [{ id: 'cuisine', titre: { fr: 'Cuisine', en: 'Kitchen', es: 'Cocina', de: 'Küche' } }],
      photos: [photo('/a.jpg'), photo('/b.jpg', { categorie: 'cuisine' })],
    });
    expect(groupes.map((g) => g.categorie.id)).toEqual([CATEGORIE_PAR_DEFAUT, 'cuisine']);
    expect(groupes[0].photos.map((p) => p.src)).toEqual(['/a.jpg']);
    expect(groupes[1].photos.map((p) => p.src)).toEqual(['/b.jpg']);
  });

  it('ne conserve pas deux catégories avec le même identifiant', () => {
    const groupes = chargerGalerie({
      categories: [
        { id: 'cuisine', titre: { fr: 'Cuisine', en: 'Kitchen', es: 'Cocina', de: 'Küche' } },
        { id: 'cuisine', titre: { fr: 'Doublon', en: 'Duplicate', es: 'Duplicado', de: 'Duplikat' } },
      ],
      photos: [photo('/a.jpg', { categorie: 'cuisine' })],
    });
    expect(groupes).toHaveLength(1);
    expect(groupes[0].categorie.titre.fr).toBe('Cuisine');
  });

  it('accepte une entrée non tableau sans casser', () => {
    expect(chargerGalerie({ photos: null } as unknown as GalerieBrute)).toEqual([]);
  });
});

describe('content/site.json et content/galerie.json', () => {
  it('expose un champ whatsapp (vide accepté : les boutons sont alors masqués)', () => {
    const site = lireSite();
    expect(site).toHaveProperty('whatsapp');
    expect(typeof site.whatsapp).toBe('string');
  });

  it('n’a aucun numéro fabriqué : le téléphone n’est pas un 0 répété', () => {
    const site = lireSite();
    expect(site.telephone).not.toMatch(/^(\+?\d)\1*$/);
  });

  it('ne perd aucune photo : chaque photo a une src et une légende dans les 4 langues', () => {
    const { photos } = lireGalerie();
    expect(photos.length).toBeGreaterThanOrEqual(6);
    for (const p of photos) {
      expect(p.src, `${p.src} : src manquante`).toMatch(/^\/gruissan-location\/images\//);
      for (const lang of ['fr', 'en', 'es', 'de']) {
        expect(p.alt?.[lang], `${p.src} : alt[${lang}] manquant`).toBeTruthy();
      }
    }
  });
});

/**
 * Contact direct (téléphone / WhatsApp) et galerie organisée par pièce.
 * Aucune dépendance Astro : importable par `Vitrine.astro` comme par les tests Vitest.
 *
 * Règle d'or : **aucune coordonnée n'est fabriquée ici**. Le module lit
 * `content/site.json` ; tant que le téléphone ou WhatsApp est vide, les boutons
 * sont masqués (`peutAppeler` / `peutUtiliserWhatsApp` renvoient false) et aucun
 * lien factice (`wa.me/`, `tel:`) n'est émis.
 */
import { LANGUAGES, t } from '../i18n';
import type { Lang } from '../i18n';

export type Traduction = Record<Lang, string>;

/** Une photo telle qu'elle apparaît dans content/galerie.json. */
export interface Photo {
  src: string;
  /** Légende traduite ; absente sur les anciennes photos (format plat). */
  alt?: Partial<Traduction>;
  /** Identifiant de pièce : sejour, chambres, cuisine… (optionnel, rétrocompatible). */
  categorie?: string;
}

/** Une pièce de l'appartement, avec son titre traduit. */
export interface CategorieGalerie {
  id: string;
  titre: Traduction;
}

/**
 * Identifiant de la catégorie de repli : toute photo sans pièce connue y est
 * rangée, pour ne jamais perdre une photo.
 */
export const CATEGORIE_PAR_DEFAUT = 'autre';

/**
 * Pièces par défaut, dans l'ordre d'affichage.
 * La première (`autre`) est la catégorie de repli : toute photo sans pièce
 * reconnue y est rangée, pour ne jamais perdre une photo.
 */
export const CATEGORIES_DEFAUT: CategorieGalerie[] = [
  { id: CATEGORIE_PAR_DEFAUT, titre: { fr: 'Autres photos', en: 'Other photos', es: 'Otras fotos', de: 'Weitere Fotos' } },
  { id: 'sejour', titre: { fr: 'Séjour', en: 'Living room', es: 'Salón', de: 'Wohnraum' } },
  { id: 'chambres', titre: { fr: 'Chambres', en: 'Bedrooms', es: 'Dormitorios', de: 'Schlafzimmer' } },
  { id: 'cuisine', titre: { fr: 'Cuisine', en: 'Kitchen', es: 'Cocina', de: 'Küche' } },
  { id: 'salle-de-bain', titre: { fr: 'Salle de bain', en: 'Bathroom', es: 'Cuarto de baño', de: 'Badezimmer' } },
  { id: 'terrasse', titre: { fr: 'Terrasse', en: 'Terrace', es: 'Terraza', de: 'Terrasse' } },
  { id: 'vue', titre: { fr: 'Vue', en: 'View', es: 'Vista', de: 'Aussicht' } },
  { id: 'exterieur', titre: { fr: 'Extérieur', en: 'Outdoors', es: 'Exterior', de: 'Außenbereich' } },
];

/** Légende de repli pour une photo ancienne sans `alt`. */
export const ALT_PAR_DEFAUT: Traduction = {
  fr: 'Gruissan Cozy',
  en: 'Gruissan Cozy',
  es: 'Gruissan Cozy',
  de: 'Gruissan Cozy',
};

/** Coordonnées lues dans content/site.json — jamais complétées par une valeur inventée. */
export interface Coordonnees {
  telephone?: string;
  whatsapp?: string;
  telephone_display?: string;
}

/**
 * Textes de la visionneuse plein écran : portée par `src/i18n.ts`
 * (bloc `t`, clés `visionneuse.*`) comme tout le reste de l'interface.
 */

/** Libellés de la visionneuse dans la langue affichée (repli : français). */
export function visionneuseTraductions(lang: Lang): Record<string, string> {
  const bloc: Record<string, string> = t[lang] ?? {};
  const resultat: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(bloc)) {
    if (cle.startsWith('visionneuse.')) resultat[cle] = valeur;
  }
  return Object.keys(resultat).length ? resultat : visionneuseTraductions('fr');
}

// ---------------------------------------------------------------------------
// Contact direct
// ---------------------------------------------------------------------------

/**
 * Numéro pour un lien `tel:` — chiffres seuls, indicatif pays compris.
 * Chaîne vide si aucune coordonnée exploitable : le bouton doit alors être masqué.
 */
export function extraitNumeroAppel(numero?: string | null): string {
  if (typeof numero !== 'string') return '';
  return numero.replace(/\D/g, '');
}

/** Lien `tel:+33…`, ou null si le téléphone est absent. */
export function numeroAppel(numero?: string | null): string | null {
  const chiffres = extraitNumeroAppel(numero);
  return chiffres ? `tel:+${chiffres}` : null;
}

/** Lien `https://wa.me/33…` (chiffres seuls, indicatif compris), ou null si indisponible. */
export function lienWhatsApp(numero?: string | null, whatsapp?: string | null): string | null {
  const source = extraitNumeroAppel(whatsapp) ? whatsapp : numero;
  const chiffres = extraitNumeroAppel(source);
  return chiffres ? `https://wa.me/${chiffres}` : null;
}

/** Un bouton d'appel n'est rendu que si un vrai numéro existe. */
export function peutAppeler(coordonnees: Coordonnees): boolean {
  return extraitNumeroAppel(coordonnees?.telephone) !== '';
}

/** Un bouton WhatsApp n'est rendu que s'il existe un numéro (dédié ou téléphone). */
export function peutUtiliserWhatsApp(coordonnees: Coordonnees): boolean {
  return extraitNumeroAppel(coordonnees?.whatsapp) !== '' || extraitNumeroAppel(coordonnees?.telephone) !== '';
}

/** Libellé affiché : la valeur lue, jamais reconstituée. */
export function libelleNumero(coordonnees: Coordonnees): string {
  const brut = coordonnees?.telephone_display ?? coordonnees?.telephone ?? '';
  return typeof brut === 'string' ? brut.trim() : '';
}

// ---------------------------------------------------------------------------
// Galerie par pièce
// ---------------------------------------------------------------------------

/** Catégorie reconnue, sinon la catégorie par défaut (jamais undefined). */
export function categorieInconnue(id?: string | null): CategorieGalerie {
  return CATEGORIES_DEFAUT.find((c) => c.id === id) ?? CATEGORIES_DEFAUT[0];
}

export interface GroupePhotos {
  categorie: CategorieGalerie;
  photos: Photo[];
}

/**
 * Regroupe les photos par pièce, dans l'ordre de `CATEGORIES_DEFAUT`.
 * Les pièces vides sont omises ; les photos sans pièce connue partent dans
 * la catégorie par défaut. Résultat : chaque photo est présente exactement une fois.
 */
export function photosParCategorie(photos: Photo[]): GroupePhotos[] {
  if (!Array.isArray(photos)) return [];
  const groupes = new Map<string, Photo[]>();
  for (const photo of photos) {
    if (!photo?.src) continue; // une entrée sans image ne peut pas être affichée
    const id = categorieInconnue(photo.categorie).id;
    const liste = groupes.get(id);
    if (liste) liste.push(photo);
    else groupes.set(id, [photo]);
  }
  return CATEGORIES_DEFAUT.filter((c) => groupes.has(c.id)).map((c) => ({
    categorie: c,
    photos: groupes.get(c.id)!,
  }));
}

export interface GalerieBrute {
  /** Format recommandé : pièces déclarées et photos rangées. */
  categories?: CategorieGalerie[];
  /** Format historique (liste plate) toujours accepté. */
  photos: Photo[];
}

/**
 * Normalise le contenu de `content/galerie.json` :
 * - format plat historique → toutes les photos en catégorie par défaut ;
 * - `categories` déclarées et reconnues → elles sont conservées ;
 * - identifiants dupliqués → le premier gagne.
 */
export function chargerGalerie(brut: GalerieBrute): GroupePhotos[] {
  if (!brut || !Array.isArray(brut.photos)) return [];

  // Pièces déclarées dans le fichier, dans leur ordre, sans doublon d'identifiant.
  // La catégorie de repli ouvre toujours la liste : c'est elle qui garantit
  // qu'une photo sans pièce reconnue n'est jamais perdue.
  const declarees: CategorieGalerie[] = [categorieInconnue(undefined)];
  const vues = new Set<string>([CATEGORIE_PAR_DEFAUT]);
  for (const c of brut.categories ?? []) {
    if (!c?.id || !c?.titre) continue;
    if (vues.has(c.id)) continue;
    vues.add(c.id);
    declarees.push(c);
  }
  // Pièces connues mais absentes du fichier (une photo peut les viser).
  for (const c of CATEGORIES_DEFAUT) {
    if (!vues.has(c.id)) {
      vues.add(c.id);
      declarees.push(c);
    }
  }

  const ordre = declarees.map((c) => c.id);
  const groupes = new Map<string, Photo[]>();
  const repli = declarees[0]; // catégorie par défaut, toujours présente
  for (const photo of brut.photos) {
    if (!photo?.src) continue;
    const categorie = declarees.find((c) => c.id === photo.categorie) ?? repli;
    const liste = groupes.get(categorie.id);
    if (liste) liste.push(photo);
    else groupes.set(categorie.id, [photo]);
  }

  return ordre
    .filter((id) => groupes.has(id))
    .map((id) => ({
      categorie: declarees.find((c) => c.id === id)!,
      photos: groupes.get(id)!,
    }));
}

/** Légende dans la langue affichée, sinon n'importe quelle langue disponible. */
export function legendePhoto(photo: Photo, lang: Lang): string {
  const alt = photo?.alt ?? {};
  const directe = alt[lang];
  if (directe?.trim()) return directe;
  for (const l of LANGUAGES) {
    if (alt[l]?.trim()) return alt[l];
  }
  return ALT_PAR_DEFAUT[lang];
}

// ---------------------------------------------------------------------------
// Visionneuse plein écran
// ---------------------------------------------------------------------------

export interface PositionVisionneuse {
  index: number;
  actif: boolean;
  src: string;
}

export interface Visionneuse {
  /** Index de la photo courante, borné et bouclé. */
  index: number;
  total: number;
  photo: Photo | null;
  alt: string;
  categorie: string;
  /** Positions pour les pastilles de navigation (un clic = accès direct). */
  positions: PositionVisionneuse[];
}

/**
 * Prépare l'état initial de la visionneuse pour la photo d'indice `index`.
 * L'index boucle (pratique courante d'une galerie plein écran) et reste borné.
 */
export function visionneuseDonnees(photos: Photo[], index: number, lang: Lang = 'fr'): Visionneuse {
  const liste = Array.isArray(photos) ? photos.filter((p) => p?.src) : [];
  const total = liste.length;
  const borne = total === 0 ? 0 : ((Math.trunc(index) % total) + total) % total;
  const photo = total === 0 ? null : liste[borne];
  const categorie = photo ? categorieInconnue(photo.categorie) : CATEGORIES_DEFAUT[0];
  return {
    index: borne,
    total,
    photo,
    alt: photo ? legendePhoto(photo, lang) : '',
    categorie: categorie.titre[lang] ?? categorie.titre.fr,
    positions: liste.map((p, i) => ({ index: i, actif: i === borne, src: p.src })),
  };
}

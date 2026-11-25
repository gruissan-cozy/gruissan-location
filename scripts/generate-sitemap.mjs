#!/usr/bin/env node
/**
 * Génération du `sitemap.xml` au build.
 *
 * Le fichier `public/sitemap.xml` était statique et ne listait que les quatre
 * accueils : `/guide/`, `/reserver/` et les trois pages légales (dans les
 * quatre langues) répondaient 200 sans jamais être annoncées. Un sitemap
 * incomplet n'empêche pas l'indexation, mais il prive Google des variantes
 * linguistiques (`hreflang`) et retarde la découverte des pages récentes.
 *
 * Source de vérité : l'arborescence réelle de `src/pages`. Une page ajoutée
 * au dépôt entre donc dans le sitemap sans qu'on pense à modifier un fichier
 * XML à la main ; une page supprimée en sort. `admin/` et `tenant/` sont
 * exclues par construction (elles ne sont pas publiques et `robots.txt` les
 * interdit déjà).
 *
 * Exécution : `npm run build` déclenche `postbuild`, qui écrit
 * `dist/sitemap.xml`. En développement (`astro dev`) le fichier n'existe pas :
 * c'est sans conséquence, il n'est lu que par les robots en production.
 */

import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Origine publique du site (GitHub Pages). */
export const ORIGINE = 'https://gruissan-cozy.github.io';

/** Préfixe de déploiement : le site ne vit pas à la racine du domaine. */
export const PREFIXE = '/gruissan-location/';

/** Langues publiées ; le français vit à la racine, les autres sous `/xx/`. */
export const LANGUES = ['fr', 'en', 'es', 'de'];

/**
 * Dossiers de `src/pages` qui ne sont pas des pages publiques :
 * le back office et l'espace locataire sont réservés au propriétaire, et
 * `404` n'a pas à figurer dans un index.
 */
export const DOSSIERS_EXCLUS = new Set(['admin', 'tenant', '404']);

/** Priorité relative par section ; une section inconnue prend 0.5. */
const PRIORITES = {
  '': 1.0,
  reserver: 0.9,
  guide: 0.8,
  'mentions-legales': 0.3,
  confidentialite: 0.3,
  'conditions-generales': 0.3,
};

/**
 * Adresse relative d'une page : `''` pour l'accueil, `guide` pour `/guide/`.
 * Le français n'a pas de préfixe de langue.
 */
export function cheminPage(section, lang) {
  const prefixeLangue = lang === 'fr' ? '' : `${lang}/`;
  return `${PREFIXE}${prefixeLangue}${section ? `${section}/` : ''}`;
}

/** Nom de section déduit d'un fichier `.astro` (`index` → accueil). */
function sectionDuFichier(nom) {
  const base = nom.replace(/\.astro$/, '');
  return base === 'index' ? '' : base;
}

/**
 * Inventaire des pages réellement présentes dans `src/pages`.
 *
 * Retourne une `Map` section → ensemble de langues disponibles. Seuls les
 * fichiers `.astro` comptent : un composant ou un test n'est pas une page.
 */
export function pagesDepuisDisque(racinePages) {
  const sections = new Map();

  const ajouter = (section, lang) => {
    if (!sections.has(section)) sections.set(section, new Set());
    sections.get(section).add(lang);
  };

  for (const entree of readdirSync(racinePages)) {
    const complet = join(racinePages, entree);
    if (statSync(complet).isDirectory()) {
      if (DOSSIERS_EXCLUS.has(entree)) continue;
      if (!LANGUES.includes(entree)) continue; // dossier hors périmètre
      for (const fichier of readdirSync(complet)) {
        if (!fichier.endsWith('.astro')) continue;
        ajouter(sectionDuFichier(fichier), entree);
      }
      continue;
    }
    if (!entree.endsWith('.astro')) continue;
    ajouter(sectionDuFichier(entree), 'fr');
  }

  return sections;
}

/**
 * Ordre d'affichage : l'accueil d'abord, puis les sections par priorité
 * décroissante, puis alphabétiquement. L'ordre d'un sitemap n'a pas de valeur
 * normative, mais un fichier stable évite un diff inutile à chaque build.
 */
function ordonner(sections) {
  return [...sections.entries()].sort(([a], [b]) => {
    const pa = PRIORITES[a] ?? 0.5;
    const pb = PRIORITES[b] ?? 0.5;
    if (pa !== pb) return pb - pa;
    return a.localeCompare(b);
  });
}

/** Échappement XML minimal des valeurs insérées. */
export function echapperXml(valeur) {
  return String(valeur).replace(/[&<>"']/g, (c) => {
    const table = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
    return table[c] ?? c;
  });
}

/**
 * Construit le contenu du sitemap.
 *
 * Chaque page déclare ses variantes linguistiques (`hreflang`) et un
 * `x-default` qui pointe vers la version française quand elle existe — c'est
 * la page que Google servira à un visiteur dont la langue est inconnue.
 */
export function construireSitemap(sections, origine = ORIGINE) {
  const racine = origine.replace(/\/+$/, '');
  const blocs = [];

  for (const [section, langues] of ordonner(sections)) {
    const dispo = LANGUES.filter((lang) => langues.has(lang));
    for (const lang of dispo) {
      const loc = `${racine}${cheminPage(section, lang)}`;
      const lignes = [`    <loc>${echapperXml(loc)}</loc>`];
      for (const autre of dispo) {
        lignes.push(
          `    <xhtml:link rel="alternate" hreflang="${autre}" href="${echapperXml(
            `${racine}${cheminPage(section, autre)}`,
          )}"/>`,
        );
      }
      if (langues.has('fr')) {
        lignes.push(
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${echapperXml(
            `${racine}${cheminPage(section, 'fr')}`,
          )}"/>`,
        );
      }
      lignes.push('    <changefreq>monthly</changefreq>');
      lignes.push(`    <priority>${(PRIORITES[section] ?? 0.5).toFixed(1)}</priority>`);
      blocs.push(`  <url>\n${lignes.join('\n')}\n  </url>`);
    }
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...blocs,
    '</urlset>',
    '',
  ].join('\n');
}

/** Toutes les adresses annoncées, pour les tests et les diagnostics. */
export function adressesSitemap(sections, origine = ORIGINE) {
  const racine = origine.replace(/\/+$/, '');
  const liste = [];
  for (const [section, langues] of ordonner(sections)) {
    for (const lang of LANGUES) {
      if (langues.has(lang)) liste.push(`${racine}${cheminPage(section, lang)}`);
    }
  }
  return liste;
}

const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Point d'entrée CLI : `node scripts/generate-sitemap.mjs [dossier-de-sortie]`.
 * Sans argument, écrit dans `dist/`. Le dossier est créé au besoin.
 */
function main() {
  const sortie = resolve(process.argv[2] ?? join(RACINE_DEPOT, 'dist'));
  const sections = pagesDepuisDisque(join(RACINE_DEPOT, 'src/pages'));
  const xml = construireSitemap(sections);
  mkdirSync(sortie, { recursive: true });
  writeFileSync(join(sortie, 'sitemap.xml'), xml, 'utf8');
  console.log(`sitemap.xml — ${adressesSitemap(sections).length} adresse(s) → ${sortie}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

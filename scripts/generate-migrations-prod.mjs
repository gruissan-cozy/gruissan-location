#!/usr/bin/env node
/**
 * Génération du pack de migrations de production.
 *
 * Les migrations Supabase de ce dépôt s'appliquent **à la main**, dans le SQL
 * Editor, faute de token d'administration pour les agents. Quatre collages
 * successifs multiplient le risque d'exécution partielle : c'est exactement
 * l'état constaté en production le 2026-11-25 (un `0012` interrompu, des
 * colonnes manquantes). Ce script réunit les quatre migrations en un fichier
 * unique, `docs/migrations-prod-0011-0014.sql`, à coller en une fois.
 *
 * Le contenu des migrations est repris **octet pour octet** : ce script ne
 * réécrit rien, n'ajoute aucune transaction et n'ajoute que des commentaires
 * séparateurs. Il refuse de produire un pack si :
 *
 *   - une migration manque (échec bruyant, jamais silencieux) ;
 *   - un fichier n'est pas terminé par un saut de ligne (le séparateur suivant
 *     se collerait à la dernière instruction) ;
 *   - une migration ouvre une transaction sans la refermer (`begin` sans
 *     `commit`), ce qui ferait échouer le reste du pack en un seul bloc.
 *
 * Exécution : `npm run migrations:pack` (jamais au build : un pack absent ne
 * doit pas empêcher `astro build`, c'est `tests/migrations-prod-pack.test.ts`
 * qui garantit que le fichier livré est à jour).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Migrations du pack, dans l'ordre imposé d'application. */
export const MIGRATIONS = [
  '0011_calendar_blocks.sql',
  '0012_unifier_bookings_sejours.sql',
  '0013_tenant_links.sql',
  '0014_purge_coordonnees.sql',
];

/** Chemin du fichier livré, relatif à la racine du dépôt. */
export const FICHIER_PACK = 'docs/migrations-prod-0011-0014.sql';

/**
 * En-tête du pack : but, ordre, mode d'emploi, avertissement de génération.
 * Il est en commentaire SQL, donc sans effet à l'exécution.
 */
export const ENTETE = `-- ============================================================
-- Gruissan Cozy — pack de migrations de production (0011 → 0014)
--
-- BUT : appliquer en UN SEUL copier-coller les quatre migrations que la
-- production attend (blocages de calendrier, fusion bookings → sejours,
-- lien locataire, purge des coordonnées). Quatre collages successifs
-- laissent la base dans un état partiel si l'un d'eux est interrompu.
--
-- ORDRE (imposé, ne pas réordonner) :
--   0011_calendar_blocks.sql
--   0012_unifier_bookings_sejours.sql
--   0013_tenant_links.sql
--   0014_purge_coordonnees.sql
--
-- MODE D'EMPLOI : docs/runbook-migrations-production.md
--   Dashboard Supabase → SQL Editor → New query → coller CE FICHIER ENTIER
--   → Run, une seule fois. Les requêtes de contrôle du runbook se lancent
--   ensuite, séparément, une par une.
--
-- Le contenu des quatre migrations est repris OCTET POUR OCTET depuis
-- migrations/. Aucune n'ouvre de transaction sans la refermer : le script
-- s'exécute d'un seul bloc. Chacune est idempotente.
--
-- FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
-- Régénérer avec : npm run migrations:pack
-- (scripts/generate-migrations-prod.mjs ; tests/migrations-prod-pack.test.ts
--  rougit si ce fichier diverge des migrations du dépôt).
-- ============================================================
`;

/** Séparateur commenté placé devant chaque migration. */
export function separateur(nom) {
  return `-- ===== ${nom} =====\n`;
}

/**
 * Assemble le pack à partir de contenus déjà lus.
 *
 * @param {Array<{ nom: string, contenu: string }>} fichiers
 * @returns {string}
 */
export function construirePack(fichiers) {
  const manquants = MIGRATIONS.filter((nom) => !fichiers.some((f) => f.nom === nom));
  if (manquants.length > 0) {
    throw new Error(`migration(s) absente(s) : ${manquants.join(', ')}`);
  }

  const parties = [ENTETE];
  for (const nom of MIGRATIONS) {
    const { contenu } = fichiers.find((f) => f.nom === nom);
    if (!contenu.endsWith('\n')) {
      throw new Error(`${nom} ne se termine pas par un saut de ligne : le séparateur suivant serait collé`);
    }
    if (!transactionsEquilibrees(contenu)) {
      throw new Error(`${nom} ouvre une transaction sans la refermer (begin sans commit) : le pack ne peut pas s'exécuter d'un bloc`);
    }
    parties.push(separateur(nom), contenu);
  }
  return parties.join('');
}

/**
 * Vrai si chaque transaction ouverte par le script est refermée.
 *
 * Seul compte le `begin` **de transaction**, en début d'instruction. Les corps
 * de fonctions PL/pgSQL (`$$ … begin … end; … $$`) contiennent leur propre
 * `begin`, qui n'ouvre aucune transaction : les blocs dollar-quotés sont donc
 * retirés avant l'analyse, comme les commentaires et les littéraux.
 */
export function transactionsEquilibrees(sql) {
  const sansCorpsDeFonction = sql.replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, '');
  const sansCommentaires = sansCorpsDeFonction
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '')
    .replace(/'(?:[^']|'')*'/g, "''");
  const ouvrir = (sansCommentaires.match(/(?:^|;)\s*begin\s*;/gi) ?? []).length;
  const fermer = (sansCommentaires.match(/(?:^|;)\s*(?:commit|rollback)\s*;/gi) ?? []).length;
  return ouvrir === fermer;
}

/**
 * Lit les quatre migrations d'un dossier et retourne le pack.
 * Échoue bruyamment si l'une d'elles est absente.
 *
 * @param {string} dossierMigrations
 * @returns {string}
 */
export function genererPack(dossierMigrations) {
  const fichiers = MIGRATIONS.map((nom) => ({
    nom,
    contenu: readFileSync(join(dossierMigrations, nom), 'utf8'),
  }));
  return construirePack(fichiers);
}

const RACINE_DEPOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Point d'entrée CLI : écrit `docs/migrations-prod-0011-0014.sql`.
 * Un fichier manquant lève une erreur et sort en code 1.
 */
function main() {
  try {
    const pack = genererPack(join(RACINE_DEPOT, 'migrations'));
    const sortie = join(RACINE_DEPOT, FICHIER_PACK);
    writeFileSync(sortie, pack, 'utf8');
    console.log(`${FICHIER_PACK} — ${MIGRATIONS.length} migration(s), ${Buffer.byteLength(pack, 'utf8')} octets`);
  } catch (erreur) {
    console.error(`[migrations:pack] échec : ${erreur.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

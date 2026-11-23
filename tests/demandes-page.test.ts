import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Contrat de la page /admin/demandes.
 *
 * Le script est un script client Astro : Vitest ne l'exécute pas. On
 * verrouille donc les invariants à la source, comme pour /reserver/ :
 * la page ne lit que les demandes, ne crée jamais de seconde ligne, et
 * n'agit qu'après un contrôle de chevauchement.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(ROOT, chemin), 'utf8');

const page = lire('src/pages/admin/demandes.astro');
const layout = lire('src/layouts/AdminLayout.astro');
const dashboard = lire('src/pages/admin/index.astro');

describe('page /admin/demandes — lecture', () => {
  it('existe et utilise le layout du back office', () => {
    expect(page).toContain("import AdminLayout from '../../layouts/AdminLayout.astro'");
    expect(page).toMatch(/<AdminLayout[^>]*section="demandes"/);
  });

  it('ne liste que les séjours au statut « demande »', () => {
    expect(page).toMatch(/\.from\(\s*['"]sejours['"]\s*\)/);
    expect(page).toMatch(/\.eq\(\s*['"]statut['"]\s*,\s*['"]demande['"]\s*\)/);
  });

  it('trie par urgence via la logique pure testée', () => {
    expect(page).toContain('trierDemandes');
  });

  it('affiche un bandeau explicite si la table manque', () => {
    expect(page).toContain('estTableSejoursAbsente');
    expect(page).toContain('demandes.tableMissing');
  });
});

describe('page /admin/demandes — décisions', () => {
  it('propose les trois actions', () => {
    expect(page).toMatch(/\[['"]confirmer['"],\s*['"]option['"],\s*['"]refuser['"]\]/);
  });

  it('n’insère jamais de ligne : la demande EST le séjour', () => {
    expect(page).not.toMatch(/\.from\(\s*['"]sejours['"]\s*\)\s*\.insert\(/);
    expect(page).not.toMatch(/\.from\(\s*['"]bookings['"]\s*\)/);
  });

  it('écrit le statut et l’historique via la logique pure', () => {
    expect(page).toContain('construirePatchAction');
    expect(page).toMatch(/\.from\(\s*['"]sejours['"]\s*\)\s*\.update\(/);
  });

  it('ne propose aucune décision quand l’occupation est illisible', () => {
    // Sans la liste complète des séjours, on ne peut pas savoir si les dates
    // sont libres : masquer les actions est la seule façon de ne jamais
    // écraser un séjour existant en silence.
    expect(page).toContain('occupationInconnue');
    expect(page).toContain('demandes.occupancyUnknown');
    expect(page).toMatch(/if\s*\(\s*resTous\.error\s*\)/);
  });

  it('exige une confirmation en cas de chevauchement', () => {
    expect(page).toContain('confirmationRequise');
    expect(page).toContain('chevauchementsDemande');
    expect(page).toContain('demandes.overlapConfirm');
  });

  it('permet un motif facultatif de refus', () => {
    expect(page).toContain('demandes.refuseMotif');
    expect(page).toMatch(/data-motif=/);
  });

  it('échappe les données saisies par un tiers', () => {
    expect(page).toContain('esc(');
    expect(page).toContain('client_nom');
  });
});

describe('navigation et tableau de bord', () => {
  it('ajoute l’onglet Demandes à la navigation du back office', () => {
    expect(layout).toContain("key: 'demandes'");
    expect(layout).toContain('admin/demandes/');
    expect(layout).toContain("'nav.demandes'");
  });

  it('accepte la section « demandes » dans le type du layout', () => {
    expect(layout).toMatch(/section: 'dashboard' \| 'demandes'/);
  });

  it('affiche un bandeau cliquable sur /admin/', () => {
    expect(dashboard).toContain('dash-demandes');
    expect(dashboard).toMatch(/admin\/demandes\//);
    expect(dashboard).toContain('compterEnAttente');
  });

  it('ne dégrade pas la garde admin', () => {
    expect(layout).toContain("const ALLOWED_EMAIL = 'gruissancozy@gmail.com'");
    expect(dashboard).toContain("const ALLOWED_EMAIL = 'gruissancozy@gmail.com'");
  });
});

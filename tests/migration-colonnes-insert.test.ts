import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde de cohérence entre le formulaire `/reserver/` et la migration 0012.
 *
 * Le formulaire écrit une demande avec `supabase-js` : PostgREST n'accepte que
 * les colonnes effectivement accordées à `anon`. Si les deux listes divergent,
 * la demande échoue en production sur `42501 permission denied` (colonne non
 * accordée) ou `PGRST204` (colonne pas encore créée) — exactement le symptôme
 * observé le 2026-11-25. Ce test lit les deux sources et exige qu'elles
 * restent identiques :
 *
 *   - `grant insert (…) on public.sejours to anon` dans
 *     `migrations/0012_unifier_bookings_sejours.sql` ;
 *   - les clés de l'objet passé à `.from('sejours').insert({ … })` dans
 *     `src/components/Reservation.astro`.
 *
 * Toute colonne ajoutée au formulaire doit donc être ajoutée au GRANT (et
 * inversement, une colonne retirée du formulaire sort du GRANT) : impossible
 * de livrer un formulaire qui écrit dans le vide.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(ROOT, chemin), 'utf8');

const MIGRATION = 'migrations/0012_unifier_bookings_sejours.sql';
const COMPOSANT = 'src/components/Reservation.astro';

/**
 * Colonnes du `grant insert (…) on public.sejours to anon`.
 *
 * Le SQL est découpé sur la virgule : la liste tient sur plusieurs lignes et
 * ne contient ni commentaire ni expression, seulement des identifiants.
 */
export function colonnesAccordees(sql: string): string[] {
  const bloc = /grant\s+insert\s*\(([\s\S]*?)\)\s*on\s+public\.sejours\s+to\s+anon/i.exec(sql);
  if (!bloc) return [];
  return bloc[1]
    .split(',')
    .map((colonne) => colonne.replace(/--[^\n]*/g, '').trim())
    .filter(Boolean);
}

/**
 * Clés de l'objet d'insertion du formulaire.
 *
 * Le bloc est délimité par `.from('sejours').insert({` et la fermeture `});`.
 * On ne retient que les clés en début de ligne (`  cle: valeur,`) et la
 * notation abrégée (`  lang,`) : une valeur peut contenir des `:` (ternaire,
 * objet imbriqué) sans être confondue avec une clé.
 */
export function colonnesEnvoyees(source: string): string[] {
  const debut = source.indexOf(".from('sejours').insert({");
  if (debut < 0) return [];
  const bloc = source.slice(debut, source.indexOf('});', debut));
  const cles: string[] = [];
  for (const ligne of bloc.split('\n')) {
    const correspondance = /^\s{2,}([a-z_][a-z0-9_]*)\s*[:,]/.exec(ligne);
    if (!correspondance) continue;
    if (!cles.includes(correspondance[1])) cles.push(correspondance[1]);
  }
  return cles;
}

const sql = lire(MIGRATION);
const composant = lire(COMPOSANT);
const accordees = colonnesAccordees(sql);
const envoyees = colonnesEnvoyees(composant);

describe('lecture des deux sources', () => {
  it('extrait les colonnes du GRANT de la migration 0012', () => {
    expect(accordees.length).toBeGreaterThan(0);
    for (const colonne of [
      'arrivee',
      'depart',
      'client_nom',
      'client_email',
      'personnes',
      'adultes',
      'mineurs',
      'statut',
      'origine',
      'lang',
    ]) {
      expect(accordees, `colonne ${colonne} absente du GRANT`).toContain(colonne);
    }
  });

  it('extrait les clés envoyées par le formulaire', () => {
    expect(envoyees.length).toBeGreaterThan(0);
    expect(envoyees).toContain('arrivee');
    expect(envoyees).toContain('statut');
  });
});

describe('formulaire ↔ migration 0012 — les deux listes restent en phase', () => {
  it('aucune colonne envoyée n’est refusée par le GRANT', () => {
    const refusees = envoyees.filter((colonne) => !accordees.includes(colonne));
    expect(
      refusees,
      `le formulaire écrit dans des colonnes non accordées à anon : ${refusees.join(', ')} — ` +
        `ajoutez-les au GRANT de ${MIGRATION}`,
    ).toEqual([]);
  });

  it('aucune colonne accordée n’est inutilisée (GRANT au plus juste)', () => {
    const inutilisees = accordees.filter((colonne) => !envoyees.includes(colonne));
    expect(
      inutilisees,
      `colonnes ouvertes à anon mais jamais écrites : ${inutilisees.join(', ')} — ` +
        'retirez-les du GRANT ou envoyez-les depuis le formulaire',
    ).toEqual([]);
  });

  it('les deux listes sont identiques, sans doublon', () => {
    expect([...envoyees].sort()).toEqual([...accordees].sort());
    expect(new Set(envoyees).size, 'clé dupliquée dans l’insert').toBe(envoyees.length);
    expect(new Set(accordees).size, 'colonne dupliquée dans le GRANT').toBe(accordees.length);
  });
});

describe('formulaire ↔ migration 0012 — colonnes sensibles', () => {
  it('n’ouvre jamais la note interne ni le prix négocié', () => {
    expect(accordees).not.toContain('note');
    expect(accordees).not.toContain('prix_total');
    expect(envoyees).not.toContain('note');
    expect(envoyees).not.toContain('prix_total');
  });

  it('force les valeurs que la politique RLS exige', () => {
    // `statut = 'demande'` et `origine = 'site'` sont dans le `with check` de
    // `public_insert_sejours` : les changer ferait refuser toute demande.
    expect(composant).toContain("statut: 'demande'");
    expect(composant).toContain("origine: 'site'");
    expect(sql).toContain("statut = 'demande'");
    expect(sql).toContain("origine = 'site'");
  });

  it('conserve le détail adultes / mineurs exigé par le plafond de capacité', () => {
    // La politique borne `adultes between 1 and 8` : un total sans détail
    // (ou `adultes = 0`) serait refusé.
    expect(sql).toMatch(/adultes between 1 and 8/);
    expect(composant).toContain('adultes: quote.adults');
    expect(composant).toContain('mineurs: quote.minors');
  });
});

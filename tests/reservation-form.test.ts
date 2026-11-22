import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le formulaire public `/reserver/` écrit désormais dans `sejours` (migration
 * 0011), avec `statut = 'demande'` et `origine = 'site'`.
 *
 * Le composant est un script client Astro : Vitest ne l'exécute pas, on
 * vérifie donc son contrat d'écriture à la source, en verrouillant les
 * colonnes envoyées et l'absence de retour à `bookings`.
 */

const ROOT = new URL('../', import.meta.url).pathname;
const source = readFileSync(join(ROOT, 'src/components/Reservation.astro'), 'utf8');

describe('formulaire /reserver — écriture de la demande', () => {
  it('insère dans sejours', () => {
    expect(source).toMatch(/\.from\(\s*['"]sejours['"]\s*\)\s*\.insert\(/);
  });

  it('n’écrit plus dans bookings', () => {
    expect(source).not.toMatch(/\.from\(\s*['"]bookings['"]\s*\)/);
  });

  it('force le statut demande', () => {
    expect(source).toContain("statut: 'demande'");
  });

  it('marque la provenance site (exigée par la politique RLS)', () => {
    expect(source).toContain("origine: 'site'");
  });

  it('envoie les colonnes de sejours et non celles de bookings', () => {
    const insert = source.slice(source.indexOf(".from('sejours').insert("));
    const bloc = insert.slice(0, insert.indexOf('});'));
    for (const colonne of [
      'arrivee', 'depart', 'personnes', 'adultes', 'mineurs',
      'client_nom', 'client_email', 'client_telephone', 'client_message',
      'packs', 'prix_estime', 'lang',
    ]) {
      // `lang` est envoyé en notation abrégée (`lang,`) : on accepte les deux.
      expect(bloc, `colonne ${colonne} manquante`).toMatch(
        new RegExp(`\\b${colonne}\\s*[:,]`),
      );
    }
    for (const ancienne of ['check_in', 'check_out', 'guests', 'nom', 'total_estime']) {
      expect(bloc, `ancienne colonne ${ancienne} encore envoyée`).not.toMatch(
        new RegExp(`(^|[^_\\w])${ancienne}\\s*:`),
      );
    }
  });

  it('conserve le détail adultes / mineurs (taxe des seuls adultes)', () => {
    const insert = source.slice(source.indexOf(".from('sejours').insert("));
    const bloc = insert.slice(0, insert.indexOf('});'));
    expect(bloc).toContain('adultes: quote.adults');
    expect(bloc).toContain('mineurs: quote.minors');
    expect(bloc).toContain('personnes: quote.guests');
  });
});

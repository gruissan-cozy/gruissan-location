import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde de non-régression sur les quatre Edge Functions locataire.
 *
 * Le piège de la fusion `bookings` → `sejours` : ces fonctions comparaient
 * `statut` à `['confirmee', 'terminee']`, le vocabulaire de `bookings`. Si une
 * seule garde l'ancien vocabulaire après la migration, l'état des lieux casse
 * SILENCIEUSEMENT pour les nouveaux séjours (statut `confirme`, qui ne
 * correspond plus à `confirmee`).
 *
 * Ces fichiers sont du TypeScript Deno : Vitest ne les importe pas, on lit
 * donc leur source. La règle métier elle-même est testée dans
 * `tests/reservation.test.ts` (module `_shared/reservation.ts`).
 */

const ROOT = new URL('../', import.meta.url).pathname;

const FONCTIONS = ['tenant-upload', 'generate-pdf', 'send-email', 'purge-tenant-data'];

const lire = (chemin: string): string => readFileSync(join(ROOT, chemin), 'utf8');

describe('Edge Functions locataire — vocabulaire unifié', () => {
  for (const fonction of FONCTIONS) {
    describe(fonction, () => {
      const source = lire(`supabase/functions/${fonction}/index.ts`);

      it('ne compare plus le statut au vocabulaire de bookings', () => {
        expect(source).not.toMatch(/['"]confirmee['"]/);
        expect(source).not.toMatch(/['"]terminee['"]/);
        expect(source).not.toMatch(/['"]annulee['"]/);
      });

      it('ne lit plus la table bookings', () => {
        expect(source).not.toMatch(/from\(\s*['"]bookings['"]\s*\)/);
      });
    });
  }

  for (const fonction of ['tenant-upload', 'generate-pdf', 'send-email']) {
    it(`${fonction} applique la garde partagée sur le statut`, () => {
      const source = lire(`supabase/functions/${fonction}/index.ts`);
      expect(source).toContain("from '../_shared/reservation.ts'");
      expect(source).toContain('estReservationAutorisee(');
    });
  }

  it('purge-tenant-data lit la date de départ dans sejours', () => {
    const source = lire('supabase/functions/purge-tenant-data/index.ts');
    expect(source).toMatch(/from\(\s*['"]sejours['"]\s*\)/);
    expect(source).toContain('depart');
    expect(source).not.toMatch(/check_out/);
  });

  it('generate-pdf lit les coordonnées du séjour dans sejours', () => {
    const source = lire('supabase/functions/generate-pdf/index.ts');
    expect(source).toMatch(/from\(\s*['"]sejours['"]\s*\)/);
    expect(source).toContain('client_nom');
    expect(source).toContain('arrivee');
  });

  it('send-email lit le nom et l’email du séjour dans sejours', () => {
    const source = lire('supabase/functions/send-email/index.ts');
    expect(source).toMatch(/from\(\s*['"]sejours['"]\s*\)/);
    expect(source).toContain('client_email');
  });

  it('tenant-upload vérifie le statut du séjour, pas d’une réservation bookings', () => {
    const source = lire('supabase/functions/tenant-upload/index.ts');
    expect(source).toMatch(/from\(\s*['"]sejours['"]\s*\)/);
    expect(source).toContain('statut');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  esc,
  fmtPrice,
  fmtDate,
  monthLabel,
  majBadgeNonLus,
  BADGE_NON_LUS_SELECTOR,
} from '../src/lib/admin-runtime';

// ---------------------------------------------------------------------------
// Bac à sable DOM minimal : majBadgeNonLus ne touche qu'à du textContent et
// à classList.toggle, aucun vrai navigateur n'est nécessaire.
// ---------------------------------------------------------------------------
class FauxElement {
  textContent = '';
  classes = new Set<string>();
  classList = {
    toggle: (classe: string, actif: boolean) => {
      if (actif) this.classes.add(classe);
      else this.classes.delete(classe);
    },
  };
}

function installerDom(elements: FauxElement[]) {
  const document = {
    querySelectorAll: (selecteur: string) =>
      selecteur === BADGE_NON_LUS_SELECTOR ? (elements as never) : [],
  };
  (globalThis as { document?: unknown }).document = document;
  return () => {
    delete (globalThis as { document?: unknown }).document;
  };
}

describe('esc (échappement HTML)', () => {
  it('neutralise les balises et attributs dangereux', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('échappe les guillemets et apostrophes', () => {
    expect(esc('" onclick="x')).toBe('&quot; onclick=&quot;x');
    expect(esc("l'appart")).toBe('l&#39;appart');
  });

  it('gère null/undefined et les caractères normaux', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(42)).toBe('42');
    expect(esc('Gruissan Plage')).toBe('Gruissan Plage');
  });
});

describe('fmtPrice', () => {
  it('formate les prix en euros à la française', () => {
    expect(fmtPrice(45)).toBe('45 €');
    expect(fmtPrice(45.5)).toBe('45,50 €');
    expect(fmtPrice(1450)).toBe('1450 €');
  });

  it('affiche un tiret pour les valeurs invalides', () => {
    expect(fmtPrice(null)).toBe('—');
    expect(fmtPrice(undefined)).toBe('—');
    expect(fmtPrice(NaN)).toBe('—');
  });
});

describe('fmtDate / monthLabel', () => {
  it('formate une date ISO en jj/mm/aaaa', () => {
    expect(fmtDate('2027-07-10')).toBe('10/07/2027');
    expect(fmtDate('2027-07-10T14:35:00Z')).toBe('10/07/2027');
  });

  it('retourne un tiret pour une date absente', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate('')).toBe('—');
  });

  it('nomme les mois en français', () => {
    expect(monthLabel(2026, 9)).toBe('Octobre 2026');
    expect(monthLabel(2027, 0)).toBe('Janvier 2027');
  });
});

describe('majBadgeNonLus (badge « demandes non lues »)', () => {
  let nettoyer: (() => void) | null = null;

  afterEach(() => {
    nettoyer?.();
    nettoyer = null;
  });

  it('affiche le compteur sur tous les badges et le masque à zéro', () => {
    const badges = [new FauxElement(), new FauxElement()];
    nettoyer = installerDom(badges);

    majBadgeNonLus(3);
    expect(badges[0].textContent).toBe('3');
    expect(badges[1].textContent).toBe('3');
    expect(badges[0].classes.has('hidden')).toBe(false);

    // Plus rien d'attendre : le badge disparaît plutôt que d'afficher « 0 ».
    majBadgeNonLus(0);
    expect(badges[0].textContent).toBe('');
    expect(badges[0].classes.has('hidden')).toBe(true);
  });

  it('neutralise les valeurs non valides (négatif, NaN, décimal)', () => {
    const badges = [new FauxElement()];
    nettoyer = installerDom(badges);

    majBadgeNonLus(-4);
    expect(badges[0].classes.has('hidden')).toBe(true);

    majBadgeNonLus(Number.NaN);
    expect(badges[0].classes.has('hidden')).toBe(true);

    majBadgeNonLus(2.9);
    expect(badges[0].textContent).toBe('2');
  });

  it('ne plante pas sans aucun badge dans la page', () => {
    nettoyer = installerDom([]);
    expect(() => majBadgeNonLus(5)).not.toThrow();
  });
});

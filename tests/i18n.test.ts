import { describe, it, expect } from 'vitest';
import { LANGUAGES, t, seo } from '../src/i18n';
import { adminT } from '../src/i18n/admin';
import { guideT } from '../src/i18n/guide';
import { booking } from '../src/i18n/booking';

/** Vérifie qu'un dictionnaire a exactement les mêmes clés dans les 4 langues, sans valeur vide. */
function expectParity(dict: Record<string, Record<string, string>>, label: string): void {
  const ref = Object.keys(dict.fr).sort();
  expect(ref.length, `${label} : le dictionnaire fr ne doit pas être vide`).toBeGreaterThan(0);
  for (const lang of LANGUAGES) {
    const keys = Object.keys(dict[lang]).sort();
    const missing = ref.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !ref.includes(k));
    expect(missing, `${label} [${lang}] : clés manquantes`).toEqual([]);
    expect(extra, `${label} [${lang}] : clés en trop`).toEqual([]);
    for (const [k, v] of Object.entries(dict[lang])) {
      expect(v && v.trim(), `${label} [${lang}] : valeur vide pour « ${k} »`).toBeTruthy();
    }
  }
}

describe('i18n.ts (vitrine)', () => {
  it('a les 4 langues déclarées', () => {
    expect(LANGUAGES).toEqual(['fr', 'en', 'es', 'de']);
  });

  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(t as never, 'i18n.ts');
  });

  it('contient les clés de navigation critiques', () => {
    for (const lang of LANGUAGES) {
      expect(t[lang]['nav.guide'], `nav.guide manquant en ${lang}`).toBeTruthy();
      expect(t[lang]['nav.reserver'], `nav.reserver manquant en ${lang}`).toBeTruthy();
      expect(t[lang]['proxi.title'], `proxi.title manquant en ${lang}`).toBeTruthy();
    }
  });

  it('expose des métadonnées SEO traduites', () => {
    for (const lang of LANGUAGES) {
      expect(seo[lang].title.length, `seo.title trop court en ${lang}`).toBeGreaterThan(10);
      expect(seo[lang].description.length, `seo.description trop courte en ${lang}`).toBeGreaterThan(30);
      expect(seo[lang].ogLocale).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    }
  });
});

describe('i18n/admin.ts (back office)', () => {
  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(adminT as never, 'admin.ts');
  });

  it('contient les libellés des sections et de l’auth', () => {
    for (const lang of LANGUAGES) {
      expect(adminT[lang]['auth.loginTitle'], `auth.loginTitle manquant en ${lang}`).toBeTruthy();
      expect(adminT[lang]['auth.submit'], `auth.submit manquant en ${lang}`).toBeTruthy();
      expect(adminT[lang]['common.backToSite'], `common.backToSite manquant en ${lang}`).toBeTruthy();
    }
  });
});

describe('i18n/guide.ts (page /guide)', () => {
  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(guideT as never, 'guide.ts');
  });
});

describe('i18n/booking.ts (page /reserver)', () => {
  it('respecte la parité des clés sur les 4 langues', () => {
    expectParity(booking as never, 'booking.ts');
  });

  it('contient les libellés clés du formulaire', () => {
    for (const lang of LANGUAGES) {
      expect(booking[lang]['booking.checkin'], `booking.checkin manquant en ${lang}`).toBeTruthy();
      expect(booking[lang]['booking.submit'] ?? booking[lang]['booking.send'], `bouton de soumission manquant en ${lang}`).toBeTruthy();
    }
  });
});

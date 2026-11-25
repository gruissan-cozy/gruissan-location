import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde sur l'aperçu social (`og:image`).
 *
 * Le layout pointait sur `hero.svg`. Facebook, X, LinkedIn, WhatsApp et Slack
 * n'acceptent pas le SVG : ils n'affichaient **aucun** aperçu, quel que soit
 * le lien partagé. Un aperçu exige une image matricielle au format paysage,
 * idéalement 1200×630 (le ratio 1.91:1 recommandé par Open Graph).
 *
 * Ces tests verrouillent le contrat : le fichier existe, c'est bien un JPEG de
 * 1200×630, le layout le référence avec ses dimensions déclarées, et le SVG
 * reste utilisé pour le rendu HTML (net à toutes les tailles).
 */

const ROOT = new URL('../', import.meta.url).pathname;
const lire = (chemin: string) => readFileSync(join(ROOT, chemin), 'utf8');

/**
 * Largeur et hauteur d'un JPEG, lues dans le marqueur SOF.
 *
 * On n'ajoute pas `sharp` aux dépendances de test pour deux nombres :
 * le format est stable, un marqueur `SOF0..SOF3 / SOF5..SOF7 / SOF9..SOF11`
 * porte les dimensions aux octets 5 à 8 du segment.
 */
function dimensionsJpeg(buffer: Buffer): { largeur: number; hauteur: number } | null {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null; // pas un JPEG
  let offset = 2;
  while (offset < buffer.length - 9) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marqueur = buffer[offset + 1];
    const longueur = buffer.readUInt16BE(offset + 2);
    const estSof =
      (marqueur >= 0xc0 && marqueur <= 0xc3) ||
      (marqueur >= 0xc5 && marqueur <= 0xc7) ||
      (marqueur >= 0xc9 && marqueur <= 0xcb);
    if (estSof) {
      return { hauteur: buffer.readUInt16BE(offset + 5), largeur: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + longueur;
  }
  return null;
}

describe('aperçu social — public/images/og-cover.jpg', () => {
  const chemin = 'public/images/og-cover.jpg';

  it('existe et reste léger', () => {
    const stats = statSync(join(ROOT, chemin));
    expect(stats.isFile()).toBe(true);
    expect(stats.size, 'image trop lourde pour un aperçu').toBeLessThan(300 * 1024);
  });

  it('est un JPEG matriciel de 1200×630', () => {
    const buffer = readFileSync(join(ROOT, chemin));
    const dimensions = dimensionsJpeg(buffer);
    expect(dimensions, 'le fichier n’est pas un JPEG lisible').not.toBeNull();
    expect(dimensions!.largeur).toBe(1200);
    expect(dimensions!.hauteur).toBe(630);
  });

  it('n’est pas un SVG déguisé', () => {
    const début = readFileSync(join(ROOT, chemin)).subarray(0, 60).toString('utf8');
    expect(début).not.toContain('<svg');
  });
});

describe('Layout.astro — métadonnées Open Graph', () => {
  const layout = lire('src/layouts/Layout.astro');

  it('référence l’image matricielle, plus le SVG', () => {
    expect(layout).toContain('/images/og-cover.jpg');
    expect(layout, 'og:image pointe encore sur le SVG').not.toMatch(
      /ogImage\s*=\s*[^\n]*hero\.svg/,
    );
  });

  it('déclare type et dimensions (exigés par Facebook et LinkedIn)', () => {
    expect(layout).toContain('property="og:image:type" content="image/jpeg"');
    expect(layout).toContain('property="og:image:width" content="1200"');
    expect(layout).toContain('property="og:image:height" content="630"');
    expect(layout).toContain('property="og:image:alt"');
  });

  it('garde le SVG pour le rendu de la page', () => {
    expect(lire('src/components/Vitrine.astro')).toContain('/images/hero.svg');
  });
});

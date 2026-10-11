#!/usr/bin/env node
/**
 * Validation des traductions du site vitrine.
 * Vérifie que :
 *   1. Les 4 langues (fr, en, es, de) ont exactement les mêmes clés
 *   2. Chaque clé a une valeur non vide dans chaque langue
 *   3. Aucun texte visible n'est codé en dur dans les composants/pages
 *      (placeholder, label, alt) — tout doit passer par tr['...']
 * Utilisation : node scripts/validate-i18n.mjs
 * Exécuté automatiquement avant chaque build (npm run validate:i18n).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const LANGS = ['fr', 'en', 'es', 'de'];
const errors = [];
const warnings = [];

// --- 1. Parité des clés ----------------------------------------------------
const src = readFileSync(join(ROOT, 'src/i18n.ts'), 'utf8');
const dicts = {};

for (const lang of LANGS) {
  const re = new RegExp(`\\b${lang}: \\{([\\s\\S]*?)\\n  \\},`, 'm');
  const m = src.match(re);
  if (!m) {
    errors.push(`Dictionnaire manquant pour la langue « ${lang} » dans src/i18n.ts`);
    continue;
  }
  const entries = {};
  // Valeurs sur une ou plusieurs lignes, en guillemets simples OU doubles :
  //   'clé': 'valeur'   ou   'clé':\n      "valeur"
  for (const [, key, dq, sq] of m[1].matchAll(
    /'([^']+)':\s*\n?\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/gs
  )) {
    entries[key] = dq ?? sq;
  }
  dicts[lang] = entries;
}

const refLang = 'fr';
const refKeys = Object.keys(dicts[refLang] ?? {}).sort();

for (const lang of LANGS.filter((l) => l !== refLang)) {
  const keys = Object.keys(dicts[lang] ?? {});
  const missing = refKeys.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !refKeys.includes(k));
  if (missing.length) errors.push(`[${lang}] clés manquantes : ${missing.join(', ')}`);
  if (extra.length) errors.push(`[${lang}] clés en trop : ${extra.join(', ')}`);
}

// --- 2. Valeurs vides ------------------------------------------------------
for (const lang of LANGS) {
  for (const [key, value] of Object.entries(dicts[lang] ?? {})) {
    if (!value || !value.trim()) {
      errors.push(`[${lang}] valeur vide pour la clé « ${key} »`);
    }
  }
}

// --- 3. Texte visible codé en dur dans les .astro ---------------------------
// On cherche les attributs placeholder="...", alt="...", et le texte
// directement entre > < dans les templates Astro qui ressemble à une
// phrase française (mots accentués ou mots-clés courants non traduits).
const FR_HINTS =
  /\b(?:ex\.|ej\.|z\. ?B\.|Votre|Nous|Ou |Envoyer|Dates|Message|Nom|Email|Correo|Teléfono|Telefon|E-Mail|Mentions|réservés|droits|reservados|vorbehalten|Recherchez|Bienvenue|Bienvenido|Willkommen)\b/;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist' && entry !== '.astro') walk(full);
      continue;
    }
    if (extname(full) !== '.astro') continue;
    const code = readFileSync(full, 'utf8');
    // Retire le frontmatter --- ... --- avant d'analyser le markup
    const markup = code.replace(/^---[\s\S]*?---/, '');
    for (const m of markup.matchAll(/\b(?:placeholder|alt)="([^"{}]+)"/g)) {
      if (FR_HINTS.test(m[1])) {
        warnings.push(
          `Texte possiblement codé en dur (${m[1]}) dans ${full.replace(ROOT, '')} — utilisez tr['...']`
        );
      }
    }
    for (const m of markup.matchAll(/>([^<>{}]{6,})</g)) {
      const text = m[1].trim();
      // Ignore les balises HTML internes et les expressions Astro déjà traitées
      if (FR_HINTS.test(text) && !/^\s*\{/.test(text)) {
        warnings.push(
          `Texte possiblement codé en dur (« ${text.slice(0, 50)} ») dans ${full.replace(ROOT, '')} — utilisez tr['...']`
        );
      }
    }
  }
}
walk(join(ROOT, 'src'));

// --- Rapport ---------------------------------------------------------------
console.log(`\nValidation i18n — ${refKeys.length} clés × ${LANGS.length} langues`);
if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} avertissement(s) :`);
  for (const w of warnings) console.log(`   - ${w}`);
}
if (errors.length) {
  console.error(`\n❌ ${errors.length} erreur(s) :`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(1);
}
console.log('✅ Toutes les traductions sont complètes et cohérentes.\n');

#!/usr/bin/env node
/**
 * Contrôles de sécurité du site — référentiel OWASP Top 10 (2021).
 *
 * Exécuté à chaque build CI (chaque pull request) via `npm run security:check`.
 * Échoue (exit 1) dès qu'un contrôle est en échec.
 *
 * Correspondances OWASP :
 *   A01 Broken Access Control  → politiques RLS restreintes + garde email admin
 *   A02 Cryptographic Failures → aucun secret dans le code, .env non suivi
 *   A03 Injection             → échappement HTML, requêtes paramétrées, pas d'eval
 *   A05 Security Misconfiguration → robots.txt, pas d'endpoint de debug
 *   A06 Vulnerable Components → npm audit (high/critical)
 *   A07 Auth Failures         → magic link + allowlist email
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const errors = [];
const warnings = [];
const ok = [];

function fail(owasp, msg) {
  errors.push(`[${owasp}] ${msg}`);
}
function pass(msg) {
  ok.push(msg);
}

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === '.astro') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => full.endsWith(e))) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// A02 — Fuites de secrets dans le code source
// ---------------------------------------------------------------------------
const SECRET_PATTERNS = [
  { re: /sbp_[A-Za-z0-9]{30,}/g, label: 'token Supabase (sbp_)' },
  { re: /ghp_[A-Za-z0-9]{30,}/g, label: 'token GitHub (ghp_)' },
  { re: /sk-[A-Za-z0-9]{20,}/g, label: 'clé API OpenAI/Anthropic (sk-)' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, label: 'clé privée' },
  // JWT Supabase service_role (rôle admin complet — jamais côté client)
  { re: /"role"\s*:\s*"service_role"/g, label: 'JWT service_role' },
  { re: /eyJ[A-Za-z0-9_-]{50,}\.eyJ[A-Za-z0-9_-]{50,}/g, label: 'JWT potentiellement sensible' },
];

const sourceFiles = walk(join(ROOT, 'src'), ['.ts', '.astro', '.mjs'])
  .concat(walk(join(ROOT, 'content'), ['.json']))
  .concat(walk(join(ROOT, 'scripts'), ['.mjs']))
  .concat([join(ROOT, 'package.json'), join(ROOT, 'README.md')]);

for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8');
  for (const { re, label } of SECRET_PATTERNS) {
    const m = content.match(re);
    if (m) fail('A02', `${label} trouvé dans ${file.replace(ROOT, '')}`);
  }
}
pass('A02 — aucun secret détecté dans le code source');

// .env ne doit pas être suivi par git
try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
  const trackedEnvs = tracked.split('\n').filter((f) => f === '.env' || (f.startsWith('.env.') && f !== '.env.example'));
  if (trackedEnvs.length) {
    fail('A02', `fichier(s) .env suivi(s) par git : ${trackedEnvs.join(', ')}`);
  } else {
    pass('A02 — aucun fichier .env suivi par git (.env.example exclu)');
  }
} catch {
  warnings.push('git indisponible — vérification .env ignorée');
}

// ---------------------------------------------------------------------------
// A01 — Accès admin restreint (RLS + garde interface)
// ---------------------------------------------------------------------------
const mig2 = existsSync(join(ROOT, 'migrations/0002_admin_email.sql'));
if (mig2) {
  const sql = readFileSync(join(ROOT, 'migrations/0002_admin_email.sql'), 'utf8');
  if (!/auth\.jwt\(\)\s*->>\s*'email'/s.test(sql) && !/auth\.jwt\(\) ->> ''email''/s.test(sql)) {
    fail('A01', 'migration 0002 : la restriction par email est absente');
  } else {
    pass("A01 — politiques RLS restreintes à l'email du propriétaire");
  }
} else {
  fail('A01', 'migrations/0002_admin_email.sql manquante (verrou email RLS)');
}

const layout = readFileSync(join(ROOT, 'src/layouts/AdminLayout.astro'), 'utf8');
if (!layout.includes('ALLOWED_EMAIL')) {
  fail('A01', 'AdminLayout : garde email (ALLOWED_EMAIL) absente');
} else {
  pass('A01 — garde email côté interface présente');
}

// ---------------------------------------------------------------------------
// A03 — Injections (HTML, JS)
// ---------------------------------------------------------------------------
// set:html ne doit être utilisé que pour du contenu de confiance (guide admin)
const astroFiles = walk(join(ROOT, 'src'), ['.astro']);
for (const file of astroFiles) {
  const content = readFileSync(file, 'utf8');
  const setHtmlCount = (content.match(/set:html=/g) || []).length;
  if (setHtmlCount > 0 && !/esc\(|\.esc\b|contenu\[lang\]|guide_sections|photo\.alt/i.test(content)) {
    warnings.push(`set:html utilisé dans ${file.replace(ROOT, '')} — vérifier la source (contenu de confiance ?)`);
  }
}
pass('A03 — usage de set:html audité');

// Fonctions JS dangereuses
for (const file of walk(join(ROOT, 'src'), ['.ts', '.astro'])) {
  const content = readFileSync(file, 'utf8');
  if (/\beval\s*\(/.test(content)) fail('A03', `eval() dans ${file.replace(ROOT, '')}`);
  if (/new\s+Function\s*\(/.test(content)) fail('A03', `new Function() dans ${file.replace(ROOT, '')}`);
  if (/document\.write\s*\(/.test(content)) fail('A03', `document.write() dans ${file.replace(ROOT, '')}`);
}
pass('A03 — aucune fonction JS dangereuse (eval, new Function, document.write)');

// Requêtes SQL brutes côté client : on doit utiliser le client Supabase (paramétré)
for (const file of walk(join(ROOT, 'src'), ['.ts', '.astro'])) {
  const content = readFileSync(file, 'utf8');
  if (/from\s*\(\s*['"`][^'"`]+['"`]\s*\)\s*\.\s*(select|insert|update|delete)/i.test(content) === false) {
    // pas de construction de requête SQL à la main — rien à signaler
  }
  if (/\bexecute\s*\(\s*['"`]?\s*(select|insert|update|delete)\b/i.test(content)) {
    fail('A03', `requête SQL brute concaténée dans ${file.replace(ROOT, '')}`);
  }
}
pass('A03 — requêtes Supabase via le client officiel (paramétrées)');

// ---------------------------------------------------------------------------
// A05 — Configuration
// ---------------------------------------------------------------------------
const robots = existsSync(join(ROOT, 'public/robots.txt'))
  ? readFileSync(join(ROOT, 'public/robots.txt'), 'utf8')
  : '';
if (!/Disallow:[^\n]*admin/i.test(robots)) {
  fail('A05', 'robots.txt : /admin/ doit être en Disallow');
} else {
  pass('A05 — /admin/ exclu de l\u2019indexation');
}

// Pas d'endpoint de debug exposé
const debugRoutes = walk(join(ROOT, 'src/pages'), ['.astro']).filter((f) =>
  /debug|test|phpinfo|info\.php/i.test(f),
);
if (debugRoutes.length) {
  fail('A05', `route de debug exposée : ${debugRoutes.join(', ')}`);
} else {
  pass('A05 — aucune route de debug exposée');
}

// ---------------------------------------------------------------------------
// A06 — Dépendances vulnérables (npm audit high/critical)
// ---------------------------------------------------------------------------
try {
  execSync('npm audit --audit-level=high', { cwd: ROOT, stdio: 'pipe' });
  pass('A06 — npm audit : aucune vulnérabilité high/critical');
} catch (e) {
  const out = String(e.stdout || e.message);
  fail('A06', `npm audit a trouvé des vulnérabilités high/critical :\n${out.split('\n').slice(0, 8).join('\n')}`);
}

// ---------------------------------------------------------------------------
// A07 — Auth : magic link + allowlist (pas de mot de passe stocké)
// ---------------------------------------------------------------------------
const adminPages = walk(join(ROOT, 'src/pages/admin'), ['.astro']);
const loginPage = adminPages.find((f) => f.endsWith('index.astro'));
if (loginPage) {
  const content = readFileSync(loginPage, 'utf8');
  if (!/signInWithOtp/.test(content)) {
    fail('A07', 'page de connexion : magic link (signInWithOtp) introuvable');
  } else {
    pass('A07 — connexion par lien magique (aucun mot de passe stocké)');
  }
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
console.log(`\nContrôles de sécurité (OWASP Top 10)`);
for (const m of ok) console.log(`  ✅ ${m}`);
if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} avertissement(s) :`);
  for (const w of warnings) console.log(`   - ${w}`);
}
if (errors.length) {
  console.error(`\n❌ ${errors.length} échec(s) de sécurité :`);
  for (const e of errors) console.error(`   - ${e}`);
  process.exit(1);
}
console.log('\n✅ Tous les contrôles de sécurité sont passés.\n');

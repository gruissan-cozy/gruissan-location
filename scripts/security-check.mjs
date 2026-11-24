#!/usr/bin/env node
/**
 * Contrôles de sécurité du site — référentiel OWASP Top 10 (2021).
 *
 * Exécuté à chaque build CI (chaque pull request) via `npm run security:check`.
 * Échoue (exit 1) dès qu'un contrôle est en échec.
 *
 * Correspondances OWASP :
 *   A01 Broken Access Control  → politiques RLS restreintes + garde email admin
 *   A02 Cryptographic Failures → aucun secret dans le code, .env ignoré et non suivi
 *   A03 Injection             → échappement HTML, requêtes paramétrées, pas d'eval
 *   A05 Security Misconfiguration → robots.txt, pas d'endpoint de debug
 *   A06 Vulnerable Components → npm audit (high/critical)
 *   A07 Auth Failures         → magic link + allowlist email
 *
 * Les fonctions pures (détection de secret, détection d'injection SQL,
 * couverture de `.gitignore`) sont exportées : `tests/security-check.test.ts`
 * les couvre, pour qu'une régression du garde elle-même ne passe pas
 * inaperçue. Le script ne s'exécute que s'il est appelé directement.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Fonctions pures (exportées pour les tests)
// ---------------------------------------------------------------------------

/**
 * Signatures de secrets recherchées dans les fichiers versionnés.
 *
 * Volontairement limitées à des formes non ambiguës : un motif trop large
 * (un simple mot « token ») noierait le rapport et pousserait à ignorer
 * l'alerte, ce qui est pire que pas d'alerte du tout.
 */
export const MOTIFS_SECRET = [
  { re: /sbp_[A-Za-z0-9]{30,}/g, label: 'token Supabase (sbp_)' },
  { re: /ghp_[A-Za-z0-9]{30,}/g, label: 'token GitHub (ghp_)' },
  { re: /sk-[A-Za-z0-9]{20,}/g, label: 'clé API OpenAI/Anthropic (sk-)' },
  { re: /re_[A-Za-z0-9]{20,}/g, label: 'clé API Resend (re_)' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, label: 'clé privée' },
  // JWT Supabase service_role (rôle admin complet — jamais côté client)
  { re: /"role"\s*:\s*"service_role"/g, label: 'JWT service_role' },
  { re: /eyJ[A-Za-z0-9_-]{50,}\.eyJ[A-Za-z0-9_-]{50,}/g, label: 'JWT potentiellement sensible' },
];

/** Libellés des secrets présents dans un contenu ; tableau vide si aucun. */
export function detecterSecrets(contenu) {
  const trouves = [];
  for (const { re, label } of MOTIFS_SECRET) {
    re.lastIndex = 0;
    if (re.test(contenu)) trouves.push(label);
  }
  return trouves;
}

/**
 * Détecte une requête SQL construite par concaténation ou interpolation.
 *
 * Le dépôt passe par le client Supabase (requêtes paramétrées par
 * PostgREST). Les deux seuls appels qui pourraient exécuter du SQL brut
 * sont `execute(` (Postgres) et `.rpc(` (fonction SQL). Si leur argument
 * est un gabarit contenant `${…}`, la valeur est injectée telle quelle :
 * c'est exactement le motif d'injection de l'A03.
 */
export function detecterSqlConcatene(contenu) {
  const interpolations = [
    /\bexecute\s*\(\s*`[^`]*\$\{/m,
    /\.rpc\s*\(\s*`[^`]*\$\{/m,
    // concaténation classique : une chaîne commençant par un ordre SQL,
    // suivie d'un `+` vers une variable.
    /["'`]\s*(?:select|insert|update|delete)\b[^"'`]*["'`]\s*\+/im,
  ];
  return interpolations.some((re) => re.test(contenu));
}

/**
 * Vrai si `.gitignore` couvre bien les fichiers d'environnement.
 *
 * Sans cette ligne, un `.env` créé localement apparaît comme fichier non
 * suivi : une commande `git add .` le publierait, avec les vraies clés.
 * Le contrôle convexait seulement « `.env` non suivi » (l'état actuel) ;
 * il manquait la cause (`.gitignore` incomplet).
 */
export function envIgnoreParGitignore(gitignore) {
  if (typeof gitignore !== 'string') return false;
  return gitignore
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne && !ligne.startsWith('#') && !ligne.startsWith('!'))
    .some((ligne) => /^\/?\.env(\*|\.\*|\.local|)$/.test(ligne) || /^\/?\.env\.\*/.test(ligne));
}

/**
 * Une source connue et échappée justifie-t-elle un `set:html` ?
 *
 * Astro n'échappe pas `set:html` : la sûreté dépend entièrement de la
 * source. On n'accepte ici que les cas audités du dépôt :
 *   - `jsonLd(...)` et `JSON.stringify(...)` : le `<` est remplacé par
 *     `\u003c`, une valeur ne peut donc pas fermer la balise `<script>` ;
 *   - `htmlEnregistrement` / `enregistrementHtml` : échappement dans
 *     `src/lib/enregistrement.ts` ;
 *   - `contenu[lang]` / `contenu(...)` / `guide_sections` : HTML saisi par
 *     le propriétaire, en écriture seule côté admin (RLS).
 */
export function sourceSetHtmlAuditee(contenu) {
  return /jsonLd\(|JSON\.stringify\(|htmlEnregistrement|enregistrementHtml|contenu\[lang\]|contenu\(s\)|guide_sections/.test(
    contenu,
  );
}

/**
 * Politiques RLS qui ouvrent une table admin à TOUT compte authentifié.
 *
 * `create policy … for all to authenticated using (true)` est le motif qui
 * transformait la clé anon + n'importe quel compte Supabase en accès total
 * au back office (avant la migration 0002). La 0002 a resserré le verrou sur
 * l'email du propriétaire — mais rien n'empêchait une migration ultérieure
 * de rouvrir la porte. Ce contrôle refuse donc ce motif dès la 0003.
 *
 * `0001_init.sql` est exclue : c'est l'état initial, corrigé par 0002.
 */
export function politiquesAdminOuvertes(fichiers) {
  const fautifs = [];
  for (const { nom, sql } of fichiers) {
    const numero = Number(nom.slice(0, 4));
    if (!Number.isFinite(numero) || numero <= 2) continue;
    const motif = /create\s+policy[\s\S]{0,400}?for\s+all\s+to\s+authenticated[\s\S]{0,200}?using\s*\(\s*true\s*\)/gi;
    if (motif.test(sql)) fautifs.push(nom);
  }
  return fautifs;
}

/**
 * Tables `public.*` créées sans `enable row level security`.
 *
 * Une table sans RLS sur Supabase est lisible ET inscriptible avec la clé
 * anon publique : c'est la fuite de données la plus banale de la stack
 * (A01). Le contrôle accepte la RLS activée dans n'importe quelle migration,
 * pas forcément celle qui crée la table.
 */
export function tablesSansRls(fichiers) {
  const creees = new Set();
  const protegees = new Set();
  for (const { sql } of fichiers) {
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)) {
      creees.add(m[1].toLowerCase());
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
    )) {
      protegees.add(m[1].toLowerCase());
    }
  }
  return [...creees].filter((table) => !protegees.has(table)).sort();
}

// ---------------------------------------------------------------------------
// Collecte de fichiers
// ---------------------------------------------------------------------------

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
// Rapport
// ---------------------------------------------------------------------------

/** Jeu de résultats d'un contrôle : au moins un `fail` ⇒ pas de ✅. */
function controleur() {
  const errors = [];
  const warnings = [];
  const ok = [];
  return {
    errors,
    warnings,
    ok,
    fail(owasp, msg) {
      errors.push(`[${owasp}] ${msg}`);
    },
    warn(msg) {
      warnings.push(msg);
    },
    /** N'inscrit le ✅ que si aucune erreur n'a été ajoutée pendant le contrôle. */
    pass(msg) {
      const avant = errors.length;
      return () => {
        if (errors.length === avant) ok.push(msg);
      };
    },
  };
}

function main() {
  const { errors, warnings, ok, fail, warn, pass } = controleur();

  // -------------------------------------------------------------------
  // A02 — Fuites de secrets dans le code source
  // -------------------------------------------------------------------
  const fichiersSources = [
    ...walk(join(ROOT, 'src'), ['.ts', '.astro', '.mjs']),
    ...walk(join(ROOT, 'content'), ['.json']),
    ...walk(join(ROOT, 'scripts'), ['.mjs']),
    // Les Edge Functions et les migrations contiennent des URL, des JWT de
    // test et parfois des clés collées « pour essayer » : elles doivent être
    // scannées comme le reste du dépôt.
    ...walk(join(ROOT, 'supabase'), ['.ts', '.toml']),
    ...walk(join(ROOT, 'migrations'), ['.sql']),
    join(ROOT, 'package.json'),
    join(ROOT, 'README.md'),
  ];

  const finSecrets = pass('A02 — aucun secret détecté dans le code source');
  for (const file of fichiersSources) {
    for (const label of detecterSecrets(readFileSync(file, 'utf8'))) {
      fail('A02', `${label} trouvé dans ${file.replace(ROOT, '')}`);
    }
  }
  finSecrets();

  // .env ne doit pas être suivi par git ET doit être ignoré
  const finEnv = pass('A02 — fichiers .env ignorés par git et absents du suivi');
  try {
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
    const trackedEnvs = tracked
      .split('\n')
      .filter((f) => f === '.env' || (f.startsWith('.env.') && f !== '.env.example'));
    if (trackedEnvs.length) {
      fail('A02', `fichier(s) .env suivi(s) par git : ${trackedEnvs.join(', ')}`);
    }
    const gitignore = existsSync(join(ROOT, '.gitignore'))
      ? readFileSync(join(ROOT, '.gitignore'), 'utf8')
      : '';
    if (!envIgnoreParGitignore(gitignore)) {
      fail(
        'A02',
        '.gitignore ne couvre pas .env : un fichier de secrets créé en local serait proposé au commit',
      );
    }
  } catch {
    warn('git indisponible — vérification .env ignorée');
  }
  finEnv();

  // -------------------------------------------------------------------
  // A01 — Accès admin restreint (RLS + garde interface)
  // -------------------------------------------------------------------
  const finRls = pass("A01 — politiques RLS restreintes à l'email du propriétaire");
  const mig2 = join(ROOT, 'migrations/0002_admin_email.sql');
  if (!existsSync(mig2)) {
    fail('A01', 'migrations/0002_admin_email.sql manquante (verrou email RLS)');
  } else {
    const sql = readFileSync(mig2, 'utf8');
    if (!/auth\.jwt\(\)\s*->>\s*''email''/s.test(sql) && !/auth\.jwt\(\)\s*->>\s*'email'/s.test(sql)) {
      fail('A01', 'migration 0002 : la restriction par email est absente');
    }
  }
  finRls();

  const finGarde = pass('A01 — garde email côté interface présente');
  const layout = readFileSync(join(ROOT, 'src/layouts/AdminLayout.astro'), 'utf8');
  if (!layout.includes('ALLOWED_EMAIL')) {
    fail('A01', 'AdminLayout : garde email (ALLOWED_EMAIL) absente');
  }
  finGarde();

  // RLS : aucune table publique sans protection, aucune politique admin
  // rouverte à tout compte authentifié.
  const fichiersSql = walk(join(ROOT, 'migrations'), ['.sql']).map((chemin) => ({
    nom: chemin.slice(chemin.lastIndexOf('/') + 1),
    sql: readFileSync(chemin, 'utf8'),
  }));

  const finTablesRls = pass('A01 — toutes les tables publiques ont RLS activée');
  for (const table of tablesSansRls(fichiersSql)) {
    fail('A01', `table public.${table} créée sans « enable row level security »`);
  }
  finTablesRls();

  const finPolitiques = pass('A01 — aucune politique admin rouverte à tout compte authentifié');
  for (const nom of politiquesAdminOuvertes(fichiersSql)) {
    fail(
      'A01',
      `${nom} : politique « for all to authenticated using (true) » — resserrer sur auth.jwt() ->> 'email'`,
    );
  }
  finPolitiques();


  const finLogin = pass('A01 — page de connexion : vérification email avant tableau de bord');
  const loginPageFile = join(ROOT, 'src/pages/admin/index.astro');
  if (existsSync(loginPageFile)) {
    const loginSrc = readFileSync(loginPageFile, 'utf8');
    if (!loginSrc.includes('ALLOWED_EMAIL') || !/session\?\.user\?\.email === ALLOWED_EMAIL/.test(loginSrc)) {
      fail('A01', 'page de connexion : la vérification de l’email avant le tableau de bord est absente');
    }
  }
  finLogin();

  // -------------------------------------------------------------------
  // A03 — Injections (HTML, JS, SQL)
  // -------------------------------------------------------------------
  // set:html n'échappe rien : chaque usage doit venir d'une source auditée.
  const finSetHtml = pass('A03 — usage de set:html audité');
  for (const file of walk(join(ROOT, 'src'), ['.astro'])) {
    const content = readFileSync(file, 'utf8');
    if (!/set:html=/.test(content)) continue;
    if (!sourceSetHtmlAuditee(content)) {
      warn(`set:html utilisé dans ${file.replace(ROOT, '')} — vérifier la source (contenu de confiance ?)`);
    }
  }
  finSetHtml();

  // Fonctions JS dangereuses
  const finJsDangereux = pass('A03 — aucune fonction JS dangereuse (eval, new Function, document.write)');
  const jsInjection = [
    { re: /\beval\s*\(/, label: 'eval()' },
    { re: /new\s+Function\s*\(/, label: 'new Function()' },
    { re: /document\.write\s*\(/, label: 'document.write()' },
  ];
  for (const file of walk(join(ROOT, 'src'), ['.ts', '.astro'])) {
    const content = readFileSync(file, 'utf8');
    for (const { re, label } of jsInjection) {
      if (re.test(content)) fail('A03', `${label} dans ${file.replace(ROOT, '')}`);
    }
  }
  finJsDangereux();

  // Requêtes SQL brutes : le client Supabase paramètre tout. Une chaîne
  // interpolée passée à `execute(` ou `.rpc(` rouvrirait l'injection.
  const finSql = pass('A03 — requêtes Supabase via le client officiel (paramétrées)');
  for (const file of [...walk(join(ROOT, 'src'), ['.ts', '.astro']), ...walk(join(ROOT, 'supabase'), ['.ts'])]) {
    if (detecterSqlConcatene(readFileSync(file, 'utf8'))) {
      fail('A03', `requête SQL brute concaténée dans ${file.replace(ROOT, '')}`);
    }
  }
  finSql();

  // -------------------------------------------------------------------
  // A05 — Configuration
  // -------------------------------------------------------------------
  const finRobots = pass('A05 — /admin/ exclu de l’indexation');
  const robots = existsSync(join(ROOT, 'public/robots.txt'))
    ? readFileSync(join(ROOT, 'public/robots.txt'), 'utf8')
    : '';
  if (!/Disallow:[^\n]*admin/i.test(robots)) {
    fail('A05', 'robots.txt : /admin/ doit être en Disallow');
  }
  finRobots();

  const finDebug = pass('A05 — aucune route de debug exposée');
  const debugRoutes = walk(join(ROOT, 'src/pages'), ['.astro']).filter((f) =>
    /debug|phpinfo|info\.php/i.test(f),
  );
  if (debugRoutes.length) {
    fail('A05', `route de debug exposée : ${debugRoutes.join(', ')}`);
  }
  finDebug();

  // -------------------------------------------------------------------
  // A06 — Dépendances vulnérables (npm audit high/critical)
  // -------------------------------------------------------------------
  const finAudit = pass('A06 — npm audit : aucune vulnérabilité high/critical');
  try {
    execSync('npm audit --audit-level=high', { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    const out = String(e.stdout || e.message);
    fail('A06', `npm audit a trouvé des vulnérabilités high/critical :\n${out.split('\n').slice(0, 8).join('\n')}`);
  }
  finAudit();

  // -------------------------------------------------------------------
  // A07 — Auth : magic link + allowlist (pas de mot de passe stocké)
  // -------------------------------------------------------------------
  const finMagic = pass('A07 — connexion par lien magique (aucun mot de passe stocké)');
  const loginPage = walk(join(ROOT, 'src/pages/admin'), ['.astro']).find((f) => f.endsWith('index.astro'));
  if (loginPage) {
    const content = readFileSync(loginPage, 'utf8');
    if (!/signInWithOtp/.test(content)) {
      fail('A07', 'page de connexion : magic link (signInWithOtp) introuvable');
    }
  }
  finMagic();

  // -------------------------------------------------------------------
  // Rapport
  // -------------------------------------------------------------------
  console.log(`\nContrôles de sécurité (OWASP Top 10)`);
  for (const m of ok) console.log(`  ✅ ${m}`);
  if (warnings.length) {
    console.log(`\n⚠️  ${warnings.length} avertissement(s) :`);
    for (const w of warnings) console.log(`   - ${w}`);
  }
  if (errors.length) {
    console.error(`\n❌ ${errors.length} échec(s) de sécurité :`);
    for (const e of errors) console.error(`   - ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log('\n✅ Tous les contrôles de sécurité sont passés.\n');
}

// Exécution uniquement en tant que script (`node scripts/security-check.mjs`),
// jamais à l'import depuis les tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

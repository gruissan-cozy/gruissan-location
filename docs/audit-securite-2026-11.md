# Audit de sécurité — gruissan-location

**Date** : 24 novembre 2026
**Périmètre** : dépôt `gruissan-cozy/gruissan-location` à `509d05d`
**Référentiel** : OWASP Top 10 (2021)
**Méthode** : revue du code, `npm run security:check`, `npm audit`, lecture des
migrations Supabase et des Edge Functions.

---

## Synthèse

| Sévérité | Nombre | État |
|---|---|---|
| Critique | 0 | — |
| Élevée | 0 | — |
| Moyenne | 1 | **corrigée** dans cette branche (A06, Astro 7.3.8 → 7.4.13) |
| Faible / durcissement | 4 | **corrigées** dans cette branche |
| Observations | 3 | à l'attention du lead, aucune action code |

Aucune vulnérabilité exploitable en production n'a été trouvée : pas de secret
versionné, RLS cohérente, garde admin intacte, pas de route de debug, pas
d'injection SQL. Les corrections apportées durcissent le **garde lui-même** et
la chaîne de dépendances.

`npm run verify` passe intégralement après modifications (i18n, sécurité, LSP,
838 + 20 tests, build 35 pages).

---

## 1. A06 — Composants vulnérables (Moyenne — CORRIGÉE)

**Constat.** `astro@7.3.8` était vulnérable à deux avis :

| Avis | Sévérité | Portée |
|---|---|---|
| [GHSA-mh32-jxcr-mh9f](https://github.com/advisories/GHSA-mh32-jxcr-mh9f) — XSS par injection d'attributs dans les noms de balises dynamiques | low | ≤ 7.4.4 |
| [GHSA-r3h5-4585-7x3w](https://github.com/advisories/GHSA-r3h5-4585-7x3w) — l'endpoint Image de `@astrojs/node` peut lire un fichier d'un dossier voisin | moderate | 5.14.3 → 7.4.6 |

`npm run security:check` ne les voyait pas : il appelle
`npm audit --audit-level=high`, et les deux avis sont *moderate* et *low*.
Le garde passait donc au vert avec une dépendance vulnérable.

**Correction.** `astro` porté à `^7.4.13`. `npm audit --audit-level=moderate`
renvoie désormais `found 0 vulnerabilities`.

**Portée réelle dans ce dépôt.** L'avis Image ne s'applique pas : le site est
un build statique (`output` par défaut), aucun adaptateur `@astrojs/node`
n'est installé ni utilisé. L'avis XSS reste théorique (aucune balise
dynamique pilotée par une entrée visiteur) mais la mise à jour est gratuite et
supprime la dette.

---

## 2. A02 — Le scanner de secrets ignorait la moitié du dépôt (Faible — CORRIGÉE)

**Constat.** `scripts/security-check.mjs` ne scannait que `src/`, `content/`,
`scripts/`, `package.json` et `README.md`. **Non scannés** : `supabase/functions/`
(4 Edge Functions avec accès `service_role`), `migrations/` (SQL), `docs/`,
`tests/`. C'est exactement là qu'on colle une clé « pour essayer » :
`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET`.

**Correction.** `supabase/**` et `migrations/**` sont désormais scannés. Le
scan manuel de ces dossiers au moment de l'audit n'a révélé **aucun secret
réel** — la lacune était dans le garde, pas dans le code.

Deux signatures ajoutées : `re_…` (clé Resend, utilisée par
`supabase/functions/send-email/index.ts`) et la clé privée PEM (déjà présente,
conservée).

---

## 3. A02 — `.gitignore` ne couvrait pas `.env` (Faible — CORRIGÉE)

**Constat.** `.gitignore` ignorait `dist/`, `.astro/`, `node_modules/`,
`.worktrees/` — **pas `.env`**. Le contrôle existant vérifiait seulement que
`.env` n'était pas *suivi* (vrai aujourd'hui), pas qu'il serait *ignoré*. Un
`.env` créé localement pour tester Supabase apparaissait donc comme fichier
non suivi, et un `git add .` l'aurait publié avec les vraies clés anon.

**Correction.** `.gitignore` couvre `.env`, `.env.*` avec l'exception
`!.env.example`. Le garde vérifie maintenant les deux : non suivi **et** ignoré.

---

## 4. A01 — Aucun contrôle automatique de la RLS réelle (Faible — CORRIGÉE)

**Constat.** Le garde vérifiait que `migrations/0002_admin_email.sql` contenait
la clause email, et que les composants portaient `ALLOWED_EMAIL`. Il ne
vérifiait pas les deux invariants qui comptent vraiment en base :

1. **toute table `public.*` a `enable row level security`** — une table sans
   RLS sur Supabase est lisible et inscriptible avec la clé anon publique ;
2. **aucune politique admin n'est rouverte à tout compte authentifié** —
   `for all to authenticated using (true)` était précisément la faille
   corrigée par la 0002 ; rien n'empêchait une migration ultérieure de la
   réintroduire.

**Correction.** Deux contrôles ajoutés (`tablesSansRls`,
`politiquesAdminOuvertes`), avec deux tests qui s'exécutent **contre le dépôt
réel** : ils échouent si une future migration crée une table sans RLS ou
rouvre une politique. Les 14 tables actuelles sont protégées, aucune
politique ouverte ne subsiste après 0002.

**Exception documentée.** `migrations/0011_calendar_blocks.sql` conserve
`public_read_calendar_blocks_dates … using (true)`, mais c'est une politique
`for select to anon` sur deux colonnes seulement (`debut`, `fin`, verrou
`grant` colonne) : les notes internent restent privées. Ce n'est pas une
politique admin, le contrôle ne la signale pas — à raison.

---

## 5. A03 — `set:html` dans `Layout.astro` sans échappement explicite (Faible — CORRIGÉE)

**Constat.** `Layout.astro` construisait son JSON-LD avec `JSON.stringify()`
brut dans `set:html`. Une valeur contenant `</script>` ferme la balise et
injecte du HTML. Les valeurs viennent de `content/site.json` (contenu du
propriétaire, non visiteur) — le risque pratique est donc nul aujourd'hui,
mais c'est le motif qu'on ne veut pas voir se propager à une valeur pilotée
par un formulaire.

**Correction.** `jsonLd()` (`src/lib/confiance.ts`) remplace `<` par `\u003c`,
comme le font déjà `Reservation.astro`, `Vitrine.astro` et `Guide.astro`.
Cohérence avec le reste du dépôt, et le garde reconnaît désormais cette source
comme auditée.

**Vérifié sans correction nécessaire** :
- `src/components/Guide.astro` — `set:html={contenu(s)}` sur du HTML saisi en
  admin, en écriture seule derrière RLS ;
- `tenant/index.astro` — `safeGuideFragment()` filtre les balises sur liste
  blanche, force `rel="noopener noreferrer"` sur les liens, et n'accepte que
  `https?://` ;
- tous les `innerHTML` des pages admin passent par `esc()` (échappement
  `& < > " '`).

---

## 6. A01 / A07 — RLS et authentification : conformes

Points vérifiés, **aucune action** :

- **Garde admin intacte** : `ALLOWED_EMAIL = 'gruissancozy@gmail.com'` dans
  `AdminLayout.astro` et `admin/index.astro`, contenu masqué par défaut
  (`class="hidden"`), vérification `session?.user?.email === ALLOWED_EMAIL`
  avant d'afficher le tableau de bord. **Non modifiée** par cette branche.
- **RLS des 14 tables** : toutes activées ; les politiques admin sont
  resserrées sur `auth.jwt() ->> 'email'`.
- **Écritures anonymes bornées** : `public_insert_sejours` (0012) impose
  `statut = 'demande'`, `origine = 'site'`, historique vide, longueurs
  bornées, `depart > arrivee` ; `grant insert` limité aux colonnes du
  formulaire — ni `note` (interne) ni `prix_total` (négocié). Même logique
  pour `messages` (0010).
- **Verrou de colonnes** : `sejours` n'expose au public que `arrivee`/`depart`
  (0003) ; `availability` que `start_date`/`end_date`/`statut` (0010) ;
  `calendar_blocks` que `debut`/`fin` (0011). Les coordonnées voyageur ne
  sont jamais lisibles avec la clé anon.
- **Auth magic link** : `signInWithOtp`, aucun mot de passe stocké. Le jeton
  locataire fait 32 octets cryptographiques (`genererJeton`), est borné à
  30 jours après le départ par un trigger SQL (0013), révoqué à l'annulation,
  et n'est jamais journalisé.
- **Horodatage constant** sur `CRON_SECRET` (`equalSecret` dans
  `purge-tenant-data`).

---

## 7. A05 — Configuration : conforme

- `public/robots.txt` : `Disallow: /gruissan-location/admin/` présent.
- `/admin/` et `/tenant/` portent `<meta name="robots" content="noindex, nofollow">`.
- `sitemap.xml` ne liste que les 4 accueils ; ni `admin/` ni `tenant/`.
- Aucune route de debug, `phpinfo` ou endpoint de diagnostic.
- Fichiers de vérification Google Search Console : statiques, sans donnée.
- Seule origine externe chargée : Google Fonts. Aucun script tiers, aucun
  tracker, aucun cookie marketing.

---

## 8. Observations pour le lead (aucune action code)

1. **`bookings` reste lisible par `authenticated`** (0012). La table est en
   lecture seule depuis la fusion vers `sejours`, mais conserve des
   coordonnées historiques. Prévue pour suppression « après une saison ».
   Décision de kiki, hors périmètre de cet audit.

2. **`tenant_sessions.token` est stocké en clair.** Volontaire pour la
   recherche par jeton (`where token = …`). Un hachage imposerait un index
   sur le condensat et casserait la comparaison par header ; la compensation
   est la durée de vie courte et la révocation automatique. À réévaluer si un
   jour la table grossit.

3. **`execute` / `rpc` ne sont pas utilisés** par le code applicatif : tout
   passe par le client Supabase (PostgREST paramétré). Le contrôle A03 ajouté
   couvre donc un risque nul aujourd'hui mais réel si une migration ou une
   Edge Function introduisait du SQL brut.

---

## Fichiers modifiés par cette branche

| Fichier | Nature |
|---|---|
| `package.json`, `package-lock.json` | astro `^7.3.8` → `^7.4.13` (A06) |
| `.gitignore` | `.env` / `.env.*` ignorés (A02) |
| `scripts/security-check.mjs` | scan étendu, `.gitignore`, RLS, politiques admin, SQL concaténé, `set:html` (A01/A02/A03) |
| `src/layouts/Layout.astro` | JSON-LD via `jsonLd()` (A03) |
| `tests/security-check.test.ts` | 20 tests du garde, dont 2 contre le dépôt réel |

## Contrôles finaux

```
npm run security:check  → 12 ✅, 0 avertissement, 0 échec
npm audit               → found 0 vulnerabilities
npm run verify          → i18n ✅ · sécurité ✅ · astro check ✅ · 858 tests ✅ · build 35 pages ✅
```

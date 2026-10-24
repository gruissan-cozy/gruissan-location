# AGENTS.md — directives pour les agents de développement

Ce fichier est lu automatiquement par les agents de code (opencode, Claude
Code, Codex, Hermes…). **Lis-le avant toute modification du dépôt.**

Détail complet, workflow PR et pièges : voir [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## Harnais : une seule commande fait foi

```bash
npm run check      # diagnostics LSP Astro/TypeScript — DOIT afficher 0 erreur
npm test           # tests unitaires Vitest — DOIT être tout vert
npm run verify     # GATE COMPLET : i18n → sécurité → LSP → tests → build
```

**Avant chaque push : `npm run verify` doit passer.** C'est exactement ce que
la CI exécute ; si ça passe en local, ça passe en CI.

Ordre du gate : `validate:i18n` → `security:check` (OWASP) → `astro check` (LSP)
→ `vitest run` → `astro build`.

---

## Règles non négociables

1. **Quatre langues, toujours** : `fr`, `en`, `es`, `de`. Toute chaîne visible
   par un visiteur doit exister dans les quatre. `validate:i18n` (en `prebuild`)
   bloque le build sinon.
2. **Aucun secret dans le code** : jamais de token, clé ou mot de passe en dur.
   Ils vivent dans les GitHub Secrets. Le scanner de sécurité échoue sinon.
3. **Open source uniquement** : pas de dépendance propriétaire, pas de service
   externe payant.
4. **La branche `main` est protégée** : tout passe par une pull request avec la
   CI verte. Le push direct est refusé, même pour l'administrateur.
5. **Commentaires, commits et interface en français** ; identifiants et API en
   anglais.
6. **Ne jamais affaiblir la garde admin** : `ALLOWED_EMAIL` dans
   `src/layouts/AdminLayout.astro` et `src/pages/admin/index.astro`, politiques
   RLS dans `migrations/`, contenu masqué par défaut (`hidden`) dans le HTML.
   Accès réservé à `gruissancozy@gmail.com`.
7. **Toute logique nouvelle est testée** : une fonction dans `src/lib/` sans
   test est incomplète. Écrire le test d'abord (TDD) est la méthode recommandée.

---

## Méthode de travail

```bash
git fetch origin main && git checkout -b feat/ma-fonctionnalite origin/main
# ... développement : npm run check && npm test au fil de l'eau
npm run verify                                   # gate complet
git push -u origin feat/ma-fonctionnalite
gh pr create --base main --fill
gh pr checks --watch && gh pr merge --squash --delete-branch
```

Préfixes de branche : `feat/`, `fix/`, `docs/`, `chore/`, `security/`.
Le merge sur `main` déclenche le déploiement GitHub Pages.

---

## Structure du dépôt

```
content/*.json      Contenu éditable (jamais en dur dans les composants)
src/i18n.ts         Traductions principales (fr/en/es/de) + SEO
src/i18n/*.ts       Traductions par domaine (admin, booking, guide)
src/lib/            Logique testable (supabase, admin-runtime, pricing)
src/pages/          Pages (index, guide, reserver, admin/*)
src/components/     Composants (Vitrine, Reservation)
src/layouts/        Layouts (Layout, AdminLayout)
scripts/            Outils du harnais (validate-i18n, security-check)
tests/              Tests unitaires Vitest
migrations/         Schéma Supabase + politiques RLS
```

---

## Pièges connus (ne pas redécouvrir)

- **Lock npm 10** : la CI tourne sous Node 22 → npm 10. Un lock généré par
  npm 11 casse `npm ci` (« Missing: @emnapi/core from lock file »). Régénérer
  avec `npx -y npm@10 install`.
- **`astro check` n'est pas dans le build** : sans lui, des erreurs de type
  passent en local et échouent en CI.
- **Le job CI s'appelle `build`** et est référencé par la protection de
  branche : ne pas le renommer.
- **`git` sans identité globale** : commiter avec
  `git -c user.name="..." -c user.email="..."`.
- **`gh` s'authentifie via la variable `GH_TOKEN`**.
- **`prebuild` lance `validate:i18n`** : un `npm run build` échoue si les clés
  i18n ne sont pas alignées — c'est voulu.

---

## Définition de « terminé »

- [ ] `npm run verify` passe intégralement ;
- [ ] les textes existent dans les 4 langues ;
- [ ] la logique nouvelle est couverte par des tests ;
- [ ] la PR est ouverte, la CI verte, puis mergée en squash ;
- [ ] le déploiement GitHub Pages a réussi et le site répond en 200.

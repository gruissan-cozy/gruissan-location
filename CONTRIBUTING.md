# Contribuer — harnais de développement

Ce document décrit **comment travailler sur ce dépôt** : les commandes du
harnais, les règles à respecter et la définition de « terminé ». À lire avant
toute modification, par un humain comme par un agent de développement.

---

## 1. Le harnais : une seule commande fait foi

```bash
npm ci              # installe les dépendances (lock à jour avec npm 10)
npm run dev         # serveur de développement (http://localhost:4321/gruissan-location/)
npm run check       # diagnostics LSP Astro/TypeScript — DOIT afficher 0 erreur
npm test            # tests unitaires Vitest — DOIT être tout vert
npm run verify      # LE GATE COMPLET : i18n → sécurité → LSP → tests → build
```

**Règle d'or : `npm run verify` doit passer avant chaque push.** C'est
exactement ce que la CI exécute. Si ça passe en local, ça passe en CI.

Détail de `verify` (dans cet ordre) :

| Étape | Commande | Ce qu'elle garantit |
|---|---|---|
| 1. i18n | `npm run validate:i18n` | Parité stricte des clés entre fr/en/es/de |
| 2. Sécurité | `npm run security:check` | OWASP : secrets, RLS, injections, `npm audit` |
| 3. LSP | `npm run check` | 0 erreur de type dans les `.astro` et `.ts` |
| 4. Tests | `npm test` | Comportement vérifié (pricing, i18n, contenu, helpers) |
| 5. Build | `npm run build` | Le site se compile (17 pages) |

---

## 2. Règles non négociables

1. **Quatre langues, toujours.** Toute chaîne visible par un visiteur doit
   exister en `fr`, `en`, `es` **et** `de`. Le script de validation bloque le
   build sinon. Ne jamais laisser une langue de côté « pour plus tard ».
2. **Aucun secret dans le code.** Jamais de token, clé ou mot de passe en dur.
   Les secrets vivent dans les *GitHub Secrets* et sont injectés au build.
   Le scanner de sécurité échoue si un secret apparaît.
3. **Open source uniquement.** Pas de dépendance propriétaire ni de service
   externe payant. Le back office repose sur Supabase (offre gratuite).
4. **La branche `main` est protégée.** Tout passe par une pull request avec la
   CI verte. Le push direct est refusé, même pour l'administrateur.
5. **Commentaires et messages en français.** Le code (identifiants, API) reste
   en anglais ; les commentaires, les commits et l'interface en français.
6. **Ne jamais affaiblir la garde admin.** `ALLOWED_EMAIL` dans
   `src/layouts/AdminLayout.astro` et `src/pages/admin/index.astro`, ainsi que
   les politiques RLS (migrations), verrouillent l'accès à
   `gruissancozy@gmail.com`. Toute modification de ces fichiers doit être
   justifiée et testée.

---

## 3. Méthode de travail (workflow PR)

```bash
# 1. Partir de main à jour
git fetch origin main && git checkout -b feat/ma-fonctionnalite origin/main

# 2. Développer, en vérifiant souvent
npm run check && npm test

# 3. Gate complet avant de pousser
npm run verify

# 4. Pousser et ouvrir la PR
git push -u origin feat/ma-fonctionnalite
gh pr create --base main --fill

# 5. Attendre la CI verte, puis merger en squash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Le merge sur `main` déclenche automatiquement le déploiement GitHub Pages.

**Nommage des branches** : `feat/…` (fonctionnalité), `fix/…` (correctif),
`docs/…`, `chore/…`, `security/…`.

---

## 4. Où se trouve quoi

```
content/*.json          Contenu éditable (site, tarifs, dispos, galerie, packs, guide, proximité)
src/i18n.ts             Traductions principales (fr/en/es/de) + SEO
src/i18n/{admin,booking,guide}.ts   Traductions par domaine (mêmes 4 langues)
src/pages/              Pages (index, guide, reserver, admin/*)
src/components/         Composants (Vitrine, Reservation)
src/layouts/            Layouts (Layout vitrine, AdminLayout back office)
src/lib/                Logique réutilisable (supabase, admin-runtime, pricing)
scripts/                Outils du harnais (validate-i18n, security-check)
tests/                  Tests unitaires Vitest
migrations/             Schéma Supabase + politiques RLS
.github/workflows/      CI (ci.yml) et déploiement (deploy.yml)
```

**Principe** : le contenu éditorial vit dans `content/*.json` (jamais en dur
dans les composants) ; la logique testable vit dans `src/lib/` ; les pages
assemblent.

---

## 5. Tests

- Framework : **Vitest** (`npm test`). Les tests sont dans `tests/*.test.ts`.
- **Toute logique nouvelle doit être testée.** Une fonction dans `src/lib/`
  sans test est considérée comme incomplète.
- Privilégier des tests rapides et déterministes : pas de réseau, pas de
  dépendance à l'horloge réelle ou au système de fichiers.
- Tester aussi les **cas limites** (valeurs vides, dates inversées, calculs à
  zéro) et pas seulement le chemin nominal.
- Avant d'écrire une fonctionnalité, écrire le test qui échoue (TDD) est la
  méthode recommandée.

---

## 6. Pièges connus (à ne pas redécouvrir)

- **Lock et npm 10.** La CI utilise Node 22 → npm 10. Régénérer le lock avec
  `npx -y npm@10 install` ; un lock produit par npm 11 casse `npm ci`.
- **`prebuild` lance `validate:i18n`.** Un `npm run build` échoue si les clés
  i18n ne sont pas alignées — c'est voulu.
- **`astro check` fait partie du gate.** Une erreur de type non détectée par le
  build fait échouer la CI : lancer `npm run check` régulièrement.
- **Le nom du job CI est `build`** et il est référencé par la protection de
  branche. Ne pas le renommer.
- **Le contenu admin est masqué par défaut dans le HTML.** Ne pas retirer les
  classes `hidden` initiales : c'est la défense en profondeur côté interface.

---

## 7. Notifications des nouvelles demandes

Le back office suit les demandes **non lues** (colonne `messages.lu_at`,
migration `migrations/0005_demandes_lues.sql`) : badge dans la navigation,
carte de comptage au tableau de bord, filtre « Non lues » et marquage lu /
non lu persistant dans `/admin/messages/`. Logique pure dans `src/lib/lu.ts`
(testée dans `tests/lu.test.ts`).

> ⚠️ **Migration 0005 à appliquer à la main** (SQL Editor de Supabase).
> Le token d'administration n'est pas disponible pour les agents de code.
> Sans elle, le suivi dégrade proprement (bandeau explicite, compteur
> masqué) et le reste du back office reste utilisable.

**Alerter le propriétaire en dehors de `/admin/`** (Telegram, e-mail,
notification GitHub) : le site est statique, rien ne tourne en permanence.
Les options possibles, leurs prérequis (token de bot, clé d'API, fournisseur
SMTP, clé Supabase de lecture) et leurs limites sont détaillées dans
[`docs/notifications.md`](docs/notifications.md). Aucune n'est implémentée :
aucun identifiant n'est disponible et le propriétaire a exclu tout service
payant. **Toute nouvelle option doit être documentée avant d'être codée.**

---

## 8. Définition de « terminé »

Une tâche est terminée quand :

- [ ] `npm run verify` passe intégralement ;
- [ ] les textes existent dans les 4 langues ;
- [ ] la logique nouvelle est couverte par des tests ;
- [ ] la PR est ouverte, la CI verte, puis mergée en squash ;
- [ ] le déploiement GitHub Pages a réussi et le site répond en 200.

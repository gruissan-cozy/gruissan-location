# Notifications à chaque nouvelle demande

Ce document décrit **comment être averti d'une nouvelle demande** de contact
ou de réservation, avec les options réellement à portée de ce projet, leurs
prérequis et leurs limites.

> **Avertissement honnête** : ce site est **statique** (GitHub Pages). Il n'y a
> ni serveur, ni processus qui tourne en permanence. Une page web ne peut pas
> « pousser » une notification sur le téléphone du propriétaire. Le seul
> mécanisme qui fonctionne aujourd'hui, sans rien configurer, est **dans le
> back office** (voir §1). Les alertes extérieures (§2 et §3) sont **décrites
> mais non implémentées**, parce qu'elles exigent des identifiants que
> l'on ne possède pas (aucun token de bot, aucune clé d'API, aucun fournisseur
> SMTP configuré) — et que le propriétaire ne veut **aucun service payant**.

---

## 1. Ce qui est en place (aucune configuration)

Le back office `/admin/` sait compter et suivre les demandes **non lues**.
Une demande est « non lue » tant que la colonne `messages.lu_at` est `NULL`
(migration `migrations/0005_demandes_lues.sql`).

| Signal | Où | Comment |
|---|---|---|
| Badge « N » | Onglet **Messages** de la navigation (toutes les pages) | Rempli dès la connexion, rafraîchi après chaque action |
| Carte **« Demandes non lues »** | Tableau de bord `/admin/` | Compteur + accès direct à la liste |
| Badge **« Non lu »** sur chaque demande | `/admin/messages/` | Ne s'affiche que sur les demandes non lues |
| Filtre **« Non lues »** | `/admin/messages/` | N'affiche que les demandes à traiter |
| Tri par priorité | `/admin/messages/` (vue « Tous ») | Les non lues remontent en tête |
| Action **« Tout marquer comme lu »** | `/admin/messages/` | Une seule écriture groupée |
| Bouton **« Marquer comme lu / non lu »** | Liste et vue détaillée | Persisté en base |

Le marquage est **persistant** : il survit à la déconnexion et est partagé
entre les appareils. **Conséquence pratique : il faut ouvrir `/admin/` pour
être averti.** Les options ci-dessous visent à combler ce manque.

### Prérequis : appliquer la migration 0005

```bash
# Dans le SQL Editor de Supabase (Dashboard → SQL Editor → New query)
# coller le contenu de migrations/0005_demandes_lues.sql puis Run.
```

Idempotent (relançable sans effet de bord). Sans elle, l'interface dégrade
proprement : compteur masqué, bandeau « exécutez la migration 0005 » sur
`/admin/` et `/admin/messages/`, mais **le reste du back office reste utilisable**
(statuts, réponses, calendrier, packs, guide).

---

## 2. Option A — notification Telegram (la plus sobre)

Un petit script interrogé périodiquement l'API Supabase, et envoie un message
au propriétaire dès qu'une demande non lue apparaît.

**Ce qu'il faut (tout est gratuit)** :

| Élément | Où l'obtenir | Pourquoi |
|---|---|---|
| Un **token de bot** Telegram | [@BotFather](https://t.me/BotFather) → `/newbot` | S'authentifier auprès de l'API Telegram |
| L'**identifiant de chat** | Écrire un message au bot, puis `https://api.telegram.org/bot<TOKEN>/getUpdates` | Savoir où envoyer |
| Une **clé donnant accès en lecture à `messages`** | Supabase → Settings → API | Le script doit lire les demandes (voir limite RLS ci-dessous) |
| Un **exécution planifiée** | GitHub Actions (`schedule`) ou un `cron` local | Le site statique ne peut pas se réveiller tout seul |

**Exemple de planification (GitHub Actions, gratuit, pas de service externe)** :

```yaml
on:
  schedule:
    - cron: '*/15 * * * *'   # toutes les 15 minutes
```

**Limites** :

- GitHub Actions sur un dépôt **public** : les workflows planifiés ne tournent
  que sur la branche par défaut et peuvent être **retardés** (files d'attente,
  minimum 5 minutes en pratique). Une demande peut donc n'être signalée qu'
  15–30 minutes plus tard.
- Les secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, clé Supabase) doivent
  être des **GitHub Secrets**. Un token de bot Telegram dans un dépôt public
  = bot détournable par n'importe qui.
- **RLS** : la clé `anon` du site **ne peut pas lire `messages`** (les politiques
  sont restreintes à `gruissancozy@gmail.com`). Le script doit donc utiliser une
  clé `service_role` (à réserver à un usage serveur, **jamais** côté site) ou
  un token d'accès du propriétaire. C'est la principale barrière : **nous ne
  disposons pas de cette clé.**
- Telegram est un service tiers : le message transite par leurs serveurs
  (contenu de la demande = coordonnées du voyageur). À considérer côté
  conformité/RGPD.

**Ce qui n'est pas fait** : le script et le workflow ne sont pas implémentés,
faute de token de bot et de clé de lecture. La description ci-dessus est le
cadre exact à suivre quand ces identifiants seront disponibles.

---

## 3. Option B — notification par e-mail

Deux voies, toutes deux gratuites mais **toutes deux dépendantes d'un
fournisseur externe** :

1. **E-mail transactionnel via un provider** (Resend, Brevo, SendGrid, Mailjet…)
   : une fonction Supabase (trigger PostgreSQL + `pg_net`) envoie l'e-mail à
   chaque `insert` dans `messages`.
   - Prérequis : un **compte provider**, une **clé d'API**, et le domaine
     expéditeur vérifié. La plupart ont un palier gratuit, mais ce sont des
     services **externes** (le propriétaire a exclu tout service payant ;
     certains paliers gratuits existent mais n'ont pas été retenus).
   - Limite : Supabase doit pouvoir joindre le provider depuis ses serveurs
     (pas de `pg_net` garanti sur tous les plans).
2. **Webhook Supabase → relais e-mail** : Supabase peut appeler une URL à
   chaque nouvelle ligne (Database Webhook). Il faut alors un service qui
   transforme le webhook en e-mail (encore un provider, ou un hébergement
   gratuit type Cloudflare Worker + service e-mail).
   - Prérequis : le provider e-mail reste indispensable.

**Pourquoi rien n'est implémenté** : aucun fournisseur n'est configuré, aucune
clé n'est disponible, et ajouter un provider revient à introduire une
dépendance externe que le propriétaire a refusée. **L'e-mail qui fonctionne
déjà sans rien configurer** est celui du formulaire de contact public
(transmis par le service du formulaire, pas par le back office) : il ne
concerne que les demandes passées par le formulaire du site.

---

## 4. Option C — notification GitHub (sans service externe)

Une Action planifiée lit l'API Supabase et ouvre une **issue** (ou un
commentaire sur une issue dédiée) à chaque nouvelle demande. GitHub envoie
alors une notification native par e-mail/push — **aucun provider tiers**.

**Prérequis** :

- Une clé Supabase autorisée à lire `messages` (voir §2, limite RLS) →
  GitHub Secret.
- Rien d'autre : `GITHUB_TOKEN` est fourni par Actions.

**Limites** : même contrainte de fréquence que §2 (pas d'alerte en temps
réel) ; la notification atterrit dans GitHub, pas sur le téléphone ;
nécessite un accès au dépôt pour lire l'issue.

**Ce qui n'est pas fait** : même blocage que §2 — la clé de lecture des
messages n'est pas disponible, et le déclenchement n'est pas en temps réel.

---

## 5. En résumé

| Option | Coût | Prérequis bloquant aujourd'hui | Délais | Implémentée ? |
|---|---|---|---|---|
| Badge + compteur dans `/admin/` | 0 | migration 0005 (manuelle) | Immédiat | ✅ Oui |
| Telegram | 0 | token de bot + clé Supabase de lecture | 15–30 min | ❌ Non (documenté) |
| E-mail via provider | Variable | compte provider + clé d'API | ~1 min | ❌ Non (documenté) |
| Notification GitHub | 0 | clé Supabase de lecture | 15–30 min | ❌ Non (documenté) |

**Recommandation** : appliquer la migration 0005 et utiliser le badge du back
office comme signal principal ; ajouter ensuite Telegram (option A) si un
token de bot et une clé de lecture sont un jour disponibles. Chaque option
documentée ci-dessus est **prête à brancher**, mais aucune ne peut l'être
sans les identifiants correspondants — et aucune ne doit être « simulée » dans
le code.

---

## 6. Pour les développeurs

- Logique pure : `src/lib/lu.ts` (comptage, filtrage, tri, détection de
  l'absence de colonne) — testée dans `tests/lu.test.ts`.
- Migration : `migrations/0005_demandes_lues.sql` (idempotente, validée dans un
  PostgreSQL éphémère : 2e exécution sans erreur, index partiel utilisé par les
  requêtes de comptage).
- Interface : `src/pages/admin/messages.astro`, `src/pages/admin/index.astro`,
  `src/layouts/AdminLayout.astro`, `src/i18n/admin.ts` (4 langues).
- Toute nouvelle option de notification **doit** être documentée ici avant
  d'être implémentée, avec ses prérequis et ses limites.

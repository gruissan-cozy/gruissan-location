# Back-office et suivi d'exploitation

Sujet : un seul appartement, une seule personne, et la question « qu'est-ce que
je dois faire cette semaine ? ». Objectif : que kiki puisse tenir sa saison en
10 minutes par jour, pas de construire un PMS.

> **Décisions actées (2026-11-21, voir `README.md` §2)** : V1 monoplateforme
> (site seule source de vérité, iCal en V2 mais `calendar_blocks` prêt dès la
> V1) ; meublé **non classé** (numéro d'enregistrement à afficher, taxe de
> séjour au régime non classé). Le back office doit refléter les deux : une vue
> « blocages » distincte des séjours, et un contrôle de complétude fiscale.

---

## 1. État réel : beaucoup d'écrans, aucun dossier de réservation

Le back office est **déjà riche** :

| Page | Ce qu'elle fait | Table lue |
|---|---|---|
| `/admin/` | Tableau de bord : CA, demandes non lues, compteurs, cartes de navigation | `messages`, `sejours` |
| `/admin/sejours/` | CRUD des séjours datés, détection de chevauchement, lien de contact | `sejours` |
| `/admin/revenus/` | CA par mois/saison/an, taux d'occupation, prix moyen, exports CSV | `sejours` |
| `/admin/taxe-sejour/` | Montant par séjour, récapitulatif annuel, export | `sejours` |
| `/admin/taches/` | Tâches entre séjours (ménage, clés…), case à cocher horodatée | `sejour_taches` |
| `/admin/messages/` | Demandes de contact, pipeline de statuts, lu/non lu, modèles de réponse | `messages` |
| `/admin/disponibilites/` | Statut mensuel (libre / partiel / réservé) | `availability` |
| `/admin/packs/` | Options de réservation, 4 langues, prix, ordre | `packs` |
| `/admin/guide/` | Sections du guide, visibilité public/locataire | `guide_sections` |
| *(à venir)* `/admin/blocages/` | Blocages de dates hors réservation (`calendar_blocks`) | — |

**Le trou béant** : **aucune page ne lit `bookings`.** Vérifié par recherche
exhaustive : les seules occurrences de `bookings` dans `src/` sont l'écriture
depuis le formulaire public et les Edge Functions locataire. Une demande de
réservation envoyée depuis `/reserver/` n'apparaît **nulle part** dans
l'interface de kiki.

Conséquence : kiki tient deux registres qui ne se parlent pas.

- Les **demandes** (`bookings`, avec dates, personnes, options, prix estimé,
  coordonnées) — invisibles.
- Les **séjours** (`sejours`, avec dates, client, prix, statut) — saisis à la
  main, sans lien avec les demandes.

Chaque demande doit donc être recopiée à la main dans `/admin/sejours/`. C'est
la première source d'erreur (date mal recopiée, oubli de blocage) et la première
perte de temps.

---

## 2. La décision structurante : un seul dossier de réservation

Deux options, à trancher avant tout développement du back office.

| Option | Description | Coût | Risque |
|---|---|---|---|
| **A. Fusionner** `bookings` → `sejours` | Une seule table, un seul cycle de vie : `demande → option → confirme → termine` (+ `annule`). `bookings` disparaît. | L | Migration de données, mise à jour des Edge Functions (`statut = 'confirmee'`), de la page locataire, des tests |
| **B. Garder deux tables** et ajouter une page de demandes | `bookings` reste la demande, `sejours` le séjour confirmé, avec un lien `sejour_id` | M | Deux vocabulaires de statuts à maintenir, deux endroits à consulter, risque d'incohérence permanent |

**Recommandation : A.** Un seul appartement, un seul cycle de vie. Deux tables
pour le même objet (des dates + un client + un prix) est une complexité qui n'a
aucune contrepartie ici. Les statuts existants de `sejours`
(`option`, `confirme`, `annule`, `termine`) couvrent déjà tout le besoin, et
`demande` s'y ajoute naturellement.

**Attention à ne pas rater** : `tenant-upload`, `generate-pdf`, `send-email` et
`purge-tenant-data` comparent `statut` à `['confirmee', 'terminee']` (orthographe
de `bookings`). La fusion doit mettre à jour **ces quatre fonctions dans le même
lot**, sinon l'état des lieux casse silencieusement pour tous les nouveaux
séjours.

---

## 3. User stories

| Id | User story | Valeur | Effort |
|---|---|---|---|
| `B-02` | En tant que kiki, je veux **voir toutes les demandes de réservation** dans le back office, avec leurs dates, leur prix et leurs coordonnées. | Ne perd plus une demande | M |
| `B-07` | En tant que kiki, je veux qu'une demande devienne un séjour **sans ressaisie**. | Zéro double saisie | M |
| `B-10` | En tant que kiki, je veux **bloquer des dates** (travaux, séjour personnel) sans créer un faux séjour, et voir la source de chaque blocage. | Données justes, prêt pour l'iCal V2 | S |
| `B-11` | En tant que kiki, je veux être **alerté si le numéro d'enregistrement mairie ou le taux de taxe non classé manquent**. | Conformité | S |
| `B-03` | En tant que kiki, je veux ouvrir une page qui me dit **ce que je dois faire cette semaine** (arrivées, départs, ménages, états des lieux manquants, soldes à encaisser). | 10 minutes par jour | M |
| `B-05` | En tant que kiki, je veux voir **encaissé vs dû** par séjour, pour savoir ce qui reste à rentrer. | Trésorerie | M |
| `B-08` | En tant que kiki, je veux repérer un séjour **sans coordonnées complètes** ou sans prix, pour ne pas le découvrir à l'arrivée. | Qualité des données | S |
| `B-06` | En tant que kiki, je veux être **alerté d'une nouvelle demande** sans ouvrir le back office. | Réactivité | S |
| `B-09` | En tant que kiki, je veux un **export unique** de tous mes séjours et de leurs états des lieux, pour ma comptabilité. | Fin d'année sans stress | S |

---

## 4. « Qu'est-ce que je dois faire cette semaine ? » : les règles exactes

C'est la fonctionnalité qui a le plus de valeur perçue, et la plus facile à
rater. Elle ne doit afficher que des choses **actionnables**, jamais un tableau
de bord décoratif.

| Signal | Règle | Action attendue |
|---|---|---|
| Arrivée dans ≤ 7 jours | Séjour `confirme` avec `arrivee` dans les 7 jours | Vérifier ménage, linge, code d'accès, envoyer le lien locataire |
| Départ dans ≤ 2 jours | Séjour `confirme` avec `depart` dans les 2 jours | Rappeler l'heure de départ, vérifier que l'état des lieux de sortie sera fait |
| État des lieux manquant | Séjour terminé, aucun `checklist` de sortie | Relancer le locataire |
| Lien locataire absent | Séjour `confirme` à venir, aucune `tenant_session` | Créer le lien |
| Solde dû | Séjour `confirme`, paiement incomplet | Encaisser |
| Tâche non faite | `sejour_taches.fait = false` sur un séjour proche | Faire (ménage, clés) |
| Demande non lue | `messages.lu_at is null` | Répondre |
| Donnée incomplète | Séjour `confirme` sans prix ou sans e-mail | Compléter |
| **Taxe de séjour non calculable** | Taux ou plafond non classé absent de `content/tarifs.json` | Renseigner le taux communal (DA-2) |
| **Numéro d'enregistrement absent** | `content/site.json` sans numéro mairie | Le demander à la mairie et le saisir |

**Règle d'or** : chaque ligne doit être cliquable et mener à l'action. Un
compteur qui ne mène nulle part est du bruit.

**Ce qu'il ne faut pas y mettre** : le chiffre d'affaires (c'est du constat, pas
une action), les statistiques (page revenus), les rappels de « bonne année ».

---

## 5. Statistiques minimales : ce qui est utile, ce qui ne l'est pas

| Indicateur | Utile ? | Pourquoi |
|---|---|---|
| Chiffre d'affaires par mois / saison / année | ✅ | Déjà là, correct (prorata des nuits) |
| Taux d'occupation | ✅ | Déjà là ; à lire avec prudence sur un seul bien (voir ci-dessous) |
| Prix moyen par nuit | ✅ | Déjà là |
| Part des séjours sans prix | ✅ | Déjà là, très utile pour la qualité des données |
| Encaisse vs dû | ✅ | **Manquant**, et c'est le plus utile au quotidien |
| Nombre de réservations par canal (site / Airbnb / Booking) | ⚠️ | **Inutile en V1** (DA-1 : le site est seule source). Devient pertinent en V2, quand `calendar_blocks.source` sera alimenté par les imports |
| Délai moyen de réponse aux demandes | ⚠️ | Mesurable, mais culpabilisant et peu actionnable sur un seul bien |
| Note moyenne des avis | ❌ | Les avis sont sur les plateformes, pas ici |
| « Revenu par m² », « RevPAR », « ADR » | ❌ | Vocabulaire d'hôtellerie. Sur un appartement, kiki raisonne en « semaines louées » |

**Piège du taux d'occupation sur un seul bien** : une semaine vide en juin fait
chuter le taux de 2 points ; une semaine vide en août en fait perdre 2 aussi,
alors que la valeur commerciale n'est pas la même. Ne pas surinterpréter.
Afficher le nombre de **nuits vendues** en plus du taux : c'est plus concret.

---

## 6. Risques

### Technique
- **Fusion de tables** : c'est la tâche la plus risquée du lot. Elle touche
  quatre Edge Functions, la page locataire, les revenus, la taxe de séjour et
  les tâches. À faire **en une fois**, avec un script de migration idempotent,
  une sauvegarde, et un test de non-régression sur le parcours locataire complet.
- **Deux vocabulaires** (`confirmee` / `confirme`) : source de bug silencieux.
  Choisir un seul jeu de valeurs et le documenter dans le README du dépôt.
- **Pagination** : `messages` charge déjà 1000 lignes. Sur un seul bien, ça
  suffit, mais un `limit` sans tri stable peut masquer une demande. Trier par
  date décroissante (déjà fait).
- **Fuseau horaire** : « cette semaine » doit être calculé en `Europe/Paris`,
  pas en UTC, sinon la liste change à 1 h ou 2 h du matin.

### Opérationnel
- **Trop d'écrans** : neuf pages pour un appartement, c'est déjà beaucoup. La
  page « cette semaine » doit **remplacer** la navigation quotidienne, pas s'y
  ajouter. À terme, `/admin/disponibilites/` (statut mensuel) devrait disparaître
  au profit des séjours datés.
- **Deux sources de disponibilité** : tant que `availability` (mensuel) et
  `sejours` (daté) coexistent, kiki peut bloquer un mois dans un écran et croire
  que c'est pris. C'est le défaut le plus dangereux du back office actuel.
- **Un seul utilisateur, un seul appareil** : pas de gestion de rôles, pas de
  journal d'audit nécessaire. Ne pas en ajouter.

### Juridique
- **Exports CSV** : contiennent des données personnelles (noms, e-mails,
  téléphones). Ils ne doivent pas être envoyés par e-mail en clair ni stockés
  dans un dossier partagé. Le code protège déjà contre l'injection de formules
  (`revenus.ts`) : à conserver.
- **Conservation** : les messages de prospects doivent être purgés après un
  délai raisonnable (12 à 24 mois). Aujourd'hui rien ne les purge.
- **Registre des traitements** : si kiki est professionnel, il doit tenir un
  registre (finalités, durées, sous-traitants). Le back office peut l'aider en
  affichant les durées, mais le document reste à sa charge.

---

## 7. Fausses bonnes idées

| Idée | Pourquoi non |
|---|---|
| **PMS complet** (Beds24, Lodgify, Guesty) | 20–100 €/mois, interface à apprendre, pour un bien. Le back office couvre déjà l'essentiel. |
| **Multi-utilisateurs avec rôles** | Kiki est seul. Un rôle « femme de ménage » pourrait avoir du sens, mais c'est une heure de travail à partager, pas un système de permissions. |
| **Notifications push dans le navigateur** | Le site est statique, aucune souscription push possible sans service worker + backend. Déjà documenté comme impossible dans `docs/notifications.md`. |
| **Tableau de bord avec graphiques animés** | Joli, inutile. Trois chiffres et une liste d'actions valent mieux. |
| **Journal d'audit complet** | Un utilisateur, aucune obligation. |
| **Synchronisation comptable automatique** | Un export CSV annuel suffit ; un connecteur comptable est un projet en soi. |
| **Gestion du linge et des stocks** | Une tâche « linge » dans `sejour_taches` suffit. |
| **Suivi du ménage en temps réel avec prestataire** | Le prestataire n'a pas de compte et ne doit pas en avoir. Une tâche cochée par kiki suffit. |

---

## 8. Prochaines tâches suggérées

### Tâche 1 — Unifier le dossier de réservation (`bookings` → `sejours`)

**Objectif** : une seule table porte la demande puis le séjour, avec un cycle de
vie unique `demande → option → confirme → termine` (+ `annule`).

**Critères d'acceptation**
- [ ] Les demandes existantes de `bookings` sont migrées vers `sejours`
      (`statut = 'demande'`), sans perte (script idempotent, testé).
- [ ] Les quatre Edge Functions qui comparent `statut` à `['confirmee',
      'terminee']` sont mises à jour et testées.
- [ ] La page locataire, les revenus, la taxe de séjour et les tâches
      fonctionnent après migration (test de non-régression).
- [ ] La RLS de `sejours` reste aussi restrictive : le public ne lit que
      `arrivee` / `depart` des séjours bloquants.
- [ ] `bookings` n'est plus écrite ni lue par aucun code (ou conservée en
      lecture seule documentée).
- [ ] `npm run verify` vert, 4 langues.

**Fichiers concernés** : `migrations/` (nouvelle migration),
`src/components/Reservation.astro`, `src/pages/tenant/index.astro`,
`src/lib/supabase.ts`, `supabase/functions/{tenant-upload,generate-pdf,send-email,purge-tenant-data}/`,
`src/pages/admin/revenus.astro`, `src/pages/admin/taxe-sejour.astro`.

---

### Tâche 2 — Page « Demandes de réservation »

**Objectif** : lister les demandes reçues, avec dates, personnes, prix estimé,
options et coordonnées, et permettre de les traiter (répondre, convertir,
refuser).

**Critères d'acceptation**
- [ ] Toutes les demandes sont visibles, triées par date décroissante.
- [ ] Un filtre « à traiter » (statut `demande`) et un compteur sur le tableau
      de bord.
- [ ] Une demande peut être convertie en séjour en un clic (mêmes dates, mêmes
      coordonnées, même prix), avec refus si chevauchement.
- [ ] Une demande refusée garde une trace (historique) et libère les dates.
- [ ] Les coordonnées ne sont pas exposées au public (RLS inchangée).
- [ ] Tests : liste vide, conversion, conversion en double, refus.
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/pages/admin/demandes.astro` (nouveau),
`src/layouts/AdminLayout.astro` (navigation), `src/lib/sejours.ts`,
`src/i18n/admin.ts`, `tests/`.

---

### Tâche 3 — Page « Cette semaine »

**Objectif** : une seule page listant les actions concrètes des 7 prochains
jours, chacune cliquable vers l'action.

**Critères d'acceptation**
- [ ] Chaque ligne correspond à une règle du tableau §4 et porte une action.
- [ ] « Cette semaine » est calculé en `Europe/Paris`.
- [ ] Une ligne sans action possible n'est pas affichée.
- [ ] Le calcul est une fonction pure, testée (arrivée J+0, J+7, J+8 ; départ
      passé ; séjour annulé ignoré).
- [ ] **Deux contrôles DA-2 y figurent** : « numéro d'enregistrement mairie
      absent » et « taux de taxe non classé absent / non calculable ».
- [ ] Page vide = message explicite (« rien à faire cette semaine »), pas un
      écran blanc.
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/pages/admin/index.astro` ou page dédiée,
`src/lib/semaine.ts` (nouveau, pur), `src/i18n/admin.ts`, `tests/semaine.test.ts`.

---

### Tâche 4 — Encaissé vs dû

**Objectif** : afficher par séjour le total, l'acompte reçu, le solde et
l'échéance.

**Critères d'acceptation**
- [ ] Basé uniquement sur les paiements enregistrés, jamais sur un statut
      supposé.
- [ ] Un séjour sans prix reste visible et signalé (comportement de
      `revenus.ts` conservé).
- [ ] Export CSV avec les mêmes protections contre l'injection de formules.
- [ ] Tests : acompte partiel, solde nul, annulation, remboursement.

**Fichiers concernés** : `src/lib/paiements.ts` (nouveau) ou `src/lib/revenus.ts`,
`src/pages/admin/revenus.astro`, `src/i18n/admin.ts`, tests.

---

### Tâche 5 — Alerte de nouvelle demande hors du back office

**Objectif** : être averti par e-mail (ou Telegram) dès qu'une demande arrive,
sans ouvrir le back office.

**Critères d'acceptation**
- [ ] Le mécanisme retenu est celui décrit dans `docs/notifications.md`
      (aucun nouveau prestataire inventé).
- [ ] Aucun secret dans le dépôt : tout en GitHub Secrets ou secrets Supabase.
- [ ] Un échec d'envoi ne bloque pas l'enregistrement de la demande.
- [ ] Le contenu de l'alerte ne contient pas plus de données que nécessaire
      (pas de message complet, juste « nouvelle demande + lien »).
- [ ] Documenté dans `docs/notifications.md` avant implémentation (règle du
      dépôt).

**Fichiers concernés** : `docs/notifications.md`, Edge Function ou workflow
GitHub Actions, `src/lib/` si une logique pure est extraite.

---

### Tâche 6 — Nettoyer la double source de disponibilité

**Objectif** : retirer `availability` (statut mensuel) du parcours de décision,
au profit des séjours datés **et des blocages** (`calendar_blocks`), et
conserver le repli JSON uniquement pour l'affichage public.

**Critères d'acceptation**
- [ ] `/admin/disponibilites/` n'est plus un moyen de bloquer des dates (ou est
      retiré de la navigation au profit de `/admin/blocages/`).
- [ ] Le formulaire et le calendrier lisent la même source (voir
      `2026-11-reservation-disponibilites.md`, tâches 0 et 1).
- [ ] Le repli `content/disponibilites.json` reste utilisé seulement si
      Supabase est indisponible, et la page l'indique.
- [ ] Aucune régression sur la vitrine.
- [ ] 4 langues, `npm run verify` vert.

### Tâche 7 — Vue « Blocages » dans le back office

**Objectif** : créer la page de gestion des blocages de dates (`calendar_blocks`)
distincte des séjours, avec la source visible.

**Critères d'acceptation**
- [ ] Création, modification, suppression d'un blocage (dates + note interne).
- [ ] La colonne `source` est affichée ; en V1 elle vaut toujours `direct`
      (aucun sélecteur airbnb/booking tant que l'import n'existe pas).
- [ ] Un `external_uid` n'est jamais saisissable à la main (champ réservé à
      l'import V2), et son index unique partiel est vérifié par un test.
- [ ] Les blocages sont exclus des revenus et du taux d'occupation.
- [ ] Tests : création, chevauchement signalé, absence dans `revenus.ts`.
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/pages/admin/blocages.astro` (nouveau),
`src/layouts/AdminLayout.astro`, `src/lib/supabase.ts`, `src/lib/calendrier.ts`,
`src/i18n/admin.ts`, `tests/`.

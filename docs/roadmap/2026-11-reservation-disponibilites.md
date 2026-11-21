# Réservation et disponibilités

Sujet : comment une demande devient une réservation, et **quelle donnée dit la
vérité** sur les dates libres.

> **Décisions actées (2026-11-21, voir `README.md` §2)** : le site est la
> **seule source de vérité** en V1 (mono-bien, sans Airbnb/Booking), avec une
> table `calendar_blocks` prévue dès le schéma pour rendre un iCal futur peu
> coûteux. Le meublé est **non classé** : pas d'étoiles, taxe de séjour au
> régime des non classés, numéro d'enregistrement mairie à afficher.

---

## 1. État réel (lu dans le code, novembre 2026)

Il existe aujourd'hui **deux modèles de réservation qui ne se parlent pas** :

| | `bookings` | `sejours` |
|---|---|---|
| Créée par | le formulaire public `/reserver/` (`statut = 'demande'`) | kiki, à la main dans `/admin/sejours/` |
| Statuts | `demande`, `confirmee`, `annulee`, `terminee` | `option`, `confirme`, `annule`, `termine` |
| Lue par le calendrier public | non | **oui** (`src/lib/disponibilites.ts`) |
| Lue par le formulaire de réservation | — | non (il lit `availability`) |
| Lue par une page admin | **aucune** | oui (`/admin/sejours/`, revenus, taxe) |
| Porte le lien locataire | oui (`tenant_sessions.reservation_id`) | non |

Conséquences concrètes :

1. Une demande envoyée depuis le site **n'apparaît dans aucun écran de kiki**.
2. Le contrôle de disponibilité du formulaire interroge `availability`
   (`statut = 'reserve'`, **granularité mensuelle**) alors que le calendrier
   public lit `sejours` (granularité jour). Les deux peuvent se contredire dans
   les deux sens.
3. Un séjour saisi dans `/admin/sejours/` ne peut pas recevoir de lien d'état
   des lieux : il n'existe pas de ligne `bookings` correspondante.
4. `availability` reste écrivable depuis `/admin/disponibilites/` et sert de
   repli JSON (`content/disponibilites.json`) : c'est une **troisième** source,
   mensuelle, encore affichée sur la vitrine quand Supabase est indisponible.

### Ce qui est déjà bon et qu'il ne faut pas casser

- `src/lib/sejours.ts` : détection de chevauchement correcte, convention
  hôtelière (le jour du départ libère le logement) bien documentée et testée.
- `src/lib/calendrier.ts` : module pur, testé, avec priorité `occupe > partiel >
  libre`. À conserver tel quel.
- `src/lib/pricing.ts` : calcul du devis (saison, semaines, nuits minimum,
  options, taxe) déjà testé.
- La RLS de `0003_sejours.sql` est bien faite : le public ne lit que
  `arrivee` / `depart` via un `GRANT` de colonnes. **Ne pas l'affaiblir.**

---

## 2. Décision DA-1 (actée) — le site est seule source de vérité en V1, iCal en V2

Décidé par kiki le 2026-11-21 : **« pas encore, mais plus tard »**.

- **V1** : le site est l'unique source de vérité. Monobien, sans Airbnb ni
  Booking. L'ajout d'échanges avec les plateformes ne doit pas *casser* la V1,
  mais s'y *brancher*.
- **V2** : synchro iCal import + export, quand kiki le décidera.

### 2.1 Pourquoi une table de blocages séparée des réservations

Aujourd'hui, `sejours` mélange deux notions qui n'ont rien à voir :

| Notion | Exemple | A un client ? | A un prix ? |
|---|---|---|---|
| **Réservation** | « Mme Dupont, 10 → 17 juillet, 1200 € » | Oui | Oui |
| **Blocage** | « travaux du 3 au 8 mars », « je garde le 15 août », « occupé Airbnb (import) » | Non | Non |

Si l'import iCal écrit ses événements dans `sejours`, il faut inventer un
client fictif (« Airbnb »), un prix nul, et nettoyer ces lignes à chaque
resynchronisation. C'est le piège classique : **l'import devient destructeur**,
et les statistiques (revenus, taux d'occupation) sont faussées par des séjours
qui n'en sont pas.

Une table `calendar_blocks` sépare proprement les deux. Le calendrier de
disponibilité lit **les deux** ; les statistiques ne lisent que les réservations.

### 2.2 Schéma cible (à créer en V1, sans code d'import)

```sql
-- Esquisse de principe — le détail appartient à la migration écrite par gruissan-dev.
create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Dates au format hôtelier : `fin` est le dernier jour bloqué, inclus.
  debut date not null,
  fin date not null,
  source text not null default 'direct'
    check (source in ('direct', 'airbnb', 'booking')),
  -- Identifiant stable de l'événement importé (UID iCal). NULL pour un blocage manuel.
  external_uid text,
  note text,
  constraint calendar_blocks_range check (fin >= debut)
);

-- Un événement importé ne doit pas être dupliqué par une resynchronisation.
create unique index if not exists calendar_blocks_external_uid_uidx
  on public.calendar_blocks (source, external_uid)
  where external_uid is not null;
```

**Points de conception à ne pas rater** :

- `external_uid` **nullable** et index **partiel** : un blocage manuel n'a pas
  d'UID, et plusieurs `NULL` doivent coexister (un `unique` simple les
  refuserait — comportement PostgreSQL).
- **`source` avec valeur par défaut `direct`** : en V1, tout est `direct`, mais
  la colonne existe déjà, donc la V2 n'ajoute qu'une valeur, pas une migration
  de structure.
- **Convention de dates** : `debut` / `fin` **bornes incluses** (contrairement à
  `sejours` où `depart` libère le logement). Deux conventions dans le même
  dépôt est un piège : le documenter dans l'en-tête de la migration et dans
  `src/lib/`.
- **RLS** : même modèle que `sejours` — l'admin a tout, le public ne lit que
  `debut, fin` des blocages, et **uniquement** pour le calendrier. Les notes
  internes restent privées (voir `0010` qui a déjà fait ce travail sur
  `availability.note`).
- **Ne pas créer de FK vers `sejours`** : un blocage est indépendant d'une
  réservation. Ils se superposent dans le temps, ils ne se référencent pas.

### 2.3 Le point d'entrée d'import, prévu mais désactivé

Une Edge Function (ou une route dédiée) `ical-import` doit exister en V1 avec un
comportement explicite :

```
POST /functions/v1/ical-import
→ 501 { "error": "Synchronisation iCal non activée (V2)." }
```

Objectif : que la V2 soit un **remplissage**, pas une refonte. Aucun parseur,
aucun job planifié, aucune interface en V1 : seulement le point d'entrée et sa
documentation. **Un bouton désactivé dans l'admin est à éviter** : il donne
l'impression d'une fonctionnalité cassée.

### 2.4 Ce que la V2 devra faire (pour information, pas à coder)

- **iCal n'est pas du temps réel** : Airbnb peut mettre jusqu'à 3 h à propager
  un changement. Un import **réduit** le risque de double réservation, il ne
  l'annule pas. Garder une marge (ne pas accepter une arrivée le lendemain d'un
  départ importé).
- **L'export est aussi nécessaire que l'import** : sans lui, les plateformes ne
  voient pas les séjours directs. Un `.ics` généré depuis `sejours` +
  `calendar_blocks`.
- **Parseur** : les flux ne sont pas normalisés (fuseaux, événements
  récurrents, `DTEND` **exclusif** en iCal alors que `fin` est inclusif ici).
  Un parseur naïf produit des dates fausses d'un jour.
- **Déduplication** : clé `(source, external_uid)`, et suppression des blocages
  importés qui ont disparu du flux — **jamais** les blocages `direct`.
- **Piège** : un flux iCal public expose les dates des séjours. Ce ne sont pas
  des données personnelles, mais c'est une information commerciale. Route
  dédiée, jamais une table lisible en masse.

---

## 3. Statut fiscal acté (DA-2) : meublé **non classé**

La réservation et la tarification doivent refléter le non-classement.

### 3.1 Taxe de séjour

| Règle | Conséquence dans le code |
|---|---|
| Tarif « hébergement non classé » | Le taux lu dans `content/tarifs.json` doit être celui des non classés : **le `1.15` actuel est provisoire et sans source** |
| **Plafonnement au tarif de la catégorie la plus basse** | Le montant par nuit et par personne ne peut pas dépasser ce plafond, même si le taux communal brut est plus élevé. À modéliser, pas à ignorer |
| **Exonération des mineurs** | Le calcul `nuits × personnes × taux` de `src/lib/taxe-sejour.ts` **surcompte** si le séjour comprend des enfants. Il faut soit collecter l'âge/nombre de mineurs, soit documenter explicitement que le calcul est un majorant |
| Taux communal de Gruissan 2027 | **À récupérer auprès de la mairie** : délibération de l'année, plafond applicable |

**Point d'attention honnête** : aujourd'hui le formulaire ne demande pas l'âge
des occupants et le calcul multiplie par `personnes`. Sur un séjour familial,
cela **surévalue** la taxe. C'est un défaut réel, pas théorique. Deux options :
ajouter un champ « nombre de mineurs » (plus juste, plus de friction) ou
afficher « taxe estimée, ajustée à l'arrivée » (plus simple, moins précis). **À
trancher avec kiki**, mais il faut le savoir.

### 3.2 Numéro d'enregistrement

Le numéro attribué par la mairie de Gruissan doit être **affiché** sur le site
et dans les annonces. Sur le site : pied de page et mentions légales. Il doit
venir d'un contenu éditable (`content/site.json`), jamais être codé en dur, et
son absence ne doit pas casser le build — mais doit être **visible comme un
manque** dans le back office, pas silencieuse.

### 3.3 Communication

- **Jamais** de mention « classé », d'étoiles, de label ou de pictogramme de
  classification. L'appartement est non classé (DA-2).
- Décrire factuellement : 4 personnes, 2 chambres, 40 m², 8 m² de terrasse,
  équipements listés.
- Le mot « standing » ou « haut de gamme » reste possible s'il est factuel, mais
  n'implique aucune classification officielle.

---

## 4. User stories

| Id | User story | Valeur | Effort |
|---|---|---|---|
| `R-07` | En tant que kiki, je veux bloquer des dates (travaux, séjour personnel) **sans créer un faux séjour**, pour garder des statistiques justes. | Propreté des données, et iCal possible plus tard | M |
| `R-02` | En tant que kiki, je veux que le formulaire de réservation refuse les dates déjà prises **selon le même calendrier que la vitrine**, pour ne plus recevoir de demandes impossibles. | Évite les échanges inutiles et les déceptions | S |
| `R-01` | En tant que kiki, je veux transformer une demande reçue en séjour confirmé **en un clic**, pour ne plus ressaisir les dates et oublier de bloquer le calendrier. | Gain de temps, zéro double saisie | M |
| `R-08` | En tant que kiki, je veux que la taxe de séjour soit calculée selon le régime **non classé** (plafond, mineurs exonérés), pour être en règle avec la mairie. | Conformité | M |
| `R-04` | En tant que kiki, je veux modifier les prix et les saisons depuis le back office, sans passer par une pull request. | Autonomie, réactivité tarifaire | M |
| `R-05` | En tant que kiki, je veux une règle de caution écrite et appliquée de la même façon à chaque séjour. | Moins de litiges | S |
| `R-06` | En tant que locataire, je veux voir clairement le prix total (séjour + options + taxe + caution) avant d'envoyer ma demande. | Transparence, confiance | ✅ déjà fait |
| `R-03` | *(V2)* En tant que kiki, je veux importer les calendriers Airbnb et Booking et exporter le mien. | Sécurité commerciale | M — **gelé** |

---

## 5. Risques

### Technique
- **Deux conventions de dates** si `calendar_blocks` utilise `fin` inclusif et
  `sejours` un `depart` exclusif. Documenter, tester le passage de l'un à
  l'autre, et ne jamais additionner les deux sans conversion.
- **Migration de données** : fusionner `bookings` et `sejours` touche les pages
  revenus, taxe de séjour, tâches et l'espace locataire. À faire en une fois,
  avec un script idempotent et une sauvegarde préalable.
- **Deux vocabulaires de statuts** (`confirmee` / `confirme`) : toute
  unification doit choisir un seul jeu de valeurs, et convertir les lignes
  existantes. Le code des Edge Functions compare `['confirmee', 'terminee']` :
  à mettre à jour **en même temps**, sinon l'upload de photos casse.
- **Fuseau horaire** : tout le calcul de dates doit rester en `UTC` côté code
  (`pricing.ts` le fait déjà) et en `Europe/Paris` pour les échéances légales.

### Juridique
- **Taxe de séjour (non classé)** : le taux du `1.15` n'a pas de source et le
  calcul ignore l'exonération des mineurs. Une taxe mal collectée est une
  irrégularité comptable — et une taxe surévaluée expose à une réclamation.
  **À faire confirmer par la mairie de Gruissan.**
- **Numéro d'enregistrement** : son absence sur le site est un manquement à une
  obligation d'affichage. Le fait que le build passe ne rend pas le site
  conforme.
- **Caution** : un dépôt de garantie n'est pas un revenu. Sa retenue doit être
  motivée (devis, photos, état des lieux) et le solde restitué dans un délai
  annoncé.
- **Nuits minimum et prix affichés** : un prix « à partir de » sans mention des
  frais obligatoires est une pratique commerciale trompeuse.

### Opérationnel
- **V1 monoplateforme** : puisque le site est seule source de vérité, kiki ne
  doit rien vendre ailleurs en parallèle. Une annonce Airbnb encore active = un
  risque de double réservation. C'est une règle d'exploitation à écrire.
- Les blocages manuels et les réservations doivent être saisis **au même
  endroit** dans le back office, sinon kiki en oubliera un.
- Un flux iCal importé (V2) ne se met pas à jour si le job tombe : prévoir une
  date de dernière synchro affichée quand la V2 arrivera.

---

## 6. Fausses bonnes idées sur ce sujet

| Idée | Pourquoi non |
|---|---|
| Coder l'import iCal en V1 | Décision DA-1 : « pas encore ». On prépare le schéma, pas le parseur. |
| Mettre les blocages dans `sejours` avec un client fictif | Fausse les revenus et le taux d'occupation, et rend l'import destructeur. C'est exactement ce que `calendar_blocks` évite. |
| Réservation instantanée **sans paiement** | Une demande confirmée automatiquement sans engagement financier s'annule souvent. Rester sur « demande → confirmation par kiki ». |
| Tarification dynamique (yield management) | 12 semaines de saison, un bien : kiki connaît ses prix. |
| Moteur de disponibilité « temps réel » maison | Sans serveur permanent, ce n'est pas possible sur GitHub Pages. Assumer un délai (demande + validation). |
| Supprimer `availability` immédiatement | C'est le repli quand Supabase est indisponible. À retirer **après** la bascule. |
| Afficher un classement ou des étoiles | Non classé (DA-2). Pratique commerciale trompeuse. |
| Multiplier la taxe par le nombre total de personnes sans distinguer les mineurs | Surévalue la taxe d'un séjour familial. À traiter explicitement (`R-08`). |

---

## 7. Prochaines tâches suggérées

### Tâche 0 — Table `calendar_blocks` (à faire avant la tâche 1)

**Objectif** : créer la table de blocages indépendante des réservations, avec
`source` et `external_uid`, et faire lire le calendrier sur **deux** sources.
Aucun code d'import.

**Critères d'acceptation**
- [ ] Migration idempotente créant `calendar_blocks` (`debut`, `fin` inclusifs,
      `source` défaut `direct`, `external_uid` nullable, index unique partiel
      `(source, external_uid) where external_uid is not null`).
- [ ] RLS : admin tous droits ; public (anon) lit **uniquement** `debut, fin`
      des blocages, `note` reste privée (même modèle que `0010` sur
      `availability.note`).
- [ ] `src/lib/calendrier.ts` (ou un module dédié) expose une fonction pure
      convertissant **séjours + blocages** en plages occupées, avec conversion
      explicite de la convention `depart` exclusif → `fin` inclusif.
- [ ] Le calendrier public et le formulaire utilisent cette fonction unique.
- [ ] Tests : blocage seul, blocage chevauchant un séjour, séjour finissant le
      jour où un blocage commence (doit être libre), blocage sur un seul jour,
      `external_uid` dupliqué rejeté, deux `NULL` acceptés.
- [ ] Aucun parseur iCal, aucune interface de synchro, aucun bouton désactivé.
- [ ] `npm run verify` vert, 4 langues.

**Fichiers concernés** : `migrations/` (nouvelle migration),
`src/lib/calendrier.ts`, `src/lib/disponibilites.ts`,
`src/components/Reservation.astro`, `src/lib/supabase.ts` (type
`CalendarBlock`), `tests/calendrier.test.ts`.

---

### Tâche 1 — Une seule source de vérité pour les disponibilités

**Objectif** : le formulaire `/reserver/` vérifie les chevauchements sur
`séjours + calendar_blocks` (granularité jour), avec la même fonction que le
calendrier public, au lieu d'interroger `availability`.

**Critères d'acceptation**
- [ ] Une date occupée par un séjour `option` ou `confirme` est refusée par le
      formulaire, avec le message « dates indisponibles » déjà traduit.
- [ ] Une date bloquée par un `calendar_block` est refusée de la même façon.
- [ ] Le jour du départ redevient réservable (convention hôtelière conservée).
- [ ] Le comportement sans Supabase est inchangé (mention « à confirmer »).
- [ ] Tests Vitest : chevauchement partiel, arrivée le jour du départ, séjour
      annulé ignoré, blocage actif, table absente → repli.
- [ ] `npm run verify` vert, textes dans les 4 langues.

**Fichiers concernés** : `src/components/Reservation.astro`,
`src/lib/sejours.ts` (réutiliser `trouverChevauchements`),
`src/lib/calendrier.ts`, `src/lib/disponibilites.ts`, `tests/`.

---

### Tâche 2 — Bloquer des dates depuis le back office

**Objectif** : kiki peut bloquer une période (travaux, séjour personnel) sans
créer de faux séjour, et la voir apparaître sur le calendrier.

**Critères d'acceptation**
- [ ] Formulaire simple : dates + note interne. `source = 'direct'` forcée en V1.
- [ ] Le blocage apparaît sur le calendrier public comme « indisponible ».
- [ ] Un chevauchement avec un séjour existant est signalé (avertissement, pas
      blocage dur : kiki peut avoir une raison).
- [ ] Les blocages n'apparaissent **jamais** dans les revenus ni le taux
      d'occupation.
- [ ] Tests : création, suppression, chevauchement, absence de fuite dans les
      statistiques.
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/pages/admin/blocages.astro` (nouveau) ou
`src/pages/admin/sejours.astro`, `src/layouts/AdminLayout.astro`,
`src/lib/calendrier.ts`, `src/i18n/admin.ts`, `tests/`.

---

### Tâche 3 — Taxe de séjour « non classé » et numéro d'enregistrement

**Objectif** : appliquer le régime non classé (plafond, mineurs exonérés) et
afficher le numéro d'enregistrement mairie.

**Critères d'acceptation**
- [ ] Le numéro d'enregistrement est lu dans `content/site.json` et affiché au
      pied de page + sur la page des mentions légales, dans les 4 langues.
- [ ] Le numéro est **absent par défaut** : son absence ne casse pas le build,
      mais est signalée dans le back office.
- [ ] Le calcul de taxe applique le plafond « catégorie la plus basse »
      (constante documentée dans `content/tarifs.json`, pas en dur dans le code).
- [ ] Le nombre de mineurs est soit collecté, soit explicitement documenté comme
      non pris en compte (choix tranché avec kiki, écrit dans le code).
- [ ] Aucune mention de classement, d'étoiles ou de label nulle part.
- [ ] Tests : plafond atteint, taux en dessous du plafond, séjour familial,
      taux absent → « non calculable » (comportement actuel conservé).
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `content/tarifs.json`, `content/site.json`,
`src/lib/taxe-sejour.ts`, `src/pages/admin/taxe-sejour.astro`,
`src/layouts/Layout.astro`, `src/i18n/admin.ts`, `tests/taxe-sejour.test.ts`.

---

### Tâche 4 — Point d'entrée d'import iCal, désactivé (V1)

**Objectif** : créer le point d'entrée documenté qui répond « non activé », pour
que la V2 soit un remplissage et non une refonte.

**Critères d'acceptation**
- [ ] Une Edge Function (ou route) répond 501 avec un message explicite.
- [ ] Aucun parseur, aucun job, aucune interface.
- [ ] `docs/ical-v2.md` décrit ce qui reste à faire (parseur, export,
      déduplication, écran de réglages), avec le schéma déjà en place.
- [ ] Aucun secret, aucun appel réseau.
- [ ] `npm run verify` vert.

**Fichiers concernés** : `supabase/functions/ical-import/index.ts` (squelette),
`docs/ical-v2.md` (nouveau).

---

### Tâche 5 — Transformer une demande en séjour en un clic

**Objectif** : depuis la fiche d'une demande, un bouton crée le séjour
correspondant (mêmes dates, mêmes coordonnées, même prix) et passe la demande
au statut « confirmé ».

**Critères d'acceptation**
- [ ] Le séjour créé apparaît immédiatement dans le calendrier public.
- [ ] Un chevauchement avec un séjour **ou un blocage** est refusé avec un
      message explicite, sans rien créer.
- [ ] La demande d'origine garde la trace de la conversion (historique).
- [ ] Aucune donnée personnelle n'est dupliquée inutilement.
- [ ] Tests : conversion nominale, conversion en double refusée, demande déjà
      convertie.
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/pages/admin/sejours.astro`,
`src/pages/admin/messages.astro`, `src/lib/sejours.ts`, `src/i18n/admin.ts`.

---

### Tâche 6 — Règle de caution écrite et affichée

**Objectif** : documenter et afficher une politique de caution unique (montant,
mode, délai de restitution, motifs de retenue), validée par kiki.

**Critères d'acceptation**
- [ ] Le montant vient de `content/tarifs.json`, jamais codé en dur.
- [ ] La règle est affichée sur `/reserver/` et reprise dans les CGV.
- [ ] Le texte existe dans les 4 langues.
- [ ] Aucune mention de retenue sans procédure (photos, état des lieux, devis).
- [ ] `a_valider` retiré une fois kiki d'accord, avec la date de validation.

**Fichiers concernés** : `content/tarifs.json`, `content/annulation.json`
ou nouveau `content/caution.json`, `src/i18n/booking.ts`.

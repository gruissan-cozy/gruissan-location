# Réservation et disponibilités

Sujet : comment une demande devient une réservation, et **quelle donnée dit la
vérité** sur les dates libres.

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

## 2. Décision D1 — site seul ou synchronisé ?

Voir le tableau du `README.md` (§2). Précisions utiles :

- **iCal n'est pas de la synchro temps réel.** Airbnb met à jour son flux avec
  un délai pouvant aller jusqu'à 3 h ; Booking est plus rapide mais pas
  instantané. Un import iCal **réduit** le risque de double réservation, il ne
  l'annule pas. Il faut donc conserver une marge de sécurité (par exemple ne pas
  accepter une arrivée le lendemain d'un départ importé).
- **L'export iCal est le plus important des deux.** Il permet aux plateformes de
  voir les séjours directs. Il est aussi le plus simple : un fichier `.ics`
  généré à la demande depuis `sejours`.
- **Piège** : un flux iCal public expose les dates des séjours. Ce n'est pas une
  donnée personnelle, mais c'est une information commerciale. À servir depuis
  une route dédiée, pas depuis une table lisible en masse.

---

## 3. User stories

| Id | User story | Valeur | Effort |
|---|---|---|---|
| `R-02` | En tant que kiki, je veux que le formulaire de réservation refuse les dates déjà prises **selon le même calendrier que la vitrine**, pour ne plus recevoir de demandes impossibles. | Évite les échanges inutiles et les déceptions | S |
| `R-01` | En tant que kiki, je veux transformer une demande reçue en séjour confirmé **en un clic**, pour ne plus ressaisir les dates et oublier de bloquer le calendrier. | Gain de temps, zéro double saisie | M |
| `R-03` | En tant que kiki, je veux importer les calendriers Airbnb et Booking et exporter le mien, pour vendre sur plusieurs canaux sans double réservation. | Sécurité commerciale | M |
| `R-04` | En tant que kiki, je veux modifier les prix et les saisons depuis le back office, sans passer par une pull request. | Autonomie, réactivité tarifaire | M |
| `R-05` | En tant que kiki, je veux une règle de caution écrite et appliquée de la même façon à chaque séjour. | Moins de litiges | S |
| `R-06` | En tant que locataire, je veux voir clairement le prix total (séjour + options + taxe + caution) avant d'envoyer ma demande. | Transparence, confiance | ✅ déjà fait |

---

## 4. Risques

### Technique
- **Migration de données** : fusionner `bookings` et `sejours` touche les pages
  revenus, taxe de séjour, tâches et l'espace locataire. À faire en une fois,
  avec un script idempotent et une sauvegarde préalable.
- **Deux vocabulaires de statuts** (`confirmee` / `confirme`) : toute
  unification doit choisir un seul jeu de valeurs, et convertir les lignes
  existantes. Le code des Edge Functions compare `['confirmee', 'terminee']` :
  à mettre à jour **en même temps**, sinon l'upload de photos casse.
- **iCal** : les flux ne sont pas normalisés (fuseaux, événements récurrents,
  `DTEND` exclusif). Un parseur naïf produit des dates fausses d'un jour.
- **Fuseau horaire** : tout le calcul de dates doit rester en `UTC` côté code
  (`pricing.ts` le fait déjà) et en `Europe/Paris` pour les échéances légales
  (expiration d'un lien, par exemple).

### Juridique
- **Taxe de séjour** : le taux de `content/tarifs.json` (1,15 €) n'a pas de
  source dans le dépôt. Il dépend du classement du meublé et de la délibération
  communale. **À faire confirmer par la mairie de Gruissan.** Une taxe mal
  collectée est une irrégularité comptable.
- **Caution** : un dépôt de garantie n'est pas un revenu. Sa retenue doit être
  motivée (devis, photos, état des lieux) et le solde restitué dans un délai
  annoncé. À écrire dans les CGV.
- **Nuits minimum et prix affichés** : un prix « à partir de » sans mention des
  frais obligatoires est une pratique commerciale trompeuse. Le récapitulatif
  actuel est correct : ne pas le dégrader.

### Opérationnel
- Un flux iCal importé ne se met pas à jour si le job planifié tombe. Il faut
  une **date de dernière synchro affichée** dans le back office, sinon kiki croit
  que c'est à jour alors que non.
- Si kiki continue à vendre sur Airbnb **et** sur le site sans synchro, le
  risque de double réservation est réel et coûteux (relogement à ses frais).

---

## 5. Fausses bonnes idées sur ce sujet

| Idée | Pourquoi non |
|---|---|
| Réservation instantanée **sans paiement** | Une demande confirmée automatiquement sans engagement financier se annule souvent. Rester sur « demande → confirmation par kiki » tant qu'il n'y a pas d'acompte. |
| Tarification dynamique (yield management) | 12 semaines de saison, un bien : kiki connaît ses prix. Un algorithme ajouterait de la complexité et des erreurs. |
| Moteur de disponibilité « temps réel » maison | Sans serveur permanent, ce n'est pas possible sur GitHub Pages. Il faut assumer un délai (demande + validation). |
| Supprimer `availability` immédiatement | C'est le repli quand Supabase est indisponible et le contenu de secours de la vitrine. À retirer **après** la bascule, pas avant. |

---

## 6. Prochaines tâches suggérées

### Tâche 1 — Une seule source de vérité pour les disponibilités

**Objectif** : le formulaire `/reserver/` vérifie les chevauchements sur la
table `sejours` (granularité jour), avec la même fonction que le calendrier
public, au lieu d'interroger `availability`.

**Critères d'acceptation**
- [ ] Une date occupée par un séjour `option` ou `confirme` est refusée par le
      formulaire, avec le message « dates indisponibles » déjà traduit.
- [ ] Le jour du départ redevient réservable (convention hôtelière conservée).
- [ ] Le comportement sans Supabase est inchangé (mention « à confirmer »).
- [ ] Tests Vitest : chevauchement partiel, arrivée le jour du départ, séjour
      annulé ignoré, table absente → repli.
- [ ] `npm run verify` vert, textes dans les 4 langues.

**Fichiers concernés** : `src/components/Reservation.astro`,
`src/lib/sejours.ts` (réutiliser `trouverChevauchements`),
`src/lib/disponibilites.ts`, `tests/sejours.test.ts`.

---

### Tâche 2 — Transformer une demande en séjour en un clic

**Objectif** : depuis la fiche d'une demande, un bouton crée le séjour
correspondant (mêmes dates, mêmes coordonnées, même prix) et passe la demande
au statut « confirmé ».

**Critères d'acceptation**
- [ ] Le séjour créé apparaît immédiatement dans le calendrier public.
- [ ] Un chevauchement avec un séjour existant est refusé avec un message
      explicite, sans rien créer.
- [ ] La demande d'origine garde la trace de la conversion (historique).
- [ ] Aucune donnée personnelle n'est dupliquée inutilement : le séjour
      référence la demande, ou reprend les champs utiles seulement.
- [ ] Tests : conversion nominale, conversion en double refusée, demande déjà
      convertie.
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/pages/admin/sejours.astro`,
`src/pages/admin/messages.astro`, `src/lib/sejours.ts`, `src/i18n/admin.ts`.

---

### Tâche 3 — Export iCal du calendrier (si D1 = B)

**Objectif** : exposer un fichier `.ics` des séjours bloquants, à coller dans
Airbnb et Booking, pour qu'ils voient les réservations directes.

**Critères d'acceptation**
- [ ] Le fichier contient les séjours `option` et `confirme` à venir, avec
      `DTEND` exclusif (départ = jour non occupé).
- [ ] Les séjours annulés et terminés sont exclus.
- [ ] Aucune donnée personnelle dans le fichier (pas de nom, pas de prix).
- [ ] Tests unitaires sur la génération ICS (dates, échappement, fuseau).
- [ ] Documenté dans `docs/` : où trouver l'URL, comment la coller dans Airbnb.

**Fichiers concernés** : nouvelle route (`src/pages/calendrier.ics.ts` ou
similaire), `src/lib/ical.ts` (nouveau, pur et testé), `tests/ical.test.ts`.

---

### Tâche 4 — Import iCal des plateformes (si D1 = B)

**Objectif** : importer les flux Airbnb/Booking et créer des séjours
« occupés » (sans coordonnées) qui bloquent le calendrier.

**Critères d'acceptation**
- [ ] Un séjour importé bloque le calendrier public et le formulaire.
- [ ] Il est visuellement distingué d'un séjour direct dans l'admin (source).
- [ ] Une resynchronisation ne crée pas de doublons (clé stable par UID iCal).
- [ ] La date de dernière synchro est affichée dans le back office.
- [ ] Un flux indisponible ne casse rien : dernier état conservé, avertissement
      affiché.
- [ ] Tests : parseur iCal (événements récurrents ignorés, `DTEND` exclusif,
      fuseaux), déduplication, flux vide.

**Fichiers concernés** : `src/lib/ical.ts`, `src/pages/admin/sejours.astro`,
migration ajoutant une colonne `source` et `ical_uid` sur `sejours`,
Edge Function ou Action planifiée pour la synchro.

---

### Tâche 5 — Tarifs et saisons éditables en base

**Objectif** : déplacer les saisons de `content/tarifs.json` vers une table
éditable dans `/admin/`, en conservant l'historique.

**Critères d'acceptation**
- [ ] Modifier un prix ne demande ni PR ni redéploiement.
- [ ] Un séjour passé garde le prix appliqué au moment de la réservation
      (pas de recalcul rétroactif).
- [ ] Repli sur `content/tarifs.json` si la table est absente.
- [ ] Tests : calcul avec tarif en base, repli, séjour à cheval sur deux saisons.
- [ ] 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/lib/pricing.ts`, `content/tarifs.json`,
`src/pages/admin/` (nouvelle page tarifs), migration dédiée,
`src/i18n/admin.ts`, `tests/pricing.test.ts`.

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

# Roadmap produit — Gruissan Location

Index priorisé de la feuille de route. Un fichier par sujet, ce README fait foi
pour l'ordre de traitement.

- **Date** : novembre 2026 (révisé le **2026-11-21** après les décisions de kiki)
- **Périmètre** : un seul bien (appartement en duplex, Gruissan Plage), un seul
  propriétaire (kiki), un site statique Astro + Supabase.
- **Auteur** : rôle produit/roadmap. Aucune ligne de code, aucune migration,
  aucune RLS modifiée ici : les propositions sont transformées en tâches par
  `gruissan-lead`, puis exécutées par `gruissan-dev` / `gruissan-content`.

---

## 1. Ce que le site sait déjà faire (état réel, novembre 2026)

À lire avant de proposer : une bonne partie du parcours existe déjà. Le
problème n'est pas le manque d'écrans, c'est que **les morceaux ne sont pas
reliés entre eux**.

| Brique | État | Où |
|---|---|---|
| Vitrine 4 langues, galerie par pièce, tarifs saisonniers, FAQ, avis, conditions d'annulation | ✅ en place | `src/components/Vitrine.astro`, `content/*.json` |
| Calendrier public des disponibilités | ✅ alimenté par la table `sejours` (dates seules), repli `content/disponibilites.json` | `src/lib/disponibilites.ts`, `src/lib/calendrier.ts` |
| Devis instantané + options (packs) + envoi d'une **demande** | ✅ écrit dans `bookings` avec `statut = 'demande'` | `src/components/Reservation.astro`, `src/lib/pricing.ts` |
| Back office : connexion magic link, garde `ALLOWED_EMAIL` | ✅ | `src/layouts/AdminLayout.astro`, `src/pages/admin/index.astro` |
| Back office : séjours datés (CRUD + détection de chevauchement) | ✅ table `sejours` | `src/pages/admin/sejours.astro`, `src/lib/sejours.ts` |
| Back office : messages prospects, pipeline de statuts, lu/non lu, modèles de réponse | ✅ | `src/pages/admin/messages.astro`, `src/lib/pipeline.ts`, `src/lib/modeles.ts` |
| Back office : revenus (CA, taux d'occupation, exports CSV), taxe de séjour, tâches entre séjours | ✅ | `src/lib/revenus.ts`, `src/lib/taxe-sejour.ts`, `src/lib/taches.ts` |
| Espace locataire : checklist par pièce, photos horodatées, signature, PDF, e-mail | ✅ code livré | `src/pages/tenant/index.astro`, `supabase/functions/*` |
| Paiement, contrat, messagerie de séjour, pages légales, iCal, blocages de dates | ❌ absent | — |

### Les trois trous qui coûtent le plus cher aujourd'hui

1. **Les demandes de réservation sont invisibles dans le back office.**
   `bookings` est écrite par le formulaire public et **aucune page admin ne la
   lit** (vérifié : seules `messages`, `sejours`, `packs`, `guide_sections`,
   `availability`, `sejour_taches` sont interrogées). Une demande envoyée depuis
   `/reserver/` n'apparaît nulle part côté kiki, sauf l'e-mail FormSubmit en mode
   dégradé.
2. **Deux sources de vérité pour les disponibilités.**
   Le calendrier public lit `sejours` ; le formulaire `/reserver/` vérifie
   `availability` (`statut = 'reserve'`, granularité mensuelle). Bloquer un mois
   dans `/admin/disponibilites/` bloque le formulaire mais **pas** le calendrier
   public, et inversement. Un client peut donc envoyer une demande sur des dates
   affichées comme réservées.
3. **Le lien locataire ne peut pas être fabriqué depuis le back office.**
   `tenant_sessions` doit être inséré à la main en SQL Editor, sur une ligne
   `bookings` au statut `confirmee` — alors que le back office travaille sur
   `sejours` (`confirme`). Une réservation venue d'Airbnb, de Booking ou du
   téléphone n'a aucune ligne `bookings` : impossible de lui donner un lien
   d'état des lieux sans écrire du SQL.

Tant que ces trois points ne sont pas réglés, ajouter du paiement ou un guide
locataire ne sert à rien : il n'y a pas de dossier de réservation fiable à
raccrocher dessus.

---

## 2. Décisions actées par kiki (2026-11-21)

Ces deux décisions sont **fermes**. Elles ne se rediscutent pas : le reste de la
roadmap s'y adapte. Les incertitudes qui subsistent (mairie, comptable,
assurance) sont des **vérifications d'exécution**, pas des remises en cause.

### DA-1 — V1 : le site est seule source de vérité des disponibilités (mono-bien, sans plateforme)

**Acté** : pas de synchro Airbnb/Booking en V1. Le site est l'unique source de
vérité. « Pas encore, mais plus tard » : l'architecture doit rendre l'ajout d'une
synchro iCal **peu coûteux**, sans rien coder maintenant.

**Conséquences techniques à respecter dès la V1** (ce sont des contraintes de
schéma, pas des fonctionnalités) :

| Contrainte | Pourquoi maintenant |
|---|---|
| Table de blocages de dates **indépendante des réservations**, type `calendar_blocks` | Un séjour est une réservation ; un blocage est une indisponibilité (travaux, séjour personnel, import plateforme). Les mélanger dans `sejours` rend l'import iCal destructeur : il faudrait créer de faux « clients ». |
| Colonne `source` sur les blocages : `direct` \| `airbnb` \| `booking` | Permet d'afficher l'origine, de purger un import sans toucher au direct, et de filtrer. Une valeur par défaut `direct` suffit en V1. |
| Colonne `external_uid` (nullable) | Clé stable d'un événement iCal. Sans elle, une resynchronisation crée des doublons. Nullable en V1, **unique quand non nulle** (index partiel). |
| Le calcul de disponibilité **lit les deux sources** (séjours bloquants + blocages) | Si on code le calendrier contre `sejours` seul, l'ajout des blocages cassera tout. Poser la bonne abstraction dès le départ coûte quelques heures. |
| Un **point d'entrée d'import iCal prévu mais désactivé** | Une route ou une Edge Function identifiable, qui répond « non activé » en V1. Documentée dans `docs/`. Objectif : ne pas avoir à redessiner l'architecture plus tard. |
| Aucune interface de synchro dans le back office en V1 | On ne montre pas un bouton inactif à kiki. La table et la logique existent, l'écran viendra avec la V2. |

**Ce qu'il ne faut PAS faire en V1** : coder un parseur iCal complet, un job de
synchro, une page de réglages plateformes, ou un bouton « synchroniser »
désactivé. On prépare le terrain, on ne construit pas la maison.

**Corollaire opérationnel** : puisque le site est seule source de vérité, kiki
ne doit **rien vendre ailleurs en parallèle** pendant la V1. Si une annonce
Airbnb reste active, il faut la suspendre ou bloquer les dates à la main dans le
back office — et le dire explicitement. C'est une règle d'exploitation, pas de
code.

### DA-2 — Le meublé de tourisme est **non classé**

**Acté** : l'appartement n'est pas classé « meublé de tourisme ». Il n'y a donc
**ni étoiles, ni label, ni mention de classement** nulle part : ni sur la
vitrine, ni dans les CGV, ni dans le contrat, ni dans les annonces.

Ce que cela implique, point par point :

| Sujet | Ce qui s'applique | Statut |
|---|---|---|
| **Déclaration en mairie** | Déclaration obligatoire à la mairie de Gruissan + **numéro d'enregistrement à afficher** sur le site et dans les annonces. Un meublé non classé n'est pas dispensé de déclaration. | **À obtenir** par kiki auprès de la mairie |
| **Affichage du numéro** | Le numéro doit apparaître sur le site (pied de page, page contact ou mentions légales) et sur toute annonce. C'est une obligation d'affichage, pas une option marketing. | À intégrer dès la tâche « pages légales » |
| **Taxe de séjour** | Régime des **hébergements non classés** : taxe par nuit et par personne, **plafonnée au tarif de la catégorie la plus basse**, avec **exonération des mineurs**. Le taux communal de Gruissan (délibération de l'année) est **à récupérer auprès de la mairie**. | Le `1.15` de `content/tarifs.json` est **provisoire et sans source** |
| **Seuil de 120 nuits** | Le seuil de 120 nuits ne concerne **que les meublés classés**. Un non classé n'y est pas soumis : la location reste possible toute l'année. | Acté (conséquence du non classé) |
| **Fiscalité** | Régime des revenus fonciers / BIC selon les recettes (micro-BIC ou réel). **Choix à faire valider par un comptable** : ne pas trancher ici. | **À valider par un comptable** |
| **Assurance** | La garantie « propriétaire non occupant » / saisonnière doit couvrir l'accueil de locataires payants. Une multirisque habitation standard ne suffit pas. | **À vérifier par kiki** |
| **Communication** | Ne jamais écrire « classé », « 3 étoiles », « label » ou afficher un pictogramme d'étoiles. La capacité (4 personnes) et les équipements se décrivent factuellement. | Règle de rédaction pour `gruissan-content` |

**Point d'attention juridique** : le régime des meublés de tourisme a été durci
récemment (loi dite « Le Meur », fin 2024) et un guichet unique national
d'enregistrement a été annoncé. **Je ne l'ai pas vérifié en source primaire**
pour Gruissan : à confirmer en mairie (procédure exacte, pièces, délai, format
du numéro). Ne pas recopier ce paragraphe dans une page publique avant
confirmation.

### D3 — Toujours ouverte : accepte-t-on un prestataire de paiement payant ?

`AGENTS.md` règle 3 pose « open source uniquement, pas de service externe
payant ». Or **aucun moyen d'encaisser une carte sans PSP** : Stripe facture
~1,5 % + 0,25 € par transaction européenne, Mollie / PayPlug sont comparables.
Les alternatives gratuites (virement, chèque, espèces) fonctionnent mais
imposent une relance manuelle et font perdre des réservations.

**C'est un arbitrage de kiki, pas une décision technique.** Trois niveaux
(numérotation alignée sur `2026-11-paiement-contrat.md` §2) :

- **Niveau 0 — Aucun paiement en ligne** (virement + acompte manuel) — 0 €,
  effort S, mais conversion faible et suivi manuel.
- **Niveau 1 — Acompte en ligne (30 %) + solde par virement** — PSP nécessaire,
  effort L.
- **Niveau 2 — Tout en ligne + empreinte de caution** — PSP + prestataire de
  caution (voir `2026-11-paiement-contrat.md`, §4 : Stripe ne sait pas bloquer
  800 € pendant trois semaines).

Tant que D3 n'est pas tranchée, la roadmap suppose le **niveau 0** : le parcours
« demande → kiki confirme → acompte par virement » fonctionne sans PSP et doit
rester livrable seul.

---

## 3. Vue en trois lots

### Lot 1 — Avant le premier été (à livrer pour **mars 2027**)

La saison 2027 se commercialise dès décembre-janvier. Objectif : un dossier de
réservation unique, fiable, et le minimum légal pour vendre en ligne — avec la
**structure de calendrier prévue pour l'iCal futur** et le **statut non classé**
respecté partout.

| Ordre | Sujet | Pourquoi maintenant |
|---|---|---|
| 1 | Boucle **demande → séjour → lien locataire** (`B-01`, `R-01`) | Sans elle, rien d'autre ne peut se raccrocher à une réservation |
| 2 | **Une seule source de vérité** des disponibilités, avec `calendar_blocks` dès le schéma (`R-02`, `R-07`) | Corrige le bug actuel **et** prépare l'iCal sans le coder |
| 3 | **Numéro d'enregistrement en mairie affiché** + **taxe de séjour non classé** (`R-08`, `P-01`) | Obligation légale liée au statut non classé (DA-2) |
| 4 | **Pages légales + CGV + confidentialité** (`P-01`) | Vendre en ligne sans CGV ni politique RGPD est un risque juridique direct |
| 5 | **Back office : voir les demandes** (`B-02`) | Kiki ne voit aujourd'hui aucune demande de réservation |
| 6 | **Lien locataire généré depuis l'admin** (`G-01`) | Débloque l'état des lieux pour les réservations hors site |
| 7 | **Paiement de l'acompte** (`P-02`, si D3 = niveau 1 ou 2) | Le seul moyen de sécuriser une réservation à distance |
| 8 | **Conservation des états des lieux** (`E-02`) | Aujourd'hui la purge détruit la preuve : inutilisable en cas de litige |

### Lot 2 — Après le premier été (hiver 2027-2028)

| Sujet | Déclencheur |
|---|---|
| **Activer la synchro iCal** (`R-03`) | Quand kiki décide de vendre aussi sur Airbnb/Booking. **Le schéma est déjà prêt** (DA-1), il ne reste que le parseur, le job et l'écran de réglages |
| Export iCal du site (`R-09`) | À faire **avec** l'import : les plateformes ont besoin de voir les séjours directs |
| Guide locataire réellement privé (`G-02`) | Dès que les codes d'accès doivent être dans le guide |
| Comparaison entrée/sortie des états des lieux (`E-03`) | Après une première saison avec litiges ou doutes |
| Contrat de location généré + signature (`P-03`) | Après validation du texte par kiki — **sans aucune mention de classement** |
| « Qu'est-ce que je dois faire cette semaine » (`B-03`) | Dès que le nombre de séjours dépasse la mémoire de kiki |
| Messagerie de séjour (`B-04`) | Seulement si WhatsApp ne suffit pas (voir §5) |
| Tarifs saisonniers éditables sans redéploiement (`R-04`) | Quand kiki veut changer un prix sans passer par une PR |

### Lot 3 — Écarté (ne pas faire)

Voir §5. Résumé : compte utilisateur, application mobile, channel manager,
boîte à clés connectée, moteur de paiement maison, avis maison, fidélité,
multi-biens, tarification dynamique.

---

## 4. Tableau des idées

Effort : **S** ≈ 1 à 2 jours, **M** ≈ 3 à 5 jours, **L** ≈ 1 à 2 semaines (un
seul développeur, avec tests et 4 langues).

| Id | Idée | Valeur (kiki / locataire) | Effort | Dépend de | Risques |
|---|---|---|---|---|---|
| `B-01` | Unifier `bookings` et `sejours` en un seul dossier de réservation | Kiki : un seul endroit à tenir. Locataire : suivi cohérent | L | — | Migration de données, RLS à revoir, régression sur les pages existantes |
| `R-01` | Convertir une demande en séjour en un clic | Kiki : plus de ressaisie, plus d'oubli de blocage du calendrier | M | `B-01` | Doublons si deux demandes identiques |
| `R-02` | Une seule source de vérité pour les disponibilités (séjours + blocages) | Les deux : plus de demande sur des dates occupées | S | `R-07` | Aucun si `R-07` est fait d'abord (sinon refonte à prévoir) |
| `R-07` | **Table `calendar_blocks`** (`source`, `external_uid`) dès la V1, sans synchro | Kiki : peut bloquer travaux/séjour perso. Équipe : iCal ajoutable plus tard sans refonte | M | — | Sur-ingénierie si on va au-delà du schéma (ne PAS coder l'import en V1) |
| `R-03` | Synchro iCal import (Airbnb/Booking) — **V2** | Kiki : vend sur plusieurs canaux sans double réservation | M | `R-07` + décision de vendre sur les plateformes | Délai de propagation, flux non normalisés, job à surveiller |
| `R-09` | Export iCal du site — **V2, avec l'import** | Les plateformes voient les séjours directs | S | `R-07` | Un flux public expose les dates (pas de données perso : veiller à ne rien ajouter) |
| `R-04` | Tarifs et saisons éditables en base | Kiki : change un prix sans PR ni redéploiement | M | `B-01` | Historique des prix à conserver pour les séjours passés |
| `R-08` | **Taxe de séjour « non classé »** + numéro d'enregistrement mairie | Kiki : conformité légale (DA-2). Locataire : prix juste | M | mairie | Taux communal à obtenir ; plafond « catégorie la plus basse » ; exonération des mineurs |
| `R-05` | Caution : politique claire (montant, restitution, délai) | Les deux : fin des discussions à l'arrivée | S | — | Juridique : la retenue doit être justifiée et documentée |
| `P-01` | Pages légales, CGV, politique de confidentialité (+ numéro d'enregistrement) | Kiki : conformité. Locataire : confiance | M | `R-08` (numéro) | Rédaction à valider, contenu à maintenir |
| `P-02` | Acompte en ligne (Stripe Checkout via Edge Function) | Kiki : réservations sécurisées. Locataire : paiement simple | L | D3, `B-01` | PSP payant, webhooks, remboursements, 3DS, KYC Stripe |
| `P-03` | Contrat + règles de la maison générés et signés | Les deux : cadre clair, preuve en cas de litige | M | `P-01` | Valeur probante d'une signature tactile, texte à valider, **aucune mention de classement** |
| `P-04` | Empreinte de caution | Kiki : protège le bien sans encaisser 800 € | L | D3 | Stripe plafonne l'autorisation à 7 jours ; prestataire dédié nécessaire |
| `E-01` | Check-in/check-out utilisables sur le terrain | Locataire : 5 min sur place. Kiki : preuve horodatée | S | `G-01` | Photos de mauvaise qualité, locataire sans réseau |
| `E-02` | Conserver les états des lieux signés (PDF) 5 ans | Kiki : preuve en cas de litige | S | — | RGPD : ne conserver que le PDF, pas les photos brutes |
| `E-03` | Comparer entrée et sortie (diff par pièce) | Kiki : repère les dégradations en 1 minute | M | `E-01` | Faux positifs (lumière, cadrage) |
| `E-04` | Boîte à clés connectée | Locataire : arrivée à toute heure | L | — | Coût, panne, batterie, accès à la résidence, sécurité |
| `G-01` | Lien locataire généré depuis l'admin | Kiki : 1 clic au lieu d'un SQL manuel | M | `B-01` | Jeton à ne jamais journaliser |
| `G-02` | Guide locataire réellement privé | Kiki : met les codes d'accès en ligne sans les exposer | M | — | Policy RLS par jeton à écrire et à tester |
| `G-03` | Code de secours / secours téléphonique | Locataire : n'est jamais bloqué dehors | S | `G-02` | Le code de secours ne doit pas être dans le guide public |
| `B-02` | Voir et traiter les demandes de réservation | Kiki : ne perd plus une demande | M | `B-01` | — |
| `B-03` | Tableau de bord « à faire cette semaine » | Kiki : sait quoi faire sans chercher | M | `B-01` | Règles métier à définir avec kiki |
| `B-04` | Fil de messages par séjour | Les deux : historique au même endroit | M | `B-01` | Doublon avec WhatsApp, RGPD (durée de conservation) |
| `B-05` | Encaissé vs dû, par séjour et par année | Kiki : sait ce qui reste à rentrer | M | `P-02` | Dépend du statut réel des paiements |
| `B-06` | Alerte nouvelle demande hors du back office | Kiki : réagit en heures, pas en jours | S | — | Déjà documenté dans `docs/notifications.md`, non implémenté faute de secrets |
| `B-10` | Vue « blocages » dans le back office (travaux, séjour perso) | Kiki : bloque ses dates sans créer un faux séjour | S | `R-07` | Ne pas confondre avec une réservation dans les statistiques |
| `B-11` | Contrôle de complétude fiscale (numéro mairie, taux non classé) | Kiki : voit ce qui manque avant de vendre | S | — | Aucun ; c'est un signalement, pas un blocage |

---

## 5. Ce qu'il ne faut pas faire (et pourquoi)

| Fausse bonne idée | Pourquoi |
|---|---|
| **Compte utilisateur locataire** (mot de passe, profil) | Un lien signé à durée limitée fait mieux : rien à retenir, rien à stocker, rien à réinitialiser. Un compte crée une base d'utilisateurs à protéger et à purger. |
| **Application mobile** | Le site est responsive et l'état des lieux se fait dans le navigateur. Une app coûte 2 stores, 2 mises à jour, 1 an de maintenance. |
| **Messagerie temps réel maison** | WhatsApp existe déjà, kiki l'utilise, et le locataire l'a sur son téléphone. Un fil maison ne sera pas consulté. Utile seulement si kiki veut garder une trace par réservation. |
| **Moteur de paiement maison / stockage de numéros de carte** | Interdit en pratique (PCI-DSS) et dangereux. Un PSP ou rien. |
| **Contrat rédigé par un agent** | Un contrat de location saisonnière est un acte juridique. Le modèle doit être validé par kiki (et idéalement un professionnel), pas généré par un LLM. |
| **Channel manager / PMS complet** (Beds24, Lodgify, Guesty) | 20 à 100 €/mois, interface à apprendre, pour un seul bien. Écarté par DA-1 (V1 sans plateforme) et par le back office existant. |
| **Coder la synchro iCal en V1** | Décision DA-1 : « pas encore ». On prépare le schéma (`calendar_blocks`), pas le parseur. Coder une synchro qu'on n'utilise pas, c'est du code mort à maintenir. |
| **Afficher un classement, des étoiles ou un label** | L'appartement est **non classé** (DA-2). Afficher un classement non détenu est une pratique commerciale trompeuse. |
| **Boîte à clés connectée** | 150 à 300 €, batterie à changer, panne = locataire dehors. Une boîte à clés mécanique à code + un code de secours couvrent 95 % des cas. |
| **Avis collectés sur le site** | Interdit d'inventer ou de filtrer les avis (pratique commerciale trompeuse). Les avis existent déjà sur Airbnb/Booking, avec une audience. `content/avis.json` est bien conçu : il ne fait que recopier de vrais avis. |
| **Tarification dynamique par IA** | Sur 12 semaines de saison et un bien, kiki connaît ses prix mieux qu'un modèle. |
| **Multi-biens** | Aucun besoin exprimé. Complexifie tout (RLS, calendrier, tarifs) pour zéro valeur. |

### Ce que les plateformes font déjà mieux (et qu'il ne faut pas répliquer)

| Besoin | Airbnb / Booking | Conclusion |
|---|---|---|
| Distribution et visibilité | Des millions de visiteurs | Garder une fiche à jour, renvoyer vers elle, mais ne pas dupliquer le moteur |
| Paiement et remboursement | Intégrés, gérés, assurés | Ne pas réécrire : PSP + règles simples |
| Caution / dégâts | AirCover, garantie Booking | Un contrat + état des lieux + caution suffisent à cette échelle |
| Litiges | Service client, arbitrage | Kiki reste seul arbitre : d'où l'importance de la preuve (photos, PDF, contrat) |
| Messagerie | Traduite, notifications push | WhatsApp fait aussi bien ici |

**Position recommandée** : le site sert la **réservation directe** (marge
complète, relation directe, pas de commission de 15 %) et l'**espace séjour**
(état des lieux, guide, consignes), pas à remplacer Airbnb.

**Nuance V1 (DA-1)** : en V1, il n'y a **aucune** vente sur Airbnb/Booking. Le
site n'est pas « en plus » des plateformes, il est **à leur place** pendant la
première saison. Ce tableau sert à savoir ce qu'on ne réplique pas *si* kiki
revient vers elles en V2 — pas à justifier une cohabitation qui n'existe pas
encore.

**Conséquence** : la visibilité que les plateformes apportaient doit être
compensée autrement en V1 (référencement local, bouche-à-oreille, lien depuis
les avis existants, page Google Business). Ce n'est pas un sujet de code, mais
c'est un risque commercial réel : un site sans trafic ne loue rien.

---

## 6. À valider par kiki / mairie / comptable (vérifications d'exécution)

Les décisions DA-1 et DA-2 sont prises. Ce tableau liste ce qu'il reste à
**obtenir ou faire confirmer** pour les appliquer — pas à rediscuter.

| Sujet | Question précise | Qui | Impact si non obtenu |
|---|---|---|---|
| **Numéro d'enregistrement** | Déclaration en mairie de Gruissan : procédure, pièces, format et obtention du numéro | Kiki → mairie | Obligation d'affichage non remplie, amende |
| **Taxe de séjour non classé** | Taux communal 2027, **plafond « catégorie la plus basse »**, exonération des mineurs | Kiki → mairie | Taxe mal collectée ; le `1.15` actuel est provisoire |
| **Fiscalité** | Micro-BIC ou réel, selon les recettes ; seuils applicables au non classé | Kiki → comptable | Déclaration erronée |
| **Assurance** | La garantie PNO/saisonnière couvre-t-elle l'accueil de locataires payants ? | Kiki → assureur | Sinistre non couvert |
| **Paiement (D3)** | Accepte-t-on Stripe (payant) malgré la règle « pas de service payant » ? | Kiki | Pas de réservation en ligne possible |
| **Caution** | Montant, mode (empreinte / chèque / virement), délai de restitution | Kiki | Litige à chaque départ |
| **Annulation** | Valider le barème de `content/annulation.json` (aujourd'hui `a_valider: true`) | Kiki | CGV inapplicables |
| **RGPD** | Durée de conservation : combien de temps garder les états des lieux ? | Kiki | Purge actuelle détruit la preuve |
| **Domaine** | Acheter un domaine (10–15 €/an) avant d'encaisser des paiements ? | Kiki | Un `github.io` inspire peu confiance pour payer |

---

## 7. Prochaines tâches suggérées (ordre de priorité)

Chaque tâche est détaillée dans son fichier thématique. Toutes respectent les
règles du dépôt : 4 langues, tests Vitest, `npm run verify` vert, PR vers `main`.

| # | Tâche | Fichier de détail |
|---|---|---|
| 1 | **Unifier le dossier de réservation** (`bookings` → `sejours`), avec migration des données existantes | `2026-11-backoffice-suivi.md` |
| 2 | **Table `calendar_blocks`** (`source`, `external_uid`) + calcul de disponibilité sur deux sources | `2026-11-reservation-disponibilites.md` |
| 3 | **Afficher et traiter les demandes de réservation** dans `/admin/` | `2026-11-backoffice-suivi.md` |
| 4 | **Une seule source de vérité** : `/reserver/` vérifie séjours + blocages | `2026-11-reservation-disponibilites.md` |
| 5 | **Taxe de séjour non classé** + numéro d'enregistrement affiché | `2026-11-reservation-disponibilites.md` |
| 6 | **Pages légales, CGV et politique de confidentialité** (sans mention de classement) | `2026-11-paiement-contrat.md` |
| 7 | **Générer le lien locataire depuis `/admin/sejours/`** | `2026-11-guide-acces-temporaire.md` |
| 8 | **Conserver les états des lieux signés** hors purge | `2026-11-etat-des-lieux.md` |
| 9 | **Acompte en ligne** (si D3 = niveau 1 ou 2) | `2026-11-paiement-contrat.md` |
| 10 | **Alerte de nouvelle demande** hors back office | `2026-11-backoffice-suivi.md` |

### Gelé jusqu'à décision ultérieure (DA-1)

- Parseur iCal, job de synchro, écran de réglages plateformes, bouton
  « synchroniser » : **V2**, quand kiki décidera de vendre sur Airbnb/Booking.
- La table `calendar_blocks` et ses colonnes sont en revanche **dans le périmètre
  V1** : c'est ce qui rend la V2 peu coûteuse.

**Note de séquencement** : la tâche 2 (`R-07`, `calendar_blocks`) **ne dépend
d'aucune autre** et peut démarrer en parallèle de la tâche 1. La faire d'abord
évite d'écrire le calcul de disponibilité deux fois.

---

## 8. Index des fichiers

- [`2026-11-reservation-disponibilites.md`](./2026-11-reservation-disponibilites.md) — moteur de réservation, source de vérité, `calendar_blocks`, iCal (V2), tarifs, caution, taxe de séjour non classé, numéro d'enregistrement.
- [`2026-11-paiement-contrat.md`](./2026-11-paiement-contrat.md) — Stripe, acompte et solde, empreinte de caution, contrat (mention non classé), signature, ce qu'il ne faut pas coder.
- [`2026-11-etat-des-lieux.md`](./2026-11-etat-des-lieux.md) — check-in/check-out autonome, photos, PDF, comparaison entrée/sortie, boîte à clés.
- [`2026-11-guide-acces-temporaire.md`](./2026-11-guide-acces-temporaire.md) — espace séjour, lien signé, expiration, code de secours, RGPD.
- [`2026-11-backoffice-suivi.md`](./2026-11-backoffice-suivi.md) — back office mono-bien, demandes, blocages, statuts, encaissé vs dû, statistiques.

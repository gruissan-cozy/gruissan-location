# Roadmap produit — Gruissan Location

Index priorisé de la feuille de route. Un fichier par sujet, ce README fait foi
pour l'ordre de traitement.

- **Date** : novembre 2026
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
| Paiement, contrat, messagerie de séjour, pages légales, iCal | ❌ absent | — |

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

## 2. Les décisions à trancher (bloquantes)

### D1 — Le site est-il la seule source de vérité des disponibilités, ou est-il synchronisé avec les plateformes ?

| Option | Conséquence | Coût |
|---|---|---|
| **A. Site seul** | Kiki bloque à la main dans `/admin/sejours/` ce qu'il vend ailleurs. Risque de double réservation s'il continue à vendre sur Airbnb/Booking en parallèle. | 0 € — S |
| **B. Synchro iCal** (import + export) | Le site importe les calendriers Airbnb/Booking et exporte le sien. Délai de propagation 15 min à 3 h selon les plateformes : **ne supprime pas le risque**, le réduit. | 0 € — M |
| **C. Channel manager** (Beds24, Lodgify…) | Vraie synchro temps réel multi-plateformes, mais abonnement mensuel et dépendance externe. Disproportionné pour un bien. | 20–50 €/mois — L |

**Recommandation** : A pour l'été 2027 si kiki arrête de vendre en parallèle sur
les plateformes ; sinon B, avec la règle « aucune réservation n'est confirmée
sans avoir bloqué le séjour dans le back office ». C exclu (voir §5).
**Décision à prendre par kiki, pas par un agent.**

### D2 — Quel est le statut administratif du meublé ?

À faire trancher avant toute mise en vente en ligne, car cela change la taxe de
séjour, l'affichage des prix, l'assurance et la fiscalité :

- **Classé « meublé de tourisme » (1 à 5 étoiles)** ou **non classé** ? Le
  classement conditionne le barème de taxe de séjour applicable et l'abattement
  fiscal. Le taux `1.15` €/nuit/personne de `content/tarifs.json` n'est adossé à
  aucune délibération dans le dépôt : **à faire confirmer par la mairie de
  Gruissan** (barème de l'année, exonérations, plafond de nuits par personne).
- **Déclaration / enregistrement en mairie** : le régime des meublés de
  tourisme a été durci (loi dite « Le Meur », fin 2024) avec un enregistrement
  obligatoire, y compris pour les non classés, et un guichet unique national
  annoncé pour 2026. **À vérifier en mairie de Gruissan** : formulaire,
  numéro d'enregistrement, affichage obligatoire de ce numéro sur l'annonce.
- **Assurance** : la multirisque habitation ne couvre pas l'accueil de
  voyageurs payants. Vérifier l'extension « location saisonnière » / RC
  locative, et la couverture en cas de dégâts ou de vol.
- **Fiscalité** : LMNP au réel ou micro-BIC ? Le choix impacte le seuil de
  chiffre d'affaires à ne pas dépasser et la tenue des justificatifs.

**Aucune de ces réponses ne peut être inventée.** Elles doivent être écrites
dans le dépôt (par exemple `docs/conformite.md`) avant que la réservation en
ligne ne soit ouverte au public.

### D3 — Accepte-t-on un prestataire de paiement payant ?

`AGENTS.md` règle 3 pose « open source uniquement, pas de service externe
payant ». Or **aucun moyen d'encaisser une carte sans PSP** : Stripe facture
~1,5 % + 0,25 € par transaction européenne, Mollie / PayPlug sont comparables.
Les alternatives gratuites (virement, chèque, espèces) fonctionnent mais
imposent une relance manuelle et font perdre des réservations.

**C'est un arbitrage de kiki, pas une décision technique.** Trois niveaux :

1. **Aucun paiement en ligne** (virement + acompte manuel) — 0 €, effort S,
   mais conversion faible et suivi manuel.
2. **Acompte en ligne (30 %) + solde par virement** — PSP nécessaire, effort L.
3. **Tout en ligne + empreinte de caution** — PSP + prestataire de caution
   (voir `2026-11-paiement-contrat.md`, §4 : Stripe ne sait pas bloquer 800 €
   pendant trois semaines).

---

## 3. Vue en trois lots

### Lot 1 — Avant le premier été (à livrer pour **mars 2027**)

La saison 2027 se commercialise dès décembre-janvier. Objectif : un dossier de
réservation unique, fiable, et le minimum légal pour vendre en ligne.

| Ordre | Sujet | Pourquoi maintenant |
|---|---|---|
| 1 | Boucle **demande → séjour → lien locataire** (`B-01`, `R-01`) | Sans elle, rien d'autre ne peut se raccrocher à une réservation |
| 2 | **Une seule source de vérité** des disponibilités (`R-02`) | Corrige un bug qui fait perdre des clients et crée des doubles réservations |
| 3 | **Pages légales + CGV + confidentialité** (`P-01`) | Vendre en ligne sans CGV ni politique RGPD est un risque juridique direct |
| 4 | **Back office : voir les demandes** (`B-02`) | Kiki ne voit aujourd'hui aucune demande de réservation |
| 5 | **Lien locataire généré depuis l'admin** (`G-01`) | Débloque l'état des lieux pour les réservations hors site |
| 6 | **Paiement de l'acompte** (`P-02`, si D3 = option 2) | Le seul moyen de sécuriser une réservation à distance |
| 7 | **Conservation des états des lieux** (`E-02`) | Aujourd'hui la purge détruit la preuve : inutilisable en cas de litige |

### Lot 2 — Après le premier été (hiver 2027-2028)

| Sujet | Déclencheur |
|---|---|
| Synchro iCal (`R-03`) | Si D1 = B, ou si kiki reprend la vente sur les plateformes |
| Guide locataire réellement privé (`G-02`) | Dès que les codes d'accès doivent être dans le guide |
| Comparaison entrée/sortie des états des lieux (`E-03`) | Après une première saison avec litiges ou doutes |
| Contrat de location généré + signature (`P-03`) | Après validation du texte par kiki |
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
| `B-01` | Unifier `bookings` et `sejours` en un seul dossier de réservation | Kiki : un seul endroit à tenir. Locataire : suivi cohérent | L | D1 | Migration de données, RLS à revoir, régression sur les pages existantes |
| `R-01` | Convertir une demande en séjour en un clic | Kiki : plus de ressaisie, plus d'oubli de blocage du calendrier | M | `B-01` | Doublons si deux demandes identiques |
| `R-02` | Une seule source de vérité pour les disponibilités | Les deux : plus de demande sur des dates occupées | S | — | Aucun (correction de bug) |
| `R-03` | Synchro iCal import/export | Kiki : vend sur plusieurs canaux sans double réservation | M | D1 | Délai de propagation, flux iCal non normalisés, job à surveiller |
| `R-04` | Tarifs et saisons éditables en base | Kiki : change un prix sans PR ni redéploiement | M | `B-01` | Historique des prix à conserver pour les séjours passés |
| `R-05` | Caution : politique claire (montant, restitution, délai) | Les deux : fin des discussions à l'arrivée | S | D2 | Juridique : la retenue doit être justifiée et documentée |
| `P-01` | Pages légales, CGV, politique de confidentialité | Kiki : conformité. Locataire : confiance | M | D2 | Rédaction à valider, contenu à maintenir |
| `P-02` | Acompte en ligne (Stripe Checkout via Edge Function) | Kiki : réservations sécurisées. Locataire : paiement simple | L | D3, `B-01` | PSP payant, webhooks, remboursements, 3DS, KYC Stripe |
| `P-03` | Contrat + règles de la maison générés et signés | Les deux : cadre clair, preuve en cas de litige | M | `P-01` | Valeur probante d'une signature tactile, texte à valider |
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

---

## 5. Ce qu'il ne faut pas faire (et pourquoi)

| Fausse bonne idée | Pourquoi |
|---|---|
| **Compte utilisateur locataire** (mot de passe, profil) | Un lien signé à durée limitée fait mieux : rien à retenir, rien à stocker, rien à réinitialiser. Un compte crée une base d'utilisateurs à protéger et à purger. |
| **Application mobile** | Le site est responsive et l'état des lieux se fait dans le navigateur. Une app coûte 2 stores, 2 mises à jour, 1 an de maintenance. |
| **Messagerie temps réel maison** | WhatsApp existe déjà, kiki l'utilise, et le locataire l'a sur son téléphone. Un fil maison ne sera pas consulté. Utile seulement si kiki veut garder une trace par réservation. |
| **Moteur de paiement maison / stockage de numéros de carte** | Interdit en pratique (PCI-DSS) et dangereux. Un PSP ou rien. |
| **Contrat rédigé par un agent** | Un contrat de location saisonnière est un acte juridique. Le modèle doit être validé par kiki (et idéalement un professionnel), pas généré par un LLM. |
| **Channel manager / PMS complet** (Beds24, Lodgify, Guesty) | 20 à 100 €/mois, interface à apprendre, pour un seul bien. Le back office actuel couvre déjà 80 % du besoin. |
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

---

## 6. À valider par kiki (avant mise en vente en ligne)

| Sujet | Question précise | Impact si non tranché |
|---|---|---|
| **Statut du meublé** | Classé ou non ? Numéro d'enregistrement ? | Taxe de séjour fausse, affichage non conforme |
| **Taxe de séjour** | Barème 2027 de Gruissan, exonérations, plafond de nuits | Le taux `1.15` actuel n'a aucune source dans le dépôt |
| **Assurance** | La multirisque couvre-t-elle l'accueil payant ? | Sinistre non couvert |
| **Fiscalité** | LMNP réel ou micro-BIC ? | Déclaration erronée |
| **Paiement** | Accepte-t-on Stripe (payant) malgré la règle « pas de service payant » ? | Pas de réservation en ligne possible |
| **Caution** | Montant, mode (empreinte / chèque / virement), délai de restitution | Litige à chaque départ |
| **Annulation** | Valider le barème de `content/annulation.json` (aujourd'hui `a_valider: true`) | CGV inapplicables |
| **RGPD** | Durée de conservation : combien de temps garder les états des lieux ? | Purge actuelle détruit la preuve au bout de quelques jours |
| **Mairie** | Déclaration, affichage du numéro, registre du logeur | Amende |
| **Domaine** | Acheter un domaine (10–15 €/an) avant d'encaisser des paiements ? | Un `github.io` inspire peu confiance pour payer |

---

## 7. Prochaines tâches suggérées (ordre de priorité)

Chaque tâche est détaillée dans son fichier thématique. Toutes respectent les
règles du dépôt : 4 langues, tests Vitest, `npm run verify` vert, PR vers `main`.

| # | Tâche | Fichier de détail |
|---|---|---|
| 1 | **Unifier le dossier de réservation** (`bookings` → `sejours`), avec migration des données existantes | `2026-11-backoffice-suivi.md` |
| 2 | **Afficher et traiter les demandes de réservation** dans `/admin/` | `2026-11-backoffice-suivi.md` |
| 3 | **Une seule source de vérité** : `/reserver/` vérifie `sejours` | `2026-11-reservation-disponibilites.md` |
| 4 | **Pages légales, CGV et politique de confidentialité** | `2026-11-paiement-contrat.md` |
| 5 | **Générer le lien locataire depuis `/admin/sejours/`** | `2026-11-guide-acces-temporaire.md` |
| 6 | **Conserver les états des lieux signés** hors purge | `2026-11-etat-des-lieux.md` |
| 7 | **Acompte en ligne** (si D3 = option 2) | `2026-11-paiement-contrat.md` |
| 8 | **Alerte de nouvelle demande** hors back office | `2026-11-backoffice-suivi.md` |

---

## 8. Index des fichiers

- [`2026-11-reservation-disponibilites.md`](./2026-11-reservation-disponibilites.md) — moteur de réservation, source de vérité, iCal, tarifs, caution, taxe de séjour.
- [`2026-11-paiement-contrat.md`](./2026-11-paiement-contrat.md) — Stripe, acompte et solde, empreinte de caution, contrat, signature, ce qu'il ne faut pas coder.
- [`2026-11-etat-des-lieux.md`](./2026-11-etat-des-lieux.md) — check-in/check-out autonome, photos, PDF, comparaison entrée/sortie, boîte à clés.
- [`2026-11-guide-acces-temporaire.md`](./2026-11-guide-acces-temporaire.md) — espace séjour, lien signé, expiration, code de secours, RGPD.
- [`2026-11-backoffice-suivi.md`](./2026-11-backoffice-suivi.md) — back office mono-bien, demandes, statuts, encaissé vs dû, statistiques.

# Paiement, contrat et signature

Sujet : encaisser de l'argent, encadrer le séjour par un contrat, et **ce qu'il
ne faut surtout pas coder soi-même**.

> Avertissement de méthode : ce fichier distingue explicitement ce qui est
> **vérifié** (dans le code du dépôt ou dans la documentation publique d'un
> prestataire) de ce qui est une **hypothèse à confirmer**. Les montants et
> délais cités sont des ordres de grandeur : ils doivent être revérifiés au
> moment de la mise en œuvre, tarifs et conditions changeant.

---

## 1. État réel

- **Aucun paiement n'existe.** `Reservation.astro` calcule un devis, affiche un
  total, puis écrit une ligne `bookings` avec `statut = 'demande'`. Rien
  n'encaisse, rien ne réserve financièrement.
- `content/tarifs.json` contient déjà `caution: 800` et
  `taxe_sejour_par_nuit_personne: 1.15`.
- `src/lib/pricing.ts` calcule séjour + options + taxe + caution ; le calcul est
  testé. **Il ne faut pas le réécrire**, seulement l'alimenter.
- `content/annulation.json` contient un barème **explicitement marqué
  `a_valider: true`** : il n'est pas contractuel aujourd'hui.
- Il n'existe **aucune page de mentions légales, CGV ou politique de
  confidentialité**. Le pied de page affiche le libellé `footer.legal` (4
  langues) mais **aucune page ne lui correspond** (vérifié : pas de
  `src/pages/legal.astro`).
- Le PDF d'état des lieux (`generate-pdf`) contient déjà un cadre de signature
  avec date (« Signé le ») : la signature tactile horodatée existe pour l'état
  des lieux, pas pour le contrat.

---

## 2. Décision D3 — quel niveau de paiement ?

| Niveau | Ce que ça donne | Ce que ça coûte | Effort |
|---|---|---|---|
| **0. Aucun paiement en ligne** | Demande → kiki confirme → virement de l'acompte sous 48 h → séjour bloqué | 0 € | S |
| **1. Acompte en ligne** | 30 % payés par carte à la réservation, solde par virement ou sur place | Frais PSP (~1,5 % + 0,25 € par transaction, ordre de grandeur à vérifier) | L |
| **2. Tout en ligne + caution** | Acompte, solde à J-30, empreinte de caution | PSP + prestataire de caution | L |

**Point bloquant à trancher par kiki** : `AGENTS.md` règle 3 interdit les
services externes payants. Un PSP est un service externe payant. Il faut soit
l'amender explicitement (avec la justification « seul moyen d'encaisser une
carte »), soit rester au niveau 0.

**Point bloquant juridique** : pour ouvrir un compte Stripe (ou tout PSP), il
faut une **entité juridique identifiée** (SIRET). Un particulier qui loue son
appartement en saisonnier exerce une activité professionnelle (loueur en meublé)
et doit être immatriculé. **À vérifier avec un comptable** : ce n'est pas un
détail administratif, c'est un prérequis technique à l'encaissement.

---

## 3. Architecture recommandée (si paiement)

Le site est **statique** sur GitHub Pages : il ne peut pas garder de secret ni
recevoir de webhook. Tout passe donc par Supabase.

```
Navigateur (page statique)
   │  1. POST /functions/v1/create-checkout  (dates + email + montant recalculé)
   ▼
Edge Function  ── 2. recalcule le prix côté serveur (jamais celui du client)
   │             3. crée une session Stripe Checkout
   ▼
Stripe Checkout (page hébergée par Stripe — aucune carte ne touche le site)
   │  4. redirection vers /reservation/merci/?session_id=…
   ▼
Webhook Stripe → Edge Function  ── 5. vérifie la signature, marque la réservation payée
```

Règles non négociables :

1. **Le montant n'est jamais celui envoyé par le navigateur.** L'Edge Function
   recalcule avec `pricing.ts` (ou son équivalent serveur) à partir des dates,
   des personnes et des options.
2. **Aucun numéro de carte ne transite par le site.** Stripe Checkout héberge le
   formulaire : le site reste hors périmètre PCI-DSS (SAQ A).
3. **Le webhook est la seule source de vérité du paiement.** Une redirection de
   navigateur peut être fermée, rejouée ou falsifiée. On ne marque « payé »
   qu'après vérification de la signature `Stripe-Signature` et de l'idempotence
   de l'événement.
4. **Clé secrète uniquement dans les secrets Edge Functions.** Jamais dans
   `PUBLIC_*`, jamais dans le dépôt (le scanner `security:check` échoue sinon —
   c'est voulu).
5. **Idempotence** : un même événement peut arriver plusieurs fois. La mise à
   jour doit être « si pas déjà payé, alors payer », pas un incrément.

---

## 4. L'empreinte de caution : la fausse bonne idée à cadrer

**Ce qui est vérifié** : Stripe permet une **autorisation sans capture**
(`capture_method: 'manual'`). L'autorisation n'est pas une garantie éternelle :
elle expire, et la durée dépend du type de carte et du secteur d'activité. Pour
l'hôtellerie, Stripe documente une possibilité d'extension, mais **une
autorisation de 800 € tenue du départ jusqu'à trois semaines après n'est pas
garantie**. À vérifier précisément auprès de Stripe avant de promettre quoi que
ce soit à kiki ou aux locataires.

**Conséquences pratiques** :

- Une empreinte qui expire avant la fin de la période d'inspection ne protège
  rien.
- Une capture partielle doit être justifiée (devis, photos, état des lieux).
- Un prestataire spécialisé (caution locative, empreinte longue durée) existe
  mais c'est un abonnement de plus.

**Recommandation pour un seul appartement** : ne pas construire d'empreinte
bancaire. Utiliser une **caution par chèque ou virement, restituée sous 7 jours
après l'état des lieux de sortie**, écrite dans le contrat. C'est moins moderne,
c'est juridiquement solide, et ça coûte zéro euro de prestataire. L'empreinte
n'a de sens qu'à partir d'un volume où la logistique du chèque devient pénible.

---

## 5. Le contrat : ce qu'il doit contenir, et ce qu'un agent ne doit pas écrire

### Contenu minimal d'un contrat de location saisonnière

- Identification des parties (bailleur, locataire), adresse du logement.
- Dates et heures d'arrivée et de départ, nombre de personnes (capacité max 4).
- Prix détaillé : nuits, options, taxe de séjour, caution, total.
- Modalités de paiement (acompte, solde, échéances) et de remboursement.
- **Conditions d'annulation** (le barème de `content/annulation.json` doit être
  validé avant d'être contractuel).
- Obligations du locataire : usage paisible, respect du règlement de la
  résidence (calme après 22 h, non-fumeur, animaux à convenir), capacité.
- Obligations du bailleur : logement en état, équipements listés, accès.
- Caution : montant, mode, délai de restitution, motifs de retenue.
- Assurance : le locataire doit être couvert en responsabilité civile.
- Litiges, droit applicable, médiation de la consommation (obligatoire pour un
  professionnel vendant à des consommateurs).
- **Annexes** : état des lieux d'entrée, règles de la maison, informations
  taxe de séjour.

### Ce qu'il ne faut pas faire

| Ne pas faire | Pourquoi |
|---|---|
| Faire rédiger le contrat par un LLM et le publier tel quel | Un contrat est un acte juridique. Un texte plausible mais faux engage kiki. Le modèle doit être validé par kiki (et idéalement relu par un professionnel). |
| Copier un contrat trouvé sur un autre site | Droit d'auteur, clauses inadaptées (piscine, animaux, caution), mentions légales manquantes. |
| Signer « électroniquement » avec une simple case à cocher | Une case cochée seule a une valeur probante faible. Ce qui compte : identité, horodatage, intégrité du document, consentement explicite. |
| Générer un PDF « signé » sans conserver l'original | Sans empreinte du document, on ne peut pas prouver que la signature porte sur ce texte-là. |

### Signature : ce qui est raisonnable ici

Trois niveaux, du plus faible au plus fort :

1. **Case « j'accepte les CGV » + horodatage serveur + adresse IP.**
   Suffisant pour des CGV. Effort S. C'est ce que fait déjà implicitement le
   formulaire de réservation.
2. **Signature tactile (canvas) + PDF horodaté + e-mail des deux parties.**
   Déjà implémenté pour l'état des lieux. Réutilisable pour le contrat. Valeur
   probante moyenne mais réelle (horodatage, envoi, conservation).
3. **Prestataire de signature électronique qualifiée (eIDAS).**
   Valeur probante forte, coût par document, dépendance externe. **Disproportionné**
   pour un appartement.

**Recommandation** : niveau 2, en réutilisant `attachTenantSignaturePad` et le
PDF existant. Ne pas ajouter de prestataire de signature.

---

## 6. User stories

| Id | User story | Valeur | Effort |
|---|---|---|---|
| `P-01` | En tant que locataire, je veux lire les CGV, les mentions légales et la politique de confidentialité **avant** de réserver, pour savoir à quoi je m'engage. | Confiance + conformité | M |
| `P-02` | En tant que kiki, je veux encaisser un acompte de 30 % à la réservation, pour que les dates soient réellement bloquées. | Réduction des annulations | L |
| `P-03` | En tant que kiki, je veux qu'un contrat reprenant les dates, le prix et les règles soit envoyé et signé, pour avoir une preuve en cas de litige. | Sécurité juridique | M |
| `P-04` | En tant que kiki, je veux suivre ce qui est encaissé et ce qui reste dû, par séjour. | Trésorerie | M |
| `P-05` | En tant que locataire, je veux recevoir une confirmation claire (montant payé, solde, échéance). | Évite les malentendus | S |

---

## 7. Risques

### Technique
- **Webhook non reçu** (panne, URL fausse, secret rotaté) : une réservation
  payée reste « en attente ». Prévoir un bouton « revérifier auprès de Stripe »
  dans l'admin, et un état intermédiaire visible (`paiement_en_attente`).
- **Double paiement** : deux clics sur « payer » créent deux sessions. Utiliser
  une clé d'idempotence par réservation.
- **Remboursement** : le barème d'annulation doit se traduire en un appel
  Stripe partiel. À tester en mode test avant la première vraie annulation.
- **3-D Secure** : obligatoire en Europe (DSP2). Stripe Checkout le gère, un
  formulaire maison non. Argument supplémentaire contre le paiement maison.
- **Secrets** : la clé secrète Stripe ne doit jamais atteindre le navigateur. Le
  scanner de sécurité ne détecte que les motifs connus : la vigilance humaine
  reste nécessaire.

### Juridique
- **SIRET requis** pour ouvrir un compte PSP. **À trancher par kiki.**
- **Médiation de la consommation** : un professionnel vendant à des
  consommateurs doit adhérer à un service de médiation et le mentionner dans ses
  CGV. **À vérifier.**
- **Droit de rétractation** : la location d'hébergement à une date déterminée
  est exclue du droit de rétractation de 14 jours (art. L221-28 du Code de la
  consommation), mais il faut le dire explicitement dans les CGV.
- **RGPD** : le paiement implique de transmettre des données à un
  sous-traitant (Stripe). Cela doit figurer dans la politique de
  confidentialité et, si kiki est un professionnel, dans un registre des
  traitements.
- **Facturation** : chaque séjour doit donner lieu à une facture (numérotée,
  mention de la taxe de séjour). Aujourd'hui le site produit un récapitulatif,
  pas une facture.

### Opérationnel
- **Un paiement en ligne crée une obligation de délai** : confirmation
  immédiate, réponse aux demandes de remboursement, gestion des litiges de
  carte. Kiki doit accepter ce rythme.
- **La taxe de séjour doit être collectée puis reversée** : ce n'est pas un
  revenu. Le suivi existe déjà (`/admin/taxe-sejour/`), il faudra l'adosser aux
  paiements réels.

---

## 8. Fausses bonnes idées

| Idée | Pourquoi non |
|---|---|
| Formulaire de carte maison (champs numéro/CVV) | PCI-DSS, interdit en pratique, dangereux. Aucune exception pour un « petit site ». |
| Stocker un IBAN pour prélèvement | Mandat SEPA à gérer, impayés, litiges. Plus lourd qu'un Checkout. |
| PayPal « entre proches » | Pas de protection vendeur, pas de facture, conditions d'utilisation non respectées pour une activité commerciale. |
| Caution encaissée puis remboursée « à la main » | Trésorerie immobilisée, oubli de remboursement, litige. Le chèque fait la même chose sans logiciel. |
| Prestataire de signature qualifiée eIDAS | 1 à 3 € par document et une intégration, pour un litige potentiel par an. |
| Contrat généré automatiquement à chaque demande | Un contrat n'a de valeur que signé. Générer un PDF non signé ne protège personne et inquiète le client. |

---

## 9. Prochaines tâches suggérées

### Tâche 1 — Pages légales, CGV et politique de confidentialité

**Objectif** : créer les pages manquantes (`/mentions-legales/`,
`/conditions-generales/`, `/confidentialite/`) dans les 4 langues, et les relier
au pied de page (le libellé existe déjà, le lien n'existe pas).

**Critères d'acceptation**
- [ ] Les 3 pages existent en fr/en/es/de et sont accessibles depuis le footer.
- [ ] Les CGV reprennent : prix, acompte, annulation (barème validé),
      caution, règles de la maison, médiation, droit applicable.
- [ ] La politique de confidentialité liste les données collectées, les
      destinataires (Supabase, Resend, PSP si activé), les durées de
      conservation et les droits.
- [ ] Aucune page n'est indexée comme contenu publicitaire trompeur : les
      mentions `a_valider` de `content/annulation.json` sont levées **après**
      validation de kiki.
- [ ] `npm run verify` vert, parité i18n stricte.

**Fichiers concernés** : `src/pages/legal/*.astro` (ou 3 pages),
`src/i18n.ts` (ou `src/i18n/legal.ts`), `src/layouts/Layout.astro` (footer),
`content/` pour les textes éditables.

---

### Tâche 2 — Case d'acceptation des CGV à la réservation

**Objectif** : avant l'envoi de la demande, le client doit cocher « j'ai lu et
j'accepte les conditions générales », avec horodatage conservé.

**Critères d'acceptation**
- [ ] La case est obligatoire ; le formulaire ne s'envoie pas sans elle.
- [ ] L'horodatage et la version des CGV acceptée sont enregistrés avec la
      demande.
- [ ] Le lien vers les CGV s'ouvre dans un nouvel onglet, sans perdre la saisie.
- [ ] Textes dans les 4 langues, accessible au clavier (label associé).
- [ ] Tests sur la validation du formulaire.

**Fichiers concernés** : `src/components/Reservation.astro`,
`src/i18n/booking.ts`, migration ajoutant `cgv_version` / `cgv_accepte_le`.

---

### Tâche 3 — Acompte en ligne via Stripe Checkout (si D3 = niveau 1)

**Objectif** : encaisser 30 % à la réservation via une page Stripe hébergée,
avec un webhook qui marque la réservation payée.

**Critères d'acceptation**
- [ ] Le montant est **recalculé côté serveur**, jamais repris du navigateur.
- [ ] Aucune donnée de carte ne transite par le site (Checkout hébergé).
- [ ] Le webhook vérifie la signature et est idempotent (rejeu sans double
      comptage).
- [ ] Une réservation payée passe à l'état « acompte reçu » et bloque le
      calendrier.
- [ ] Un paiement échoué ou abandonné laisse la demande en attente, sans
      bloquer les dates indéfiniment (expiration).
- [ ] Bouton « revérifier le paiement » dans l'admin pour les webhooks manqués.
- [ ] Clé secrète uniquement en secret Edge Function ; `security:check` vert.
- [ ] Tests : recalcul du montant, idempotence, signature invalide rejetée.

**Fichiers concernés** : `supabase/functions/create-checkout/` (nouveau),
`supabase/functions/stripe-webhook/` (nouveau), `src/pages/reserver.astro`,
migration (colonnes de paiement sur le dossier de réservation),
`docs/paiement-setup.md` (nouveau).

---

### Tâche 4 — Contrat de location généré et signé

**Objectif** : produire un PDF de contrat à partir du dossier de réservation
(dates, prix, règles), le faire signer au locataire et l'archiver.

**Critères d'acceptation**
- [ ] Le PDF reprend exactement les données du séjour (aucune valeur inventée).
- [ ] Le texte du contrat vient d'un fichier éditable (`content/contrat.json`),
      pas du code.
- [ ] La signature tactile réutilise `attachTenantSignaturePad` ; le PDF
      mentionne la date et l'heure de signature.
- [ ] Le contrat signé est envoyé au locataire et à kiki, et conservé.
- [ ] Le modèle est marqué `a_valider: true` tant que kiki ne l'a pas confirmé.
- [ ] Tests : génération avec données manquantes (prix absent → pas de PDF
      silencieux), dates inversées refusées.

**Fichiers concernés** : `supabase/functions/generate-pdf/` (extension ou
fonction dédiée), `content/contrat.json` (nouveau), `src/pages/tenant/index.astro`,
`src/i18n.ts`.

---

### Tâche 5 — Suivi encaissé / dû par séjour

**Objectif** : afficher, pour chaque séjour, le montant total, l'acompte reçu,
le solde attendu et la date d'échéance.

**Critères d'acceptation**
- [ ] Le calcul ne dépend que des paiements réellement enregistrés (pas d'un
      statut supposé).
- [ ] Un séjour sans prix reste visible et signalé « prix non renseigné »
      (comportement déjà retenu dans `revenus.ts`, à conserver).
- [ ] Les totaux sont exportables en CSV (mêmes précautions d'injection de
      formules que `revenus.ts`).
- [ ] Tests : acompte partiel, solde nul, séjour annulé, remboursement.

**Fichiers concernés** : `src/lib/revenus.ts` ou nouveau `src/lib/paiements.ts`,
`src/pages/admin/revenus.astro`, `src/i18n/admin.ts`, tests dédiés.

---

### Tâche 6 — Facture de séjour

**Objectif** : produire une facture numérotée par séjour (mention de la taxe de
séjour séparément), téléchargeable par kiki et le locataire.

**Critères d'acceptation**
- [ ] Numérotation séquentielle, sans trou ni doublon.
- [ ] La taxe de séjour est une ligne distincte, non soumise à la TVA.
- [ ] Les mentions légales obligatoires sont présentes (identité, SIRET,
      dates, détail).
- [ ] Le format respecte les règles de conservation comptable.
- [ ] Tests : numérotation, ventilation de la taxe, séjour à cheval sur deux
      années.

**Fichiers concernés** : `supabase/functions/generate-pdf/`, `src/lib/taxe-sejour.ts`,
migration (compteur de factures), `docs/conformite.md`.

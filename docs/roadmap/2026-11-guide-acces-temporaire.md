# Guide d'accueil et accès temporaire

Sujet : donner au locataire, **et à lui seul**, les informations du séjour
(Wi-Fi, codes, consignes, urgences) pendant une fenêtre de temps limitée, sans
créer de compte.

> **Rappel DA-1** : le site est seule source de vérité en V1. L'espace locataire
> ne doit donc **pas** afficher de numéro de réservation Airbnb/Booking ni
> dépendre d'une plateforme. Il est entièrement autonome.

> **Rappel DA-2** : le meublé est **non classé**. Le guide ne mentionne aucun
> classement. En revanche, il peut rappeler le numéro d'enregistrement mairie
> pour rassurer le locataire (information factuelle, déjà publique sur le site).

---

## 1. État réel

| Brique | État | Détail |
|---|---|---|
| Guide public `/guide/` | ✅ | Lit `guide_sections` avec `actif = true` **et** `visibilite = 'public'` (`migrations/0010`) |
| Sections réservées locataire | ⚠️ partiel | La colonne `visibilite = 'tenant'` existe, mais l'espace locataire lit **toutes** les sections actives, sans filtre de visibilité (`src/pages/tenant/index.astro`, `loadGuide`) |
| Jeton temporaire | ✅ | `tenant_sessions.token`, 32 octets hex, expiration en base |
| Un seul lien par réservation | ✅ | index unique (0009) |
| Expiration vérifiée | ✅ | policy `tenant_read_own_session` avec `expires_at > now()` |
| Jeton retiré de l'URL | ✅ | après mémorisation côté client |
| `noindex, nofollow, no-referrer` | ✅ | dans `src/pages/tenant/index.astro` |
| Guide accessible sans jeton | ⚠️ | voir §3, point 2 |
| Compte utilisateur | ✅ absent (et c'est bien) | — |

### Les trois défauts

1. **La visibilité `tenant` n'est pas appliquée dans l'espace locataire.**
   `loadGuide()` fait `.eq('actif', true)` sans filtrer sur `visibilite`. Une
   section marquée « locataire » dans l'admin s'affiche donc aussi… dans
   l'espace locataire, ce qui est l'intention — mais **rien ne garantit qu'elle
   ne fuite pas ailleurs**. Surtout : la policy `public_read_guide` filtre bien
   `visibilite = 'public'` côté API anon, donc la sécurité tient **par la RLS**,
   pas par le code. C'est fragile : une requête oubliée suffirait.
2. **Le guide est lisible par la clé anon.** La policy `public_read_guide`
   autorise `anon` à lire toutes les sections `public`. C'est voulu pour
   `/guide/`. Mais l'espace locataire utilise la **même clé anon** : si une
   section `tenant` était un jour lisible par `anon`, elle serait exposée.
   Aujourd'hui la RLS l'empêche — mais aucune section `tenant` n'existe encore,
   donc **le cas n'a jamais été testé en conditions réelles**.
3. **Le guide n'est pas lié à la réservation dans son contenu.** Toutes les
   réservations voient le même guide. Or certaines informations sont
   spécifiques : heure d'arrivée convenue, code de la boîte à clés, nombre de
   personnes, options achetées.

---

## 2. Décision d'architecture : lien signé, pas de compte

Le choix du dépôt est le bon : **un jeton opaque en base, à durée limitée, sans
compte**. Ne pas changer.

| Approche | Avantages | Inconvénients | Verdict |
|---|---|---|---|
| **Jeton en base** (actuel) | Révocable, un seul actif, pas de secret à gérer, expiration vérifiée en SQL | Nécessite une requête en base à chaque accès | ✅ à garder |
| JWT signé (stateless) | Pas de requête en base | **Non révocable** avant expiration ; un lien transféré reste valide | ❌ |
| Compte + mot de passe | Familier | Base d'utilisateurs à protéger, mots de passe à réinitialiser, RGPD plus lourd | ❌ |
| Magic link par e-mail | Pas de mot de passe | Dépend de l'e-mail du locataire, ajoute un flux d'auth complet | ❌ (déjà couvert par le jeton) |

**Point clé** : le jeton actuel est **révocable** (on supprime la ligne). C'est
ce qui permet de couper l'accès immédiatement en cas de problème. Un JWT ne le
permet pas. C'est un argument décisif pour garder le modèle actuel.

---

## 3. Fenêtre d'accès : quelle durée ?

Aujourd'hui : expiration au **lendemain du départ, 12 h, heure de Paris**
(`docs/tenant-checkin-setup.md` §3). La demande de kiki parle de « J-1 → J+1 ».

**Recommandation** : `arrivée − 1 jour` → `départ + 1 jour à 12 h`. Justification :

| Moment | Besoin | Fenêtre |
|---|---|---|
| J-1 | Le locataire prépare son arrivée (code, adresse, parking) | ouverture |
| Jour J | Check-in, photos d'entrée | ✅ |
| Séjour | Guide (Wi-Fi, électroménager, urgences) | ✅ |
| Jour du départ | Check-out, photos de sortie | ✅ |
| J+1 matin | Oubli d'une photo, besoin de vérifier une consigne | ✅ |
| J+2 | Plus aucun besoin légitime | fermeture |

**Ne pas ouvrir plus tôt** : un lien envoyé trois semaines avant l'arrivée
circule, se transfère, et donne les codes d'accès à quelqu'un qui n'est pas
encore sur place. **Ne pas laisser ouvert plus longtemps** : chaque jour
supplémentaire est un jour où un ancien locataire peut entrer dans le logement
s'il garde le code.

**Attention** : le jeton donne accès au guide **et** à l'état des lieux. Si
l'accès se ferme à J+1 12 h, un litige déclaré à J+5 ne peut plus être
documenté par le locataire. C'est acceptable (kiki a le PDF), mais il faut le
savoir : **le PDF conservé est la seule preuve après expiration.**

---

## 4. RGPD : ce qu'il faut écrire et faire

| Question | Réponse recommandée | À valider |
|---|---|---|
| Base légale | Exécution du contrat de location | — |
| Données collectées | Nom, e-mail, téléphone, dates, nombre de personnes, photos des pièces, signature | — |
| Finalité | Gestion du séjour, état des lieux, preuve en cas de litige | — |
| Destinataires | Kiki, Supabase (hébergement), Resend (e-mail) | Sous-traitants à lister |
| Transfert hors UE | Supabase et Resend peuvent héberger hors UE → clause contractuelle | **À vérifier** |
| Durée — photos brutes | 30 jours après le départ (ou jusqu'à résolution d'un litige) | **À valider** |
| Durée — PDF signé | 5 ans (prescription contractuelle) | **À valider** |
| Durée — jeton | Supprimé à l'expiration | — |
| Droits | Accès, rectification, effacement, opposition → adresse de contact | À publier |
| Information | Page `/confidentialite/` + phrase dans le lien locataire | À créer |

**Aujourd'hui** : la purge supprime tout (photos, PDF, sessions) après
expiration. C'est **conforme au principe de minimisation**, mais **incompatible
avec la finalité de preuve**. Il faut trancher : soit on assume de ne garder
aucune preuve (et l'état des lieux ne sert qu'à rassurer), soit on conserve le
PDF et on l'écrit dans la politique de confidentialité. Voir
`2026-11-etat-des-lieux.md`, tâche 2.

---

## 5. Le code de secours : un vrai besoin, un vrai piège

Le locataire arrive à 23 h, le code de la boîte à clés ne fonctionne pas, le
téléphone de kiki est éteint. C'est l'incident le plus fréquent en location
saisonnière, et le plus coûteux en réputation.

**Ce qu'il faut** :
- Un numéro à appeler, affiché dans l'espace locataire **et** envoyé par
  e-mail avant l'arrivée.
- Un code de secours (autre boîte, voisin de confiance, agence) **dans une
  section `tenant`**, jamais dans le guide public.
- Une procédure écrite : qui appeler, à quelle heure, quoi faire en attendant.

**Le piège** : mettre le code de secours dans `content/guide.json` (repli
statique). Ce fichier est **public** (il est embarqué dans le site). Un code
d'accès y serait lisible par n'importe qui. **Toute information sensible doit
vivre en base, dans une section `visibilite = 'tenant'`, et n'être lue que par
une session locataire valide.**

---

## 6. User stories

| Id | User story | Valeur | Effort |
|---|---|---|---|
| `G-02` | En tant que kiki, je veux publier les codes d'accès dans le guide **sans qu'ils soient visibles du public**, pour arrêter de les envoyer à la main. | Sécurité + temps | M |
| `G-03` | En tant que locataire, je veux un code de secours et un numéro à appeler si le code principal ne marche pas. | N'est jamais bloqué dehors | S |
| `G-04` | En tant que locataire, je veux voir le guide **avant** d'arriver (J-1), pour préparer mon trajet. | Sérénité | S |
| `G-05` | En tant que kiki, je veux que l'accès se ferme tout seul après le séjour, sans rien faire. | Sécurité, zéro maintenance | ✅ fait |
| `G-06` | En tant que kiki, je veux couper l'accès immédiatement si un lien a fuité. | Contrôle | ✅ fait (supprimer la session) |

---

## 7. Risques

### Technique
- **La RLS est la seule barrière pour les sections `tenant`.** Le code de
  l'espace locataire ne filtre pas sur `visibilite`. Si une section `tenant`
  existe un jour, il faut **ajouter le filtre côté code aussi** (défense en
  profondeur), et un test qui vérifie qu'une section `tenant` n'apparaît pas
  dans le HTML de `/guide/`.
- **Le HTML du guide est injecté** (`safeGuideFragment` filtre les balises,
  vérifié). Ne pas contourner ce filtre pour « aller plus vite ».
- **Jeton dans l'historique du navigateur** : la page le retire de l'URL, mais
  il reste dans l'historique de la requête précédente. `no-referrer` limite la
  fuite. Ne pas ajouter de lien sortant depuis la page locataire.
- **E-mail avec le lien** : le lien transite par Resend. Si l'e-mail est
  transféré, le destinataire obtient l'accès. C'est inhérent ; la durée limitée
  et la révocation sont les contre-mesures.

### Juridique
- **Information du locataire** : il doit savoir que ses photos et sa signature
  sont conservées, et pour combien de temps. Une phrase au moment de la
  signature, pas seulement dans une politique de confidentialité à 3 clics.
- **Consentement** : la base légale est le contrat, pas le consentement. Ne pas
  demander une case « j'accepte d'être photographié » qui n'aurait pas de sens
  (ce sont les murs, pas la personne).
- **Hébergement hors UE** : Supabase et Resend sont des sous-traitants. Si kiki
  est un professionnel, il doit les mentionner dans son registre et vérifier les
  clauses contractuelles types.
- **Droit d'accès** : si un locataire demande une copie de ses données, il faut
  pouvoir la fournir. Le PDF signé est déjà cette copie.

### Opérationnel
- **Un locataire qui partage le lien avec un ami** : c'est le risque principal.
  La révocation manuelle et la durée limitée sont les seules réponses ; un
  « code à usage unique » serait plus sûr mais plus fragile (une erreur de
  saisie = accès perdu).
- **Un locataire qui n'a pas d'e-mail** : le lien doit pouvoir être transmis par
  SMS ou WhatsApp. Prévoir un bouton « copier le lien » dans l'admin.
- **Un changement de code Wi-Fi pendant la saison** : le guide est éditable en
  base, c'est prévu. Ne pas remettre les codes dans `content/guide.json`.

---

## 8. Fausses bonnes idées

| Idée | Pourquoi non |
|---|---|
| Compte utilisateur avec mot de passe | Base d'utilisateurs à protéger, mots de passe oubliés, support. Le jeton fait mieux pour une semaine de séjour. |
| JWT signé sans stockage | Non révocable. Un lien qui fuit reste valide jusqu'à expiration, sans recours. |
| Lien permanent par appartement | Tous les anciens locataires gardent l'accès aux codes. Dangereux. |
| Guide en PDF envoyé par e-mail | Obsolète dès qu'un code change, et le PDF circule. Une page à jour est meilleure. |
| Application mobile pour le guide | Le site suffit. Une app pour lire 8 sections est surdimensionnée. |
| QR code affiché dans l'appartement | Utile **en complément** (accès au guide sans taper d'URL), mais il ne doit pas donner l'accès aux codes sans jeton. Un QR code qui pointe vers `/guide/` public est acceptable ; un QR vers un lien permanent ne l'est pas. |

---

## 9. Prochaines tâches suggérées

### Tâche 1 — Appliquer la visibilité `tenant` dans l'espace locataire

**Objectif** : filtrer explicitement les sections par visibilité dans le code de
l'espace locataire, et garantir par un test qu'une section `tenant` ne fuit
jamais dans `/guide/`.

**Critères d'acceptation**
- [ ] L'espace locataire lit `visibilite` et n'affiche que `public` + `tenant`.
- [ ] Un test vérifie que le HTML de `/guide/` ne contient aucune section
      `tenant`.
- [ ] Le repli `content/guide.json` ne contient aucune information sensible
      (vérifié par un test ou une revue).
- [ ] Textes dans les 4 langues, `npm run verify` vert.

**Fichiers concernés** : `src/pages/tenant/index.astro`,
`src/components/Guide.astro`, `src/lib/supabase.ts`, tests dédiés.

---

### Tâche 2 — Fenêtre d'accès J-1 → J+1 et message d'expiration clair

**Objectif** : calculer l'ouverture à `arrivée − 1 jour` et la fermeture à
`départ + 1 jour 12 h (Europe/Paris)`, avec un message explicite quand le lien
est expiré.

**Critères d'acceptation**
- [ ] Le calcul est une fonction pure, testée (y compris changement d'heure).
- [ ] Un lien consulté avant l'ouverture affiche « disponible à partir du … »,
      pas « expiré ».
- [ ] Un lien expiré affiche un message avec un contact.
- [ ] La RLS vérifie aussi la borne basse (pas seulement `expires_at`).
- [ ] Textes dans les 4 langues.

**Fichiers concernés** : `src/lib/tenant.ts` (ou nouveau `src/lib/acces.ts`),
migration (colonne `opens_at`), `src/pages/tenant/index.astro`,
`src/i18n.ts`, tests.

---

### Tâche 3 — Guide spécifique au séjour (heure d'arrivée, options, personnes)

**Objectif** : afficher dans l'espace locataire les informations propres à la
réservation (heure d'arrivée convenue, options achetées, nombre de personnes),
en plus du guide commun.

**Critères d'acceptation**
- [ ] Les valeurs viennent du dossier de réservation, jamais d'une valeur par
      défaut inventée.
- [ ] Si une information manque, elle n'est pas affichée (pas de « 16 h » par
      défaut).
- [ ] Aucune donnée d'une autre réservation ne peut être lue (test RLS).
- [ ] Textes dans les 4 langues.

**Fichiers concernés** : `src/pages/tenant/index.astro`,
`supabase/functions/_shared/tenant.ts`, `src/i18n.ts`.

---

### Tâche 4 — Section « code de secours » réservée au locataire

**Objectif** : créer une section de guide `visibilite = 'tenant'` contenant le
code de secours et la procédure d'urgence, et vérifier qu'elle n'est jamais
publique.

**Critères d'acceptation**
- [ ] La section est créée via l'admin (pas en dur), avec `visibilite = tenant`.
- [ ] Un test vérifie qu'elle est absente du HTML public.
- [ ] La procédure indique qui appeler, à quelle heure, et quoi faire en
      attendant.
- [ ] Textes dans les 4 langues.

**Fichiers concernés** : `content/guide.json` (structure seulement, sans
secret), `src/pages/admin/guide.astro`, `src/pages/tenant/index.astro`, tests.

---

### Tâche 5 — Bouton « copier le lien » et envoi par e-mail depuis l'admin

**Objectif** : après création du lien (voir `2026-11-etat-des-lieux.md`,
tâche 1), permettre de le copier ou de l'envoyer par e-mail au locataire.

**Critères d'acceptation**
- [ ] Le lien complet est affiché une seule fois, avec un bouton « copier ».
- [ ] L'envoi par e-mail utilise la fonction `send-email` existante.
- [ ] Le jeton n'est jamais réaffiché après rechargement de la page.
- [ ] Un échec d'envoi laisse le lien valide et affiche une erreur claire.
- [ ] Textes dans les 4 langues.

**Fichiers concernés** : `src/pages/admin/sejours.astro`,
`supabase/functions/send-email/index.ts`, `src/i18n/admin.ts`.

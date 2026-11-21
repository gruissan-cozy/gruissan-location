# État des lieux et check-in / check-out autonome

Sujet : faire entrer et sortir un locataire sans être sur place, avec une preuve
photographique horodatée.

> **Bonne nouvelle** : c'est la brique la plus avancée du dépôt. Le code
> existe, il est testé, il fonctionne. Les problèmes sont ailleurs : le lien est
> impossible à générer depuis l'admin, et la purge détruit la preuve.

---

## 1. État réel (vérifié dans le code)

| Brique | État | Fichier |
|---|---|---|
| Page locataire (check-in / check-out) | ✅ | `src/pages/tenant/index.astro` |
| Checklist par pièce (6 pièces : séjour, cuisine, chambre, mezzanine, salle de bain, entrée) | ✅ | `src/lib/tenant.ts`, `TENANT_ROOMS` |
| Règle « OK ou problème décrit » obligatoire par pièce | ✅ testée | `missingTenantAssessments` |
| Au moins 1 photo par pièce, max 2 | ✅ testée | `missingTenantPhotos` |
| Compression image côté navigateur (JPEG 0,68) | ✅ | `compressImage` |
| Upload via Edge Function service-role (le navigateur n'écrit pas dans Storage) | ✅ | `supabase/functions/tenant-upload/` |
| Contrainte SQL sur le chemin, la pièce, le MIME et la taille (1,5 Mo) | ✅ | `migrations/0009_tenant_automation.sql` |
| Signature tactile | ✅ | `attachTenantSignaturePad` |
| PDF d'état des lieux (4 langues) avec photos et signature | ✅ | `supabase/functions/generate-pdf/` |
| Envoi e-mail locataire + propriétaire via Resend | ✅ | `supabase/functions/send-email/` |
| Lien à durée limitée (jeton 32 octets, expiration au lendemain du départ) | ✅ | `tenant_sessions` |
| Un seul lien actif par réservation | ✅ | index unique `tenant_sessions_reservation_uidx` |
| Expiration vérifiée à chaque lecture | ✅ | policy `tenant_read_own_session` (0009) |
| Purge quotidienne (03:15 UTC) | ✅ | `pg_cron` + `purge-tenant-data` |
| **Génération du lien depuis l'admin** | ❌ **SQL manuel** | `docs/tenant-checkin-setup.md` §3 |
| **Conservation de la preuve après purge** | ❌ **tout est supprimé** | `purge-tenant-data` |
| **Comparaison entrée / sortie** | ❌ | — |
| **Boîte à clés** | ❌ | — |

### Les deux défauts à corriger en priorité

1. **Le lien ne peut pas être créé depuis le back office.** Il faut ouvrir le
   SQL Editor de Supabase et exécuter une requête en remplaçant un UUID à la
   main. Kiki ne fera pas ça. Pire : la requête cible `bookings` au statut
   `confirmee`, alors que le back office travaille sur `sejours` (`confirme`) —
   une réservation venue d'Airbnb ou du téléphone n'a aucune ligne `bookings`.
2. **La purge détruit la preuve.** `purge-tenant-data` supprime photos,
   checklists, PDF et sessions des réservations expirées. Un état des lieux sert
   précisément à prouver un dégât **des semaines plus tard**. Le PDF signé doit
   survivre ; seules les photos brutes et les données personnelles doivent
   disparaître.

---

## 2. Ce qui est bien conçu et qu'il ne faut pas « améliorer »

- **Le navigateur n'écrit pas dans Storage.** Tout passe par une Edge Function
  en service-role, qui valide la session, le statut de la réservation, la pièce,
  le type MIME et la taille. C'est le bon modèle : ne pas revenir à un upload
  direct avec la clé anon.
- **Le jeton est retiré de la barre d'adresse** après mémorisation, et la page
  est en `noindex, nofollow` avec `referrer: no-referrer`.
- **Le PDF est régénéré côté serveur** : le client ne fournit pas de document
  déjà formé.
- **Les contraintes sont en base, pas seulement dans le code** : chemin imposé
  (`reservation_id/moment/…`), pièce dans une liste fermée, MIME limité. C'est
  de la défense en profondeur correcte.

---

## 3. User stories

| Id | User story | Valeur | Effort |
|---|---|---|---|
| `G-01` | En tant que kiki, je veux créer le lien d'état des lieux d'un séjour **depuis le back office, en un clic**, pour ne plus toucher au SQL. | Autonomie totale | M |
| `E-01` | En tant que locataire, je veux faire mon état des lieux d'entrée en 5 minutes sur mon téléphone, sans installer d'application ni créer de compte. | Expérience fluide | ✅ fait |
| `E-02` | En tant que kiki, je veux **conserver le PDF signé** même après la purge, pour pouvoir le produire en cas de litige. | Preuve juridique | S |
| `E-03` | En tant que kiki, je veux comparer l'entrée et la sortie pièce par pièce, pour repérer une dégradation en une minute. | Gain de temps à chaque départ | M |
| `E-04` | En tant que locataire, je veux un moyen d'entrer même si le code ne fonctionne pas. | N'est jamais bloqué dehors | S |
| `E-05` | En tant que kiki, je veux savoir quels états des lieux sont **manquants** (locataire qui n'a rien fait). | Suivi réel | S |

---

## 4. Risques

### Technique
- **Photos de mauvaise qualité** : la compression à 0,68 détruit parfois le
  détail d'une rayure. Ne pas baisser la qualité ; si besoin, monter la limite
  de taille, pas la compression.
- **Locataire sans réseau** dans l'appartement ou sur la plage : la page ne peut
  pas fonctionner hors ligne (site statique + appels Supabase). Prévoir un
  message clair et la possibilité de reprendre plus tard (les données sont
  sauvegardées au fil de l'eau, ce qui est déjà le cas pour la checklist).
- **Fuseau horaire** : l'expiration est calculée en `Europe/Paris` dans le
  script SQL de création. Toute génération automatique doit conserver ce fuseau,
  sinon le lien peut expirer une heure trop tôt ou trop tard.
- **Fuite de jeton** : un jeton dans un lien envoyé par e-mail peut être
  transféré. Il ne donne accès qu'à une réservation, mais il faut éviter de le
  journaliser (déjà le cas dans les logs Edge Functions).
- **Perte de session** : si le locataire change de navigateur, le jeton doit
  être ressaisi. Acceptable ; ne pas le rendre « permanent » via cookie long.

### Juridique
- **Valeur probante de l'état des lieux** : un état des lieux contradictoire
  (signé des deux parties) a plus de valeur qu'un état des lieux unilatéral.
  Ici le locataire signe seul, kiki reçoit le PDF. C'est utilisable comme
  preuve, mais **moins fort** qu'un constat contradictoire. À dire clairement
  dans le contrat.
- **Photos = données personnelles ?** Les photos de pièces sans personne ne
  sont pas des données personnelles, mais elles peuvent le devenir (un
  document, un effet personnel visible). La politique de confidentialité doit
  mentionner le traitement, la finalité (preuve) et la durée.
- **Durée de conservation** : la preuve doit survivre au litige. La prescription
  contractuelle est de 5 ans (droit commun). **À faire valider par kiki** : on
  conserve le PDF 5 ans, les photos brutes 30 jours après le départ (ou plus si
  litige déclaré).
- **Effets personnels photographiés** : le locataire doit être informé que des
  photos sont prises et conservées. Une phrase dans le lien et dans le contrat.

### Opérationnel
- **Un locataire qui refuse de faire l'état des lieux** : sans sanction prévue,
  il ne le fera pas. La caution est le seul levier. À écrire dans le contrat.
- **Un locataire qui photographie mal** (pièce sombre, cadrage partiel) : le
  PDF est inutilisable. Une courte consigne par pièce (« photographiez le sol et
  les murs ») améliorerait beaucoup le résultat, pour un effort minime.
- **Le ménage doit avoir lieu entre deux séjours** : l'état des lieux de sortie
  doit être fait **avant** le ménage, sinon les traces disparaissent. C'est une
  contrainte d'organisation, pas de code.

---

## 5. Fausses bonnes idées

| Idée | Pourquoi non |
|---|---|
| **Boîte à clés connectée** (150–300 €) | Batterie, panne, locataire bloqué dehors, dépendance à une app. Une boîte mécanique à code + code de secours couvre 95 % des cas pour 30 €. |
| **Reconnaissance d'image automatique** des dégradations | Coûteux, faux positifs, aucune valeur probante. Une comparaison côte à côte suffit. |
| **Vidéo d'état des lieux** | Lourd à envoyer, difficile à archiver, difficile à consulter. Les photos par pièce sont plus exploitables. |
| **Faire signer kiki aussi** | Il n'est pas sur place. Un état des lieux unilatéral horodaté + envoi immédiat par e-mail est ce qui se fait couramment. |
| **Supprimer la purge** | Non : les données personnelles ne doivent pas être conservées indéfiniment. Il faut **conserver le PDF** et purger le reste. |
| **Un « score » de propreté** | Subjectif, source de litige. |

---

## 6. Prochaines tâches suggérées

### Tâche 1 — Générer le lien locataire depuis le back office

**Objectif** : depuis `/admin/sejours/`, un bouton « Créer le lien locataire »
génère un jeton, l'affiche une seule fois, et permet de l'envoyer par e-mail au
locataire.

**Critères d'acceptation**
- [ ] Le jeton est généré côté serveur (`gen_random_bytes`), jamais dans le
      navigateur.
- [ ] L'expiration est fixée au lendemain du départ à 12 h, heure de Paris.
- [ ] Un seul lien actif par séjour ; un bouton « révoquer » puis « recréer »
      remplace l'ancien.
- [ ] Le jeton n'apparaît dans aucun log ni aucune liste après la création.
- [ ] Fonctionne pour un séjour saisi à la main (sans ligne `bookings`).
- [ ] Tests : création, révocation, recréation, séjour non confirmé refusé.

**Fichiers concernés** : `src/pages/admin/sejours.astro`,
`supabase/functions/tenant-link/` (nouveau) ou Edge Function existante,
`src/lib/tenant.ts`, `src/i18n/admin.ts`, `docs/tenant-checkin-setup.md`.

---

### Tâche 2 — Conserver les états des lieux signés après la purge

**Objectif** : la purge supprime les photos brutes et les données personnelles,
mais **conserve le PDF signé** (et ses métadonnées) pendant la durée légale.

**Critères d'acceptation**
- [ ] Le PDF signé est copié dans un emplacement non purgé avant suppression.
- [ ] Seules les photos brutes, checklists et sessions sont supprimées.
- [ ] Le PDF conservé ne contient pas plus de données personnelles que
      nécessaire (nom, dates, signature) et sa durée est documentée.
- [ ] La purge reste idempotente et journalise ce qu'elle a conservé/supprimé.
- [ ] Tests : purge d'une session expirée → PDF conservé, photos supprimées.

**Fichiers concernés** : `supabase/functions/purge-tenant-data/index.ts`,
`supabase/functions/generate-pdf/index.ts`, migration (table d'archive),
`docs/tenant-checkin-setup.md`, `docs/conformite.md`.

---

### Tâche 3 — Signaler les états des lieux manquants

**Objectif** : dans le back office, voir d'un coup d'œil les séjours dont
l'état des lieux d'entrée ou de sortie n'a pas été fait.

**Critères d'acceptation**
- [ ] Une colonne ou un badge indique « entrée manquante » / « sortie
      manquante » par séjour.
- [ ] Un séjour terminé sans état des lieux de sortie est signalé en évidence.
- [ ] Le calcul est une fonction pure, testée.
- [ ] Textes dans les 4 langues.

**Fichiers concernés** : `src/lib/tenant.ts` (nouvelle fonction pure),
`src/pages/admin/sejours.astro`, `src/i18n/admin.ts`, tests dédiés.

---

### Tâche 4 — Comparaison entrée / sortie par pièce

**Objectif** : afficher côte à côte les photos et l'état déclaré à l'entrée et à
la sortie, pièce par pièce, avec les écarts mis en évidence.

**Critères d'acceptation**
- [ ] Une pièce « OK à l'entrée, problème à la sortie » est signalée.
- [ ] Les photos sont affichées par URL signée (jamais publique).
- [ ] L'écart est calculé côté serveur ou par une fonction pure testée, pas
      laissé à l'interprétation de l'interface seule.
- [ ] Fonctionne quand l'entrée manque (message explicite, pas d'erreur).
- [ ] Textes dans les 4 langues.

**Fichiers concernés** : `src/lib/tenant.ts`, `src/pages/admin/sejours.astro`
ou page dédiée, `supabase/functions/tenant-upload/` (signature d'URL),
`src/i18n/admin.ts`.

---

### Tâche 5 — Consignes de prise de vue par pièce

**Objectif** : améliorer la qualité des photos avec une phrase de consigne par
pièce (« cadrez le sol et les murs », « allumez la lumière »).

**Critères d'acceptation**
- [ ] Chaque pièce a une consigne courte, dans les 4 langues.
- [ ] La consigne s'affiche avant l'ouverture de l'appareil photo.
- [ ] Aucune consigne ne bloque la validation (c'est un conseil, pas une règle).
- [ ] `npm run verify` vert.

**Fichiers concernés** : `src/i18n.ts` (clés `tenant.hint.*`),
`src/pages/tenant/index.astro`, `src/lib/tenant.ts` si les libellés y sont
centralisés.

---

### Tâche 6 — Code de secours d'accès (voir aussi guide)

**Objectif** : prévoir un moyen d'entrer si le code principal ne fonctionne
pas, sans exposer ce code sur le guide public.

**Critères d'acceptation**
- [ ] Le code de secours vit dans une section de guide `visibilite = 'tenant'`.
- [ ] Il n'apparaît jamais dans le HTML public (vérifié par un test).
- [ ] La procédure est écrite : qui appeler, à quel numéro, à quelle heure.
- [ ] Textes dans les 4 langues.

**Fichiers concernés** : `src/components/Guide.astro` (filtre déjà en place),
`src/pages/tenant/index.astro`, `content/guide.json` ou `guide_sections`.

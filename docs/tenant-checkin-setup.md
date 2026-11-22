# Mise en service de l’espace locataire

Le code du chantier 10 doit être livré avec `0007_tenant_checkin.sql`,
`0008_pdf_reports.sql` puis `0009_tenant_automation.sql`. Ces migrations ne sont
pas exécutées par le dépôt ou par GitHub Pages : elles doivent être appliquées
manuellement dans le SQL Editor Supabase, dans cet ordre.

## 0. Ordre de mise en service de la migration 0011 (à lire en premier)

`0011_unifier_bookings_sejours.sql` fusionne `bookings` dans `sejours`. Le
déploiement GitHub Pages est **automatique au merge sur `main`** : si l’ordre
n’est pas respecté, des demandes sont perdues silencieusement. Séquence
obligatoire :

1. **Appliquer `0011`** dans le SQL Editor Supabase (colonne `origine`,
   `adultes`, `mineurs`, `prix_estime`, politique `public_insert_sejours`…).
2. **Déployer les quatre Edge Functions** (§1.3 ci-dessous) : elles lisent
   désormais `sejours` et les statuts `confirme` / `termine`.
3. **Merger la branche sur `main`** — c’est ce merge qui publie le formulaire
   public écrivant dans `sejours`.

Entre le merge et l’exécution de `0011`, le formulaire `/reserver/` échoue : il
envoie des colonnes qui n’existent pas encore et la politique d’insertion
publique n’est pas créée. La demande retombe sur le message d’erreur générique
(`booking.error`) et **n’est pas enregistrée**. Ne jamais merger avant d’avoir
appliqué la migration et déployé les fonctions.

## 1. Préparer Supabase

1. Dans **Storage**, créer le bucket `etats-des-lieux` en mode **privé**.
2. Limiter les types MIME aux `image/jpeg`, `image/png` et `application/pdf`.
   La page compresse les images avant envoi ; la fonction refuse plus de 1,5 Mo
   par photo et limite à deux photos par pièce et par étape.
3. Après les migrations, déployer les quatre Edge Functions avec la CLI
   Supabase, en utilisant le bon projet :

   ```sh
   supabase functions deploy tenant-upload --project-ref ykvieyeftewvxjralcym
   supabase functions deploy generate-pdf --project-ref ykvieyeftewvxjralcym
   supabase functions deploy send-email --project-ref ykvieyeftewvxjralcym
   supabase functions deploy purge-tenant-data --project-ref ykvieyeftewvxjralcym
   ```

   `supabase/config.toml` conserve la vérification JWT pour les trois fonctions
   locataire et désactive seulement le JWT de la fonction cron, qui exige à la
   place l’en-tête secret `x-cron-secret`.

4. Déployer aussi la fonction du back office qui émet les liens locataire
   (chantier 12, migration `0012_tenant_links.sql`) :

   ```sh
   supabase functions deploy tenant-link --project-ref ykvieyeftewvxjralcym
   ```

   Elle vérifie le JWT de la session admin (`verify_jwt = true`) puis refuse
   tout compte dont l’email n’est pas `ADMIN_EMAIL` (valeur par défaut
   `gruissancozy@gmail.com`).

## 2. Secrets Edge Functions et email

Configurer dans **Supabase → Edge Functions → Secrets** (ou via
`supabase secrets set`) les variables suivantes, sans les mettre dans le dépôt :

- `RESEND_API_KEY` : clé API Resend ;
- `RESEND_FROM_EMAIL` : adresse expéditrice vérifiée dans Resend ;
- `OWNER_EMAIL` : adresse de réception du propriétaire (facultative, valeur par
  défaut `gruissancozy@gmail.com`) ;
- `CRON_SECRET` : valeur aléatoire longue utilisée uniquement pour appeler la
  fonction de purge ;
- `ADMIN_EMAIL` : adresse du propriétaire autorisée à émettre un lien locataire
  (facultative, valeur par défaut `gruissancozy@gmail.com`).

Les fonctions utilisent aussi les variables Supabase standard
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`, fournies par l’environnement des
Edge Functions. Vérifier que l’adresse expéditrice Resend est vérifiée et que
le compte Resend permet l’envoi aux destinataires souhaités avant une vraie
réservation.

Le workflow de déploiement GitHub Pages lit aussi `PUBLIC_SUPABASE_URL` et
`PUBLIC_SUPABASE_ANON_KEY` depuis les **GitHub Actions Secrets** du dépôt ;
ces deux secrets publics doivent être configurés pour que `/tenant/` se
connecte au projet Supabase.

Pour le cron, créer dans **Supabase Vault** un secret portant exactement le nom
`tenant-purge-cron-secret` et la même valeur que `CRON_SECRET`. La migration
`0009` programme une purge quotidienne à 03:15 UTC.

La purge **anonymise, elle n’ampute pas la preuve** (`supabase/functions/_shared/purge.ts`) :

- elle supprime les données personnelles : sessions locataire (email, jeton),
  notes libres des checklists et fichiers Storage hors preuve ;
- elle vide les métadonnées libres des photos (`photos.meta`) ;
- elle **conserve le PDF signé et les photos d’état des lieux**, intacts, pour
  une durée de preuve de 5 ans après le départ (`RETENTION_PREUVE_ANNEES`),
  distincte de la durée des données personnelles
  (`RETENTION_DONNEES_PERSONNELLES_JOURS`, 30 jours) ;
- une fois ces 5 ans écoulés, le second passage de la purge supprime la preuve
  à son tour ;
- chaque passage journalise un rapport : ce qui a été supprimé, anonymisé,
  conservé et pourquoi.

Le PDF n’est jamais réécrit par la purge : le régénérer ferait perdre
l’horodatage de signature, donc sa valeur de preuve. Il ne contient aucune
métadonnée personnelle (pdf-lib n’écrit que le producteur et la date de
création) ; le nom du locataire n’apparaît que dans le corps du document,
inséparable de la preuve.

## 3. Créer un lien de locataire

Depuis le chantier 12 (migrations `0011` et `0012` appliquées, fonction
`tenant-link` déployée), le lien se crée depuis le back office, sans SQL :

1. ouvrir **`/admin/sejours/`** et se connecter avec l’adresse `ADMIN_EMAIL` ;
2. cliquer sur **« Lien locataire »** sur la ligne du séjour ;
3. vérifier la date d’expiration proposée (lendemain du départ à midi, heure de
   Paris) et cliquer sur **« Générer le lien locataire »** ;
4. cliquer sur **« Copier le lien »** et le transmettre au locataire par SMS,
   WhatsApp ou email.

Règles appliquées par la fonction (`supabase/functions/_shared/lien.ts`, testé
dans `tests/tenant-lien.test.ts`) :

- seuls un séjour **`confirme`** ou **`termine`** peuvent recevoir un lien ;
- le jeton fait 32 octets aléatoires (64 caractères hexadécimaux) : il n’est
  jamais dérivé de l’identifiant ni de l’email du séjour ;
- l’expiration ne peut pas dépasser **30 jours après le départ**, ni être dans
  le passé ; elle est également bornée en base par un trigger ;
- le jeton n’apparaît **jamais** dans les journaux des Edge Functions ni dans le
  HTML servi : il n’existe qu’à l’exécution, et seulement tant que le lien est
  actif.

Un lien se révoque de trois façons :

- **manuellement**, avec le bouton « Révoquer le lien » du panneau ;
- **automatiquement** quand le séjour passe au statut `annule` (trigger de la
  migration `0012`, plus un appel de la page pour une révocation immédiate) ;
- **à l’expiration**, où le jeton cesse d’être accepté puis est purgé par le
  cron.

Une seule session est autorisée par séjour. Générer un nouveau lien alors que le
précédent est encore actif réaffiche le lien existant ; s’il est expiré, il est
remplacé.

Le lien prend la forme :

```text
https://gruissan-cozy.github.io/gruissan-location/tenant/?lang=fr&token=JETON
```

Remplacer `fr` par `en`, `es` ou `de` selon la langue enregistrée pour le
séjour — la page le fait automatiquement d’après `sejours.lang`. La page retire
le jeton de la barre d’adresse après l’avoir mémorisé.

## 4. Vérification avant usage réel

- Ouvrir un lien d’essai expiré et vérifier le refus d’accès.
- Avec une réservation de test confirmée, vérifier check-in et check-out,
  checklist, prévisualisation, ajout/suppression de photos, signature, PDF et
  réception des deux emails.
- Vérifier les logs Edge Functions et le premier passage du cron ; les logs sont
  agrégés et n’incluent ni jeton ni adresse personnelle.
- Confirmer la purge des fichiers Storage après expiration avant de transmettre
  un lien à un locataire.
- Vérifier qu’un séjour passé à `annule` perd immédiatement son lien (panneau
  « Lien locataire » vide, ancien lien refusé).

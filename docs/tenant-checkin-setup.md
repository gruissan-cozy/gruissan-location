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

## 2. Secrets Edge Functions et email

Configurer dans **Supabase → Edge Functions → Secrets** (ou via
`supabase secrets set`) les variables suivantes, sans les mettre dans le dépôt :

- `RESEND_API_KEY` : clé API Resend ;
- `RESEND_FROM_EMAIL` : adresse expéditrice vérifiée dans Resend ;
- `OWNER_EMAIL` : adresse de réception du propriétaire (facultative, valeur par
  défaut `gruissancozy@gmail.com`) ;
- `CRON_SECRET` : valeur aléatoire longue utilisée uniquement pour appeler la
  fonction de purge.

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

Une fois `0007`, `0008`, `0009` et `0011` appliquées, l’espace `/admin/` ne crée
pas encore ces liens. Pour un séjour confirmé, exécuter dans le SQL Editor la
requête ci-dessous en remplaçant le placeholder par l’UUID du séjour. Elle
génère un jeton aléatoire unique, lié à l’email du séjour, et l’expire au début
du lendemain du départ (heure de Paris) :

```sql
insert into public.tenant_sessions (reservation_id, email, token, expires_at)
select id,
       client_email,
       encode(gen_random_bytes(32), 'hex'),
       ((depart + 1)::timestamp at time zone 'Europe/Paris')
from public.sejours
where id = 'REMPLACER_PAR_UUID_DU_SEJOUR'
  and statut = 'confirme'
returning token, reservation_id, expires_at;
```

Depuis la migration `0011`, la réservation vit dans `sejours` : la colonne de
départ s’appelle `depart`, le statut confirmé s’écrit `confirme`, et l’email du
client est `client_email`. Un séjour saisi à la main dans `/admin/sejours/` peut
désormais recevoir un lien, ce qui n’était pas possible avant la fusion.

Copier le jeton retourné dans le lien privé, sans le publier ni le placer dans
un ticket ou un journal :

```text
https://gruissan-cozy.github.io/gruissan-location/tenant/?lang=fr&token=JETON
```

Remplacer `fr` par `en`, `es` ou `de` selon la langue enregistrée pour le
séjour. La page retire le jeton de la barre d’adresse après l’avoir mémorisé.
Une seule session est autorisée par réservation ; pour réémettre un lien,
révoquer ou remplacer la session existante depuis le SQL Editor.

## 4. Vérification avant usage réel

- Ouvrir un lien d’essai expiré et vérifier le refus d’accès.
- Avec une réservation de test confirmée, vérifier check-in et check-out,
  checklist, prévisualisation, ajout/suppression de photos, signature, PDF et
  réception des deux emails.
- Vérifier les logs Edge Functions et le premier passage du cron ; les logs sont
  agrégés et n’incluent ni jeton ni adresse personnelle.
- Confirmer la purge des fichiers Storage après expiration avant de transmettre
  un lien à un locataire.

# Mise en service de l’espace locataire

Le code du chantier 10 doit être livré avec `0007_tenant_checkin.sql`,
`0008_pdf_reports.sql` puis `0009_tenant_automation.sql`. Ces migrations ne sont
pas exécutées par le dépôt ou par GitHub Pages : elles doivent être appliquées
manuellement dans le SQL Editor Supabase, dans cet ordre.

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
`0009` programme une purge quotidienne à 03:15 UTC. Elle supprime Storage,
photos, checklists, rapports et sessions expirées ; l’historique conservé par le
propriétaire reste dans ses emails.

## 3. Créer un lien de locataire

Une fois `0007`, `0008` et `0009` appliquées, l’espace `/admin/` ne crée pas encore ces liens. Pour
un séjour confirmé, exécuter dans le SQL Editor la requête ci-dessous en
remplaçant le placeholder par l’UUID du séjour. Elle génère un jeton aléatoire
unique, lié à l’email du séjour, et l’expire au début du lendemain du départ
(heure de Paris) :

```sql
insert into public.tenant_sessions (reservation_id, email, token, expires_at)
select id,
       email,
       encode(gen_random_bytes(32), 'hex'),
       ((check_out + 1)::timestamp at time zone 'Europe/Paris')
from public.bookings
where id = 'REMPLACER_PAR_UUID_DU_SEJOUR'
  and statut = 'confirmee'
returning token, reservation_id, expires_at;
```

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

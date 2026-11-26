# Runbook — appliquer les migrations en production

**Statut : à exécuter à la main. Aucun agent ne peut le faire.**

Ce document est le mode d'emploi de la remise en service des réservations.
Tant qu'il n'a pas été suivi jusqu'au bout, **le formulaire `/reserver/`
n'enregistre aucune demande** : le site affiche un message de maintenance et
propose un repli par email.

---

## 0. Pourquoi maintenant

Constat du 2026-11-25, obtenu en interrogeant le Supabase de production avec la
clé publique publiée dans `/reserver/` :

| Requête | Réponse |
|---|---|
| `POST /rest/v1/sejours` avec le corps exact du formulaire | `PGRST204` — `Could not find the 'adultes' column of 'sejours' in the schema cache` |
| Même requête réduite aux colonnes de 0003 | `42501` — `permission denied for table sejours` |
| `GET /rest/v1/calendar_blocks` | `PGRST205` — table absente |

Autrement dit : les migrations **0011 à 0014 ne sont pas appliquées** sur le
projet de production. Le code du site, lui, est déployé (PR #61 et suivantes) :
il écrit dans des colonnes qui n'existent pas encore.

> **Rien ne se répare tout seul.** Une demande envoyée aujourd'hui n'est
> enregistrée nulle part. Le message affiché au visiteur le dit honnêtement et
> propose un email de repli — mais ce repli n'existe que si
> `content/site.json` porte une adresse réelle (voir §5).

---

## 1. Avant de commencer

- [ ] Accès au **dashboard Supabase** du projet (`ykvieyeftewvxjralcym`), rôle
      propriétaire : le SQL Editor et le déploiement des Edge Functions
      exigent un compte administrateur.
- [ ] Une sauvegarde : **Database → Backups**. Les migrations sont idempotentes
      et non destructrices, mais une sauvegarde coûte trente secondes.
- [ ] Le dépôt à jour sur `main` (les fichiers `migrations/*.sql` sont la
      source de vérité : ne rien recopier de mémoire). Le pack
      `docs/migrations-prod-0011-0014.sql` en est généré — s'il manque ou
      semble périmé, lancer `npm run migrations:pack`.

**Ordre imposé.** Chaque migration suppose la précédente appliquée :

```
docs/migrations-prod-0011-0014.sql   (0011 → 0012 → 0013 → 0014, en une fois)
→ redéploiement des 5 Edge Functions
→ vérification finale
```

Ne pas sauter d'étape. `0012` référence `calendar_blocks` dans ses contrôles ;
`0013` modifie `tenant_sessions`, créée par `0007` et repointée par `0012` ;
`0014` ajoute les index qui rendent la purge supportable.

---

## 2. Étape 1 — coller le pack `docs/migrations-prod-0011-0014.sql`

**Où** : Dashboard → SQL Editor → New query → coller **le fichier entier**
`docs/migrations-prod-0011-0014.sql` → **Run**, une seule fois.

Ce fichier est généré par `scripts/generate-migrations-prod.mjs` à partir des
quatre migrations du dépôt, reprises octet pour octet, dans l'ordre :

| Bloc | Fichier source | Ce qu'il fait |
|---|---|---|
| 0011 | `0011_calendar_blocks.sql` | table des blocages de dates (travaux, séjour personnel, futur import iCal) + RLS |
| 0012 | `0012_unifier_bookings_sejours.sql` | **critique** : colonnes du formulaire (`adultes`, `mineurs`, `client_message`, `packs`, `prix_estime`, `origine`, `lang`), insertion anonyme, reprise de `bookings` |
| 0013 | `0013_tenant_links.sql` | email facultatif sur `tenant_sessions`, expiration bornée à 30 jours après le départ, révocation à l'annulation |
| 0014 | `0014_purge_coordonnees.sql` | deux index pour la purge des coordonnées |

**Pourquoi un seul collage.** Quatre copier-coller successifs multiplient le
risque d'exécution partielle : l'état de production du 2026-11-25 vient
probablement d'un `0012` interrompu (colonnes manquantes). Le pack s'exécute
d'un seul bloc, aucune migration n'ouvre de transaction qu'elle ne referme, et
chacune est idempotente — le relancer ne duplique rien (les lignes sont
reprises avec `on conflict (id) do nothing`).

**Si le SQL Editor signale une erreur** : noter la migration concernée (le
séparateur `-- ===== 00NN_….sql =====` la nomme), corriger la cause, puis
relancer le pack **entier** — jamais un fragment isolé.

**Ne pas éditer le pack à la main** : il est régénéré par
`npm run migrations:pack`, et `tests/migrations-prod-pack.test.ts` rougit dès
qu'il diverge d'une migration du dépôt.

### Contrôles — à lancer séparément, un par un

Les requêtes ci-dessous restent la preuve que chaque migration est passée.
Elles se lancent **après** le Run du pack, chacune dans une nouvelle requête.

#### Contrôle 0011 — la table et sa RLS

Doit renvoyer une ligne, sans erreur :

```sql
select count(*) as blocages from public.calendar_blocks;
```

Le public ne doit voir que les dates :

```sql
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'calendar_blocks'
  and grantee = 'anon'
order by column_name;
```

Attendu : deux lignes, `debut` et `fin` en `SELECT` uniquement. Aucune ligne
pour `note`, `source` ou `external_uid`.

#### Contrôle 0012 — les colonnes, les droits, la politique, la reprise

**Contrôle 1 — les colonnes existent** :

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'sejours'
  and column_name in ('adultes','mineurs','client_message','packs',
                      'prix_estime','historique','lang','origine')
order by column_name;
```

Attendu : 8 lignes. `packs` et `historique` en `jsonb not null default '[]'`,
`origine` en `text not null default 'admin'`.

**Contrôle 2 — le droit d'insertion est ouvert aux seules colonnes du
formulaire** :

```sql
select column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'sejours'
  and grantee = 'anon' and privilege_type = 'INSERT'
order by column_name;
```

Attendu, exactement :

```
adultes, arrivee, client_email, client_message, client_nom,
client_telephone, depart, lang, mineurs, origine, packs,
personnes, prix_estime, statut
```

Aucune trace de `note` ni de `prix_total`. Cette liste est verrouillée par
`tests/migration-colonnes-insert.test.ts` : si le formulaire change, le test
rougit avant que la production ne casse.

**Contrôle 3 — la politique d'insertion existe** :

```sql
select polname, polcmd, pg_get_expr(polwithcheck, polrelid) as condition
from pg_policy where polrelid = 'public.sejours'::regclass;
```

Attendu : `public_insert_sejours` en `a` (INSERT), avec `statut = 'demande'` et
`origine = 'site'` dans la condition.

**Contrôle 4 — les demandes héritées sont reprises** :

```sql
select
  (select count(*) from public.bookings) as dans_bookings,
  (select count(*) from public.sejours where origine = 'import') as reprises;
```

`reprises` doit être ≥ `dans_bookings`. Un écart signale des lignes dégénérées
(départ ≤ arrivée) reprises avec une note interne : c'est prévu, elles sont
conservées.

#### Contrôle 0013 — lien locataire

Rend l'email facultatif sur `tenant_sessions`, borne l'expiration d'un lien
locataire à 30 jours après le départ et révoque le lien à l'annulation du
séjour.

```sql
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'tenant_sessions'
  and column_name = 'email';
```

Attendu : `is_nullable = YES`.

```sql
select tgname from pg_trigger
where tgrelid = 'public.tenant_sessions'::regclass and not tgisinternal;
```

Attendu : `tenant_sessions_expiration_check`.

#### Contrôle 0014 — les index de purge

Deux index seulement (`sejours_depart_idx` et le rappel sur `messages`). Aucune
colonne, aucune politique : rien ne casse si elle passe après les autres.

```sql
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'sejours'
  and indexname = 'sejours_depart_idx';
```

Attendu : une ligne.

---

## 3. Étape 2 — redéployer les 5 Edge Functions

Le code des fonctions suppose les statuts unifiés (`confirme`, `termine`) et
les tables de `0012`. Déployer **après** les migrations, jamais avant.

```sh
supabase functions deploy tenant-link      --project-ref ykvieyeftewvxjralcym
supabase functions deploy tenant-upload    --project-ref ykvieyeftewvxjralcym
supabase functions deploy generate-pdf     --project-ref ykvieyeftewvxjralcym
supabase functions deploy send-email       --project-ref ykvieyeftewvxjralcym
supabase functions deploy purge-tenant-data --project-ref ykvieyeftewvxjralcym
```

`tenant-link` est la cinquième : elle sert le bouton « Générer le lien
locataire » de `/admin/sejours/`. Les quatre fonctions historiques sont celles
listées dans `docs/tenant-checkin-setup.md` §1. Les cinq doivent être
redéployées, sinon le back office appelle une version antérieure au schéma de
`0012`.

**Secrets à vérifier** (Edge Functions → Secrets, jamais dans le dépôt) :
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `OWNER_EMAIL`, `CRON_SECRET`. Le détail
est dans `docs/tenant-checkin-setup.md` §2.

**Contrôle** : lancer une génération de lien locataire depuis
`/admin/sejours/` sur un séjour confirmé. Un jeton doit apparaître dans
`tenant_sessions` et le lien s'ouvrir sur `/tenant/`.

---

## 4. Étape 3 — vérification finale, depuis le site

1. Ouvrir `/reserver/` en navigation privée (pour ne pas réutiliser un cache).
2. Remplir une demande réelle sur deux dates libres, l'envoyer.
3. Attendu : l'écran de confirmation « Demande envoyée », **pas** le message de
   maintenance.
4. Dans le SQL Editor :

```sql
select id, created_at, arrivee, depart, adultes, mineurs, statut, origine, lang
from public.sejours
where origine = 'site'
order by created_at desc
limit 3;
```

La demande doit apparaître avec `statut = 'demande'` et `origine = 'site'`.
Elle ne bloque pas le calendrier tant qu'elle n'est pas passée en `option` ou
`confirme` — c'est voulu.

5. Ouvrir `/admin/demandes/` : la demande doit y figurer.

Si l'étape 3 échoue encore, ouvrir la console du navigateur : le message
`[réservation] envoi impossible — cause=… code=…` donne la cause exacte
(`migration`, `reseau`, `inconnu`) et le code PostgREST. Une cause `migration`
signifie qu'une étape ci-dessus a été sautée ou a échoué.

---

## 5. Le repli email du formulaire (à faire par le propriétaire)

Tant que la base n'est pas migrée — et même après, en cas d'incident — le
formulaire propose un lien `mailto:` pré-rempli. Ce lien n'apparaît **que si**
`content/site.json` porte une adresse réelle :

```json
{
  "email": "adresse-reelle@domaine.tld"
}
```

L'adresse `contact@exemple.com` livrée par défaut est un domaine réservé à la
documentation (RFC 2606) : elle ne reçoit aucun courrier. `adresseContact()`
(`src/lib/legal.ts`) la rejette volontairement, et le formulaire masque alors
le repli au lieu de promettre une boîte qui n'existe pas.

**Action** : renseigner une adresse réellement relevée, puis merger. Aucun
agent ne peut inventer cette valeur à la place du propriétaire.

---

## 6. Ce qu'il ne faut pas faire

- **Ne pas merger de code qui écrit dans une colonne non migrée.** L'ordre est
  toujours : migrations → Edge Functions → merge/déploiement.
- **Ne pas éditer `public/sitemap.xml` à la main** : il n'existe plus, le build
  le génère depuis `src/pages` (`scripts/generate-sitemap.mjs`).
- **Ne pas régénérer `package-lock.json` avec npm 11** : la CI tourne sous
  Node 22 / npm 10.
- **Ne pas découper le pack en quatre collages** : c'est précisément ce qui a
  laissé la production dans un état partiel. Relancer le pack entier est sans
  danger (migrations idempotentes) ; relancer un fragment isolé ne l'est pas.
- **Ne pas éditer `docs/migrations-prod-0011-0014.sql` à la main** : il est
  régénéré par `npm run migrations:pack`, et
  `tests/migrations-prod-pack.test.ts` rougit dès qu'il diverge des migrations.
- **Ne pas relancer un fragment isolé en espérant « réparer »** : relire
  d'abord le rapport d'erreur du SQL Editor, corriger la cause, puis relancer
  le pack entier.

---

## 7. Journal

| Date | Étape | Résultat | Par |
|---|---|---|---|
| 2026-11-25 | Audit | 0011→0014 absentes en production, formulaire inopérant | agent (lecture anon) |
| 2026-11-25 | Correctifs de code | diagnostic d'échec, repli email, sitemap, aperçu social | agent |
| 2026-11-26 | Pack de migrations | `docs/migrations-prod-0011-0014.sql` généré (4 migrations, un seul collage), générateur `scripts/generate-migrations-prod.mjs`, garde `tests/migrations-prod-pack.test.ts` ; runbook ramené à un seul copier-coller, contrôles SQL conservés | agent |
| _à remplir_ | 0011 → 0014 + Edge Functions | | |

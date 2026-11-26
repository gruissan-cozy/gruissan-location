-- ============================================================
-- Gruissan Cozy — pack de migrations de production (0011 → 0014)
--
-- BUT : appliquer en UN SEUL copier-coller les quatre migrations que la
-- production attend (blocages de calendrier, fusion bookings → sejours,
-- lien locataire, purge des coordonnées). Quatre collages successifs
-- laissent la base dans un état partiel si l'un d'eux est interrompu.
--
-- ORDRE (imposé, ne pas réordonner) :
--   0011_calendar_blocks.sql
--   0012_unifier_bookings_sejours.sql
--   0013_tenant_links.sql
--   0014_purge_coordonnees.sql
--
-- MODE D'EMPLOI : docs/runbook-migrations-production.md
--   Dashboard Supabase → SQL Editor → New query → coller CE FICHIER ENTIER
--   → Run, une seule fois. Les requêtes de contrôle du runbook se lancent
--   ensuite, séparément, une par une.
--
-- Le contenu des quatre migrations est repris OCTET POUR OCTET depuis
-- migrations/. Aucune n'ouvre de transaction sans la refermer : le script
-- s'exécute d'un seul bloc. Chacune est idempotente.
--
-- FICHIER GÉNÉRÉ — NE PAS ÉDITER À LA MAIN.
-- Régénérer avec : npm run migrations:pack
-- (scripts/generate-migrations-prod.mjs ; tests/migrations-prod-pack.test.ts
--  rougit si ce fichier diverge des migrations du dépôt).
-- ============================================================
-- ===== 0011_calendar_blocks.sql =====
-- ============================================================
-- Gruissan Cozy — Chantier réservation : blocages de calendrier
--
-- Tâche 0 du lot « réservation et disponibilités » : séparer un BLOCAGE
-- (travaux, séjour personnel, futur import iCal) d'une RÉSERVATION
-- (`sejours`, qui porte un client et un prix).
--
-- Un blocage écrit dans `sejours` obligerait à inventer un faux client et
-- fausserait les statistiques (revenus, taux d'occupation). Cette table
-- indépendante évite ce piège ; le calendrier lit les DEUX sources, les
-- statistiques ne lisent que `sejours`.
--
-- ATTENTION — DEUX CONVENTIONS DE DATES DANS CE DÉPÔT :
--   * `sejours`          : `arrivee` / `depart`, `depart` EXCLUSIF
--                          (le jour du départ libère le logement) ;
--   * `calendar_blocks`  : `debut` / `fin` INCLUSIFS
--                          (`fin` est le dernier jour bloqué).
-- La conversion entre les deux vit dans src/lib/calendrier.ts
-- (`plagesOccupees`) : ne jamais additionner les deux tables sans elle.
--
-- Aucune clé étrangère vers `sejours` : un blocage est indépendant d'une
-- réservation. Ils se superposent dans le temps, ils ne se référencent pas.
--
-- À exécuter dans le SQL Editor de Supabase (idempotent : rejouable).
-- ============================================================

-- ---------- calendar_blocks : blocages de dates ----------
create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Bornes INCLUSES : `fin` est le dernier jour bloqué (convention inverse
  -- de `sejours.depart`). Un blocage d'un seul jour a `debut = fin`.
  debut date not null,
  fin date not null,
  -- direct : saisi par kiki ; airbnb / booking : réservés à l'import iCal (V2).
  source text not null default 'direct',
  -- Identifiant stable de l'événement importé (UID iCal). NULL pour un
  -- blocage manuel : plusieurs NULL doivent pouvoir coexister (voir l'index
  -- unique partiel plus bas).
  external_uid text,
  -- Note interne : jamais exposée au public (voir le GRANT de colonnes).
  note text,
  constraint calendar_blocks_range check (fin >= debut),
  constraint calendar_blocks_source_check
    check (source in ('direct', 'airbnb', 'booking'))
);

-- Si la table préexistait sans ses contraintes (exécution partielle), on les
-- ajoute : `create table if not exists` ne touche pas une table existante.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_blocks_range'
      and conrelid = 'public.calendar_blocks'::regclass
  ) then
    alter table public.calendar_blocks
      add constraint calendar_blocks_range check (fin >= debut);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_blocks_source_check'
      and conrelid = 'public.calendar_blocks'::regclass
  ) then
    alter table public.calendar_blocks
      add constraint calendar_blocks_source_check
      check (source in ('direct', 'airbnb', 'booking'));
  end if;
end
$$;

create index if not exists calendar_blocks_dates_idx
  on public.calendar_blocks (debut, fin);

-- Un événement importé ne doit pas être dupliqué par une resynchronisation.
-- Index PARTIEL : un `unique (source, external_uid)` simple refuserait
-- plusieurs blocages manuels, car PostgreSQL considère deux NULL comme égaux
-- dans un index unique. La clause `where external_uid is not null` ne
-- contraint que les lignes réellement importées.
create unique index if not exists calendar_blocks_external_uid_uidx
  on public.calendar_blocks (source, external_uid)
  where external_uid is not null;

-- ============================================================
-- Sécurité (RLS) — même modèle que `sejours` (migrations/0003_sejours.sql)
--
-- 1. L'admin (propriétaire) a tous les droits sur la table.
-- 2. Le public (clé anon) ne lit que `debut` / `fin`, pour le calendrier.
--    `note` reste privée, comme `availability.note` en 0010.
-- ============================================================
alter table public.calendar_blocks enable row level security;

drop policy if exists "admin_all_calendar_blocks" on public.calendar_blocks;
create policy "admin_all_calendar_blocks" on public.calendar_blocks
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');

drop policy if exists "public_read_calendar_blocks_dates" on public.calendar_blocks;
create policy "public_read_calendar_blocks_dates" on public.calendar_blocks
  for select to anon
  using (true);

-- Seules les dates sont lisibles par le public (verrou au niveau colonne).
revoke all on public.calendar_blocks from anon;
grant select (debut, fin) on public.calendar_blocks to anon;

comment on table public.calendar_blocks is
  'Blocages de dates (travaux, séjour personnel, import iCal) indépendants des réservations. Bornes debut/fin INCLUSES.';
comment on column public.calendar_blocks.debut is
  'Premier jour bloqué (inclus). Convention inverse de sejours.depart, qui est exclusif.';
comment on column public.calendar_blocks.fin is
  'Dernier jour bloqué (inclus). Un blocage d''un seul jour a debut = fin.';
comment on column public.calendar_blocks.source is
  'direct : saisi dans le back office ; airbnb / booking : réservés à l''import iCal (V2).';
comment on column public.calendar_blocks.external_uid is
  'UID iCal de l''événement importé. NULL pour un blocage manuel ; unicité partielle sur (source, external_uid).';
comment on column public.calendar_blocks.note is
  'Note interne, jamais lisible par le public (GRANT limité à debut, fin).';
-- ===== 0012_unifier_bookings_sejours.sql =====
-- ============================================================
-- Gruissan Cozy — Chantier 12 : un seul dossier de réservation
--
-- Fusionne `bookings` (demandes du formulaire public) dans `sejours`
-- (séjours du back office) : une seule table, un seul cycle de vie
--
--     demande → option → confirme → termine   (+ annule)
--
-- `bookings` n'est PAS supprimée ici : elle passe en LECTURE SEULE et
-- sera retirée par une migration de nettoyage, après une saison.
--
-- ⚠️ ACTION MANUELLE REQUISE — ET DANS CET ORDRE
-- Le token d'administration Supabase n'est pas disponible pour les
-- agents de code : CE FICHIER DOIT ÊTRE EXÉCUTÉ À LA MAIN.
--   Dashboard Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- ORDRE DE MISE EN SERVICE (le merge déploie le site automatiquement) :
--   1. exécuter CE FICHIER dans le SQL Editor ;
--   2. déployer les quatre Edge Functions (voir docs/tenant-checkin-setup.md) ;
--   3. seulement ensuite merger sur `main` (le déploiement GitHub Pages est
--      déclenché par le merge).
--
-- Fenêtre de casse si l'ordre n'est pas respecté : entre le merge et
-- l'exécution de ce fichier, le formulaire public écrit dans `sejours` avec
-- `origine` / `adultes` / `mineurs` / `prix_estime`, colonnes qui n'existent
-- pas encore, et la politique `public_insert_sejours` non plus. Toute demande
-- envoyée depuis /reserver/ échoue alors sur son message d'erreur générique :
-- elle est PERDUE silencieusement. Les Edge Functions déployées avant la
-- migration échouent de la même façon (statuts `confirme`/`termine` absents).
--
-- Le script est IDEMPOTENT : il peut être relancé sans effet de bord.
--
-- Conventions retenues :
--   * les identifiants des lignes `bookings` sont CONSERVÉS dans `sejours`
--     (même `id`) : les sessions locataire, checklists, photos et rapports
--     PDF existants continuent de fonctionner sans remise à zéro, et un
--     séjour saisi à la main peut désormais recevoir un lien locataire ;
--   * `origine` distingue une ligne créée par le site ('site'), par
--     l'administrateur ('admin') ou reprise de `bookings` ('import') ;
--   * `personnes` reste le total ; `adultes` / `mineurs` portent le détail
--     (les mineurs sont exonérés de taxe de séjour). Les lignes reprises de
--     `bookings` ne portaient pas ce détail : adultes = guests, mineurs = 0.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Statut : ajouter « demande » au domaine de `sejours`
--
-- `sejours` n'acceptait que option / confirme / annule / termine. On
-- remplace la contrainte CHECK par le jeu unifié. Le nom auto-généré n'est
-- pas fiable : on parcourt pg_constraint (même méthode que 0004).
-- ------------------------------------------------------------
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.sejours'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%statut%'
  loop
    execute format('alter table public.sejours drop constraint if exists %I', c.conname);
  end loop;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sejours_statut_check'
      and conrelid = 'public.sejours'::regclass
  ) then
    alter table public.sejours
      add constraint sejours_statut_check
      check (statut in ('demande', 'option', 'confirme', 'annule', 'termine'));
  end if;
end $$;

comment on column public.sejours.statut is
  'Cycle de vie unifié : demande (formulaire public) → option → confirme → termine, ou annule. '
  'Seuls option et confirme bloquent le calendrier public.';

-- ------------------------------------------------------------
-- 2. Colonnes manquantes reprises de `bookings`
--
-- Coordonnées complémentaires, détail adultes/mineurs, options, prix
-- estimé (distinct du prix_total négocié), provenance et historique.
-- ------------------------------------------------------------
alter table public.sejours
  add column if not exists client_message text,
  add column if not exists adultes integer,
  add column if not exists mineurs integer,
  add column if not exists packs jsonb not null default '[]'::jsonb,
  add column if not exists prix_estime numeric(10,2),
  add column if not exists historique jsonb not null default '[]'::jsonb,
  add column if not exists lang text,
  add column if not exists origine text not null default 'admin';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sejours_adultes_check'
      and conrelid = 'public.sejours'::regclass
  ) then
    alter table public.sejours
      add constraint sejours_adultes_check
      check (adultes is null or adultes between 0 and 8);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sejours_mineurs_check'
      and conrelid = 'public.sejours'::regclass
  ) then
    alter table public.sejours
      add constraint sejours_mineurs_check
      check (mineurs is null or mineurs between 0 and 8);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sejours_prix_estime_check'
      and conrelid = 'public.sejours'::regclass
  ) then
    alter table public.sejours
      add constraint sejours_prix_estime_check
      check (prix_estime is null or prix_estime >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sejours_origine_check'
      and conrelid = 'public.sejours'::regclass
  ) then
    alter table public.sejours
      add constraint sejours_origine_check
      check (origine in ('admin', 'site', 'import'));
  end if;
end $$;

create index if not exists sejours_origine_idx on public.sejours (origine);

-- ------------------------------------------------------------
-- 3. Migration des lignes `bookings` → `sejours`
--
-- Idempotence : l'identifiant est conservé, donc `on conflict (id) do
-- nothing` suffit — une seconde exécution ne duplique rien.
--
-- Correspondance des statuts (l'ancien vocabulaire disparaît) :
--   demande   → demande
--   confirmee → confirme
--   annulee   → annule
--   terminee  → termine
-- Toute valeur inconnue devient `demande` (jamais bloquante : elle reste à
-- trier dans le back office plutôt que de bloquer des dates par erreur).
-- ------------------------------------------------------------
insert into public.sejours (
  id, created_at, arrivee, depart,
  client_nom, client_email, client_telephone, client_message,
  personnes, adultes, mineurs,
  statut, prix_estime, note, packs, historique, lang, origine
)
select
  b.id,
  b.created_at,
  b.check_in,
  b.check_out,
  b.nom,
  b.email,
  b.telephone,
  b.message,
  b.guests,
  b.guests,
  0,
  case b.statut
    when 'confirmee' then 'confirme'
    when 'annulee'   then 'annule'
    when 'terminee'  then 'termine'
    else 'demande'
  end,
  b.total_estime,
  null,
  b.packs,
  b.historique,
  b.lang,
  'import'
from public.bookings b
where b.check_out > b.check_in
on conflict (id) do nothing;

-- Lignes dégénérées (départ ≤ arrivée) : impossibles depuis la contrainte
-- de 0010, mais possibles avant. On les reprend sur une nuit pour conserver
-- leur identifiant (donc leurs liens locataire) et on inscrit les dates
-- d'origine dans la note interne : rien n'est perdu.
insert into public.sejours (
  id, created_at, arrivee, depart,
  client_nom, client_email, client_telephone, client_message,
  personnes, adultes, mineurs,
  statut, prix_estime, note, packs, historique, lang, origine
)
select
  b.id,
  b.created_at,
  b.check_in,
  b.check_in + 1,
  b.nom,
  b.email,
  b.telephone,
  b.message,
  b.guests,
  b.guests,
  0,
  case b.statut
    when 'confirmee' then 'confirme'
    when 'annulee'   then 'annule'
    when 'terminee'  then 'termine'
    else 'demande'
  end,
  b.total_estime,
  '[migration 0012] dates incohérentes reprises de bookings : arrivée '
    || b.check_in || ', départ ' || b.check_out
    || ' (départ ramené au lendemain de l''arrivée).',
  b.packs,
  b.historique,
  b.lang,
  'import'
from public.bookings b
where b.check_out <= b.check_in
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4. Les tables locataire pointent désormais sur `sejours`
--
-- `tenant_sessions.reservation_id` (et les tables qui en dépendent)
-- référençait `bookings`. L'identifiant étant conservé à l'étape 3, la
-- bascule ne casse aucun lien existant.
-- ------------------------------------------------------------
do $$
declare
  t text;
  c record;
  v_nom text;
begin
  foreach t in array array['tenant_sessions', 'checklists', 'photos', 'pdf_reports']
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue; -- table pas encore créée sur ce projet
    end if;

    for c in
      select conname
      from pg_constraint
      where conrelid = format('public.%I', t)::regclass
        and contype = 'f'
        and pg_get_constraintdef(oid) ilike '%reservation_id%'
        and confrelid <> 'public.sejours'::regclass
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;

    v_nom := t || '_reservation_id_fkey';
    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', t)::regclass
        and contype = 'f'
        and pg_get_constraintdef(oid) ilike '%reservation_id%'
    ) then
      -- NOT VALID : une ligne orpheline héritée ne doit pas faire échouer la
      -- migration. Les nouvelles écritures sont contrôlées normalement.
      execute format(
        'alter table public.%I add constraint %I foreign key (reservation_id) references public.sejours(id) on delete cascade not valid',
        t, v_nom
      );
    end if;
  end loop;
end $$;

-- Validation des clés étrangères, sans bloquer la migration si un orphelin
-- hérité subsiste : l'avertissement est journalisé dans le SQL Editor.
do $$
declare
  t text;
begin
  foreach t in array array['tenant_sessions', 'checklists', 'photos', 'pdf_reports']
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    begin
      execute format('alter table public.%I validate constraint %I', t, t || '_reservation_id_fkey');
    exception when others then
      raise notice 'Clé étrangère % non validée (orphelins hérités) : %', t, sqlerrm;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Écriture publique : le formulaire écrit dans `sejours`
--
-- Le public garde EXACTEMENT les mêmes droits qu'avant, transposés :
--   * lecture : seules `arrivee` / `depart` des séjours option/confirme
--     (politique et GRANT de colonnes de 0003 inchangés — ne pas y toucher) ;
--   * écriture : insertion d'une DEMANDE uniquement, avec les mêmes bornes
--     de validation que la politique `public_insert_bookings` de 0010
--     (statut forcé, historique vide, longueurs bornées).
-- Rien n'est élargi : ni lecture des coordonnées, ni écriture d'un statut
-- confirmé.
-- ------------------------------------------------------------
drop policy if exists "public_insert_sejours" on public.sejours;
create policy "public_insert_sejours" on public.sejours
  for insert to anon
  with check (
    statut = 'demande'
    and origine = 'site'
    and historique = '[]'::jsonb
    and jsonb_typeof(packs) = 'array'
    and (prix_estime is null or prix_estime >= 0)
    and char_length(btrim(client_nom)) between 1 and 120
    and char_length(btrim(client_email)) between 3 and 160
    and (client_telephone is null or char_length(client_telephone) <= 40)
    and (client_message is null or char_length(client_message) <= 2000)
    and depart > arrivee
    and personnes between 1 and 8
    and (adultes is null or adultes between 1 and 8)
    and (mineurs is null or mineurs between 0 and 8)
    and (lang is null or char_length(lang) <= 5)
  );

-- Colonnes ouvertes à l'insertion anonyme : celles du formulaire, jamais
-- `note` (interne) ni `prix_total` (négocié par le propriétaire).
revoke insert on public.sejours from anon;
grant insert (
  arrivee, depart, client_nom, client_email, client_telephone, client_message,
  personnes, adultes, mineurs, packs, prix_estime, statut, lang, origine
) on public.sejours to anon;

-- ------------------------------------------------------------
-- 6. `bookings` : lecture seule, en attendant la migration de nettoyage
--
-- Plus aucun code n'écrit ni ne lit cette table. On retire le droit
-- d'insertion anonyme (la politique de 0010 n'a plus d'objet) et on
-- révoque les écritures : les données restent consultables pour l'audit
-- et la reprise, mais ne peuvent plus diverger de `sejours`.
-- ------------------------------------------------------------
drop policy if exists "public_insert_bookings" on public.bookings;
revoke insert, update, delete on public.bookings from anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke insert, update, delete on public.bookings from authenticated';
  end if;
end $$;

comment on table public.bookings is
  'OBSOLÈTE depuis la migration 0012 : les réservations vivent dans `sejours`. '
  'Table conservée en lecture seule pour l''audit ; sera supprimée après une saison.';
-- ===== 0013_tenant_links.sql =====
-- ============================================================
-- Gruissan Cozy — Chantier 12 : lien locataire depuis le back office
--
-- Le bouton « Générer le lien locataire » de /admin/sejours/ appelle
-- l'Edge Function `tenant-link`, qui écrit dans `tenant_sessions`. Cette
-- migration prépare la table pour cet usage :
--
--   1. un séjour saisi à la main peut n'avoir aucun email ; l'ancienne
--      contrainte `email not null` (0007) rendait la création impossible ;
--   2. l'expiration d'un lien ne peut pas dépasser 30 jours après le
--      départ du séjour, même si quelqu'un écrivait directement en base ;
--   3. un séjour qui passe à `annule` voit son lien révoqué : aucun accès
--      ne survit à l'annulation.
--
-- À exécuter APRÈS 0012_unifier_bookings_sejours.sql, dans le SQL Editor
-- Supabase. Le script est IDEMPOTENT : il peut être relancé sans effet de
-- bord.
--
-- Aucune politique RLS n'est modifiée : l'administrateur garde tous les
-- droits, et la lecture par jeton reste bornée par `expires_at > now()`
-- (0009). Le jeton n'est jamais écrit dans les journaux.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Email facultatif
--
-- Le lien est transmis par SMS, WhatsApp ou copier-coller : un séjour
-- confirmé sans adresse email doit pouvoir en recevoir un. La colonne
-- reste là (l'Edge Function la renseigne quand elle existe) mais n'est
-- plus obligatoire.
-- ------------------------------------------------------------
alter table public.tenant_sessions alter column email drop not null;

comment on column public.tenant_sessions.email is
  'Email du locataire au moment de l''émission du lien (facultatif depuis 0012). '
  'Supprimé par la purge à l''expiration de la session.';

-- ------------------------------------------------------------
-- 2. Bornes d'expiration en base (défense en profondeur)
--
-- Le calcul « départ + 1 jour à 12 h (Paris) » et la limite de 30 jours
-- sont appliqués par l'Edge Function (`_shared/lien.ts`). Ce trigger les
-- rejoue côté SQL pour qu'une écriture directe ne puisse pas ouvrir un
-- accès permanent.
-- ------------------------------------------------------------
create or replace function public.verifier_expiration_lien()
returns trigger
language plpgsql
as $$
declare
  v_depart date;
begin
  select depart into v_depart from public.sejours where id = new.reservation_id;
  if v_depart is null then
    raise exception 'Séjour introuvable pour le lien locataire (%).', new.reservation_id;
  end if;

  if new.expires_at <= now() then
    raise exception 'L''expiration du lien locataire doit être dans le futur.';
  end if;

  -- 30 jours après le départ, à midi (heure de Paris) : borne supérieure.
  if new.expires_at > ((v_depart + 30)::timestamp at time zone 'Europe/Paris') + interval '12 hours' then
    raise exception 'L''expiration d''un lien locataire ne peut pas dépasser 30 jours après le départ.';
  end if;

  return new;
end;
$$;

drop trigger if exists tenant_sessions_expiration_check on public.tenant_sessions;
create trigger tenant_sessions_expiration_check
  before insert or update of expires_at, reservation_id on public.tenant_sessions
  for each row execute function public.verifier_expiration_lien();

-- ------------------------------------------------------------
-- 3. Révocation à l'annulation
--
-- Un séjour `annule` ne doit plus donner accès aux codes ni à l'état des
-- lieux. Le lien est supprimé au moment du changement de statut, sans
-- intervention.
-- ------------------------------------------------------------
create or replace function public.revoquer_lien_si_annule()
returns trigger
language plpgsql
as $$
begin
  if new.statut = 'annule' then
    delete from public.tenant_sessions where reservation_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists sejours_revoquer_lien on public.sejours;
create trigger sejours_revoquer_lien
  after update of statut on public.sejours
  for each row
  when (new.statut = 'annule' and old.statut is distinct from new.statut)
  execute function public.revoquer_lien_si_annule();

-- ------------------------------------------------------------
-- 4. Réparation : liens déjà existants sur un séjour annulé
--
-- Une ligne annulée AVANT cette migration pouvait garder sa session. On
-- la supprime une fois pour que l'état de départ soit cohérent.
-- ------------------------------------------------------------
delete from public.tenant_sessions s
using public.sejours j
where s.reservation_id = j.id
  and j.statut = 'annule';

comment on table public.tenant_sessions is
  'Accès locataire temporaire (jeton, expiration). Un seul lien par séjour '
  '(index unique 0009) ; révoqué à l''expiration, à l''annulation du séjour '
  'ou manuellement depuis /admin/sejours/.';
-- ===== 0014_purge_coordonnees.sql =====
-- ============================================================
-- Gruissan Cozy — Chantier 13 : effacement des coordonnées voyageur
--
-- Décision de kiki (2026-11-23) : les coordonnées du voyageur ne sont pas
-- conservées au titre d'une durée légale. Passé un délai court après le
-- départ, elles sont effacées par `purge-tenant-data`.
--
-- ⚠️ ACTION MANUELLE REQUISE
-- Le token d'administration Supabase n'est pas disponible pour les agents
-- de code : CE FICHIER DOIT ÊTRE EXÉCUTÉ À LA MAIN.
--   Dashboard Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- Cette migration n'ajoute AUCUNE colonne et ne change AUCUNE politique :
-- elle ne fait qu'ajouter deux index. Rien ne casse si elle est appliquée
-- après le merge du code, ni avant.
--
-- ORDRE : à exécuter après 0011, 0012 et 0013, avant de merger le code qui
-- déclenche la purge. Sans elle, la purge fonctionne quand même — elle est
-- simplement plus lente sur une grosse table.
-- ============================================================

-- ------------------------------------------------------------
-- 1. `sejours.depart`
--
-- La purge balaie les séjours dont le départ est antérieur à la date
-- d'échéance (`where depart < cutoff order by depart`). L'index existant
-- `sejours_dates_idx` porte sur (arrivee, depart) : il ne sert pas une
-- recherche sur `depart` seul. Sans cet index, chaque purge lit la table
-- entière.
-- ------------------------------------------------------------
create index if not exists sejours_depart_idx on public.sejours (depart);

-- ------------------------------------------------------------
-- 2. `messages.created_at`
--
-- `messages_created_idx` existe déjà (0001) sur (created_at desc) et suffit
-- au balayage `where created_at < cutoff`. Rien à ajouter : ce commentaire
-- existe pour qu'on ne cherche pas l'index manquant la prochaine fois.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Vérification
--
-- Après exécution, ces deux requêtes doivent renvoyer un nombre, pas une
-- erreur. Elles ne modifient rien.
--
--   select count(*) from public.sejours where depart < current_date - 30;
--   select count(*) from public.messages where created_at < now() - interval '30 days';
--
-- Le second compte les messages que la prochaine purge va effacer. Si le
-- chiffre est important, c'est normal : la purge n'a encore jamais tourné.
-- ------------------------------------------------------------

comment on column public.sejours.client_nom is
  'Nom du voyageur. `not null` : la purge ne le met jamais à NULL, elle le '
  'remplace par un libellé neutre (voir _shared/purge.ts, NOM_ANONYMISE).';

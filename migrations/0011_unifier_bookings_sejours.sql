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
  '[migration 0011] dates incohérentes reprises de bookings : arrivée '
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
  'OBSOLÈTE depuis la migration 0011 : les réservations vivent dans `sejours`. '
  'Table conservée en lecture seule pour l''audit ; sera supprimée après une saison.';

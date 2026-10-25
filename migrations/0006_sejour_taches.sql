-- ============================================================
-- Gruissan Cozy — Chantier 8 : taxe de séjour, tâches entre
-- séjours et modèles de réponse (#22)
--
-- Migration 0006 — tâches entre séjours.
--
-- ⚠️ ACTION MANUELLE REQUISE
-- Le token d'administration Supabase n'est pas disponible pour les
-- agents de code : CE FICHIER DOIT ÊTRE EXÉCUTÉ À LA MAIN.
--   Dashboard Supabase → SQL Editor → New query → coller ce fichier
--   → Run. Tant qu'elle n'est pas appliquée, /admin/taches/ affiche un
--   bandeau explicite et le reste du back office reste utilisable.
--
-- Le script est IDEMPOTENT : il peut être relancé sans effet de bord.
--
-- ⚠️ PRÉREQUIS : la table public.sejours doit exister (migration 0003).
--   Sans elle, la clé étrangère ci-dessous échoue volontairement : on ne
--   crée pas de table de tâches orpheline.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pourquoi une table dédiée plutôt qu'une colonne jsonb
--
-- Le cahier des charges laissait le choix. Une table dédiée a été
-- retenue pour trois raisons :
--
--   a) RÉFÉRENTIEL : `sejour_id` porte une clé étrangère vers
--      `public.sejours` avec `on delete cascade`. Une tâche ne peut pas
--      exister sans séjour et ne peut pas survivre à sa suppression.
--      Dans un jsonb, rien n'empêche une tâche orpheline ou un séjour
--      supprimé dont les tâches traîneraient encore dans la base.
--
--   b) SÉCURITÉ : les politiques RLS s'écrivent sur une table. La
--      colonne jsonb de `sejours` n'y est pas soumise — elle suit les
--      politiques de la table parente, sans pouvoir distinguer « tâches
--      internes » et « champs métier ». Ici, le public (clé anon) n'a
--      AUCUN accès : aucune tâche n'est lisible hors du propriétaire.
--
--   c) EXPLOITABILITÉ : le suivi d'avancement et l'historique des
--      réalisations s'interrogent par ligne (« quelles tâches reste-t-il
--      avant l'arrivée du prochain séjour ? »), ce qu'un jsonb rend
--      possible mais au prix de fonctions JSON complexes et non indexées.
--
-- Le coût — une table de plus, une jointure — est faible au regard de
-- ces trois garanties, et il reste facile de revenir à un jsonb si le
-- volume le justifie.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 2. Table des tâches
--
--   fait_le NULL        → tâche non réalisée (case décochée)
--   fait_le IS NOT NULL → tâche réalisée à cet horodatage
--
-- `libelles` est le libellé de la liste type dans les 4 langues
-- ({"fr": "Ménage", "en": "Cleaning", …}) : il est dupliqué depuis le
-- modèle de tâche au moment de la création, de sorte qu'une tâche reste
-- lisible même si la liste type est modifiée ou retirée ensuite.
-- ------------------------------------------------------------
create table if not exists public.sejour_taches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sejour_id uuid not null
    references public.sejours (id) on delete cascade,
  -- Libellé de la liste type au moment de la création (ménage,
  -- remise des clés, état des lieux, linge, inventaire…).
  slug text not null default 'autre'
    check (length(slug) between 1 and 60),
  -- Libellé de la liste type dans les 4 langues.
  libelles jsonb not null default '{}'::jsonb
    check (jsonb_typeof(libelles) = 'object'),
  -- Libellé libre saisi par le propriétaire (optionnel).
  custom_label text check (custom_label is null or length(custom_label) <= 200),
  -- Ordre d'affichage dans la liste du séjour.
  ordre integer not null default 0 check (ordre >= 0),
  -- Case à cocher.
  fait boolean not null default false,
  -- Horodatage de réalisation : NULL = non réalisé.
  fait_le timestamptz,
  -- Cohérence interne : pas d'horodatage sans case cochée.
  constraint sejour_taches_fait_coherence
    check ((fait = false and fait_le is null) or (fait = true))
);

-- ------------------------------------------------------------
-- 3. Index
--
-- L'accès dominant est « les tâches d'un séjour » (page /admin/taches/),
-- le second est « les tâches à réaliser avant une date » (arrivées
-- imminentes).
-- ------------------------------------------------------------
create index if not exists sejour_taches_sejour_idx
  on public.sejour_taches (sejour_id, ordre);

create index if not exists sejour_taches_a_faire_idx
  on public.sejour_taches (fait)
  where fait = false;

comment on table public.sejour_taches is
  'Tâches entre séjours (ménage, remise des clés, état des lieux…) rattachées à un séjour. Chantier 8 — #22.';

comment on column public.sejour_taches.fait_le is
  'Horodatage de réalisation : NULL = case non cochée, non NULL = tâche faite à cette date. Chantier 8 — #22.';

comment on column public.sejour_taches.libelles is
  'Libellé de la liste type dans les 4 langues ({"fr": …, "en": …}) dupliqué au moment de la création : une tâche reste lisible même si la liste type change.';

-- ------------------------------------------------------------
-- 4. Horodatage de mise à jour automatique
--
-- Même motif que les autres tables du back office : toute modification
-- (case cochée, libellé corrigé) met `updated_at` à jour sans que le
-- script client ait à s'en charger.
-- ------------------------------------------------------------
create or replace function public.maj_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sejour_taches_maj_updated_at on public.sejour_taches;
create trigger sejour_taches_maj_updated_at
  before update on public.sejour_taches
  for each row execute function public.maj_updated_at();

-- ============================================================
-- Sécurité (RLS)
--
-- 1. L'admin (propriétaire) a tous les droits sur la table.
-- 2. Le public (clé anon) n'a AUCUN accès : une tâche est un élément
--    interne de l'exploitation, sans contrepartie publique.
--
-- Aucun GRANT n'est donc émis pour `anon` (le défaut est aucun droit),
-- et le verrou est doublé par la politique admin restreinte à l'email
-- du propriétaire — jamais par un rôle large comme `authenticated`.
-- ============================================================
alter table public.sejour_taches enable row level security;

-- Les politiques RLS ne peuvent s'exercer que si le rôle a les droits
-- sur la table. `authenticated` (qui porte la session admin) reçoit donc
-- les droits ; `anon` n'en reçoit AUCUN, ce qui verrouille l'accès public
-- dès le niveau des privilèges, avant même l'évaluation des politiques.
grant select, insert, update, delete on public.sejour_taches to authenticated;
revoke all on public.sejour_taches from anon;

drop policy if exists "admin_all_sejour_taches" on public.sejour_taches;
create policy "admin_all_sejour_taches" on public.sejour_taches
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');

-- ============================================================
-- 5. Modèles de réponse (fonction 3) — aucun objet SQL
--
-- Les modèles vivent dans `content/modeles-reponse.json` : c'est un
-- contenu éditable par le propriétaire, comme les packs ou le guide.
-- Aucune table n'est créée pour eux.
--
-- La taxe de séjour (fonction 1) n'a pas besoin de migration non plus :
-- elle se calcule à la lecture des séjours existants (table `sejours`,
-- migration 0003) avec le taux de `content/tarifs.json`.
-- ============================================================

-- ============================================================
-- Vérification rapide (à exécuter après la migration) :
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'sejour_taches'
--   order by ordinal_position;
--
--   select count(*) from public.sejour_taches;  -- 0 après la migration
--
-- Relancer ce fichier ne doit rien changer : chaque instruction est
-- idempotent (if not exists / drop … if exists / if exists).
-- ============================================================

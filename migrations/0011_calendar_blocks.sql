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

-- ============================================================
-- Gruissan Cozy — Chantier 1 : calendrier de séjours
--
-- Remplace le statut mensuel (table `availability`) par de vrais
-- séjours datés (arrivée → départ), saisis dans le back office.
--
-- À exécuter dans le SQL Editor de Supabase (idempotent).
-- ============================================================

-- ---------- sejours : séjours datés du logement ----------
create table if not exists public.sejours (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  arrivee date not null,
  depart date not null,
  client_nom text not null,
  client_email text,
  client_telephone text,
  personnes integer not null default 2 check (personnes between 1 and 8),
  -- option  : dates bloquées en option (demande en cours)
  -- confirme: séjour confirmé (bloque le calendrier)
  -- annule  : séjour annulé (libère le calendrier)
  -- termine : séjour passé (n'apparaît plus dans le calendrier public)
  statut text not null default 'confirme'
    check (statut in ('option', 'confirme', 'annule', 'termine')),
  prix_total numeric(10,2) check (prix_total is null or prix_total >= 0),
  note text,
  constraint sejours_range check (depart > arrivee)
);

create index if not exists sejours_dates_idx on public.sejours (arrivee, depart);
create index if not exists sejours_statut_idx on public.sejours (statut);

-- ============================================================
-- Sécurité (RLS)
--
-- 1. L'admin (propriétaire) a tous les droits sur la table.
-- 2. Le public (clé anon) peut seulement LIRE les dates des séjours
--    actifs, et uniquement les colonnes `arrivee` / `depart`.
--
-- Le verrou des colonnes est assuré par un GRANT au niveau colonne
-- (et non par une vue `security definer`, dont l'usage est
-- déconseillé) : même en cas d'erreur de requête côté client,
-- aucune donnée personnelle ne peut être lue par le public.
-- ============================================================
alter table public.sejours enable row level security;

drop policy if exists "admin_all_sejours" on public.sejours;
create policy "admin_all_sejours" on public.sejours
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com')
  with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');

drop policy if exists "public_read_sejours_dates" on public.sejours;
create policy "public_read_sejours_dates" on public.sejours
  for select to anon
  using (statut in ('option', 'confirme'));

-- Seules les dates sont lisibles par le public.
revoke all on public.sejours from anon;
grant select (arrivee, depart) on public.sejours to anon;

-- ============================================================
-- Repli : les statuts mensuels existants sont conservés dans
-- `availability` (utilisés si Supabase est indisponible).
-- ============================================================
comment on table public.sejours is
  'Séjours datés du logement (arrivée → départ). Chantier 1 — calendrier.';

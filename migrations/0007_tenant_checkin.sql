-- ============================================================
-- Chantier 10 — Check-in / check-out autonome locataire
-- Tables : tenant_sessions, checklists, photos, pdf_reports
--
-- IMPORTANT : créer le bucket Storage `etats-des-lieux` dans le
-- dashboard Supabase (Storage → Create bucket, privé).
-- Les policies RLS ci-dessous supposent que le bucket existe.
-- ============================================================

-- ---------- tenant_sessions : accès locataire temporaire ----------
create table if not exists public.tenant_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reservation_id uuid not null references public.bookings(id) on delete cascade,
  email text not null,
  token text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  check (expires_at > created_at)
);
create index if not exists tenant_sessions_token_idx on public.tenant_sessions (token);
create index if not exists tenant_sessions_reservation_idx on public.tenant_sessions (reservation_id);

-- ---------- checklists : items validés par pièce ----------
create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reservation_id uuid not null references public.bookings(id) on delete cascade,
  moment text not null check (moment in ('checkin', 'checkout')),
  room text not null,
  item text not null,
  ok boolean not null default false,
  note text,
  unique (reservation_id, moment, room, item)
);
create index if not exists checklists_reservation_idx on public.checklists (reservation_id);

-- ---------- photos : états des lieux photographiques ----------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reservation_id uuid not null references public.bookings(id) on delete cascade,
  moment text not null check (moment in ('checkin', 'checkout')),
  room text not null,
  path text not null, -- chemin dans le bucket Storage
  mime text not null default 'image/jpeg',
  size integer,
  -- métadonnées supplémentaires (optionnel)
  meta jsonb not null default '{}'::jsonb
);
create index if not exists photos_reservation_idx on public.photos (reservation_id);
create index if not exists photos_moment_idx on public.photos (moment);

-- ---------- pdf_reports : rapports PDF générés ----------
create table if not exists public.pdf_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reservation_id uuid not null references public.bookings(id) on delete cascade,
  moment text not null check (moment in ('checkin', 'checkout')),
  path text not null, -- chemin dans le bucket Storage
  size integer,
  sent_to_tenant boolean not null default false,
  sent_to_owner boolean not null default false,
  error text
);
create index if not exists pdf_reports_reservation_idx on public.pdf_reports (reservation_id);

-- ============================================================
-- RLS : accès locataire temporaire via token + réservation
-- ============================================================
alter table public.tenant_sessions enable row level security;
alter table public.checklists enable row level security;
alter table public.photos enable row level security;
alter table public.pdf_reports enable row level security;

-- tenant_sessions : lecture via header x-tenant-token
drop policy if exists "tenant_read_own_session" on public.tenant_sessions;
create policy "tenant_read_own_session" on public.tenant_sessions
  for select to anon using (token = current_setting('request.headers', true)::json->>'x-tenant-token');

-- tenant_sessions : admin tous droits (email propriétaire)
drop policy if exists "admin_all_tenant_sessions" on public.tenant_sessions;
create policy "admin_all_tenant_sessions" on public.tenant_sessions
  for all to authenticated using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com') with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');

-- checklists : locataire via token + session valide
drop policy if exists "tenant_manage_checklist" on public.checklists;
create policy "tenant_manage_checklist" on public.checklists
  for all to anon using (
    exists (
      select 1 from public.tenant_sessions s
      where s.reservation_id = checklists.reservation_id
        and s.token = current_setting('request.headers', true)::json->>'x-tenant-token'
        and s.expires_at > now()
    )
  ) with check (
    exists (
      select 1 from public.tenant_sessions s
      where s.reservation_id = checklists.reservation_id
        and s.token = current_setting('request.headers', true)::json->>'x-tenant-token'
        and s.expires_at > now()
    )
  );

-- checklists : admin tous droits
drop policy if exists "admin_all_checklists" on public.checklists;
create policy "admin_all_checklists" on public.checklists
  for all to authenticated using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com') with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');

-- photos : locataire via token + session valide
drop policy if exists "tenant_manage_photos" on public.photos;
create policy "tenant_manage_photos" on public.photos
  for all to anon using (
    exists (
      select 1 from public.tenant_sessions s
      where s.reservation_id = photos.reservation_id
        and s.token = current_setting('request.headers', true)::json->>'x-tenant-token'
        and s.expires_at > now()
    )
  ) with check (
    exists (
      select 1 from public.tenant_sessions s
      where s.reservation_id = photos.reservation_id
        and s.token = current_setting('request.headers', true)::json->>'x-tenant-token'
        and s.expires_at > now()
    )
  );

-- photos : admin tous droits
drop policy if exists "admin_all_photos" on public.photos;
create policy "admin_all_photos" on public.photos
  for all to authenticated using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com') with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');

-- pdf_reports : admin tous droits
drop policy if exists "admin_all_pdf_reports" on public.pdf_reports;
create policy "admin_all_pdf_reports" on public.pdf_reports
  for all to authenticated using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com') with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');

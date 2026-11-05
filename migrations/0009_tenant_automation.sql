-- ============================================================
-- Chantier 10 — sécurisation et automatisation des rapports locataires
-- À exécuter après 0007_tenant_checkin.sql et 0008_pdf_reports.sql dans le SQL Editor Supabase.
-- ============================================================

-- Une seule session locataire (donc un seul lien) par réservation.
with doublons_sessions as (
  select id,
         row_number() over (
           partition by reservation_id
           order by created_at desc, id desc
         ) as rang
  from public.tenant_sessions
)
delete from public.tenant_sessions s
using doublons_sessions d
where s.id = d.id and d.rang > 1;

create unique index if not exists tenant_sessions_reservation_uidx
  on public.tenant_sessions (reservation_id);

-- Les liens expirés ne doivent plus pouvoir lire leur session.
drop policy if exists "tenant_read_own_session" on public.tenant_sessions;
create policy "tenant_read_own_session" on public.tenant_sessions
  for select to anon
  using (
    token = current_setting('request.headers', true)::json->>'x-tenant-token'
    and expires_at > now()
  );

-- Le locataire ne lit que les champs nécessaires de sa propre session.
revoke all on public.tenant_sessions from anon;
grant select (id, reservation_id, token, expires_at) on public.tenant_sessions to anon;
-- Seul l’Edge Function service-role peut déposer ou supprimer des fichiers.
-- Le navigateur ne lit que les métadonnées strictement nécessaires à l’aperçu.
revoke all on public.photos from anon;
grant select (id, reservation_id, moment, room, created_at) on public.photos to anon;

alter table public.photos drop constraint if exists photos_path_scope_check;
alter table public.photos add constraint photos_path_scope_check check (
  path like reservation_id::text || '/' || moment || '/%'
  and room in ('living', 'kitchen', 'bedroom', 'mezzanine', 'bathroom', 'entrance')
  and mime in ('image/jpeg', 'image/png')
  and size is not null
  and size between 1 and 1500000
);

grant select, insert, update, delete on public.checklists to anon;

-- Job quotidien de purge. Créer au préalable dans Supabase Vault un secret
-- nommé `tenant-purge-cron-secret`, puis configurer la même valeur comme
-- secret Edge Function `CRON_SECRET`.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-tenant-data';

select cron.schedule(
  'purge-expired-tenant-data',
  '15 3 * * *',
  $job$
    select net.http_post(
      url := 'https://ykvieyeftewvxjralcym.supabase.co/functions/v1/purge-tenant-data',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'tenant-purge-cron-secret'
          limit 1
        )
      ),
      body := '{}'::jsonb
    );
  $job$
);

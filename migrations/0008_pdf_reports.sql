-- ============================================================
-- Chantier 10 — contrainte d’unicité des rapports locataires
-- À exécuter après 0007_tenant_checkin.sql dans le SQL Editor Supabase.
-- Idempotente : conserve le rapport le plus récent avant d’ajouter l’index.
-- ============================================================

with doublons as (
  select id,
         row_number() over (
           partition by reservation_id, moment
           order by created_at desc, id desc
         ) as rang
  from public.pdf_reports
)
delete from public.pdf_reports p
using doublons d
where p.id = d.id and d.rang > 1;

create unique index if not exists pdf_reports_reservation_moment_uidx
  on public.pdf_reports (reservation_id, moment);

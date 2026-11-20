-- ============================================================
-- Gruissan Cozy — Chantier 11 : sécurité (issue #44)
--
-- Points 1, 3 et 5 de l'issue :
--   1. séparer le guide public du guide locataire ;
--   2. contraindre les écritures anonymes (bookings, messages) ;
--   3. verrouiller les colonnes publiques (availability, packs, guide).
--
-- À exécuter après 0009_tenant_automation.sql dans le SQL Editor Supabase.
-- Idempotent : peut être rejoué sans effet de bord.
-- ============================================================

-- ============================================================
-- 1. Guide : visibilité public / locataire
--
-- La colonne `actif` ne protégeait rien : la politique anon était
-- `using (true)`, donc les lignes inactives restaient lisibles par l'API
-- publique. On ajoute une visibilité explicite et on filtre la RLS.
-- ============================================================
alter table public.guide_sections
  add column if not exists visibilite text not null default 'public';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'guide_sections_visibilite_check'
      and conrelid = 'public.guide_sections'::regclass
  ) then
    alter table public.guide_sections
      add constraint guide_sections_visibilite_check
      check (visibilite in ('public', 'tenant'));
  end if;
end
$$;

drop policy if exists "public_read_guide" on public.guide_sections;
create policy "public_read_guide" on public.guide_sections
  for select to anon
  using (actif and visibilite = 'public');

comment on column public.guide_sections.visibilite is
  'public : affichée sur /guide/ ; tenant : réservée à l''espace locataire (codes d''accès).';

-- ============================================================
-- 2. Écritures anonymes contraintes
--
-- La clé anon est publique : sans contrainte, n'importe qui pouvait
-- insérer une réservation « confirmée », un historique falsifié ou un
-- message déjà marqué lu. Les formulaires n'envoient que le minimum,
-- les valeurs par défaut couvrent le reste.
-- ============================================================
drop policy if exists "public_insert_bookings" on public.bookings;
create policy "public_insert_bookings" on public.bookings
  for insert to anon
  with check (
    statut = 'demande'
    and historique = '[]'::jsonb
    and (total_estime is null or total_estime >= 0)
    and char_length(btrim(nom)) between 1 and 120
    and char_length(btrim(email)) between 3 and 160
    and (telephone is null or char_length(telephone) <= 40)
    and (message is null or char_length(message) <= 2000)
    and check_out > check_in
    and guests between 1 and 8
  );

drop policy if exists "public_insert_messages" on public.messages;
create policy "public_insert_messages" on public.messages
  for insert to anon
  with check (
    statut = 'nouveau'
    and replies = '[]'::jsonb
    and historique = '[]'::jsonb
    and lu_at is null
    and char_length(btrim(nom)) between 1 and 120
    and char_length(btrim(email)) between 3 and 160
    and (telephone is null or char_length(telephone) <= 40)
    and (dates is null or char_length(dates) <= 120)
    and char_length(btrim(message)) between 1 and 4000
  );

-- ============================================================
-- 3. Colonnes publiques verrouillées
--
-- `availability.note` est un champ interne : on révoque l'accès table
-- puis on n'accorde que les colonnes lues par la page publique, comme
-- pour `sejours` en 0003.
-- ============================================================
revoke all on public.availability from anon;
grant select (start_date, end_date, statut) on public.availability to anon;

-- Les packs inactifs ne doivent plus être renvoyés par l'API publique.
drop policy if exists "public_read_packs" on public.packs;
create policy "public_read_packs" on public.packs
  for select to anon
  using (actif);

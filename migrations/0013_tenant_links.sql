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

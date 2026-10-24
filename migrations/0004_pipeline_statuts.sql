-- ============================================================
-- Gruissan Cozy — Chantier 5 : pipeline de statuts des demandes (#19)
--
-- Remplace l'ancien cycle de vie des messages
--   (nouveau → en_cours → repondu → archive)
-- par le pipeline :
--   nouveau → contacte → devis_envoye → confirme → termine
--   + refuse (état terminal alternatif)
--
-- ⚠️ ACTION MANUELLE REQUISE
-- Le token d'administration Supabase n'est pas disponible pour les
-- agents de code : CE FICHIER DOIT ÊTRE EXÉCUTÉ À LA MAIN.
--   Dashboard Supabase → SQL Editor → New query → coller ce fichier
--   → Run. L'interface /admin/messages dégrade proprement (bandeau
--   explicite) tant que la migration n'est pas appliquée.
--
-- Le script est IDEMPOTENT : il peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonne d'historique des changements de statut
--
-- On réutilise le motif déjà présent sur `bookings.historique` :
--   [{"at": "ISO", "by": "admin", "action": "statut", "detail": "nouveau → contacte"}]
-- Aucune table ni aucune structure nouvelle n'est inventée.
-- ------------------------------------------------------------
alter table public.messages
  add column if not exists historique jsonb not null default '[]'::jsonb;

-- ------------------------------------------------------------
-- 2. Conversion des valeurs héritées (idempotente)
--
-- La contrainte CHECK historique n'accepte que l'ancien jeu de
-- valeurs. On la remplace donc temporairement par une contrainte
-- LARGE (ancien + nouveau), on convertit les lignes existantes,
-- puis on resserre sur le nouveau pipeline.
--
--   nouveau  → nouveau      (inchangé)
--   en_cours → contacte     (la demande a été contactée)
--   repondu  → devis_envoye (une réponse a été apportée)
--   archive  → termine      (dossier clôturé)
-- ------------------------------------------------------------

-- 2a. Retirer la (ou les) contrainte(s) CHECK portant sur `statut`,
--     quel que soit son nom (le nom auto-généré est en général
--     `messages_statut_check`, mais on ne s'y fie pas).
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%statut%'
  loop
    execute format('alter table public.messages drop constraint if exists %I', c.conname);
  end loop;
end $$;

-- 2b. Contrainte large : accepte encore l'ancien et le nouveau jeu.
alter table public.messages
  add constraint messages_statut_check
  check (statut in (
    'nouveau', 'contacte', 'devis_envoye', 'confirme', 'termine', 'refuse',
    'en_cours', 'repondu', 'archive'
  ));

-- 2c. Conversion à proprement parler (ne touche que les valeurs héritées).
update public.messages
set statut = case statut
  when 'en_cours' then 'contacte'
  when 'repondu'  then 'devis_envoye'
  when 'archive'  then 'termine'
  else statut
end
where statut in ('en_cours', 'repondu', 'archive');

-- 2d. Resserrer sur le pipeline définitif.
alter table public.messages drop constraint if exists messages_statut_check;
alter table public.messages
  add constraint messages_statut_check
  check (statut in ('nouveau', 'contacte', 'devis_envoye', 'confirme', 'termine', 'refuse'));

-- ------------------------------------------------------------
-- 3. Index
--
-- Le filtre par statut de /admin/messages s'appuie sur cette colonne.
-- ------------------------------------------------------------
create index if not exists messages_statut_idx on public.messages (statut);

comment on column public.messages.historique is
  'Historique des changements de statut : [{"at": ISO, "by": "admin", "action": "statut", "detail": "avant → après"}]. Chantier 5 — pipeline des demandes.';

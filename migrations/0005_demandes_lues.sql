-- ============================================================
-- Gruissan Cozy — Chantier 4 : suivi LU / NON LU des demandes (#18)
--
-- Ajoute une colonne d'horodatage de lecture à la table
-- `messages` :
--   lu_at NULL  → demande NON LUE (nouveauté à traiter)
--   lu_at IS NOT NULL → demande lue (le propriétaire l'a ouverte)
--
-- Le back office s'en sert pour :
--   - signaler les demandes non lues (badge « non lu », compteur) ;
--   - persister le marquage lu / non lu (action groupée incluse).
--
-- ⚠️ ACTION MANUELLE REQUISE
-- Le token d'administration Supabase n'est pas disponible pour les
-- agents de code : CE FICHIER DOIT ÊTRE EXÉCUTÉ À LA MAIN.
--   Dashboard Supabase → SQL Editor → New query → coller ce fichier
--   → Run. Tant qu'elle n'est pas appliquée, /admin/messages et le
--   tableau de bord dégradent proprement (bandeau explicite) sans
--   casser le reste du back office.
--
-- Le script est IDEMPOTENT : il peut être relancé sans effet de bord.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Colonne d'horodatage de lecture
--
-- `null` est la valeur « non lu » : aucun default, aucun backfill
-- forcé. Les demandes déjà en base restent donc NON LUES après la
-- migration (elles ne sont pas marquées lues silencieusement : le
-- propriétaire doit pouvoir les retrouver).
-- ------------------------------------------------------------
alter table public.messages
  add column if not exists lu_at timestamptz;

comment on column public.messages.lu_at is
  'Horodatage de lecture de la demande : NULL = non lu, non NULL = lu. Chantier 4 — notifications (#18).';

-- ------------------------------------------------------------
-- 2. Index
--
-- Deux accès dominants :
--   a) compter / lister les demandes NON LUES (tableau de bord,
--      badge de navigation, filtre « non lues ») → index partiel,
--      le plus sélectif et le moins gros possible ;
--   b) filtre / tri général sur lu_at → index simple.
-- ------------------------------------------------------------
create index if not exists messages_non_lus_idx
  on public.messages (created_at desc)
  where lu_at is null;

create index if not exists messages_lu_at_idx
  on public.messages (lu_at);

-- ------------------------------------------------------------
-- 3. Repli optionnel : considérer les demandes existantes comme lues
--
-- Décommenter CE BLOC si l'on ne veut pas que les demandes déjà en
-- base apparaissent comme « non lues » après la migration (elles sont
-- généralement déjà traitées). Elles seront alors marquées comme lues
-- à leur date de réception.
--
-- ⚠️ Bloc volontairement commenté : le comportement par défaut
--    (toutes les demandes existantes restent non lues) est le plus
--    sûr, il ne fait disparaître aucun suivi.
-- ------------------------------------------------------------
-- update public.messages
--   set lu_at = created_at
--   where lu_at is null;

-- ============================================================
-- Vérification rapide (à exécuter après la migration) :
--
--   select lu_at is null as non_lu, count(*)
--   from public.messages
--   group by 1;
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'messages'
--     and column_name = 'lu_at';
-- ============================================================

-- ============================================================
-- Gruissan Cozy — Chantier 13 : effacement des coordonnées voyageur
--
-- Décision de kiki (2026-11-23) : les coordonnées du voyageur ne sont pas
-- conservées au titre d'une durée légale. Passé un délai court après le
-- départ, elles sont effacées par `purge-tenant-data`.
--
-- ⚠️ ACTION MANUELLE REQUISE
-- Le token d'administration Supabase n'est pas disponible pour les agents
-- de code : CE FICHIER DOIT ÊTRE EXÉCUTÉ À LA MAIN.
--   Dashboard Supabase → SQL Editor → New query → coller ce fichier → Run.
--
-- Cette migration n'ajoute AUCUNE colonne et ne change AUCUNE politique :
-- elle ne fait qu'ajouter deux index. Rien ne casse si elle est appliquée
-- après le merge du code, ni avant.
--
-- ORDRE : à exécuter après 0011, 0012 et 0013, avant de merger le code qui
-- déclenche la purge. Sans elle, la purge fonctionne quand même — elle est
-- simplement plus lente sur une grosse table.
-- ============================================================

-- ------------------------------------------------------------
-- 1. `sejours.depart`
--
-- La purge balaie les séjours dont le départ est antérieur à la date
-- d'échéance (`where depart < cutoff order by depart`). L'index existant
-- `sejours_dates_idx` porte sur (arrivee, depart) : il ne sert pas une
-- recherche sur `depart` seul. Sans cet index, chaque purge lit la table
-- entière.
-- ------------------------------------------------------------
create index if not exists sejours_depart_idx on public.sejours (depart);

-- ------------------------------------------------------------
-- 2. `messages.created_at`
--
-- `messages_created_idx` existe déjà (0001) sur (created_at desc) et suffit
-- au balayage `where created_at < cutoff`. Rien à ajouter : ce commentaire
-- existe pour qu'on ne cherche pas l'index manquant la prochaine fois.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 3. Vérification
--
-- Après exécution, ces deux requêtes doivent renvoyer un nombre, pas une
-- erreur. Elles ne modifient rien.
--
--   select count(*) from public.sejours where depart < current_date - 30;
--   select count(*) from public.messages where created_at < now() - interval '30 days';
--
-- Le second compte les messages que la prochaine purge va effacer. Si le
-- chiffre est important, c'est normal : la purge n'a encore jamais tourné.
-- ------------------------------------------------------------

comment on column public.sejours.client_nom is
  'Nom du voyageur. `not null` : la purge ne le met jamais à NULL, elle le '
  'remplace par un libellé neutre (voir _shared/purge.ts, NOM_ANONYMISE).';

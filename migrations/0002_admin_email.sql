-- ============================================================
-- Restriction de l'accès admin au propriétaire
--
-- Les policies de 0001 donnent accès complet à tout utilisateur
-- authentifié. Cette migration les resserre : seuls les comptes
-- dont l'email correspond peuvent lire/écrire les données admin.
--
-- À exécuter dans le SQL Editor de Supabase (idempotent).
-- ============================================================

do $$
declare
  owner_email text := 'gruissancozy@gmail.com';
  tbl text;
begin
  foreach tbl in array array['messages', 'bookings', 'availability', 'packs', 'guide_sections']
  loop
    -- Supprimer toutes les policies admin existantes sur la table
    execute format('drop policy if exists "admin_all_%s" on public.%I', tbl, tbl);
    execute format('drop policy if exists "admin_all_guide" on public.%I', tbl);
    -- Recréer la policy restreinte à l'email du propriétaire
    execute format(
      'create policy "admin_all_%s" on public.%I for all to authenticated using (auth.jwt() ->> ''email'' = %L) with check (auth.jwt() ->> ''email'' = %L)',
      tbl, tbl, owner_email, owner_email
    );
  end loop;
end $$;

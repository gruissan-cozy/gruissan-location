/**
 * Construction de l'URL du lien locataire (côté navigateur).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase. Il est
 * importé par le script de `/admin/sejours/` et couvert par
 * `tests/tenant-lien.test.ts`.
 *
 * Seule l'ADRESSE est construite ici : le jeton vient de l'Edge Function
 * `tenant-link` et n'est jamais fabriqué côté client. Les règles métier
 * (statut autorisé, bornes d'expiration) vivent dans
 * `supabase/functions/_shared/lien.ts`, une seule source de vérité partagée
 * avec la fonction.
 */

/** Langues acceptées dans le lien ; toute autre valeur retombe sur le français. */
const LANGUES_LIEN = ['fr', 'en', 'es', 'de'] as const;

/**
 * URL absolue ou relative du lien locataire.
 *
 * `base` est le `BASE_URL` Astro (« /gruissan-location/ » sur GitHub Pages).
 * Le jeton est encodé : un caractère réservé ne peut pas casser la requête.
 */
export function construireLienLocataire(base: string, token: string, lang: string | null | undefined): string {
  const racine = base.endsWith('/') ? base : `${base}/`;
  const langue = LANGUES_LIEN.includes((lang ?? '') as (typeof LANGUES_LIEN)[number]) ? lang! : 'fr';
  return `${racine}tenant/?lang=${langue}&token=${encodeURIComponent(token)}`;
}

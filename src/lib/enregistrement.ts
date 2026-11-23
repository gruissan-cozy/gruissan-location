/**
 * Numéro d'enregistrement de la mairie (meublé de tourisme non classé).
 *
 * Le champ `numero_enregistrement_mairie` de `content/site.json` est vide tant
 * que Kiki n'a pas obtenu le numéro. Règle d'or : **rien n'est affiché** quand
 * il est vide — pas de ligne vide, pas de placeholder, pas de « à compléter ».
 * Dès qu'il est renseigné, la mention traduite apparaît dans le pied de page.
 * Aucune valeur n'est inventée ici.
 */
import { t } from '../i18n';
import type { Lang } from '../i18n';

/** Échappe les caractères HTML avant insertion dans le fragment. */
function echappeHtml(valeur: string): string {
  return valeur.replace(/[&<>"']/g, (caractere) => {
    switch (caractere) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

/** Libellé traduit (le français sert de repli si la langue est inconnue). */
export function libelleEnregistrement(lang: Lang): string {
  return t[lang]?.['footer.enregistrement'] ?? t.fr['footer.enregistrement'];
}

/** Valeur lue dans le contenu, strictement : ni complétée, ni reconstituée. */
export function valeurEnregistrement(numero: unknown): string {
  return typeof numero === 'string' ? numero.trim() : '';
}

/**
 * Fragment HTML prêt à insérer dans le pied de page.
 * Chaîne vide si le numéro est absent : aucun élément n'est alors rendu.
 */
export function htmlEnregistrement(numero: unknown, lang: Lang): string {
  const valeur = valeurEnregistrement(numero);
  if (!valeur) return '';
  return `<p class="mt-3 text-xs text-ocean-200/60" data-enregistrement-mairie>${echappeHtml(libelleEnregistrement(lang))} ${echappeHtml(valeur)}</p>`;
}

/**
 * Logique pure des modèles de réponse (chantier 8 — #22).
 *
 * Module PUR : aucune dépendance au DOM, au réseau ou à Supabase.
 * Couvert par tests/modeles.test.ts.
 *
 * Un modèle est une réponse type (disponibilité, tarif, conditions…)
 * stockée dans `content/modeles-reponse.json` et insérable en un clic
 * dans le champ de réponse de la messagerie admin. Les variables sont
 * substituées : `{nom}`, `{dates}`, `{tarif}`, `{sejour}`…
 *
 * Règles de sécurité :
 *   - une variable non fournie n'est JAMAIS remplacée par une valeur
 *     inventée : elle reste telle quelle dans le texte (le propriétaire
 *     voit `{nom}` et sait qu'il doit la remplir) ;
 *   - le rendu est du texte brut : aucune balise HTML n'est ajoutée, le
 *     champ de réponse étant échappé à l'affichage.
 */

// ---------------------------------------------------------------------------
// Données
// ---------------------------------------------------------------------------

/** Un modèle de réponse. */
export interface ModeleReponse {
  /** Identifiant stable du modèle. */
  id: string;
  /** Catégorie d'affichage (disponibilite, tarif, conditions…). */
  categorie: string;
  /** Libellé du modèle dans les 4 langues. */
  nom: Record<string, string>;
  /** Texte du modèle avec variables `{nom}`, `{dates}`… */
  texte: string;
  /** Variables attendues (informatif, affiché dans le back office). */
  variables?: string[];
}

/** Texte rendu d'un modèle, prêt à être inséré dans le champ de réponse. */
export interface RenduModele {
  texte: string;
  /** Variables du modèle qui n'ont pas pu être remplacées. */
  manquantes: string[];
  /** Variables du modèle qui ont été remplacées. */
  remplacees: string[];
}

/** Contexte de substitution : `{ nom: 'Durand', dates: '10 → 17 juillet' }`. */
export type Contexte = Readonly<Record<string, unknown>>;

// ---------------------------------------------------------------------------
// Découverte des variables
// ---------------------------------------------------------------------------

/** Motif d'une variable : `{nom}`, `{date_arrivee}`, `{prix_total}`. */
export const VARIABLE_RE = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Variables utilisées dans un texte, sans doublon, dans l'ordre
 * d'apparition. Tout le reste (`{{nom}}`, `{ nom }`, `{1}`) est ignoré.
 */
export function extraireVariables(texte: unknown): string[] {
  if (typeof texte !== 'string' || !texte) return [];
  const vues = new Set<string>();
  for (const m of texte.matchAll(VARIABLE_RE)) vues.add(m[1]);
  return [...vues];
}

/**
 * Variables déclarées par le modèle (`variables`) qui ne figurent pas
 * dans le texte : un modèle mal déclaré, signalé au propriétaire.
 */
export function variablesDeclaresInutiles(modele: Pick<ModeleReponse, 'texte' | 'variables'>): string[] {
  const declarees = Array.isArray(modele.variables) ? modele.variables : [];
  const utilisees = new Set(extraireVariables(modele.texte));
  return declarees.filter((v) => !utilisees.has(v));
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

/**
 * Substitue les variables d'un modèle.
 *
 * - une variable présente dans le contexte est remplacée par sa valeur,
 *   convertie en chaîne et échappée si elle contient des accolades (une
 *   valeur `{x}` ne doit pas être relue comme une variable) ;
 * - une variable absente du contexte reste inchangée et est listée dans
 *   `manquantes` : rien n'est inventé.
 */
export function rendreModele(modele: Pick<ModeleReponse, 'texte'>, contexte: Contexte = {}): RenduModele {
  const texte = typeof modele.texte === 'string' ? modele.texte : '';
  const remplacees = new Set<string>();
  const manquantes = new Set<string>();

  const rendu = texte.replace(VARIABLE_RE, (correspondance: string, nom: string) => {
    if (!Object.prototype.hasOwnProperty.call(contexte, nom)) {
      manquantes.add(nom);
      return correspondance;
    }
    const valeur = contexte[nom];
    remplacees.add(nom);
    return echapperVariable(String(valeur ?? ''));
  });

  return {
    texte: rendu.trim(),
    manquantes: [...manquantes],
    remplacees: [...remplacees],
  };
}

/**
 * Échappe une valeur de variable : les accolades deviennent `\{{` et
 * `\}}` afin qu'une valeur contenant `{nom}` ne soit pas substituée à
 * son tour lors d'un second rendu.
 */
export function echapperVariable(valeur: string): string {
  return valeur.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

// ---------------------------------------------------------------------------
// Validation d'un modèle
// ---------------------------------------------------------------------------

/**
 * Anomalies d'un modèle de réponse : texte vide, libellé manquant dans
 * une langue, variable déclarée mais absente du texte.
 */
export function anomaliesModele(modele: Partial<ModeleReponse>): string[] {
  const anomalies: string[] = [];
  if (typeof modele.id !== 'string' || !modele.id.trim()) anomalies.push('id_manquant');
  if (typeof modele.texte !== 'string' || !modele.texte.trim()) anomalies.push('texte_vide');
  const nom = modele.nom;
  if (!nom || typeof nom !== 'object') {
    anomalies.push('nom_absent');
  } else {
    for (const lang of ['fr', 'en', 'es', 'de']) {
      const valeur = (nom as Record<string, unknown>)[lang];
      if (typeof valeur !== 'string' || !valeur.trim()) anomalies.push(`nom_${lang}_vide`);
    }
  }
  if (modele.variables) anomalies.push(...variablesDeclaresInutiles(modele as ModeleReponse).map((v) => `variable_inutilisee:${v}`));
  return anomalies;
}

/** Vrai si le modèle est exploitable (aucune anomalie bloquante). */
export function modeleValide(modele: Partial<ModeleReponse>): boolean {
  return anomaliesModele(modele).length === 0;
}

// ---------------------------------------------------------------------------
// Sélection depuis le contenu
// ---------------------------------------------------------------------------

/**
 * Modèles valides d'une liste, avec leurs anomalies à côté.
 *
 * Un modèle cassé n'est pas insérable : il est renvoyé avec ses anomalies
 * pour être affiché désactivé dans le back office (jamais inséré par
 * erreur dans un champ de réponse).
 */
export function selectionnerModeles(modeles: ReadonlyArray<Partial<ModeleReponse>>): Array<{
  modele: ModeleReponse;
  anomalies: string[];
  valide: boolean;
}> {
  return (modeles ?? [])
    .filter((m): m is Partial<ModeleReponse> => Boolean(m) && typeof m === 'object')
    .map((m) => {
      const anomalies = anomaliesModele(m);
      return {
        modele: m as ModeleReponse,
        anomalies,
        valide: anomalies.length === 0,
      };
    });
}

// ---------------------------------------------------------------------------
// Insertion dans le champ de réponse
// ---------------------------------------------------------------------------

/** Position d'insertion dans un champ texte. */
export interface Position {
  debut: number;
  fin: number;
}

/** Valeur contenue entre deux bornes, bornes incluses. */
export function extraireIntervalle(texte: string, debut: number, fin: number): string {
  const taille = texte.length;
  if (taille === 0) return '';
  const a = Math.max(0, Math.min(debut, taille - 1));
  const b = Math.max(a - 1, Math.min(fin, taille - 1));
  return texte.slice(a, b + 1);
}

/**
 * Insère un texte rendu dans le contenu du champ, à la position donnée.
 *
 * - sans position (champ vierge) : le texte remplace tout ;
 * - le texte inséré est séparé du contenu existant par un saut de ligne,
 *   et le texte existant est conservé (aucune perte de saisie) ;
 * - une position aberrante (bornes inversées, hors limites) est ramenée
 *   à la fin du champ : on n'insère jamais « nulle part ».
 */
export function insererDansChamp(contenu: string, texte: string, position?: Position): string {
  const base = typeof contenu === 'string' ? contenu : '';
  const ajout = typeof texte === 'string' ? texte.trim() : '';
  if (!ajout) return base;

  let curseur = base.length;
  if (position && Number.isFinite(position.debut) && Number.isFinite(position.fin)) {
    curseur = Math.max(0, Math.min(Math.round(position.debut), base.length));
  }

  // Saut de ligne autour du texte inséré quand il reste du contenu des deux
  // côtés du point d'insertion : la réponse reste lisible. Jamais de blanc
  // en tête (insertion en fin de champ) ni de saut de ligne inutile.
  const avant = base.slice(0, curseur);
  const apres = base.slice(curseur);
  // Séparateur du côté où il reste du texte : insérer « X » au début de
  // « Bonjour » donne « X\nBonjour », à la fin « Bonjour\nX », au milieu
  // « Bonjour \nX\nle monde ». Aucun saut de ligne inutile n'est ajouté
  // quand le texte inséré est seul ou en queue de champ.
  const sepAvant = avant.length > 0 && !avant.endsWith('\n') ? '\n' : '';
  const sepApres = apres.length > 0 && !ajout.endsWith('\n') ? '\n' : '';
  return `${avant}${sepAvant}${ajout}${sepApres}${apres}`;
}

/**
 * Prépare l'écriture d'un modèle dans le champ de réponse d'un message :
 * rendu + insertion au curseur + position du curseur après insertion.
 *
 * `position` décrit la sélection courante du champ (bornes de sélection).
 */
export function preparerInsertion(
  modele: Pick<ModeleReponse, 'texte'>,
  contenuChamp: string,
  contexte: Contexte = {},
  position?: Position,
): { contenu: string; manquantes: string[] } {
  const rendu = rendreModele(modele, contexte);
  const contenu = insererDansChamp(contenuChamp, rendu.texte, position);
  return { contenu, manquantes: rendu.manquantes };
}

/** Position du curseur après insertion (fin du texte inséré). */
export function curseurApresInsertion(contenu: string, texte: string, position?: Position): number {
  const base = typeof contenu === 'string' ? contenu : '';
  const ajout = typeof texte === 'string' ? texte.trim() : '';
  if (!ajout) return base.length;
  let curseur = base.length;
  if (position && Number.isFinite(position.debut) && Number.isFinite(position.fin)) {
    curseur = Math.max(0, Math.min(Math.round(position.debut), base.length));
  }
  return curseur + ajout.length;
}

// ---------------------------------------------------------------------------
// Libellé du modèle
// ---------------------------------------------------------------------------

/** Libellé du modèle dans la langue demandée, avec repli (comme une tâche). */
export function libellerModele(
  modele: Pick<ModeleReponse, 'nom' | 'id'>,
  lang: string,
): string {
  const nom = (modele.nom ?? {}) as Record<string, unknown>;
  for (const cle of [lang, 'fr', ...Object.keys(nom)]) {
    const valeur = nom[cle];
    if (typeof valeur === 'string' && valeur.trim()) return valeur.trim();
  }
  return modele.id || '—';
}

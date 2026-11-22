/**
 * Contrôle de disponibilité du formulaire de réservation (`/reserver/`).
 *
 * SOURCE UNIQUE — c'est ici, et nulle part ailleurs, qu'une demande de dates
 * est validée. La décision s'appuie sur les mêmes fonctions pures que le
 * calendrier public (`plagesOccupees` puis `datesOccupees` de
 * src/lib/calendrier.ts) : séjours (`depart` EXCLUSIF) + blocages
 * `calendar_blocks` (`fin` INCLUSIVE). Le formulaire et la vitrine ne peuvent
 * donc plus se contredire.
 *
 * CE QUI NE VALIDE PLUS UNE RÉSERVATION — et ne doit jamais y revenir :
 *   - la table `availability` (`statut = 'reserve'`, granularité MENSUELLE),
 *     encore écrivable depuis /admin/disponibilites/ ;
 *   - `content/disponibilites.json`, son repli statique.
 * Ces deux sources restent en place comme repli d'AFFICHAGE de la vitrine
 * (voir src/lib/disponibilites.ts) : elles décrivent des MOIS, pas des nuits,
 * et ne peuvent donc pas décider si une nuit précise est libre.
 *
 * Différence assumée avec la vitrine : une lecture partielle (une table
 * illisible) n'empêche jamais d'envoyer une demande — le formulaire répond
 * « à confirmer », jamais « indisponible » sur une source qu'il n'a pas pu
 * lire. La vitrine, elle, reste conservatrice parce qu'elle n'a pas de
 * confirmation humaine derrière. Un vrai conflit détecté bloque dans les deux
 * cas.
 *
 * Module PUR : aucun DOM, aucun réseau, aucun Supabase. La lecture des tables
 * vit dans le composant (script navigateur) ; la décision est ici, et
 * tests/reservation-disponibilite.test.ts la couvre.
 */

import { STATUTS_BLOQUANTS } from './sejours';
import {
  datesOccupees,
  plagesOccupees,
  type LigneBlocage,
  type LigneSejour,
  type Plage,
} from './calendrier';

/**
 * Verdict rendu au formulaire.
 *
 * - `libre`       : aucune plage occupée ne touche les dates demandées ;
 * - `occupe`      : un séjour `option`/`confirme` ou un blocage est touché ;
 * - `a_confirmer` : une des deux tables n'a pas pu être lue, donc on ne peut
 *                   ni affirmer « libre » ni refuser la demande.
 */
export type VerdictDates = 'libre' | 'occupe' | 'a_confirmer';

/** Ligne de `sejours` telle que le public peut la lire (dates, et statut si fourni). */
export interface LigneSejourStatut extends LigneSejour {
  statut?: unknown;
}

export interface ControleDates {
  verdict: VerdictDates;
  /**
   * Plages occupées réellement lues, après conversion des deux conventions.
   * Exposé pour les tests et le diagnostic : le formulaire ne s'en sert pas
   * (il ne lit que `verdict`), ce n'est donc pas du code mort.
   */
  plages: Plage[];
  /** Au moins une des deux lectures a échoué (table absente, RLS, réseau). */
  lecturePartielle: boolean;
}

/**
 * Ne garde que les séjours qui bloquent le calendrier.
 *
 * En pratique la politique RLS de migrations/0003_sejours.sql ne laisse déjà
 * sortir que `option` et `confirme` (et seulement les colonnes de dates) : le
 * filtre est une seconde barrière, utile quand une ligne arrive d'une autre
 * source (test, back office, future lecture authentifiée). Une ligne SANS
 * statut est considérée bloquante : on ne libère jamais des dates par défaut.
 */
export function sejoursBloquants(
  lignes: ReadonlyArray<LigneSejourStatut> | null,
): LigneSejourStatut[] {
  return (lignes ?? []).filter((ligne) => {
    const statut = ligne?.statut;
    if (statut === undefined || statut === null) return true;
    return (STATUTS_BLOQUANTS as ReadonlyArray<string>).includes(String(statut));
  });
}

/**
 * Décide si une demande `arrivee` → `depart` (départ exclusif, convention
 * hôtelière : le jour du départ redevient réservable) est acceptable.
 *
 * `null` signifie « lecture en échec » (table absente, RLS, réseau) ; un
 * tableau vide signifie « aucune ligne » et reste une lecture complète. C'est
 * exactement le contrat de `lireDates` dans le composant et dans
 * src/lib/disponibilites.ts : ne pas le changer d'un côté seulement.
 */
export function controlerDates(
  arrivee: string,
  depart: string,
  sejours: ReadonlyArray<LigneSejourStatut> | null,
  blocages: ReadonlyArray<LigneBlocage> | null,
): ControleDates {
  const plages = plagesOccupees(sejoursBloquants(sejours), blocages ?? []);
  const lecturePartielle = !sejours || !blocages;

  if (datesOccupees(arrivee, depart, plages)) {
    return { verdict: 'occupe', plages, lecturePartielle };
  }
  if (lecturePartielle) {
    return { verdict: 'a_confirmer', plages, lecturePartielle };
  }
  return { verdict: 'libre', plages, lecturePartielle };
}

/**
 * Point d'entrée du formulaire : mêmes règles que `controlerDates`, mais à
 * partir des tableaux BRUTS rendus par la lecture Supabase (`unknown[] | null`).
 *
 * C'est le SEUL endroit qui convertit le résultat d'une requête en lignes
 * typées — et il conserve `null` tel quel. Ne jamais écrire
 * `controlerDates(…, (sejours ?? []) as …)` dans un composant : le `?? []`
 * transformerait « lecture en échec » en « aucune ligne », donc `libre` au lieu
 * de `a_confirmer`, et le visiteur lirait « Ces dates semblent libres » alors
 * que rien n'a pu être vérifié.
 */
export function controlerLectures(
  arrivee: string,
  depart: string,
  sejours: ReadonlyArray<unknown> | null,
  blocages: ReadonlyArray<unknown> | null,
): ControleDates {
  return controlerDates(
    arrivee,
    depart,
    sejours as ReadonlyArray<LigneSejourStatut> | null,
    blocages as ReadonlyArray<LigneBlocage> | null,
  );
}

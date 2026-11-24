import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  construireAlerteDemande,
  envoyerAlerteDemande,
  formaterDateAlerte,
  formaterPrixEstime,
  formaterVoyageurs,
  LIEN_ADMIN_DEMANDES,
  SECRETS_ALERTE_DEMANDE,
  type DemandePourAlerte,
  type EnvironnementAlerte,
} from '../src/lib/notifications';

/**
 * Demande réaliste : les champs personnels sont volontairement présents dans
 * l'entrée pour vérifier qu'aucun d'entre eux ne sort dans le payload.
 * Le type d'entrée du module est réduit aux seuls champs autorisés, mais un
 * séjour complet du back office lui est structurellement assignable.
 */
function demandeRealiste(): DemandePourAlerte & Record<string, unknown> {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    arrivee: '2026-07-10',
    depart: '2026-07-17',
    adultes: 2,
    mineurs: 1,
    prix_estime: 1250,
    client_nom: 'Camille Durand',
    client_email: 'camille.durand@exemple.fr',
    client_telephone: '0612345678',
    client_message: 'Nous serons avec un enfant de 8 ans.',
    note: 'Demande à rappeler rapidement',
    statut: 'demande',
  };
}

const SECRETS_TEST: EnvironnementAlerte = {
  ALERTE_DEMANDE_WEBHOOK_URL: 'https://exemple.invalid/relais',
  ALERTE_DEMANDE_WEBHOOK_SECRET: 'valeur-de-test',
};

describe('construireAlerteDemande', () => {
  it('construit un message avec dates, adultes, mineurs, prix et lien', () => {
    const alerte = construireAlerteDemande(demandeRealiste());

    expect(alerte.titre).toBe('Nouvelle demande de réservation');
    expect(alerte.message).toContain('10/07/2026');
    expect(alerte.message).toContain('17/07/2026');
    expect(alerte.message).toContain('2 adultes');
    expect(alerte.message).toContain('1 mineur');
    expect(alerte.message).toContain('1 250,00 €');
    expect(alerte.message).toContain('/admin/demandes/');
    expect(alerte.lien).toBe('/admin/demandes/');
    expect(LIEN_ADMIN_DEMANDES).toBe('/admin/demandes/');
  });

  it('ne met aucune donnée personnelle dans le payload', () => {
    const payload = JSON.stringify(construireAlerteDemande(demandeRealiste()));

    for (const valeur of [
      'Camille Durand',
      'camille.durand@exemple.fr',
      'camille.durand',
      '0612345678',
      'Nous serons avec un enfant',
      'Demande à rappeler',
      '11111111-2222-3333-4444-555555555555',
    ]) {
      expect(payload).not.toContain(valeur);
    }
    expect(payload).not.toContain('@');
    expect(payload).not.toMatch(/\b\d{10}\b/);
  });

  it('écarte toute valeur injectée dans un champ de date', () => {
    const alerte = construireAlerteDemande({
      arrivee: 'camille@exemple.fr 0612345678',
      depart: '2026-07-17',
      adultes: 2,
      mineurs: 0,
    });

    const payload = JSON.stringify(alerte);
    expect(payload).not.toContain('camille@exemple.fr');
    expect(payload).not.toContain('0612345678');
    expect(payload).toContain('à confirmer');
  });

  it('ne modifie pas la demande et reste déterministe', () => {
    const sejour = demandeRealiste();
    const avant = structuredClone(sejour);

    const premier = construireAlerteDemande(sejour);
    const second = construireAlerteDemande(sejour);

    expect(sejour).toEqual(avant);
    expect(second).toEqual(premier);
  });

  it('ne remplace jamais un prix absent par zéro', () => {
    const alerte = construireAlerteDemande({
      arrivee: '2026-07-10',
      depart: '2026-07-17',
      prix_estime: null,
    });

    expect(alerte.message).toContain('Prix estimé : non renseigné');
    expect(alerte.message).not.toContain('0,00 €');
  });

  it('annonce les voyageurs non renseignés sans en inventer', () => {
    const alerte = construireAlerteDemande({
      arrivee: '2026-07-10',
      depart: '2026-07-17',
      adultes: -3,
      mineurs: 'pas-un-nombre' as unknown as number,
    });

    expect(alerte.message).toContain('Voyageurs : non renseignés.');
  });

  it('gère le singulier et le zéro', () => {
    const alerte = construireAlerteDemande({
      arrivee: '2026-07-10',
      depart: '2026-07-17',
      adultes: 1,
      mineurs: 0,
    });

    expect(alerte.message).toContain('1 adulte et 0 mineurs');
  });
});

describe('formateurs purs', () => {
  it('formate une date ISO sans dépendre du fuseau horaire', () => {
    expect(formaterDateAlerte('2026-07-10')).toBe('10/07/2026');
    expect(formaterDateAlerte(' 2026-01-02 ')).toBe('02/01/2026');
  });

  it('refuse les dates invalides au lieu de recopier une valeur arbitraire', () => {
    expect(formaterDateAlerte('2026-13-01')).toBe('à confirmer');
    expect(formaterDateAlerte('10/07/2026')).toBe('à confirmer');
    expect(formaterDateAlerte(null)).toBe('à confirmer');
  });

  it('formate le prix en euros avec deux décimales', () => {
    expect(formaterPrixEstime(1250)).toBe('1 250,00 €');
    expect(formaterPrixEstime('1250.5')).toBe('1 250,50 €');
    expect(formaterPrixEstime(0)).toBe('0,00 €');
  });

  it('refuse un prix invalide plutôt que de le fabriquer', () => {
    expect(formaterPrixEstime('abc')).toBe('non renseigné');
    expect(formaterPrixEstime(-10)).toBe('non renseigné');
    expect(formaterPrixEstime(undefined)).toBe('non renseigné');
  });

  it('normalise les effectifs entiers positifs', () => {
    expect(formaterVoyageurs(2.9, 1)).toBe('2 adultes et 1 mineur');
    expect(formaterVoyageurs(null, null)).toBe('non renseignés');
  });
});

describe('envoyerAlerteDemande', () => {
  it('retourne un résultat explicite quand les secrets manquent', () => {
    const resultat = envoyerAlerteDemande(demandeRealiste(), {});

    expect(resultat.envoye).toBe(false);
    expect(resultat.raison).toBe('configuration_manquante');
    expect(resultat.secretsManquants).toEqual([...SECRETS_ALERTE_DEMANDE]);
    expect(resultat.alerte).toEqual(construireAlerteDemande(demandeRealiste()));
  });

  it('signale le secret manquant quand un seul est présent', () => {
    const sansSecret = envoyerAlerteDemande(demandeRealiste(), {
      ALERTE_DEMANDE_WEBHOOK_URL: 'https://exemple.invalid/relais',
    });
    expect(sansSecret.raison).toBe('configuration_manquante');
    expect(sansSecret.secretsManquants).toEqual(['ALERTE_DEMANDE_WEBHOOK_SECRET']);

    const sansUrl = envoyerAlerteDemande(demandeRealiste(), {
      ALERTE_DEMANDE_WEBHOOK_SECRET: 'valeur-de-test',
    });
    expect(sansUrl.raison).toBe('configuration_manquante');
    expect(sansUrl.secretsManquants).toEqual(['ALERTE_DEMANDE_WEBHOOK_URL']);
  });

  it('ne prétend pas envoyer quand les secrets sont présents : le branchement reste à faire', () => {
    const resultat = envoyerAlerteDemande(demandeRealiste(), SECRETS_TEST);

    expect(resultat.envoye).toBe(false);
    expect(resultat.raison).toBe('integration_non_branchee');
    expect(resultat.secretsManquants).toEqual([]);
  });

  it('ne lève aucune exception et n’écrit ni secret ni donnée personnelle dans les logs', () => {
    const espions = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];

    expect(() => envoyerAlerteDemande(demandeRealiste(), {})).not.toThrow();
    expect(() => envoyerAlerteDemande(demandeRealiste(), SECRETS_TEST)).not.toThrow();

    for (const espion of espions) {
      expect(espion).not.toHaveBeenCalled();
      espion.mockRestore();
    }
  });

  it('ne laisse fuir aucune valeur de secret dans le résultat', () => {
    const resultat = JSON.stringify(envoyerAlerteDemande(demandeRealiste(), SECRETS_TEST));

    expect(resultat).not.toContain('valeur-de-test');
    expect(resultat).not.toContain('exemple.invalid');
  });

  it('tolère une demande vide ou mal formée sans lever d’exception', () => {
    const vide = envoyerAlerteDemande({} as DemandePourAlerte, {});
    const nulle = envoyerAlerteDemande(null as unknown as DemandePourAlerte, {});

    for (const resultat of [vide, nulle]) {
      expect(resultat.envoye).toBe(false);
      expect(resultat.alerte.message).toContain('à confirmer');
      expect(resultat.alerte.message).toContain('non renseigné');
    }
  });
});

describe('pureté du module', () => {
  const source = readFileSync(
    new URL('../src/lib/notifications.ts', import.meta.url),
    'utf8',
  );

  it('n’effectue aucun appel réseau', () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
  });

  it('ne dépend ni de Supabase ni du DOM', () => {
    expect(source).not.toMatch(/@supabase/);
    expect(source).not.toMatch(/createClient/);
    expect(source).not.toMatch(/\bdocument\./);
  });

  it('n’écrit rien dans la console', () => {
    expect(source).not.toMatch(/console\./);
  });
});

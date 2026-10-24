import { describe, it, expect } from 'vitest';
import {
  afficherSectionAvis,
  avisVisibles,
  estAvisPubliable,
  estDateIsoValide,
  noteMoyenne,
  dateAffichee,
  cleSourceAvis,
  faqJsonLd,
  avisJsonLd,
  jsonLd,
  type Avis,
  type FaqEntree,
} from '../src/lib/confiance';

const avisValide = (surcharge: Partial<Avis> = {}): Avis => ({
  note: 5,
  auteur: 'Marie L.',
  date: '2026-07-18',
  source: 'airbnb',
  texte: { fr: 'Séjour parfait.', en: 'Perfect stay.', es: 'Estancia perfecta.', de: 'Perfekter Aufenthalt.' },
  ...surcharge,
});

describe('estDateIsoValide', () => {
  it('accepte une date réelle', () => {
    expect(estDateIsoValide('2026-07-18')).toBe(true);
  });

  it('rejette un jour inexistant', () => {
    expect(estDateIsoValide('2026-02-30')).toBe(false);
  });

  it('rejette un format non ISO', () => {
    expect(estDateIsoValide('18/07/2026')).toBe(false);
    expect(estDateIsoValide('2026-7-8')).toBe(false);
    expect(estDateIsoValide('')).toBe(false);
  });
});

describe('estAvisPubliable — aucun avis fabriqué ou incomplet ne doit passer', () => {
  it('accepte un avis complet', () => {
    expect(estAvisPubliable(avisValide(), 'fr')).toBe(true);
  });

  it('refuse un avis sans texte dans la langue affichée', () => {
    const a = avisValide({ texte: { fr: 'Bien' } });
    expect(estAvisPubliable(a, 'fr')).toBe(true);
    expect(estAvisPubliable(a, 'de')).toBe(false);
  });

  it('refuse un texte vide ou composé d’espaces', () => {
    expect(estAvisPubliable(avisValide({ texte: { fr: '   ' } }), 'fr')).toBe(false);
  });

  it('refuse une note hors barème ou non entière', () => {
    expect(estAvisPubliable(avisValide({ note: 0 }), 'fr')).toBe(false);
    expect(estAvisPubliable(avisValide({ note: 6 }), 'fr')).toBe(false);
    expect(estAvisPubliable(avisValide({ note: 4.5 }), 'fr')).toBe(false);
  });

  it('refuse un auteur vide', () => {
    expect(estAvisPubliable(avisValide({ auteur: '  ' }), 'fr')).toBe(false);
  });

  it('refuse une date invalide', () => {
    expect(estAvisPubliable(avisValide({ date: '2026-02-30' }), 'fr')).toBe(false);
  });
});

describe('afficherSectionAvis — la section disparaît sans avis publiable', () => {
  it('masque la section pour une liste vide', () => {
    expect(afficherSectionAvis([], 'fr')).toBe(false);
  });

  it('masque la section si aucun avis n’est publiable', () => {
    expect(afficherSectionAvis([avisValide({ note: 0 }), avisValide({ auteur: '' })], 'fr')).toBe(false);
  });

  it('masque la section si les avis n’existent que dans une autre langue', () => {
    expect(afficherSectionAvis([avisValide({ texte: { fr: 'Bien' } })], 'en')).toBe(false);
  });

  it('affiche la section dès qu’un avis est publiable', () => {
    expect(afficherSectionAvis([avisValide()], 'fr')).toBe(true);
  });

  it('tolère une entrée non tableau', () => {
    expect(afficherSectionAvis(undefined as unknown as Avis[], 'fr')).toBe(false);
  });
});

describe('avisVisibles', () => {
  it('trie du plus récent au plus ancien', () => {
    const res = avisVisibles(
      [avisValide({ date: '2026-05-01' }), avisValide({ date: '2026-08-20' }), avisValide({ date: '2026-06-15' })],
      'fr',
    );
    expect(res.map((a) => a.date)).toEqual(['2026-08-20', '2026-06-15', '2026-05-01']);
  });

  it('filtre les avis non publiables', () => {
    const res = avisVisibles([avisValide(), avisValide({ note: 9 })], 'fr');
    expect(res).toHaveLength(1);
  });
});

describe('noteMoyenne', () => {
  it('renvoie null sans avis publiable', () => {
    expect(noteMoyenne([], 'fr')).toBeNull();
  });

  it('arrondit au dixième', () => {
    const res = noteMoyenne([avisValide({ note: 5 }), avisValide({ note: 4 }), avisValide({ note: 4 })], 'fr');
    expect(res).toBe(4.3);
  });
});

describe('dateAffichee', () => {
  it('formate la date dans chaque langue', () => {
    expect(dateAffichee('2026-07-18', 'fr')).toBe('18 Juillet 2026');
    expect(dateAffichee('2026-07-18', 'en')).toBe('18 July 2026');
    expect(dateAffichee('2026-07-18', 'es')).toBe('18 Julio 2026');
    expect(dateAffichee('2026-07-18', 'de')).toBe('18 Juli 2026');
  });

  it('renvoie une chaîne vide pour une date invalide', () => {
    expect(dateAffichee('2026-02-30', 'fr')).toBe('');
  });
});

describe('cleSourceAvis', () => {
  it('renvoie la clé i18n d’une source connue', () => {
    expect(cleSourceAvis('airbnb')).toBe('avis.source.airbnb');
    expect(cleSourceAvis('google')).toBe('avis.source.google');
  });

  it('renvoie null pour une source inconnue', () => {
    expect(cleSourceAvis('inconnue')).toBeNull();
  });
});

describe('faqJsonLd', () => {
  const entrees: FaqEntree[] = [
    { id: 'menage', a_valider: true, question: { fr: 'Le ménage ?' }, reponse: { fr: 'En option.' } },
    { id: 'vide', a_valider: true, question: { fr: 'Sans réponse' }, reponse: { fr: '   ' } },
  ];

  it('ne garde que les entrées complètes', () => {
    const ld = faqJsonLd(entrees, 'fr');
    expect(ld.mainEntity).toHaveLength(1);
    expect(ld.mainEntity[0].name).toBe('Le ménage ?');
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe('En option.');
  });

  it('produit un balisage FAQPage valide', () => {
    const ld = faqJsonLd(entrees, 'fr');
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.inLanguage).toBe('fr');
  });
});

describe('avisJsonLd', () => {
  it('renvoie null sans avis publiable (aucune donnée inventée)', () => {
    expect(avisJsonLd([], 'fr')).toBeNull();
  });

  it('agrège la note et liste chaque avis', () => {
    const ld = avisJsonLd([avisValide({ note: 5 }), avisValide({ note: 4, date: '2026-06-01' })], 'fr');
    const graph = ld!['@graph'] as Array<Record<string, unknown>>;
    const aggregate = graph[0];
    expect(aggregate['@type']).toBe('AggregateRating');
    expect(aggregate.ratingValue).toBe(4.5);
    expect(aggregate.reviewCount).toBe(2);
    expect(graph).toHaveLength(3); // 1 agrégat + 2 avis
  });
});

describe('jsonLd', () => {
  it('échappe les chevrons pour ne pas fermer la balise script', () => {
    const sortie = jsonLd({ texte: '</script><script>alert(1)</script>' });
    expect(sortie).not.toContain('</script>');
    expect(sortie).toContain('\\u003c');
  });
});

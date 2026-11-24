import { describe, expect, it } from 'vitest';
import {
  MOTIFS_SECRET,
  detecterSecrets,
  detecterSqlConcatene,
  envIgnoreParGitignore,
  politiquesAdminOuvertes,
  sourceSetHtmlAuditee,
  tablesSansRls,
} from '../scripts/security-check.mjs';

/**
 * Garde du garde : `npm run security:check` est le seul contrôle de sécurité
 * automatisé du dépôt. S'il se trompe (faux négatif), une fuite passe en
 * production sans que personne ne le sache ; s'il crie au loup, on apprend à
 * l'ignorer — les deux sont pires que pas de garde du tout.
 *
 * Ces tests couvrent les fonctions pures du script. Le script lui-même n'est
 * exécuté qu'appelé directement (`node scripts/security-check.mjs`), donc son
 * import ici n'a aucun effet de bord.
 */

describe('detecterSecrets', () => {
  it('reconnaît chaque signature listée', () => {
    const exemples = [
      `sbp_${'a'.repeat(40)}`,
      `ghp_${'b'.repeat(36)}`,
      `sk-${'c'.repeat(32)}`,
      `re_${'d'.repeat(24)}`,
      '-----BEGIN RSA PRIVATE KEY-----',
      '"role": "service_role"',
      `eyJ${'e'.repeat(60)}.eyJ${'f'.repeat(60)}`,
    ];
    for (const exemple of exemples) {
      expect(detecterSecrets(exemple), exemple).not.toEqual([]);
    }
  });

  it('laisse passer le code et la documentation ordinaires', () => {
    const benignes = [
      'const token = req.headers.get("x-tenant-token");',
      'SUPABASE_SERVICE_ROLE_KEY est fournie par l’environnement des Edge Functions.',
      'sbp_',
      'sk-',
      'eyJtropcourt',
      'La purge supprime les jetons expirés.',
    ];
    for (const benigne of benignes) {
      expect(detecterSecrets(benigne), benigne).toEqual([]);
    }
  });

  it('ne dépend pas de l’état de lastIndex entre deux appels (regex /g)', () => {
    const contenu = `ghp_${'x'.repeat(36)}`;
    expect(detecterSecrets(contenu).length).toBe(1);
    expect(detecterSecrets(contenu).length).toBe(1);
    expect(detecterSecrets(contenu).length).toBe(1);
  });

  it('chaque motif est une expression globale (scan de tout le fichier)', () => {
    for (const { re, label } of MOTIFS_SECRET) {
      expect(re.global, label).toBe(true);
    }
  });
});

describe('detecterSqlConcatene', () => {
  it('signale une interpolation dans execute()', () => {
    expect(detecterSqlConcatene('await db.execute(`select * from t where id = ${id}`)')).toBe(true);
  });

  it('signale une interpolation dans .rpc()', () => {
    expect(detecterSqlConcatene('supabase.rpc(`fn_${suffixe}`, params)')).toBe(true);
  });

  it('signale une concaténation de chaîne SQL', () => {
    expect(detecterSqlConcatene('"delete from messages where id = " + id')).toBe(true);
  });

  it('laisse passer les appels paramétrés du client Supabase', () => {
    expect(detecterSqlConcatene(".from('messages').select('id').eq('id', id)")).toBe(false);
    expect(detecterSqlConcatene('supabase.rpc("fn_sejours", { p_id: id })')).toBe(false);
    expect(detecterSqlConcatene('await db.execute(query, [id])')).toBe(false);
  });
});

describe('envIgnoreParGitignore', () => {
  it('accepte les formes utiles', () => {
    expect(envIgnoreParGitignore('.env\n')).toBe(true);
    expect(envIgnoreParGitignore('/.env\n')).toBe(true);
    expect(envIgnoreParGitignore('.env.*\n!.env.example\n')).toBe(true);
    expect(envIgnoreParGitignore('node_modules/\n.env.local\n')).toBe(true);
  });

  it('refuse un .gitignore qui ne couvre pas .env', () => {
    expect(envIgnoreParGitignore('node_modules/\ndist/\n')).toBe(false);
    expect(envIgnoreParGitignore('# .env commenté\n')).toBe(false);
    expect(envIgnoreParGitignore('')).toBe(false);
    expect(envIgnoreParGitignore(undefined)).toBe(false);
  });

  it('le .gitignore du dépôt couvre bien les secrets locaux', async () => {
    const { readFileSync } = await import('node:fs');
    const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
    expect(envIgnoreParGitignore(gitignore)).toBe(true);
  });
});

describe('sourceSetHtmlAuditee', () => {
  it('reconnaît les sources auditées du dépôt', () => {
    expect(sourceSetHtmlAuditee('set:html={jsonLd(donnees)}')).toBe(true);
    expect(sourceSetHtmlAuditee('set:html={JSON.stringify(cfg).replace(/</g, "\\u003c")}')).toBe(true);
    expect(sourceSetHtmlAuditee('{enregistrementHtml && <Fragment set:html={enregistrementHtml} />}')).toBe(true);
    expect(sourceSetHtmlAuditee('set:html={contenu(s)}')).toBe(true);
  });

  it('ne blanchit pas une source inconnue (donnée de formulaire)', () => {
    expect(sourceSetHtmlAuditee('set:html={visiteur.message}')).toBe(false);
    expect(sourceSetHtmlAuditee('set:html={params.get("x")}')).toBe(false);
  });
});

describe('politiquesAdminOuvertes', () => {
  const ouvert = `
    alter table public.sejours enable row level security;
    create policy "admin_all_sejours" on public.sejours
      for all to authenticated using (true) with check (true);
  `;
  const ferme = `
    create policy "admin_all_sejours" on public.sejours
      for all to authenticated
      using (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com')
      with check (auth.jwt() ->> 'email' = 'gruissancozy@gmail.com');
  `;

  it('signale une politique admin ouverte dans une migration récente', () => {
    expect(politiquesAdminOuvertes([{ nom: '0013_oups.sql', sql: ouvert }])).toEqual(['0013_oups.sql']);
  });

  it('laisse passer une politique resserrée sur l’email', () => {
    expect(politiquesAdminOuvertes([{ nom: '0013_ok.sql', sql: ferme }])).toEqual([]);
  });

  it('ignore 0001 et 0002 : l’état initial est corrigé par la 0002', () => {
    expect(politiquesAdminOuvertes([{ nom: '0001_init.sql', sql: ouvert }])).toEqual([]);
  });

  it('le dépôt réel ne contient aucune politique admin ouverte', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dossier = new URL('../migrations/', import.meta.url);
    const fichiers = readdirSync(dossier)
      .filter((nom) => nom.endsWith('.sql'))
      .map((nom) => ({ nom, sql: readFileSync(new URL(nom, dossier), 'utf8') }));
    expect(politiquesAdminOuvertes(fichiers)).toEqual([]);
  });
});

describe('tablesSansRls', () => {
  it('signale une table créée sans RLS', () => {
    const fichiers = [{ sql: 'create table public.fuites (id uuid);' }];
    expect(tablesSansRls(fichiers)).toEqual(['fuites']);
  });

  it('accepte une RLS activée dans une migration ultérieure', () => {
    const fichiers = [
      { sql: 'create table if not exists public.messages (id uuid);' },
      { sql: 'alter table public.messages enable row level security;' },
    ];
    expect(tablesSansRls(fichiers)).toEqual([]);
  });

  it('le dépôt réel protège toutes ses tables publiques', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dossier = new URL('../migrations/', import.meta.url);
    const fichiers = readdirSync(dossier)
      .filter((nom) => nom.endsWith('.sql'))
      .map((nom) => ({ nom, sql: readFileSync(new URL(nom, dossier), 'utf8') }));
    expect(tablesSansRls(fichiers)).toEqual([]);
  });
});

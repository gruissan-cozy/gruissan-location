import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Racine du dépôt (ou du worktree courant).
const racine = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Les worktrees de développement (<racine>/.worktrees) et les artefacts de
    // build ne font pas partie du projet : sans cette exclusion, leurs tests
    // seraient ramassés par le harnais de la copie principale.
    // Le chemin est ancré sur la racine du dépôt pour que cette configuration
    // reste valable lorsqu'on travaille depuis un worktree.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.astro/**',
      resolve(racine, '.worktrees/**'),
    ],
  },
});

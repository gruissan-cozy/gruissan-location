import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // ⚠️ Remplacez les deux valeurs ci-dessous après avoir créé le repo GitHub :
  //   site = https://VOTRE-PSEUDO-GITHUB.github.io
  //   base = /NOM-DU-REPO/
  site: 'https://VOTRE-PSEUDO-GITHUB.github.io',
  base: '/gruissan-location/',
  vite: {
    plugins: [tailwindcss()],
  },
});

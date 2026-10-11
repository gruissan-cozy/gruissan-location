import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Repo : https://github.com/gruissan-cozy/gruissan-location
  site: 'https://gruissan-cozy.github.io',
  base: '/gruissan-location/',
  vite: {
    plugins: [tailwindcss()],
  },
});

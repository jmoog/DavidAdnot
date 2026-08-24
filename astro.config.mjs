// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://www.adnot-couvreur.fr',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  // Montserrat auto-hébergée : Astro télécharge les WOFF2 au build et les sert
  // depuis le domaine — conforme RGPD/CNIL, aucune requête vers Google Fonts.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Montserrat',
      cssVariable: '--font-montserrat',
      weights: ['400', '500', '600', '700', '800'],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
    },
  ],
  // CSS entièrement inliné dans le HTML → zéro requête CSS bloquante.
  build: {
    inlineStylesheets: 'always',
    format: 'directory',
  },
  // Adapter Node standalone : sert le statique + la route /api/devis.
  adapter: node({ mode: 'standalone' }),
  security: { checkOrigin: false },

  integrations: [
    sitemap({
      filter: (page) => !page.includes('/merci/'),
      serialize(item) {
        const u = new URL(item.url);
        let path = u.pathname;
        if (!path.endsWith('/')) path += '/';

        // Priorités SEO : home > services > villes > pages info
        if (path === '/') item.priority = 1.0;
        else if (path === '/galerie-photo/') item.priority = 0.6;
        else if ([
          '/nettoyage-demoussage-toiture/',
          '/application-de-traitement-de-toiture-dans-les-yvelines-78/',
          '/reparation-toiture/', '/renovation-toiture/', '/isolation-toiture/',
          '/pose-de-velux/', '/zinguerie-gouttieres/', '/recherche-de-fuites/',
          '/contact/',
        ].includes(path)) item.priority = 0.8;
        else if ([
          '/mentions-legales/', '/politique-de-confidentialite/', '/plan-du-site/',
        ].includes(path)) item.priority = 0.3;
        else item.priority = 0.7; // pages villes et autres

        item.changefreq = 'monthly';
        return item;
      },
    }),
  ],
});

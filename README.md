# adnot-couvreur.fr — David Adnot, Artisan Couvreur 78

Site vitrine de David Adnot, artisan couvreur à Rambouillet, dans les Yvelines (78).
Migration WordPress → **Astro 6** (CSS vanilla, pas de framework), même architecture que
couvreur-77-lafleur.fr, déployable via **Coolify** (Docker, adapter Node standalone).

## Stack

- Astro 6, `@astrojs/node` (standalone) + `@astrojs/sitemap`
- CSS vanilla (`src/styles/global.css`), Montserrat auto-hébergée (API fonts Astro)
- Formulaire de devis : `/api/devis` → Brevo (HTTPS), anti-spam 4 couches
  (honeypot, time-trap, Cloudflare Turnstile, scoring de contenu `src/lib/antispam.ts`)
- Données : `src/data/` (services, villes, avis Google, manifeste galerie)

## Développement

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # build de production dans dist/
```

## Images

Les images du site (`public/images/`) sont issues de la banque `WEBP/` du dossier projet,
renommées sans la double extension (`.jpg.webp` → `.webp`) et réparties par catégorie :

| Dossier WEBP | public/images/ |
|---|---|
| 01-logo-david-adnot | / (racine images) |
| 02-logos-marques-partenaires | fournisseurs/ |
| 03-identite-vehicules-equipe | equipe/ |
| 04-renovation-de-toiture | renovation/ |
| 05-pose-de-tuiles | tuiles/ |
| 06-faitage-aretiers | faitage/ |
| 07-zinguerie-gouttieres | zinguerie/ |
| 08-fenetres-de-toit-velux | velux/ |
| 09-nettoyage-demoussage | nettoyage/ |
| 10-etancheite-toit-terrasse | etancheite/ |
| 11-isolation-combles | isolation/ |
| 12-ravalement-de-facade | ravalement/ |
| 13-toitures-terminees | toitures/ |
| 14-chantiers-vues-generales | chantiers/ |
| 15-visuels-web-banque-images | illustrations/ |

La page galerie est pilotée par `src/data/galerie.json` (préfixe + nombre d'images par
catégorie) : ajouter une photo = déposer le fichier numéroté suivant et incrémenter `nombre`.

## Déploiement (Coolify)

1. Application Docker à partir de ce dépôt (le `Dockerfile` multi-stage est à la racine).
2. Variables d'environnement : voir `.env.example`. `TURNSTILE_SITE_KEY` et
   `TURNSTILE_SECRET_KEY` sont à déclarer **aussi en build variables**.
3. Port exposé : `4321`.

## SEO — règles du projet

- URLs héritées du site WordPress en prod **avec slash final** (`trailingSlash: 'always'`) :
  `/couvreur-a-{ville}/`, `/nettoyage-demoussage-toiture/`, `/contact/`, etc.
- Nouvelles pages services créées : `/reparation-toiture/`, `/renovation-toiture/`,
  `/isolation-toiture/`, `/pose-de-velux/`, `/zinguerie-gouttieres/`, `/recherche-de-fuites/`,
  `/galerie-photo/`.
- Titles/metas/H1 des pages existantes conservés depuis la prod ; balises des nouvelles pages
  rédigées en anti-triplette (title ≠ H1, meta complémentaire).
- Jamais d'ancre générique (« En savoir plus ») — ancres descriptives uniquement.

## À faire avant la mise en ligne

- [ ] Remplacer `urlFiche` dans `src/data/reviews.json` par le vrai lien court Google Maps
      de la fiche (maps.app.goo.gl/…).
- [ ] Créer la clé API Brevo + le widget Turnstile pour le domaine, remplir `.env`.
- [ ] Copier `favicon.webp` et `apple-touch-icon.png` dans `public/` (fait par le script
      de copie des images si exécuté).
- [ ] Ajouter la balise `google-site-verification` dans `BaseLayout.astro` si besoin.

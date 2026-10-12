# Site vitrine — Location saisonnière à Gruissan

Site vitrine pour la location saisonnière de votre appartement à Gruissan Plage.
Stack 100 % open source : **Astro 5** + **Tailwind CSS 4**, déployé gratuitement sur **GitHub Pages**.

## Fonctionnalités

- 🏠 Présentation de l'appartement (capacité, chambres, surface, terrasse)
- 🖼️ Galerie photos
- 💶 Tarification par saison + options + caution
- 📅 Calendrier de disponibilités
- 📩 Formulaire de contact (FormSubmit, sans compte) + téléphone / WhatsApp
- 🔗 Liens Airbnb / Abritel / Booking / Instagram (si renseignés)
- 🌍 4 langues : **Français** (défaut), **English**, **Español**, **Deutsch**
- 🎨 Design moderne côtier (bleu mer / sable / blanc)
- 🚀 Déploiement automatique sur GitHub Pages à chaque `push` sur `main`

## Modifier le contenu

Tout le contenu éditable est dans le dossier [`content/`](content/) — de simples fichiers texte :

| Fichier | À modifier pour… |
|---|---|
| `content/site.json` | Nom du bien, adresse, téléphone, WhatsApp, email, liens Airbnb/Abritel/Instagram |
| `content/tarifs.json` | Prix par saison, options, caution |
| `content/disponibilites.json` | Statut de chaque mois (`libre` / `partiel` / `reserve`) |
| `content/galerie.json` | Liste des photos de la galerie |

### Remplacer les photos

1. Déposez vos images dans `public/images/galerie/`
2. Listez-les dans `content/galerie.json` :

```json
{
  "photos": [
    { "src": "/gruissan-location/images/galerie/mon-salon.jpg", "alt": "Salon avec vue mer" }
  ]
}
```

Les images SVG actuelles sont des placeholders (« PHOTO À REMPLACER »).

### Changer les textes / traductions

Les textes du site sont dans [`src/i18n.ts`](src/i18n.ts) — un bloc par langue.

## Développement local

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # génère le site dans dist/
npm run preview    # prévisualise le build
```

## Espace propriétaire (`/admin/`)

Le site fonctionne **sans aucun service externe** : les contenus (tarifs,
disponibilités, packs, guide, photos) sont des fichiers JSON dans le dossier
[`content/`](content/), et les demandes de contact/réservation arrivent
**par email** via FormSubmit. La page `/admin/` est un mode d'emploi qui
explique comment tout mettre à jour en éditant les fichiers sur GitHub.

### Mettre à jour le site (1 à 2 minutes)

1. Ouvrez le dépôt : https://github.com/gruissan-cozy/gruissan-location
2. Entrez dans le dossier `content/` et cliquez sur le fichier à modifier
3. Cliquez sur le crayon (✏️) en haut à droite
4. Faites vos modifications, puis « Commit changes »
5. Le site se met à jour automatiquement (workflow GitHub Actions)

| Fichier | Ce qu'il contient |
|---|---|
| `content/site.json` | Identité du bien, coordonnées, liens plateformes |
| `content/tarifs.json` | Tarifs par saison, options, caution |
| `content/disponibilites.json` | Disponibilités mois par mois |
| `content/packs.json` | Options proposées à la réservation |
| `content/galerie.json` | Liste des photos |
| `content/guide.json` | Contenu du guide d'accueil |
| `content/proximite.json` | Lieux à proximité + durées |

### Messages et réservations

Ils arrivent par email à l'adresse de `content/site.json`. Votre boîte mail
est votre historique.

### Option : brancher Supabase (plus tard)

Si vous souhaitez un jour un back office avec base de données (boîte de
réception unifiée, édition en interface), le code est dormant dans le dépôt :
il suffit de créer un projet [supabase.com](https://supabase.com), d'exécuter
[`migrations/0001_init.sql`](migrations/0001_init.sql) et de passer
`SUPABASE_ENABLED = true` dans `src/lib/supabase.ts`.

## Déploiement sur GitHub Pages

1. Créez un repo GitHub (vide), puis :
   ```bash
   git remote add origin https://github.com/VOTRE-PSEUDO/gruissan-location.git
   git push -u origin main
   ```
2. Dans **Settings → Pages** du repo, choisissez **Source : GitHub Actions**.
3. Dans [`astro.config.mjs`](astro.config.mjs), mettez à jour :
   - `site` → `https://VOTRE-PSEUDO.github.io`
   - `base` → `/gruissan-location/` (le nom de votre repo)

Le workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) construit et déploie le site automatiquement à chaque push sur `main`.

## Nom de domaine personnalisé (plus tard)

Créez un fichier `public/CNAME` contenant votre domaine, puis ajoutez les enregistrements DNS chez votre registrar. Aucun coût d'hébergement — seul le domaine est payant (~10-15 €/an).

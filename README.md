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

## Back office (`/admin/`)

Le back office est réservé au propriétaire : il permet de gérer les demandes,
le calendrier, les options et le guide voyageur **sans toucher au code**.

### Première mise en route (une seule fois)

1. Créez un projet gratuit sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécutez le contenu de [`migrations/0001_init.sql`](migrations/0001_init.sql)
   (crée les tables + les règles de sécurité RLS + les données initiales).
3. Dans **Authentication → Providers**, activez **Email** et le **Magic Link**.
   Ajoutez l'URL du site dans **Authentication → URL Configuration → Redirect URLs**
   (en local : `http://localhost:4321/gruissan-location/admin/`).
4. Renseignez les variables d'environnement :
   - en local : copiez `.env.example` en `.env` et remplissez les valeurs ;
   - sur GitHub : **Settings → Secrets and variables → Actions**, ajoutez
     `PUBLIC_SUPABASE_URL` et `PUBLIC_SUPABASE_ANON_KEY`.

> La clé « anon » est **publique par conception** : elle est protégée par les
> politiques RLS. N'utilisez jamais la clé « service_role » côté site.

### Les 5 sections

| Page | Contenu |
|---|---|
| `/admin/` | Connexion par lien magique (e-mail, sans mot de passe) + tableau de bord |
| `/admin/messages/` | Demandes reçues, fil des réponses, statut (nouveau / en cours / répondu / archivé) |
| `/admin/disponibilites/` | Statut des 12 prochains mois (libre / partiel / réservé) + note interne |
| `/admin/packs/` | Options proposées à la réservation (4 langues, prix, unité, ordre, actif) |
| `/admin/guide/` | Guide d'accueil numérique (titre + contenu HTML en 4 langues) |

Si les variables Supabase ne sont pas définies, chaque page du back office
affiche un message explicite au lieu d'un écran vide.

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

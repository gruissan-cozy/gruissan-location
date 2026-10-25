# Contenu du site — modifiez ces fichiers pour mettre à jour le site
# Aucune connaissance technique nécessaire : ce sont de simples fichiers texte structurés.

## site.json
Identité du bien, coordonnées, réseaux/plateformes de réservation.

## tarifs.json
Tarification par saison (haute / moyenne / basse), en euros par semaine ou par nuit.

## disponibilites.json
Calendrier des disponibilités, mois par mois (à jour à la main).

## galerie/
Déposez vos photos dans public/images/galerie/ puis listez-les dans galerie.json.

Chaque photo appartient à une pièce déclarée dans `categories` (séjour, chambres,
cuisine, salle-de-bain, terrasse, vue, exterieur). Une photo sans pièce reconnue
est rangée dans la catégorie de repli « autre » : aucune photo n'est perdue.
Les légendes (`alt`, `legende`) sont renseignées dans les 4 langues directement
dans le fichier. Le fichier reste modifiable sans toucher au code.

## site.json
Identité du bien, coordonnées, réseaux/plateformes de réservation.
`telephone`, `telephone_display` et `whatsapp` peuvent rester vides : les boutons
d'appel et WhatsApp sont alors masqués automatiquement (aucun faux numéro n'est affiché).
Pour WhatsApp, `whatsapp` accepte un numéro distinct du téléphone.

## proximite.json
Points d'intérêt à proximité avec leur distance en mètres depuis l'appartement.
Chaque point a un nom et une description dans les 4 langues.

## modeles-reponse.json
Réponses types insérables en un clic dans le champ de réponse de la messagerie
du back office (disponibilité, tarif, conditions…). Éditables ici, sans toucher
au code. Chaque modèle porte un `id`, une `categorie`, un `nom` en 4 langues et
un `texte` contenant des variables entre accolades (`{nom}`, `{dates}`…) :
une variable absente du message reste affichée telle quelle dans le texte,
elle n'est jamais remplacée par une valeur inventée.

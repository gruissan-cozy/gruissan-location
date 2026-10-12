import type { Lang } from '../i18n';

/**
 * Textes de la page /admin (mode d'emploi du propriétaire).
 * Le back office avec base de données a été retiré : le site fonctionne
 * en JSON seul. Cette page explique au propriétaire comment tout gérer
 * en éditant les fichiers du dépôt GitHub, sans aucun service externe.
 */
export const adminT: Record<Lang, Record<string, string>> = {
  fr: {
    'admin.title': 'Espace propriétaire',
    'admin.subtitle':
      "Votre site fonctionne sans aucun service externe : tout se met à jour en modifiant les fichiers du dépôt GitHub. Voici comment.",
    'admin.howto.title': 'Le principe',
    'admin.howto.desc':
      "Chaque élément du site (tarifs, disponibilités, packs, guide, photos) est un fichier texte dans le dossier content/ du dépôt. Vous le modifiez en ligne sur GitHub, et le site se met à jour tout seul en 1 à 2 minutes. Aucune base de données, aucun compte à créer.",
    'admin.howto.step1': "Ouvrez le dépôt : github.com/gruissan-cozy/gruissan-location",
    'admin.howto.step2': "Naviguez dans le dossier content/ et cliquez sur le fichier à modifier",
    'admin.howto.step3': "Cliquez sur le crayon (✏️) en haut à droite pour éditer",
    'admin.howto.step4': "Faites vos modifications, puis cliquez sur « Commit changes » en haut",
    'admin.howto.step5': "Attendez 1-2 minutes : le site est mis à jour automatiquement",
    'admin.files.title': 'Les fichiers à connaître',
    'admin.files.site': 'Identité du bien : nom, adresse, téléphone, WhatsApp, email, liens Airbnb/Abritel',
    'admin.files.tarifs': 'Tarifs par saison, options, caution',
    'admin.files.dispo': 'Disponibilités mois par mois (libre / partiel / réservé)',
    'admin.files.packs': 'Les options proposées à la réservation (vélo, pack plage, pack bienvenue, ménage…)',
    'admin.files.galerie': 'La liste des photos de la galerie',
    'admin.files.guide': "Le contenu du guide d'accueil (12 sections, 4 langues)",
    'admin.files.proxi': 'Les lieux à proximité avec distances et durées (pied/vélo/voiture)',
    'admin.messages.title': 'Messages et demandes de réservation',
    'admin.messages.desc':
      "Le formulaire de contact et la page de réservation envoient tout par email à l'adresse indiquée dans content/site.json. Votre boîte mail est votre historique — rien d'autre à consulter.",
    'admin.photos.title': 'Changer les photos',
    'admin.photos.desc':
      "Déposez vos images dans le dossier public/images/galerie/ du dépôt (bouton « Add file » → « Upload files »), puis listez-les dans content/galerie.json. Pensez à des images légères (moins de 500 Ko).",
    'admin.warn.title': 'Bon à savoir',
    'admin.warn.desc':
      "Le fichier JSON doit rester valide : gardez les guillemets et les virgules. Si le site affiche une erreur après une modification, vérifiez la dernière virgule ou le dernier guillemet — c'est 9 fois sur 10 la cause.",
    'admin.back': 'Retour au site',
  },
  en: {
    'admin.title': 'Owner area',
    'admin.subtitle':
      'Your site runs with no external service: everything updates by editing the files in the GitHub repository. Here is how.',
    'admin.howto.title': 'How it works',
    'admin.howto.desc':
      'Every element of the site (rates, availability, packs, guide, photos) is a text file in the content/ folder of the repository. You edit it online on GitHub, and the site updates by itself in 1-2 minutes. No database, no account to create.',
    'admin.howto.step1': 'Open the repository: github.com/gruissan-cozy/gruissan-location',
    'admin.howto.step2': 'Navigate to the content/ folder and click the file to edit',
    'admin.howto.step3': 'Click the pencil (✏️) at the top right to edit',
    'admin.howto.step4': 'Make your changes, then click "Commit changes" at the top',
    'admin.howto.step5': 'Wait 1-2 minutes: the site updates automatically',
    'admin.files.title': 'Files to know',
    'admin.files.site': 'Property identity: name, address, phone, WhatsApp, email, Airbnb/Abritel links',
    'admin.files.tarifs': 'Seasonal rates, options, security deposit',
    'admin.files.dispo': 'Month-by-month availability (free / partial / booked)',
    'admin.files.packs': 'Options offered at booking (bikes, beach pack, welcome pack, cleaning…)',
    'admin.files.galerie': 'The list of gallery photos',
    'admin.files.guide': 'The welcome guide content (12 sections, 4 languages)',
    'admin.files.proxi': 'Nearby places with distances and durations (walk/bike/car)',
    'admin.messages.title': 'Messages and booking requests',
    'admin.messages.desc':
      'The contact form and booking page send everything by email to the address in content/site.json. Your inbox is your history — nothing else to check.',
    'admin.photos.title': 'Changing photos',
    'admin.photos.desc':
      'Upload your images to the public/images/galerie/ folder of the repository ("Add file" → "Upload files"), then list them in content/galerie.json. Use light images (under 500 KB).',
    'admin.warn.title': 'Good to know',
    'admin.warn.desc':
      'The JSON file must stay valid: keep the quotes and commas. If the site shows an error after an edit, check the last comma or quote — that is the cause 9 times out of 10.',
    'admin.back': 'Back to site',
  },
  es: {
    'admin.title': 'Área del propietario',
    'admin.subtitle':
      'Tu sitio funciona sin ningún servicio externo: todo se actualiza editando los archivos del repositorio GitHub. Así se hace.',
    'admin.howto.title': 'El principio',
    'admin.howto.desc':
      'Cada elemento del sitio (tarifas, disponibilidad, packs, guía, fotos) es un archivo de texto en la carpeta content/ del repositorio. Lo editas en línea en GitHub, y el sitio se actualiza solo en 1-2 minutos. Sin base de datos, sin cuentas que crear.',
    'admin.howto.step1': 'Abre el repositorio: github.com/gruissan-cozy/gruissan-location',
    'admin.howto.step2': 'Entra en la carpeta content/ y haz clic en el archivo a modificar',
    'admin.howto.step3': 'Haz clic en el lápiz (✏️) arriba a la derecha para editar',
    'admin.howto.step4': 'Haz tus cambios y luego clic en « Commit changes » arriba',
    'admin.howto.step5': 'Espera 1-2 minutos: el sitio se actualiza automáticamente',
    'admin.files.title': 'Los archivos que debes conocer',
    'admin.files.site': 'Identidad del inmueble: nombre, dirección, teléfono, WhatsApp, email, enlaces Airbnb/Abritel',
    'admin.files.tarifs': 'Tarifas por temporada, opciones, fianza',
    'admin.files.dispo': 'Disponibilidad mes a mes (libre / parcial / reservado)',
    'admin.files.packs': 'Las opciones ofrecidas al reservar (bicis, pack playa, pack bienvenida, limpieza…)',
    'admin.files.galerie': 'La lista de fotos de la galería',
    'admin.files.guide': 'El contenido de la guía de bienvenida (12 secciones, 4 idiomas)',
    'admin.files.proxi': 'Lugares cercanos con distancias y duraciones (a pie/bici/coche)',
    'admin.messages.title': 'Mensajes y solicitudes de reserva',
    'admin.messages.desc':
      'El formulario de contacto y la página de reserva envían todo por email a la dirección indicada en content/site.json. Tu bandeja de entrada es tu historial — nada más que consultar.',
    'admin.photos.title': 'Cambiar las fotos',
    'admin.photos.desc':
      'Sube tus imágenes a la carpeta public/images/galerie/ del repositorio (« Add file » → « Upload files ») y luego lístalas en content/galerie.json. Usa imágenes ligeras (menos de 500 KB).',
    'admin.warn.title': 'Conviene saber',
    'admin.warn.desc':
      'El archivo JSON debe seguir siendo válido: conserva las comillas y las comas. Si el sitio muestra un error tras una edición, revisa la última coma o comilla — es la causa 9 de cada 10 veces.',
    'admin.back': 'Volver al sitio',
  },
  de: {
    'admin.title': 'Eigentümerbereich',
    'admin.subtitle':
      'Ihre Website läuft ohne externen Dienst: alles wird durch Bearbeiten der Dateien im GitHub-Repository aktualisiert. So geht es.',
    'admin.howto.title': 'Das Prinzip',
    'admin.howto.desc':
      'Jedes Element der Website (Preise, Verfügbarkeit, Pakete, Handbuch, Fotos) ist eine Textdatei im Ordner content/ des Repositorys. Sie bearbeiten sie online auf GitHub, und die Website aktualisiert sich in 1-2 Minuten von selbst. Keine Datenbank, kein Konto nötig.',
    'admin.howto.step1': 'Öffnen Sie das Repository: github.com/gruissan-cozy/gruissan-location',
    'admin.howto.step2': 'Navigieren Sie zum Ordner content/ und klicken Sie auf die zu bearbeitende Datei',
    'admin.howto.step3': 'Klicken Sie auf den Stift (✏️) oben rechts zum Bearbeiten',
    'admin.howto.step4': 'Nehmen Sie Ihre Änderungen vor und klicken Sie oben auf „Commit changes“',
    'admin.howto.step5': 'Warten Sie 1-2 Minuten: die Website aktualisiert sich automatisch',
    'admin.files.title': 'Die wichtigen Dateien',
    'admin.files.site': 'Identität der Unterkunft: Name, Adresse, Telefon, WhatsApp, E-Mail, Airbnb/Abritel-Links',
    'admin.files.tarifs': 'Saisonpreise, Optionen, Kaution',
    'admin.files.dispo': 'Verfügbarkeit Monat für Monat (frei / teilweise / belegt)',
    'admin.files.packs': 'Die bei der Buchung angebotenen Optionen (Fahrräder, Strand-Paket, Willkommens-Paket, Reinigung…)',
    'admin.files.galerie': 'Die Liste der Galerie-Fotos',
    'admin.files.guide': 'Der Inhalt des Gästehandbuchs (12 Abschnitte, 4 Sprachen)',
    'admin.files.proxi': 'Orte in der Umgebung mit Entfernungen und Dauern (zu Fuß/Fahrrad/Auto)',
    'admin.messages.title': 'Nachrichten und Buchungsanfragen',
    'admin.messages.desc':
      'Das Kontaktformular und die Buchungsseite senden alles per E-Mail an die in content/site.json angegebene Adresse. Ihr Posteingang ist Ihr Verlauf — nichts anderes zu prüfen.',
    'admin.photos.title': 'Fotos ändern',
    'admin.photos.desc':
      'Laden Sie Ihre Bilder in den Ordner public/images/galerie/ des Repositorys hoch („Add file“ → „Upload files“) und listen Sie sie dann in content/galerie.json auf. Verwenden Sie leichte Bilder (unter 500 KB).',
    'admin.warn.title': 'Gut zu wissen',
    'admin.warn.desc':
      'Die JSON-Datei muss gültig bleiben: behalten Sie Anführungszeichen und Kommas. Wenn die Website nach einer Bearbeitung einen Fehler zeigt, prüfen Sie das letzte Komma oder Anführungszeichen — das ist 9 von 10 Mal die Ursache.',
    'admin.back': 'Zurück zur Website',
  },
};

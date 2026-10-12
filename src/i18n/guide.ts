import type { Lang } from '../i18n';

/**
 * Textes d'interface du guide d'accueil numérique (page /guide/).
 * Le contenu éditorial des sections vient de Supabase (guide_sections)
 * avec repli sur content/guide.json ; seuls les libellés d'interface
 * (titres, sommaire, bouton impression, mentions) vivent ici.
 */
export const guideT: Record<Lang, Record<string, string>> = {
  fr: {
    'guide.title': "Guide d'accueil",
    'guide.subtitle':
      "Tout ce qu'il faut savoir pour un séjour en toute sérénité : check-in, Wi-Fi, climatisation, tri des déchets et bonnes adresses.",
    'guide.sommaire': 'Sommaire',
    'guide.imprimer': 'Imprimer ce guide',
    'guide.urgence':
      "En cas d'urgence, appelez le 112 (numéro d'urgence européen) ou le 18 (pompiers).",
    'guide.mentions':
      "Contenu fourni par votre hôte — vérifié avant votre arrivée. Les tarifs et options sont détaillés sur la page Tarifs.",
    'guide.retour': 'Retour au site',
  },
  en: {
    'guide.title': 'Welcome guide',
    'guide.subtitle':
      'Everything you need to know for a relaxing stay: check-in, Wi-Fi, air conditioning, waste sorting and good addresses.',
    'guide.sommaire': 'Contents',
    'guide.imprimer': 'Print this guide',
    'guide.urgence': 'In an emergency, call 112 (European emergency number) or 18 (fire brigade).',
    'guide.mentions':
      'Content provided by your host — checked before your arrival. Rates and options are detailed on the Rates page.',
    'guide.retour': 'Back to the website',
  },
  es: {
    'guide.title': 'Guía de bienvenida',
    'guide.subtitle':
      'Todo lo que necesitas saber para una estancia tranquila: check-in, Wi-Fi, aire acondicionado, reciclaje y buenas direcciones.',
    'guide.sommaire': 'Índice',
    'guide.imprimer': 'Imprimir esta guía',
    'guide.urgence':
      'En caso de urgencia, llama al 112 (número europeo de emergencias) o al 18 (bomberos).',
    'guide.mentions':
      'Contenido facilitado por tu anfitrión — verificado antes de tu llegada. Las tarifas y opciones se detallan en la página Tarifas.',
    'guide.retour': 'Volver al sitio',
  },
  de: {
    'guide.title': 'Gästehandbuch',
    'guide.subtitle':
      'Alles für einen entspannten Aufenthalt: Check-in, WLAN, Klimaanlage, Mülltrennung und gute Adressen.',
    'guide.sommaire': 'Inhalt',
    'guide.imprimer': 'Dieses Handbuch drucken',
    'guide.urgence':
      'Im Notfall rufen Sie 112 (europäische Notrufnummer) oder 18 (Feuerwehr) an.',
    'guide.mentions':
      'Inhalt bereitgestellt von Ihrem Gastgeber — vor Ihrer Ankunft geprüft. Preise und Optionen sind auf der Seite Preise detailliert.',
    'guide.retour': 'Zurück zur Website',
  },
};

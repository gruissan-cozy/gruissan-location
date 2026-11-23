import type { Lang } from '../i18n';

/**
 * Textes des deux pages légales : mentions légales et politique de
 * confidentialité. Le contenu variable (identité de l'exploitant, numéro
 * d'enregistrement, hébergeur) vient de `content/legal.json` et de
 * `content/site.json` ; seuls les libellés et les explications vivent ici.
 */
export const legalT: Record<Lang, Record<string, string>> = {
  fr: {
    'legal.retour': 'Retour au site',
    'legal.miseAJour': 'Dernière mise à jour :',
    'mentions.title': 'Mentions légales',
    'mentions.subtitle': "Informations sur l'éditeur du site et sur son hébergement.",
    'mentions.editeur.titre': 'Éditeur du site',
    'mentions.editeur.intro':
      "Ce site présente un appartement proposé en location saisonnière. Il est édité par l'exploitant du logement, joignable aux coordonnées ci-dessous.",
    'mentions.editeur.nom': 'Nom ou raison sociale',
    'mentions.editeur.forme': 'Forme juridique',
    'mentions.editeur.siret': 'SIRET',
    'mentions.editeur.adresse': "Adresse de l'exploitant",
    'mentions.editeur.telephone': 'Téléphone',
    'mentions.editeur.email': 'Email',
    'mentions.activite.titre': 'Activité',
    'mentions.activite.texte':
      "Location saisonnière d'un appartement meublé de tourisme, situé {0}, {1} {2}, {3}.",
    'mentions.publication.titre': 'Responsable de la publication',
    'mentions.publication.texte':
      "Le responsable de la publication est l'exploitant du logement. Toute demande peut être adressée à l'adresse {0}.",
    'mentions.hebergeur.titre': 'Hébergement du site',
    'mentions.hebergeur.texte':
      'Le site est hébergé par {0}, sur le service GitHub Pages.',
    'mentions.hebergeur.site': "Site de l'hébergeur",
    'mentions.propriete.titre': 'Propriété intellectuelle',
    'mentions.propriete.texte':
      "Les textes, photographies et éléments graphiques de ce site sont protégés par le droit d'auteur. Toute reproduction ou réutilisation, totale ou partielle, sans autorisation écrite est interdite.",
    'mentions.donnees.titre': 'Données personnelles',
    'mentions.donnees.texte':
      "Les données transmises lors d'une demande de réservation ou d'un état des lieux sont traitées conformément à la politique de confidentialité du site, qui précise leur nature, leur finalité, leur durée de conservation et les droits dont vous disposez.",
    'mentions.donnees.lien': 'Lire la politique de confidentialité',
    'mentions.assurance.titre': 'Assurance',
    'mentions.assurance.texte':
      "Le logement est couvert par une assurance adaptée à l'accueil de voyageurs payants. Les références du contrat sont communiquées sur demande écrite.",
    'mentions.assurance.assureur': 'Assureur',
    'mentions.assurance.contrat': 'Numéro de contrat',
    'confidentialite.title': 'Politique de confidentialité',
    'confidentialite.subtitle':
      'Comment vos données sont collectées, utilisées et conservées.',
    'confidentialite.responsable.titre': 'Responsable du traitement',
    'confidentialite.responsable.texte':
      "Le responsable du traitement est l'exploitant du logement présenté sur ce site. Pour toute question relative à vos données, écrivez à {0}.",
    'confidentialite.donnees.titre': 'Données collectées',
    'confidentialite.donnees.intro':
      "Le site ne collecte que les données nécessaires à la préparation et au suivi d'un séjour :",
    'confidentialite.donnees.reservation':
      'Réservation : nom, adresse email, numéro de téléphone si vous le communiquez, dates souhaitées, nombre de personnes, message libre et options choisies.',
    'confidentialite.donnees.etat':
      "État des lieux : photographies des pièces, notes libres et signature manuscrite numérique, transmises depuis l'espace locataire à l'arrivée et au départ.",
    'confidentialite.donnees.techniques':
      "Données techniques : journaux de connexion conservés par l'hébergeur du site pour assurer sa sécurité et son bon fonctionnement.",
    'confidentialite.finalites.titre': 'Pourquoi ces données sont-elles utilisées ?',
    'confidentialite.finalites.intro': 'Les données servent uniquement à :',
    'confidentialite.finalites.reservation':
      'répondre à une demande de réservation et organiser le séjour ;',
    'confidentialite.finalites.sejour':
      "préparer l'arrivée, remettre le logement et établir l'état des lieux ;",
    'confidentialite.finalites.preuve':
      "conserver la preuve des constats réalisés en cas de litige sur la caution ou l'état du logement ;",
    'confidentialite.finalites.legal':
      'respecter les obligations légales, notamment la déclaration de la taxe de séjour et la tenue de la comptabilité.',
    'confidentialite.base.titre': 'Base juridique',
    'confidentialite.base.texte':
      "Les traitements reposent sur l'exécution du contrat de location et sur les démarches précontractuelles (demande de réservation), sur l'intérêt légitime de l'exploitant à conserver une preuve en cas de litige, et sur le respect des obligations légales.",
    'confidentialite.destinataires.titre': 'Destinataires et sous-traitants',
    'confidentialite.destinataires.texte':
      "Les données ne sont ni vendues ni cédées. Elles sont accessibles au seul exploitant du logement et aux prestataires techniques qui assurent le service :",
    'confidentialite.destinataires.supabase':
      'Supabase : hébergement de la base de données et du stockage des photographies.',
    'confidentialite.destinataires.resend':
      "Resend : acheminement des emails transactionnels (confirmation de demande, lien de l'espace locataire, état des lieux signé).",
    'confidentialite.destinataires.hebergeur':
      'GitHub Pages : hébergement des pages publiques du site.',
    'confidentialite.destinataires.autorites':
      "Les données peuvent être communiquées aux autorités administratives ou judiciaires lorsque la loi l'exige.",
    'confidentialite.transferts.titre': "Transferts hors de l'Union européenne",
    'confidentialite.transferts.texte':
      "Certains prestataires peuvent héberger des données en dehors de l'Union européenne. Ces transferts s'appuient sur les garanties contractuelles prévues par le RGPD (clauses contractuelles types de la Commission européenne) et sont limités aux données nécessaires au service.",
    'confidentialite.durees.titre': 'Durées de conservation',
    'confidentialite.durees.intro':
      'Les durées ci-dessous sont appliquées automatiquement par la purge des données locataire :',
    'confidentialite.durees.donnees':
      "Données personnelles du séjour (adresse email, jeton d'accès, notes libres) : supprimées {0} jours après le départ.",
    'confidentialite.durees.preuve':
      "Preuve de l'état des lieux (PDF signé et photographies) : conservée {0} ans à compter du départ, pour répondre à un éventuel litige.",
    'confidentialite.durees.note':
      'Les données de réservation nécessaires à la comptabilité et à la déclaration de la taxe de séjour sont conservées pendant la durée légale applicable.',
    'confidentialite.droits.titre': 'Vos droits',
    'confidentialite.droits.intro':
      'Conformément au RGPD, vous disposez des droits suivants sur vos données :',
    'confidentialite.droits.acces': "droit d'accès et de copie ;",
    'confidentialite.droits.rectification': 'droit de rectification ;',
    'confidentialite.droits.effacement':
      "droit à l'effacement, dans les limites des obligations de conservation ;",
    'confidentialite.droits.limitation': 'droit à la limitation du traitement ;',
    'confidentialite.droits.opposition': "droit d'opposition ;",
    'confidentialite.droits.portabilite':
      'droit à la portabilité des données que vous avez fournies.',
    'confidentialite.droits.exercer':
      "Pour exercer ces droits, écrivez à {0}. Une réponse vous sera apportée dans un délai d'un mois.",
    'confidentialite.droits.reclamation':
      "Vous pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr) si vous estimez que vos droits ne sont pas respectés.",
    'confidentialite.cookies.titre': "Cookies et mesure d'audience",
    'confidentialite.cookies.texte':
      "Le site ne dépose aucun cookie publicitaire et n'utilise aucun outil de mesure d'audience. Seuls les échanges techniques nécessaires à l'affichage des pages et à l'envoi d'un formulaire ont lieu.",
    'confidentialite.photos.titre': "Photographies de l'état des lieux",
    'confidentialite.photos.texte':
      "Les photographies prises dans l'appartement servent uniquement à documenter son état. Elles ne sont ni publiées ni utilisées à d'autres fins. Vous pouvez demander leur suppression à l'adresse de contact, sous réserve des durées de conservation de preuve indiquées ci-dessus.",
  },
  en: {
    'legal.retour': 'Back to the website',
    'legal.miseAJour': 'Last updated:',
    'mentions.title': 'Legal notice',
    'mentions.subtitle': 'Information about the publisher of this website and its hosting.',
    'mentions.editeur.titre': 'Website publisher',
    'mentions.editeur.intro':
      'This website presents an apartment offered for seasonal rental. It is published by the owner of the accommodation, who can be reached using the contact details below.',
    'mentions.editeur.nom': 'Name or company name',
    'mentions.editeur.forme': 'Legal form',
    'mentions.editeur.siret': 'SIRET',
    'mentions.editeur.adresse': 'Publisher address',
    'mentions.editeur.telephone': 'Phone',
    'mentions.editeur.email': 'Email',
    'mentions.activite.titre': 'Activity',
    'mentions.activite.texte':
      'Seasonal rental of a furnished tourist apartment located at {0}, {1} {2}, {3}.',
    'mentions.publication.titre': 'Publication manager',
    'mentions.publication.texte':
      'The publication manager is the owner of the accommodation. Any request can be sent to {0}.',
    'mentions.hebergeur.titre': 'Website hosting',
    'mentions.hebergeur.texte': 'The website is hosted by {0}, through the GitHub Pages service.',
    'mentions.hebergeur.site': 'Host website',
    'mentions.propriete.titre': 'Intellectual property',
    'mentions.propriete.texte':
      'The texts, photographs and graphic elements of this website are protected by copyright. Any reproduction or reuse, in whole or in part, without written authorisation is prohibited.',
    'mentions.donnees.titre': 'Personal data',
    'mentions.donnees.texte':
      'Data sent with a booking request or an inventory report is processed in accordance with the website privacy policy, which sets out its nature, purpose, retention period and your rights.',
    'mentions.donnees.lien': 'Read the privacy policy',
    'mentions.assurance.titre': 'Insurance',
    'mentions.assurance.texte':
      'The accommodation is covered by insurance suited to hosting paying guests. The contract details are provided on written request.',
    'mentions.assurance.assureur': 'Insurer',
    'mentions.assurance.contrat': 'Contract number',
    'confidentialite.title': 'Privacy policy',
    'confidentialite.subtitle': 'How your data is collected, used and retained.',
    'confidentialite.responsable.titre': 'Data controller',
    'confidentialite.responsable.texte':
      'The data controller is the owner of the accommodation presented on this website. For any question about your data, write to {0}.',
    'confidentialite.donnees.titre': 'Data collected',
    'confidentialite.donnees.intro':
      'The website only collects the data needed to prepare and monitor a stay:',
    'confidentialite.donnees.reservation':
      'Booking: name, email address, phone number if you provide one, requested dates, number of guests, free-text message and selected options.',
    'confidentialite.donnees.etat':
      'Inventory report: photographs of the rooms, free-text notes and a digital handwritten signature, sent from the tenant space on arrival and departure.',
    'confidentialite.donnees.techniques':
      'Technical data: connection logs kept by the website host to ensure its security and proper operation.',
    'confidentialite.finalites.titre': 'Why is this data used?',
    'confidentialite.finalites.intro': 'The data is used only to:',
    'confidentialite.finalites.reservation':
      'answer a booking request and organise the stay;',
    'confidentialite.finalites.sejour':
      'prepare the arrival, hand over the accommodation and draw up the inventory report;',
    'confidentialite.finalites.preuve':
      'keep evidence of the findings in the event of a dispute over the security deposit or the condition of the accommodation;',
    'confidentialite.finalites.legal':
      'comply with legal obligations, in particular the tourist tax declaration and bookkeeping.',
    'confidentialite.base.titre': 'Legal basis',
    'confidentialite.base.texte':
      'Processing relies on the performance of the rental contract and pre-contractual steps (booking request), on the legitimate interest of the owner in keeping evidence in the event of a dispute, and on compliance with legal obligations.',
    'confidentialite.destinataires.titre': 'Recipients and processors',
    'confidentialite.destinataires.texte':
      'The data is neither sold nor transferred. It is accessible only to the owner of the accommodation and to the technical providers delivering the service:',
    'confidentialite.destinataires.supabase':
      'Supabase: database hosting and photograph storage.',
    'confidentialite.destinataires.resend':
      'Resend: delivery of transactional emails (booking request confirmation, tenant space link, signed inventory report).',
    'confidentialite.destinataires.hebergeur': 'GitHub Pages: hosting of the public pages of the website.',
    'confidentialite.destinataires.autorites':
      'Data may be disclosed to administrative or judicial authorities where required by law.',
    'confidentialite.transferts.titre': 'Transfers outside the European Union',
    'confidentialite.transferts.texte':
      'Some providers may host data outside the European Union. Such transfers rely on the contractual safeguards provided for by the GDPR (European Commission standard contractual clauses) and are limited to the data needed for the service.',
    'confidentialite.durees.titre': 'Retention periods',
    'confidentialite.durees.intro':
      'The periods below are applied automatically by the tenant data purge:',
    'confidentialite.durees.donnees':
      'Personal data of the stay (email address, access token, free-text notes): deleted {0} days after departure.',
    'confidentialite.durees.preuve':
      'Inventory report evidence (signed PDF and photographs): retained for {0} years from departure, to respond to a possible dispute.',
    'confidentialite.durees.note':
      'Booking data required for bookkeeping and the tourist tax declaration is kept for the applicable legal period.',
    'confidentialite.droits.titre': 'Your rights',
    'confidentialite.droits.intro':
      'Under the GDPR, you have the following rights over your data:',
    'confidentialite.droits.acces': 'right of access and copy;',
    'confidentialite.droits.rectification': 'right of rectification;',
    'confidentialite.droits.effacement':
      'right to erasure, within the limits of retention obligations;',
    'confidentialite.droits.limitation': 'right to restriction of processing;',
    'confidentialite.droits.opposition': 'right to object;',
    'confidentialite.droits.portabilite':
      'right to portability of the data you have provided.',
    'confidentialite.droits.exercer':
      'To exercise these rights, write to {0}. A reply will be sent within one month.',
    'confidentialite.droits.reclamation':
      'You may also lodge a complaint with the CNIL (www.cnil.fr) if you believe your rights are not respected.',
    'confidentialite.cookies.titre': 'Cookies and audience measurement',
    'confidentialite.cookies.texte':
      'The website sets no advertising cookies and uses no audience measurement tool. Only the technical exchanges required to display pages and submit a form take place.',
    'confidentialite.photos.titre': 'Inventory report photographs',
    'confidentialite.photos.texte':
      'Photographs taken in the apartment are used only to document its condition. They are neither published nor used for any other purpose. You may request their deletion at the contact address, subject to the evidence retention periods stated above.',
  },
  es: {
    'legal.retour': 'Volver al sitio',
    'legal.miseAJour': 'Última actualización:',
    'mentions.title': 'Aviso legal',
    'mentions.subtitle': 'Información sobre el editor del sitio y su alojamiento.',
    'mentions.editeur.titre': 'Editor del sitio',
    'mentions.editeur.intro':
      'Este sitio presenta un apartamento ofrecido en alquiler de temporada. Lo edita el propietario del alojamiento, disponible en los datos de contacto indicados a continuación.',
    'mentions.editeur.nom': 'Nombre o razón social',
    'mentions.editeur.forme': 'Forma jurídica',
    'mentions.editeur.siret': 'SIRET',
    'mentions.editeur.adresse': 'Dirección del propietario',
    'mentions.editeur.telephone': 'Teléfono',
    'mentions.editeur.email': 'Correo electrónico',
    'mentions.activite.titre': 'Actividad',
    'mentions.activite.texte':
      'Alquiler de temporada de un apartamento amueblado de turismo, situado en {0}, {1} {2}, {3}.',
    'mentions.publication.titre': 'Responsable de la publicación',
    'mentions.publication.texte':
      'El responsable de la publicación es el propietario del alojamiento. Cualquier solicitud puede enviarse a {0}.',
    'mentions.hebergeur.titre': 'Alojamiento del sitio',
    'mentions.hebergeur.texte':
      'El sitio está alojado por {0}, en el servicio GitHub Pages.',
    'mentions.hebergeur.site': 'Sitio del proveedor',
    'mentions.propriete.titre': 'Propiedad intelectual',
    'mentions.propriete.texte':
      'Los textos, fotografías y elementos gráficos de este sitio están protegidos por el derecho de autor. Queda prohibida toda reproducción o reutilización, total o parcial, sin autorización escrita.',
    'mentions.donnees.titre': 'Datos personales',
    'mentions.donnees.texte':
      'Los datos enviados con una solicitud de reserva o un inventario se tratan conforme a la política de privacidad del sitio, que precisa su naturaleza, finalidad, plazo de conservación y los derechos de los que dispone.',
    'mentions.donnees.lien': 'Leer la política de privacidad',
    'mentions.assurance.titre': 'Seguro',
    'mentions.assurance.texte':
      'El alojamiento está cubierto por un seguro adecuado para acoger huéspedes de pago. Los datos del contrato se facilitan por escrito si se solicitan.',
    'mentions.assurance.assureur': 'Aseguradora',
    'mentions.assurance.contrat': 'Número de contrato',
    'confidentialite.title': 'Política de privacidad',
    'confidentialite.subtitle': 'Cómo se recogen, utilizan y conservan sus datos.',
    'confidentialite.responsable.titre': 'Responsable del tratamiento',
    'confidentialite.responsable.texte':
      'El responsable del tratamiento es el propietario del alojamiento presentado en este sitio. Para cualquier pregunta sobre sus datos, escriba a {0}.',
    'confidentialite.donnees.titre': 'Datos recogidos',
    'confidentialite.donnees.intro':
      'El sitio solo recoge los datos necesarios para preparar y seguir una estancia:',
    'confidentialite.donnees.reservation':
      'Reserva: nombre, dirección de correo electrónico, número de teléfono si lo comunica, fechas deseadas, número de personas, mensaje libre y opciones elegidas.',
    'confidentialite.donnees.etat':
      'Inventario: fotografías de las estancias, notas libres y firma manuscrita digital, enviadas desde el espacio del inquilino a la llegada y a la salida.',
    'confidentialite.donnees.techniques':
      'Datos técnicos: registros de conexión conservados por el proveedor de alojamiento del sitio para garantizar su seguridad y buen funcionamiento.',
    'confidentialite.finalites.titre': '¿Para qué se utilizan estos datos?',
    'confidentialite.finalites.intro': 'Los datos solo sirven para:',
    'confidentialite.finalites.reservation':
      'responder a una solicitud de reserva y organizar la estancia;',
    'confidentialite.finalites.sejour':
      'preparar la llegada, entregar el alojamiento y realizar el inventario;',
    'confidentialite.finalites.preuve':
      'conservar la prueba de las comprobaciones realizadas en caso de litigio sobre la fianza o el estado del alojamiento;',
    'confidentialite.finalites.legal':
      'cumplir las obligaciones legales, en particular la declaración de la tasa turística y la contabilidad.',
    'confidentialite.base.titre': 'Base jurídica',
    'confidentialite.base.texte':
      'Los tratamientos se basan en la ejecución del contrato de alquiler y en las gestiones precontractuales (solicitud de reserva), en el interés legítimo del propietario en conservar una prueba en caso de litigio, y en el cumplimiento de las obligaciones legales.',
    'confidentialite.destinataires.titre': 'Destinatarios y encargados',
    'confidentialite.destinataires.texte':
      'Los datos no se venden ni se ceden. Solo tienen acceso el propietario del alojamiento y los proveedores técnicos que prestan el servicio:',
    'confidentialite.destinataires.supabase':
      'Supabase: alojamiento de la base de datos y almacenamiento de las fotografías.',
    'confidentialite.destinataires.resend':
      'Resend: envío de los correos transaccionales (confirmación de solicitud, enlace del espacio del inquilino, inventario firmado).',
    'confidentialite.destinataires.hebergeur': 'GitHub Pages: alojamiento de las páginas públicas del sitio.',
    'confidentialite.destinataires.autorites':
      'Los datos pueden comunicarse a las autoridades administrativas o judiciales cuando la ley lo exija.',
    'confidentialite.transferts.titre': 'Transferencias fuera de la Unión Europea',
    'confidentialite.transferts.texte':
      'Algunos proveedores pueden alojar datos fuera de la Unión Europea. Estas transferencias se basan en las garantías contractuales previstas por el RGPD (cláusulas contractuales tipo de la Comisión Europea) y se limitan a los datos necesarios para el servicio.',
    'confidentialite.durees.titre': 'Plazos de conservación',
    'confidentialite.durees.intro':
      'Los plazos siguientes se aplican automáticamente mediante la purga de los datos del inquilino:',
    'confidentialite.durees.donnees':
      'Datos personales de la estancia (dirección de correo, token de acceso, notas libres): suprimidos {0} días después de la salida.',
    'confidentialite.durees.preuve':
      'Prueba del inventario (PDF firmado y fotografías): conservada {0} años desde la salida, para responder a un posible litigio.',
    'confidentialite.durees.note':
      'Los datos de reserva necesarios para la contabilidad y la declaración de la tasa turística se conservan durante el plazo legal aplicable.',
    'confidentialite.droits.titre': 'Sus derechos',
    'confidentialite.droits.intro':
      'De conformidad con el RGPD, dispone de los siguientes derechos sobre sus datos:',
    'confidentialite.droits.acces': 'derecho de acceso y copia;',
    'confidentialite.droits.rectification': 'derecho de rectificación;',
    'confidentialite.droits.effacement':
      'derecho de supresión, dentro de los límites de las obligaciones de conservación;',
    'confidentialite.droits.limitation': 'derecho a la limitación del tratamiento;',
    'confidentialite.droits.opposition': 'derecho de oposición;',
    'confidentialite.droits.portabilite':
      'derecho a la portabilidad de los datos que haya facilitado.',
    'confidentialite.droits.exercer':
      'Para ejercer estos derechos, escriba a {0}. Recibirá una respuesta en el plazo de un mes.',
    'confidentialite.droits.reclamation':
      'También puede presentar una reclamación ante la CNIL (www.cnil.fr) si considera que no se respetan sus derechos.',
    'confidentialite.cookies.titre': 'Cookies y medición de audiencia',
    'confidentialite.cookies.texte':
      'El sitio no instala cookies publicitarias ni utiliza herramientas de medición de audiencia. Solo se producen los intercambios técnicos necesarios para mostrar las páginas y enviar un formulario.',
    'confidentialite.photos.titre': 'Fotografías del inventario',
    'confidentialite.photos.texte':
      'Las fotografías tomadas en el apartamento solo sirven para documentar su estado. No se publican ni se utilizan con otros fines. Puede solicitar su supresión en la dirección de contacto, sin perjuicio de los plazos de conservación de prueba indicados anteriormente.',
  },
  de: {
    'legal.retour': 'Zurück zur Website',
    'legal.miseAJour': 'Letzte Aktualisierung:',
    'mentions.title': 'Impressum',
    'mentions.subtitle': 'Angaben zum Betreiber der Website und zum Hosting.',
    'mentions.editeur.titre': 'Betreiber der Website',
    'mentions.editeur.intro':
      'Diese Website stellt eine Ferienwohnung vor. Betreiber ist der Vermieter der Wohnung; er ist unter den unten angegebenen Kontaktdaten erreichbar.',
    'mentions.editeur.nom': 'Name oder Firma',
    'mentions.editeur.forme': 'Rechtsform',
    'mentions.editeur.siret': 'SIRET',
    'mentions.editeur.adresse': 'Anschrift des Vermieters',
    'mentions.editeur.telephone': 'Telefon',
    'mentions.editeur.email': 'E-Mail',
    'mentions.activite.titre': 'Tätigkeit',
    'mentions.activite.texte':
      'Vermietung einer möblierten Ferienwohnung in {0}, {1} {2}, {3}.',
    'mentions.publication.titre': 'Verantwortlich für den Inhalt',
    'mentions.publication.texte':
      'Verantwortlich ist der Vermieter der Wohnung. Anfragen können an die Adresse {0} gerichtet werden.',
    'mentions.hebergeur.titre': 'Hosting',
    'mentions.hebergeur.texte': 'Die Website wird von {0} über den Dienst GitHub Pages gehostet.',
    'mentions.hebergeur.site': 'Website des Hosters',
    'mentions.propriete.titre': 'Urheberrecht',
    'mentions.propriete.texte':
      'Texte, Fotografien und grafische Elemente dieser Website sind urheberrechtlich geschützt. Jede vollständige oder teilweise Vervielfältigung oder Wiederverwendung ohne schriftliche Genehmigung ist untersagt.',
    'mentions.donnees.titre': 'Personenbezogene Daten',
    'mentions.donnees.texte':
      'Daten, die bei einer Buchungsanfrage oder einem Zustandsbericht übermittelt werden, werden gemäß der Datenschutzerklärung dieser Website verarbeitet; diese beschreibt Art, Zweck, Speicherdauer und Ihre Rechte.',
    'mentions.donnees.lien': 'Datenschutzerklärung lesen',
    'mentions.assurance.titre': 'Versicherung',
    'mentions.assurance.texte':
      'Die Wohnung ist durch eine Versicherung abgedeckt, die der Vermietung an zahlende Gäste entspricht. Die Vertragsangaben werden auf schriftliche Anfrage mitgeteilt.',
    'mentions.assurance.assureur': 'Versicherer',
    'mentions.assurance.contrat': 'Vertragsnummer',
    'confidentialite.title': 'Datenschutzerklärung',
    'confidentialite.subtitle': 'Wie Ihre Daten erhoben, verwendet und gespeichert werden.',
    'confidentialite.responsable.titre': 'Verantwortlicher',
    'confidentialite.responsable.texte':
      'Verantwortlich ist der Vermieter der auf dieser Website vorgestellten Wohnung. Bei Fragen zu Ihren Daten schreiben Sie an {0}.',
    'confidentialite.donnees.titre': 'Erhobene Daten',
    'confidentialite.donnees.intro':
      'Die Website erhebt nur die Daten, die für die Vorbereitung und Begleitung eines Aufenthalts erforderlich sind:',
    'confidentialite.donnees.reservation':
      'Buchung: Name, E-Mail-Adresse, Telefonnummer sofern angegeben, gewünschte Daten, Personenzahl, freie Nachricht und gewählte Optionen.',
    'confidentialite.donnees.etat':
      'Zustandsbericht: Fotos der Räume, freie Notizen und digitale handschriftliche Unterschrift, die bei Ankunft und Abreise über den Mieterbereich übermittelt werden.',
    'confidentialite.donnees.techniques':
      'Technische Daten: Verbindungsprotokolle, die vom Hoster der Website zu Sicherheits- und Betriebszwecken gespeichert werden.',
    'confidentialite.finalites.titre': 'Wozu werden diese Daten verwendet?',
    'confidentialite.finalites.intro': 'Die Daten dienen ausschließlich dazu:',
    'confidentialite.finalites.reservation':
      'eine Buchungsanfrage zu beantworten und den Aufenthalt zu organisieren;',
    'confidentialite.finalites.sejour':
      'die Ankunft vorzubereiten, die Wohnung zu übergeben und den Zustandsbericht zu erstellen;',
    'confidentialite.finalites.preuve':
      'den Nachweis der Feststellungen bei einem Streit über die Kaution oder den Zustand der Wohnung aufzubewahren;',
    'confidentialite.finalites.legal':
      'gesetzliche Pflichten zu erfüllen, insbesondere die Erklärung der Kurtaxe und die Buchhaltung.',
    'confidentialite.base.titre': 'Rechtsgrundlage',
    'confidentialite.base.texte':
      'Die Verarbeitungen beruhen auf der Durchführung des Mietvertrags und vorvertraglichen Maßnahmen (Buchungsanfrage), auf dem berechtigten Interesse des Vermieters, bei einem Streit einen Nachweis aufzubewahren, sowie auf der Erfüllung gesetzlicher Pflichten.',
    'confidentialite.destinataires.titre': 'Empfänger und Auftragsverarbeiter',
    'confidentialite.destinataires.texte':
      'Die Daten werden weder verkauft noch weitergegeben. Zugriff haben nur der Vermieter der Wohnung und die technischen Dienstleister, die den Dienst erbringen:',
    'confidentialite.destinataires.supabase':
      'Supabase: Hosting der Datenbank und Speicherung der Fotos.',
    'confidentialite.destinataires.resend':
      'Resend: Versand der Transaktions-E-Mails (Bestätigung der Anfrage, Link zum Mieterbereich, unterzeichneter Zustandsbericht).',
    'confidentialite.destinataires.hebergeur': 'GitHub Pages: Hosting der öffentlichen Seiten der Website.',
    'confidentialite.destinataires.autorites':
      'Daten können an Verwaltungs- oder Justizbehörden übermittelt werden, wenn dies gesetzlich vorgeschrieben ist.',
    'confidentialite.transferts.titre': 'Übermittlungen außerhalb der Europäischen Union',
    'confidentialite.transferts.texte':
      'Einige Dienstleister können Daten außerhalb der Europäischen Union hosten. Diese Übermittlungen stützen sich auf die im DSGVO vorgesehenen vertraglichen Garantien (Standardvertragsklauseln der Europäischen Kommission) und beschränken sich auf die für den Dienst erforderlichen Daten.',
    'confidentialite.durees.titre': 'Speicherdauer',
    'confidentialite.durees.intro':
      'Die folgenden Fristen werden automatisch durch die Löschroutine der Mieterdaten angewandt:',
    'confidentialite.durees.donnees':
      'Personenbezogene Daten des Aufenthalts (E-Mail-Adresse, Zugangstoken, freie Notizen): {0} Tage nach der Abreise gelöscht.',
    'confidentialite.durees.preuve':
      'Nachweis des Zustandsberichts (unterzeichnetes PDF und Fotos): {0} Jahre ab der Abreise aufbewahrt, um einen möglichen Streit beantworten zu können.',
    'confidentialite.durees.note':
      'Buchungsdaten, die für die Buchhaltung und die Erklärung der Kurtaxe erforderlich sind, werden für die geltende gesetzliche Frist aufbewahrt.',
    'confidentialite.droits.titre': 'Ihre Rechte',
    'confidentialite.droits.intro':
      'Gemäß DSGVO haben Sie folgende Rechte an Ihren Daten:',
    'confidentialite.droits.acces': 'Recht auf Auskunft und Kopie;',
    'confidentialite.droits.rectification': 'Recht auf Berichtigung;',
    'confidentialite.droits.effacement':
      'Recht auf Löschung im Rahmen der Aufbewahrungspflichten;',
    'confidentialite.droits.limitation': 'Recht auf Einschränkung der Verarbeitung;',
    'confidentialite.droits.opposition': 'Widerspruchsrecht;',
    'confidentialite.droits.portabilite':
      'Recht auf Übertragbarkeit der von Ihnen bereitgestellten Daten.',
    'confidentialite.droits.exercer':
      'Um diese Rechte auszuüben, schreiben Sie an {0}. Sie erhalten innerhalb eines Monats eine Antwort.',
    'confidentialite.droits.reclamation':
      'Sie können sich auch bei der CNIL (www.cnil.fr) beschweren, wenn Sie der Ansicht sind, dass Ihre Rechte nicht beachtet werden.',
    'confidentialite.cookies.titre': 'Cookies und Reichweitenmessung',
    'confidentialite.cookies.texte':
      'Die Website setzt keine Werbe-Cookies und verwendet keine Reichweitenmessung. Es finden nur die technischen Vorgänge statt, die für die Anzeige der Seiten und das Absenden eines Formulars erforderlich sind.',
    'confidentialite.photos.titre': 'Fotos des Zustandsberichts',
    'confidentialite.photos.texte':
      'Die in der Wohnung aufgenommenen Fotos dienen ausschließlich der Dokumentation ihres Zustands. Sie werden weder veröffentlicht noch für andere Zwecke verwendet. Sie können ihre Löschung unter der Kontaktadresse verlangen, vorbehaltlich der oben genannten Aufbewahrungsfristen.',
  },
};

import type { Lang } from '../i18n';

/**
 * Textes des conditions générales de vente.
 *
 * Le contenu variable (barème d'annulation, caution, version, médiateur) vient
 * de `content/annulation.json`, `content/tarifs.json` et `content/cgv.json` ;
 * seuls les libellés et les explications vivent ici. Aucune valeur juridique
 * n'est écrite en dur dans ce dictionnaire : ce qui dépend d'une décision du
 * propriétaire est interpolé depuis un fichier de contenu marqué `a_valider`.
 */
export const cgvT: Record<Lang, Record<string, string>> = {
  fr: {
    'cgv.title': 'Conditions générales de vente',
    'cgv.subtitle':
      "Les règles applicables à une location saisonnière dans cet appartement : prix, réservation, annulation, état des lieux et litiges.",
    'cgv.objet.titre': 'Objet',
    'cgv.objet.texte':
      "Les présentes conditions régissent la location saisonnière de l'appartement présenté sur ce site, à {0}, pour une durée déterminée. Elles s'appliquent à toute demande envoyée depuis le formulaire de réservation et sont acceptées au moment de l'envoi.",
    'cgv.logement.titre': 'Le logement',
    'cgv.logement.texte':
      "L'appartement est un meublé de tourisme proposé pour {0} personnes au maximum. Il est loué meublé, équipé et prêt à habiter, pour un usage d'habitation temporaire : il ne peut servir ni de résidence principale, ni à une activité professionnelle, commerciale ou artisanale.",
    'cgv.logement.nonClasse':
      "Le logement est un meublé de tourisme non classé : il ne bénéficie d'aucun classement, d'aucune étoile et d'aucun label. Aucune prestation de type hôtelier n'est comprise dans la location.",
    'cgv.prix.titre': 'Prix',
    'cgv.prix.texte':
      "Le prix du séjour dépend de la saison, du nombre de nuits et du nombre de voyageurs. Le montant estimé affiché par le formulaire est calculé à partir des tarifs publiés sur le site ; il est confirmé par écrit avant tout engagement.",
    'cgv.prix.options':
      "Les prestations facultatives (ménage de fin de séjour, location de vélos, forfait plage) sont facturées en supplément et ne sont dues que si elles ont été demandées. Les draps et le linge de maison sont fournis.",
    'cgv.prix.caution':
      "Une caution de {0} € est demandée. Elle n'est pas incluse dans le prix du séjour : elle est restituée après l'état des lieux de sortie, déduction faite des éventuels dommages constatés.",
    'cgv.prix.taxe':
      "La taxe de séjour s'ajoute au prix du séjour. Le logement relevant du régime des meublés de tourisme non classés, elle est due par nuit et par personne dans la limite du tarif de la catégorie la plus basse fixée par la commune. Les mineurs en sont exonérés.",
    'cgv.prix.taxeMontant':
      "Le taux communal en vigueur est de {0} € par nuit et par personne, dans la limite du plafond applicable aux meublés non classés.",
    'cgv.prix.taxeAValider':
      "Le barème communal de l'année en cours est communiqué avec la confirmation de la réservation. Aucun montant n'est publié ici tant qu'il n'a pas été vérifié auprès de la mairie.",
    'cgv.reservation.titre': 'Réservation',
    'cgv.reservation.texte':
      "Une demande envoyée depuis le site n'est pas une réservation ferme : elle est étudiée puis confirmée par écrit, sous réserve de la disponibilité du logement aux dates demandées. Le logement n'est retenu qu'après cette confirmation.",
    'cgv.reservation.paiement':
      "Aucun paiement n'est demandé ni encaissé sur ce site. Aucune donnée bancaire n'y est collectée.",
    'cgv.reservation.acompte':
      "Les modalités de règlement (acompte à la réservation et solde avant l'arrivée) sont indiquées dans la confirmation écrite, avec les coordonnées nécessaires. Tant que le règlement prévu n'est pas reçu, les dates peuvent être proposées à un autre voyageur.",
    'cgv.annulation.titre': "Annulation et remboursement",
    'cgv.annulation.intro':
      "En cas d'annulation par le voyageur, le remboursement dépend du délai restant avant l'arrivée. Le jour de l'arrivée n'est pas compté dans ce délai.",
    'cgv.annulation.colDelai': "Délai avant l'arrivée",
    'cgv.annulation.colRemboursement': 'Remboursement',
    'cgv.annulation.rembourse': 'du montant du séjour',
    'cgv.annulation.modele':
      "Ce barème est un modèle en attente de validation par le propriétaire : il est fourni à titre indicatif et ne devient contractuel qu'une fois confirmé dans le contrat de location.",
    'cgv.annulation.proprietaire':
      "Si l'annulation est le fait du propriétaire, le montant déjà versé est restitué intégralement, sans retenue.",
    'cgv.annulation.horsBareme':
      "Le remboursement porte sur le montant du séjour, hors taxe de séjour et hors prestations facultatives. Les cas particuliers (maladie, force majeure, interruption du séjour) ne sont pas couverts par ce barème : ils sont examinés au cas par cas, sur demande écrite.",
    'cgv.etat.titre': 'État des lieux et caution',
    'cgv.etat.texte':
      "Un état des lieux est réalisé à l'arrivée et au départ, avec photos et signature. Ces éléments servent uniquement à établir l'état du logement et à justifier, le cas échéant, une retenue sur la caution. Le voyageur est responsable des dégradations causées pendant son séjour, à l'exclusion de l'usure normale.",
    'cgv.etat.restauration':
      "Le logement doit être rendu dans l'état où il a été remis : vaisselle rangée, poubelles sorties, fenêtres fermées. Si l'option ménage n'a pas été souscrite, le logement doit être laissé propre.",
    'cgv.reglement.titre': 'Règlement du logement',
    'cgv.reglement.texte':
      "Le logement est prévu pour {0} personnes au maximum, enfants compris. La tranquillité de la résidence doit être respectée, en particulier après 22 heures. L'appartement est non-fumeur. Les animaux ne sont acceptés qu'après accord préalable et écrit.",
    'cgv.reglement.guide': "Lire le guide d'accueil",
    'cgv.donnees.titre': 'Données personnelles',
    'cgv.donnees.texte':
      "Les informations transmises avec une demande de réservation sont utilisées pour y répondre, organiser le séjour et remplir les obligations légales du loueur. Leur nature, leur durée de conservation et les droits dont dispose le voyageur sont décrits dans la politique de confidentialité.",
    'cgv.donnees.lien': 'Lire la politique de confidentialité',
    'cgv.mediateur.titre': 'Réclamations et médiation',
    'cgv.mediateur.texte':
      "Toute réclamation doit d'abord être adressée par écrit à {0}, en décrivant les faits. Une réponse est apportée dans le délai d'un mois.",
    'cgv.mediateur.absent':
      "Le propriétaire n'a pas encore désigné de médiateur de la consommation. Si aucune solution n'est trouvée après une réclamation écrite, le voyageur peut recourir gratuitement à un médiateur de la consommation dans les conditions prévues par le code de la consommation, ou s'adresser à l'association de consommateurs de son choix.",
    'cgv.droit.titre': 'Droit applicable',
    'cgv.droit.texte':
      "Les présentes conditions sont soumises au droit français. En cas de litige, les parties cherchent d'abord une solution amiable ; à défaut, les juridictions compétentes sont celles prévues par les règles légales applicables, y compris les règles protectrices dont bénéficie un consommateur.",
    'cgv.version.titre': 'Version applicable',
    'cgv.version.texte':
      "Cette version des conditions générales est identifiée par la référence {0}. La version applicable à une réservation est celle qui était en ligne au moment de l'envoi de la demande.",
    'cgv.contact': 'Une question sur ces conditions ? Écrivez-nous.',
  },
  en: {
    'cgv.title': 'Terms and conditions',
    'cgv.subtitle':
      'The rules that apply to a seasonal rental in this apartment: price, booking, cancellation, inventory and disputes.',
    'cgv.objet.titre': 'Purpose',
    'cgv.objet.texte':
      'These terms govern the seasonal rental of the apartment presented on this site, in {0}, for a fixed period. They apply to any request sent from the booking form and are accepted when it is sent.',
    'cgv.logement.titre': 'The property',
    'cgv.logement.texte':
      'The apartment is furnished tourist accommodation offered for a maximum of {0} people. It is let furnished, equipped and ready to live in, for temporary residential use only: it may not serve as a main residence or for any professional, commercial or craft activity.',
    'cgv.logement.nonClasse':
      'The property is unclassified furnished tourist accommodation: it holds no classification, no star rating and no label. No hotel-type service is included in the rental.',
    'cgv.prix.titre': 'Price',
    'cgv.prix.texte':
      'The price of the stay depends on the season, the number of nights and the number of guests. The estimate shown by the form is calculated from the rates published on the site; it is confirmed in writing before any commitment.',
    'cgv.prix.options':
      'Optional services (end-of-stay cleaning, bicycle hire, beach package) are charged extra and are due only when requested. Bed linen and household linen are provided.',
    'cgv.prix.caution':
      'A security deposit of {0} € is required. It is not included in the price of the stay: it is returned after the check-out inventory, less any damage found.',
    'cgv.prix.taxe':
      'Tourist tax is added to the price of the stay. As the property falls under the unclassified furnished tourist accommodation regime, it is due per night and per person, capped at the rate of the lowest category set by the municipality. Minors are exempt.',
    'cgv.prix.taxeMontant':
      'The applicable municipal rate is {0} € per night and per person, within the cap that applies to unclassified accommodation.',
    'cgv.prix.taxeAValider':
      "The municipal scale for the current year is provided with the booking confirmation. No amount is published here until it has been verified with the town hall.",
    'cgv.reservation.titre': 'Booking',
    'cgv.reservation.texte':
      'A request sent from the site is not a firm booking: it is reviewed and then confirmed in writing, subject to the property being available for the requested dates. The property is held only after that confirmation.',
    'cgv.reservation.paiement':
      'No payment is requested or collected on this site. No bank details are collected here.',
    'cgv.reservation.acompte':
      'Payment terms (deposit on booking and balance before arrival) are set out in the written confirmation, together with the necessary details. Until the agreed payment is received, the dates may be offered to another guest.',
    'cgv.annulation.titre': 'Cancellation and refunds',
    'cgv.annulation.intro':
      'If the guest cancels, the refund depends on the time remaining before arrival. The arrival day is not counted in that period.',
    'cgv.annulation.colDelai': 'Notice before arrival',
    'cgv.annulation.colRemboursement': 'Refund',
    'cgv.annulation.rembourse': 'of the stay amount',
    'cgv.annulation.modele':
      'This scale is a template awaiting confirmation by the owner: it is provided for information only and becomes contractual once confirmed in the rental agreement.',
    'cgv.annulation.proprietaire':
      'If the owner cancels, any amount already paid is refunded in full, without deduction.',
    'cgv.annulation.horsBareme':
      'Refunds apply to the amount of the stay, excluding tourist tax and optional services. Specific cases (illness, force majeure, early departure) are not covered by this scale: they are reviewed case by case, on written request.',
    'cgv.etat.titre': 'Inventory and security deposit',
    'cgv.etat.texte':
      'An inventory is taken on arrival and on departure, with photos and a signature. These records are used only to establish the condition of the property and, where applicable, to justify a deduction from the deposit. The guest is responsible for damage caused during the stay, excluding normal wear and tear.',
    'cgv.etat.restauration':
      'The property must be returned in the condition in which it was handed over: dishes put away, bins emptied, windows closed. If the cleaning option was not taken, the property must be left clean.',
    'cgv.reglement.titre': 'House rules',
    'cgv.reglement.texte':
      'The property is intended for a maximum of {0} people, children included. Quiet must be respected in the residence, particularly after 10 pm. The apartment is non-smoking. Pets are accepted only with prior written agreement.',
    'cgv.reglement.guide': 'Read the welcome guide',
    'cgv.donnees.titre': 'Personal data',
    'cgv.donnees.texte':
      'Information sent with a booking request is used to answer it, organise the stay and meet the owner’s legal obligations. Its nature, retention period and the guest’s rights are described in the privacy policy.',
    'cgv.donnees.lien': 'Read the privacy policy',
    'cgv.mediateur.titre': 'Complaints and mediation',
    'cgv.mediateur.texte':
      'Any complaint must first be sent in writing to {0}, describing the facts. A reply is given within one month.',
    'cgv.mediateur.absent':
      'The owner has not yet appointed a consumer mediator. If no solution is found after a written complaint, the guest may use a consumer mediator free of charge under the conditions set by the French consumer code, or contact a consumer association of their choice.',
    'cgv.droit.titre': 'Governing law',
    'cgv.droit.texte':
      'These terms are governed by French law. In the event of a dispute, the parties first seek an amicable solution; failing that, the competent courts are those provided for by the applicable legal rules, including the protective rules benefiting a consumer.',
    'cgv.version.titre': 'Applicable version',
    'cgv.version.texte':
      'This version of the terms is identified by reference {0}. The version applicable to a booking is the one online at the time the request was sent.',
    'cgv.contact': 'A question about these terms? Write to us.',
  },
  es: {
    'cgv.title': 'Condiciones generales de venta',
    'cgv.subtitle':
      'Las normas aplicables al alquiler de temporada de este apartamento: precio, reserva, cancelación, inventario y litigios.',
    'cgv.objet.titre': 'Objeto',
    'cgv.objet.texte':
      'Las presentes condiciones regulan el alquiler de temporada del apartamento presentado en este sitio, en {0}, por un periodo determinado. Se aplican a toda solicitud enviada desde el formulario de reserva y se aceptan en el momento del envío.',
    'cgv.logement.titre': 'El alojamiento',
    'cgv.logement.texte':
      'El apartamento es un alojamiento turístico amueblado que se ofrece para un máximo de {0} personas. Se alquila amueblado, equipado y listo para habitar, para un uso residencial temporal: no puede servir como vivienda habitual ni para una actividad profesional, comercial o artesanal.',
    'cgv.logement.nonClasse':
      'El alojamiento es un alojamiento turístico amueblado sin clasificación: no cuenta con clasificación, estrellas ni distintivo alguno. El alquiler no incluye ningún servicio de tipo hotelero.',
    'cgv.prix.titre': 'Precio',
    'cgv.prix.texte':
      'El precio de la estancia depende de la temporada, del número de noches y del número de huéspedes. El importe estimado que muestra el formulario se calcula a partir de las tarifas publicadas en el sitio; se confirma por escrito antes de cualquier compromiso.',
    'cgv.prix.options':
      'Los servicios opcionales (limpieza de salida, alquiler de bicicletas, pack de playa) se facturan aparte y solo se deben si se han solicitado. Se facilitan sábanas y ropa de casa.',
    'cgv.prix.caution':
      'Se solicita una fianza de {0} €. No está incluida en el precio de la estancia: se devuelve tras el inventario de salida, descontando los posibles daños comprobados.',
    'cgv.prix.taxe':
      'La tasa turística se añade al precio de la estancia. Al estar el alojamiento sujeto al régimen de los alojamientos turísticos amueblados sin clasificación, se debe por noche y por persona con el límite de la tarifa de la categoría más baja fijada por el municipio. Los menores están exentos.',
    'cgv.prix.taxeMontant':
      'La tarifa municipal vigente es de {0} € por noche y por persona, dentro del límite aplicable a los alojamientos sin clasificación.',
    'cgv.prix.taxeAValider':
      'El baremo municipal del año en curso se comunica con la confirmación de la reserva. No se publica aquí ningún importe mientras no se haya verificado con el ayuntamiento.',
    'cgv.reservation.titre': 'Reserva',
    'cgv.reservation.texte':
      'Una solicitud enviada desde el sitio no es una reserva firme: se estudia y después se confirma por escrito, siempre que el alojamiento esté disponible en las fechas solicitadas. El alojamiento solo queda retenido tras esa confirmación.',
    'cgv.reservation.paiement':
      'En este sitio no se solicita ni se cobra ningún pago. Tampoco se recogen datos bancarios.',
    'cgv.reservation.acompte':
      'Las modalidades de pago (señal en la reserva y saldo antes de la llegada) se indican en la confirmación escrita, junto con los datos necesarios. Mientras no se reciba el pago previsto, las fechas pueden ofrecerse a otro huésped.',
    'cgv.annulation.titre': 'Cancelación y reembolso',
    'cgv.annulation.intro':
      'Si el huésped cancela, el reembolso depende del tiempo que quede antes de la llegada. El día de llegada no se cuenta en ese plazo.',
    'cgv.annulation.colDelai': 'Plazo antes de la llegada',
    'cgv.annulation.colRemboursement': 'Reembolso',
    'cgv.annulation.rembourse': 'del importe de la estancia',
    'cgv.annulation.modele':
      'Este baremo es un modelo pendiente de validación por el propietario: se facilita a título indicativo y solo será contractual cuando se confirme en el contrato de alquiler.',
    'cgv.annulation.proprietaire':
      'Si la cancelación es del propietario, el importe ya abonado se devuelve íntegramente, sin retención.',
    'cgv.annulation.horsBareme':
      'El reembolso se aplica al importe de la estancia, sin la tasa turística ni los servicios opcionales. Los casos particulares (enfermedad, fuerza mayor, interrupción de la estancia) no están cubiertos por este baremo: se examinan caso por caso, previa solicitud escrita.',
    'cgv.etat.titre': 'Inventario y fianza',
    'cgv.etat.texte':
      'Se realiza un inventario a la llegada y a la salida, con fotografías y firma. Estos elementos solo sirven para constatar el estado del alojamiento y, en su caso, justificar una retención de la fianza. El huésped responde de los daños causados durante su estancia, excluido el desgaste normal.',
    'cgv.etat.restauration':
      'El alojamiento debe devolverse en el estado en que se entregó: vajilla recogida, basura sacada, ventanas cerradas. Si no se contrató la opción de limpieza, el alojamiento debe dejarse limpio.',
    'cgv.reglement.titre': 'Normas del alojamiento',
    'cgv.reglement.texte':
      'El alojamiento está previsto para un máximo de {0} personas, niños incluidos. Debe respetarse la tranquilidad de la residencia, especialmente después de las 22 h. El apartamento es para no fumadores. Solo se admiten animales con acuerdo previo y por escrito.',
    'cgv.reglement.guide': 'Leer la guía de acogida',
    'cgv.donnees.titre': 'Datos personales',
    'cgv.donnees.texte':
      'Los datos enviados con una solicitud de reserva se utilizan para responderla, organizar la estancia y cumplir las obligaciones legales del arrendador. Su naturaleza, su plazo de conservación y los derechos del huésped se describen en la política de privacidad.',
    'cgv.donnees.lien': 'Leer la política de privacidad',
    'cgv.mediateur.titre': 'Reclamaciones y mediación',
    'cgv.mediateur.texte':
      'Toda reclamación debe dirigirse primero por escrito a {0}, describiendo los hechos. Se responde en el plazo de un mes.',
    'cgv.mediateur.absent':
      'El propietario aún no ha designado un mediador de consumo. Si no se alcanza una solución tras una reclamación escrita, el huésped puede recurrir gratuitamente a un mediador de consumo en las condiciones previstas por el código de consumo francés, o dirigirse a la asociación de consumidores que elija.',
    'cgv.droit.titre': 'Derecho aplicable',
    'cgv.droit.texte':
      'Las presentes condiciones se rigen por el derecho francés. En caso de litigio, las partes buscan primero una solución amistosa; en su defecto, son competentes los tribunales previstos por las normas legales aplicables, incluidas las normas protectoras de las que se beneficia un consumidor.',
    'cgv.version.titre': 'Versión aplicable',
    'cgv.version.texte':
      'Esta versión de las condiciones se identifica con la referencia {0}. La versión aplicable a una reserva es la que estaba en línea en el momento del envío de la solicitud.',
    'cgv.contact': '¿Tiene alguna duda sobre estas condiciones? Escríbanos.',
  },
  de: {
    'cgv.title': 'Allgemeine Geschäftsbedingungen',
    'cgv.subtitle':
      'Die Regeln für die Vermietung dieser Ferienwohnung: Preis, Buchung, Stornierung, Zustandsbericht und Streitfälle.',
    'cgv.objet.titre': 'Gegenstand',
    'cgv.objet.texte':
      'Diese Bedingungen regeln die Vermietung der auf dieser Website vorgestellten Wohnung in {0} für einen festen Zeitraum. Sie gelten für jede über das Buchungsformular gesendete Anfrage und werden mit dem Absenden angenommen.',
    'cgv.logement.titre': 'Die Wohnung',
    'cgv.logement.texte':
      'Die Wohnung ist eine möblierte Ferienwohnung für höchstens {0} Personen. Sie wird möbliert, ausgestattet und bezugsfertig für eine vorübergehende Wohnnutzung vermietet: Sie darf weder als Hauptwohnsitz noch für eine berufliche, gewerbliche oder handwerkliche Tätigkeit dienen.',
    'cgv.logement.nonClasse':
      'Die Wohnung ist eine nicht eingestufte möblierte Ferienwohnung: Sie hat keine Einstufung, keine Sterne und kein Gütesiegel. Hoteldienstleistungen sind in der Miete nicht enthalten.',
    'cgv.prix.titre': 'Preis',
    'cgv.prix.texte':
      'Der Preis des Aufenthalts richtet sich nach der Saison, der Anzahl der Nächte und der Anzahl der Gäste. Der im Formular angezeigte Schätzbettrag wird aus den auf der Website veröffentlichten Preisen berechnet und vor jeder verbindlichen Zusage schriftlich bestätigt.',
    'cgv.prix.options':
      'Optionale Leistungen (Endreinigung, Fahrradverleih, Strandpaket) werden zusätzlich berechnet und sind nur bei Bestellung geschuldet. Bettwäsche und Hauswäsche werden gestellt.',
    'cgv.prix.caution':
      'Es wird eine Kaution von {0} € verlangt. Sie ist nicht im Preis des Aufenthalts enthalten: Sie wird nach dem Abnahmebericht zurückgezahlt, abzüglich festgestellter Schäden.',
    'cgv.prix.taxe':
      'Die Kurtaxe wird zum Preis des Aufenthalts hinzugerechnet. Da die Wohnung unter die Regelung für nicht eingestufte Ferienwohnungen fällt, wird sie pro Nacht und pro Person bis zur Höhe des niedrigsten von der Gemeinde festgelegten Tarifs erhoben. Minderjährige sind befreit.',
    'cgv.prix.taxeMontant':
      'Der geltende Gemeindetarif beträgt {0} € pro Nacht und pro Person, innerhalb der für nicht eingestufte Wohnungen geltenden Obergrenze.',
    'cgv.prix.taxeAValider':
      'Die Gemeindestaffel des laufenden Jahres wird mit der Buchungsbestätigung mitgeteilt. Ein Betrag wird hier erst veröffentlicht, wenn er mit der Stadtverwaltung abgeglichen wurde.',
    'cgv.reservation.titre': 'Buchung',
    'cgv.reservation.texte':
      'Eine über die Website gesendete Anfrage ist keine feste Buchung: Sie wird geprüft und anschließend schriftlich bestätigt, sofern die Wohnung zu den gewünschten Daten verfügbar ist. Die Wohnung wird erst nach dieser Bestätigung reserviert.',
    'cgv.reservation.paiement':
      'Auf dieser Website wird keine Zahlung verlangt und keine entgegengenommen. Es werden auch keine Bankdaten erhoben.',
    'cgv.reservation.acompte':
      'Die Zahlungsmodalitäten (Anzahlung bei der Buchung und Restzahlung vor der Anreise) ergeben sich aus der schriftlichen Bestätigung samt den erforderlichen Angaben. Bis zum Eingang der vereinbarten Zahlung können die Daten anderen Gästen angeboten werden.',
    'cgv.annulation.titre': 'Stornierung und Erstattung',
    'cgv.annulation.intro':
      'Storniert der Gast, richtet sich die Erstattung nach dem verbleibenden Zeitraum bis zur Anreise. Der Anreisetag zählt nicht zu dieser Frist.',
    'cgv.annulation.colDelai': 'Frist vor der Anreise',
    'cgv.annulation.colRemboursement': 'Erstattung',
    'cgv.annulation.rembourse': 'des Aufenthaltsbetrags',
    'cgv.annulation.modele':
      'Diese Staffelung ist ein Modell, das vom Eigentümer noch bestätigt werden muss: Sie dient nur zur Information und wird erst mit der Bestätigung im Mietvertrag verbindlich.',
    'cgv.annulation.proprietaire':
      'Storniert der Eigentümer, wird der bereits gezahlte Betrag vollständig und ohne Abzug erstattet.',
    'cgv.annulation.horsBareme':
      'Die Erstattung bezieht sich auf den Betrag des Aufenthalts ohne Kurtaxe und ohne optionale Leistungen. Sonderfälle (Krankheit, höhere Gewalt, vorzeitige Abreise) sind von dieser Staffelung nicht erfasst: Sie werden auf schriftliche Anfrage im Einzelfall geprüft.',
    'cgv.etat.titre': 'Zustandsbericht und Kaution',
    'cgv.etat.texte':
      'Bei Ankunft und bei Abreise wird ein Zustandsbericht mit Fotos und Unterschrift erstellt. Diese Unterlagen dienen ausschließlich dazu, den Zustand der Wohnung festzustellen und gegebenenfalls einen Abzug von der Kaution zu begründen. Der Gast haftet für Schäden, die während seines Aufenthalts entstehen, ausgenommen normale Abnutzung.',
    'cgv.etat.restauration':
      'Die Wohnung ist in dem Zustand zurückzugeben, in dem sie übergeben wurde: Geschirr weggeräumt, Müll entsorgt, Fenster geschlossen. Wurde die Reinigungsoption nicht gebucht, ist die Wohnung sauber zu hinterlassen.',
    'cgv.reglement.titre': 'Hausordnung',
    'cgv.reglement.texte':
      'Die Wohnung ist für höchstens {0} Personen einschließlich Kinder vorgesehen. Die Ruhe in der Wohnanlage ist zu wahren, insbesondere nach 22 Uhr. Die Wohnung ist eine Nichtraucherwohnung. Haustiere sind nur nach vorheriger schriftlicher Zustimmung erlaubt.',
    'cgv.reglement.guide': 'Gästehandbuch lesen',
    'cgv.donnees.titre': 'Personenbezogene Daten',
    'cgv.donnees.texte':
      'Die mit einer Buchungsanfrage übermittelten Daten dienen deren Beantwortung, der Organisation des Aufenthalts und der Erfüllung der gesetzlichen Pflichten des Vermieters. Art, Speicherdauer und die Rechte des Gastes sind in der Datenschutzerklärung beschrieben.',
    'cgv.donnees.lien': 'Datenschutzerklärung lesen',
    'cgv.mediateur.titre': 'Beschwerden und Mediation',
    'cgv.mediateur.texte':
      'Beschwerden sind zunächst schriftlich an {0} zu richten und dabei die Umstände zu schildern. Eine Antwort erfolgt innerhalb eines Monats.',
    'cgv.mediateur.absent':
      'Der Eigentümer hat noch keinen Verbraucherschlichter benannt. Wird nach einer schriftlichen Beschwerde keine Lösung gefunden, kann der Gast nach den Vorgaben des französischen Verbrauchergesetzbuchs kostenlos einen Verbraucherschlichter anrufen oder sich an eine Verbraucherorganisation seiner Wahl wenden.',
    'cgv.droit.titre': 'Anwendbares Recht',
    'cgv.droit.texte':
      'Diese Bedingungen unterliegen französischem Recht. Im Streitfall suchen die Parteien zunächst eine gütliche Lösung; andernfalls sind die nach den geltenden gesetzlichen Regeln zuständigen Gerichte berufen, einschließlich der Verbraucherschutzvorschriften.',
    'cgv.version.titre': 'Geltende Fassung',
    'cgv.version.texte':
      'Diese Fassung der Bedingungen ist durch die Referenz {0} gekennzeichnet. Für eine Buchung gilt die Fassung, die beim Absenden der Anfrage online war.',
    'cgv.contact': 'Fragen zu diesen Bedingungen? Schreiben Sie uns.',
  },
};

-- ============================================================
-- Gruissan Cozy — Schéma initial
-- Back office (messages, réservations, disponibilités) +
-- guide d'accueil numérique + packs (options de réservation)
--
-- À exécuter UNE FOIS dans le SQL Editor de Supabase
-- (Dashboard du projet → SQL Editor → New query → coller → Run).
-- ============================================================

-- ---------- messages : formulaire de contact ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text not null,
  email text not null,
  telephone text,
  dates text,
  message text not null,
  statut text not null default 'nouveau'
    check (statut in ('nouveau', 'en_cours', 'repondu', 'archive')),
  -- historique des réponses : [{"at": "ISO", "by": "admin", "body": "..."}]
  replies jsonb not null default '[]'::jsonb
);
create index if not exists messages_created_idx on public.messages (created_at desc);
create index if not exists messages_statut_idx on public.messages (statut);

-- ---------- bookings : demandes de réservation ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  check_in date not null,
  check_out date not null,
  guests integer not null default 2 check (guests between 1 and 8),
  nom text not null,
  email text not null,
  telephone text,
  message text,
  -- options choisies : [{"id":"...","slug":"velo","nom":"...","prix":45,"unite":"par_personne","quantite":2}]
  packs jsonb not null default '[]'::jsonb,
  total_estime numeric(10,2),
  statut text not null default 'demande'
    check (statut in ('demande', 'confirmee', 'annulee', 'terminee')),
  -- historique : [{"at": "ISO", "by": "admin", "action": "...", "detail": "..."}]
  historique jsonb not null default '[]'::jsonb,
  lang text
);
create index if not exists bookings_dates_idx on public.bookings (check_in, check_out);
create index if not exists bookings_statut_idx on public.bookings (statut);

-- ---------- availability : disponibilités par période ----------
create table if not exists public.availability (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  statut text not null default 'libre' check (statut in ('libre', 'partiel', 'reserve')),
  note text,
  updated_at timestamptz not null default now(),
  constraint availability_range check (end_date >= start_date)
);
create index if not exists availability_start_idx on public.availability (start_date);

-- ---------- packs : options proposées à la réservation ----------
create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  -- multilingue : {"fr": "...", "en": "...", "es": "...", "de": "..."}
  nom jsonb not null,
  description jsonb not null,
  prix numeric(10,2) not null check (prix >= 0),
  unite text not null default 'par_sejour'
    check (unite in ('par_personne', 'par_sejour', 'par_nuit')),
  actif boolean not null default true,
  ordre integer not null default 0
);

-- ---------- guide_sections : guide d'accueil numérique ----------
create table if not exists public.guide_sections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  titre jsonb not null,    -- {"fr": "...", ...}
  -- contenu HTML de confiance, saisi par l'admin dans le back office
  contenu jsonb not null,  -- {"fr": "<p>...</p>", ...}
  icone text,              -- emoji
  ordre integer not null default 0,
  actif boolean not null default true
);

-- ============================================================
-- Sécurité (RLS) : le public (clé anon) ne peut qu'écrire des
-- demandes et lire les contenus actifs. Tout le reste est
-- réservé à l'admin (authentifié Supabase — magic link).
-- ============================================================
alter table public.messages enable row level security;
alter table public.bookings enable row level security;
alter table public.availability enable row level security;
alter table public.packs enable row level security;
alter table public.guide_sections enable row level security;

create policy "public_insert_messages" on public.messages
  for insert to anon with check (true);
create policy "admin_all_messages" on public.messages
  for all to authenticated using (true) with check (true);

create policy "public_insert_bookings" on public.bookings
  for insert to anon with check (true);
create policy "admin_all_bookings" on public.bookings
  for all to authenticated using (true) with check (true);

create policy "public_read_availability" on public.availability
  for select to anon using (true);
create policy "admin_all_availability" on public.availability
  for all to authenticated using (true) with check (true);

create policy "public_read_packs" on public.packs
  for select to anon using (true);
create policy "admin_all_packs" on public.packs
  for all to authenticated using (true) with check (true);

create policy "public_read_guide" on public.guide_sections
  for select to anon using (true);
create policy "admin_all_guide" on public.guide_sections
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Données initiales : packs par défaut
-- ============================================================
insert into public.packs (slug, nom, description, prix, unite, ordre) values
  ('velo', '{"fr": "Location de vélos", "en": "Bike rental", "es": "Alquiler de bicicletas", "de": "Fahrradverleih"}'::jsonb,
   '{"fr": "Vélos tout chemin pour explorer la presqu''île, à retirer au port de Gruissan.", "en": "All-terrain bikes to explore the peninsula, pick-up at Gruissan marina.", "es": "Bicicletas de montaña para explorar la península, recogida en el puerto de Gruissan.", "de": "Trekkingräder für die Erkundung der Halbinsel, Abholung im Hafen von Gruissan."}'::jsonb,
   45, 'par_personne', 1),
  ('pack-plage', '{"fr": "Pack plage", "en": "Beach pack", "es": "Pack playa", "de": "Strand-Paket"}'::jsonb,
   '{"fr": "Parasol et 2 transats installés pour vous sur la plage du Grazel.", "en": "Parasol and 2 sun loungers set up for you on Grazel beach.", "es": "Sombrilla y 2 hamacas instalados para ti en la playa del Grazel.", "de": "Sonnenschirm und 2 Liegestühle, für Sie am Strand Le Grazel aufgebaut."}'::jsonb,
   70, 'par_sejour', 2),
  ('pack-bienvenue', '{"fr": "Pack bienvenue", "en": "Welcome pack", "es": "Pack bienvenida", "de": "Willkommens-Paket"}'::jsonb,
   '{"fr": "Vin du Clape, sel de Gruissan et tapenade maison pour vos premiers instants.", "en": "Clape wine, Gruissan salt and homemade tapenade for your first moments.", "es": "Vino del Clape, sal de Gruissan y tapenade casera para tus primeros instantes.", "de": "Clape-Wein, Salz aus Gruissan und hausgemachte Tapenade für Ihre ersten Momente."}'::jsonb,
   35, 'par_sejour', 3),
  ('menage', '{"fr": "Ménage fin de séjour", "en": "End-of-stay cleaning", "es": "Limpieza de fin de estancia", "de": "Endreinigung"}'::jsonb,
   '{"fr": "Ménage complet après votre départ — sans cette option, merci de laisser l''appartement propre.", "en": "Full cleaning after your departure — without this option, please leave the apartment clean.", "es": "Limpieza completa después de tu salida — sin esta opción, deja el apartamento limpio.", "de": "Komplette Reinigung nach Ihrer Abreise — ohne diese Option hinterlassen Sie die Wohnung bitte sauber."}'::jsonb,
   65, 'par_sejour', 4);

-- ============================================================
-- Données initiales : sections du guide d'accueil (FR)
-- Les autres langues sont à compléter depuis le back office
-- (/admin/guide) — la page publique retombe sur le français.
-- ============================================================
insert into public.guide_sections (slug, titre, contenu, icone, ordre) values
  ('bienvenue', '{"fr": "Bienvenue & check-in", "en": "Welcome & check-in", "es": "Bienvenida y check-in", "de": "Willkommen & Check-in"}'::jsonb,
   '{"fr": "<p>Bienvenue à Gruissan Plage ! Votre studio duplex est dans la résidence Les Régates, à deux pas de la plage du Grazel.</p><p><strong>Check-in</strong> : à partir de 16h (à ajuster selon vos horaires d''arrivée — appelez-moi).</p><p><em>À compléter dans le back office : digicode, étage, remise des clés.</em></p>"}'::jsonb,
   '👋', 1),
  ('wifi', '{"fr": "Wi-Fi", "en": "Wi-Fi", "es": "Wi-Fi", "de": "WLAN"}'::jsonb,
   '{"fr": "<p>La box internet se trouve dans le placard de l''entrée.</p><p><em>À compléter : nom du réseau et mot de passe.</em></p>"}'::jsonb,
   '📶', 2),
  ('climatisation', '{"fr": "Climatisation & chauffage", "en": "Air conditioning & heating", "es": "Aire acondicionado y calefacción", "de": "Klimaanlage & Heizung"}'::jsonb,
   '{"fr": "<p>Le studio est équipé d''une climatisation réversible (télécommande sur la table de chevet).</p><ul><li>Mode <strong>cool</strong> l''été, <strong>heat</strong> l''hiver — bouton MODE de la télécommande</li><li>Température conseillée : 22-25 °C</li><li>Fenêtres fermées pendant le fonctionnement</li><li>Éteindre en quittant l''appartement</li></ul>"}'::jsonb,
   '❄️', 3),
  ('electricite', '{"fr": "Électricité & compteur", "en": "Electricity & meter", "es": "Electricidad y contador", "de": "Strom & Zähler"}'::jsonb,
   '{"fr": "<p>Le compteur électrique et le disjoncteur général sont dans le placard du couloir du rez-de-chaussée.</p><p>Si le courant saute : vérifiez qu''un appareil n''est pas en surcharge (plaques + climatiseur + four en même temps), puis réarmez l''interrupteur basculé sur le tableau.</p><p><em>À compléter : emplacement exact du tableau.</em></p>"}'::jsonb,
   '⚡', 4),
  ('eau', '{"fr": "Eau", "en": "Water", "es": "Agua", "de": "Wasser"}'::jsonb,
   '{"fr": "<p>Eau chaude sanitaire par cumulus : prévoir environ 30 min après une douche pour le suivant.</p><p>Ne rien jeter dans les WC hormis le papier toilette.</p>"}'::jsonb,
   '🚿', 5),
  ('cuisine', '{"fr": "Cuisine & équipements", "en": "Kitchen & equipment", "es": "Cocina y equipamiento", "de": "Küche & Ausstattung"}'::jsonb,
   '{"fr": "<p>Cuisine ouverte équipée : réfrigérateur, micro-ondes, plaques de cuisson, évier, cafetière et bouilloire. Vaisselle et couverts pour 4 personnes.</p><p>Merci de laisser la vaisselle lavée et rangée au départ.</p>"}'::jsonb,
   '🍳', 6),
  ('accessoires', '{"fr": "Accessoires disponibles", "en": "Available accessories", "es": "Accesorios disponibles", "de": "Verfügbares Zubehör"}'::jsonb,
   '{"fr": "<p>Dans l''appartement : sèche-cheveux, fer et planche à repasser, étendoir à linge, produits de nettoyage de base, papier toilette et sacs poubelle.</p><p>En option à la réservation : pack plage (parasol + transats), location de vélos.</p>"}'::jsonb,
   '🧺', 7),
  ('dechets', '{"fr": "Poubelles & tri", "en": "Bins & recycling", "es": "Basura y reciclaje", "de": "Müll & Trennung"}'::jsonb,
   '{"fr": "<p>Bacs de tri dans la résidence. Sortez les poubelles le soir (passage tôt le matin).</p><p><em>À compléter : emplacement du local à poubelles.</em></p>"}'::jsonb,
   '🗑️', 8),
  ('checkout', '{"fr": "Check-out & ménage", "en": "Check-out & cleaning", "es": "Check-out y limpieza", "de": "Check-out & Reinigung"}'::jsonb,
   '{"fr": "<p>Départ avant 11h.</p><ul><li>Vaisselle lavée et rangée</li><li>Poubelles sorties</li><li>Fenêtres fermées, climatiseur éteint</li><li>Clés laissées sur la table / dans la boîte à clés</li></ul><p>Option ménage fin de séjour disponible à la réservation (65 €) — sinon l''appartement doit être laissé propre.</p>"}'::jsonb,
   '🧹', 9),
  ('reglement', '{"fr": "Règlement de la résidence", "en": "Residence rules", "es": "Normas de la residencia", "de": "Hausordnung"}'::jsonb,
   '{"fr": "<ul><li>Calme après 22h — résidence familiale</li><li>Capacité maximale : 4 personnes</li><li>Animaux : à convenir avant la réservation</li><li>Appartement non-fumeur</li></ul>"}'::jsonb,
   '📋', 10),
  ('urgences', '{"fr": "Urgences & numéros utiles", "en": "Emergencies & useful numbers", "es": "Urgencias y números útiles", "de": "Notfälle & nützliche Nummern"}'::jsonb,
   '{"fr": "<ul><li>Urgences : 112 (européen) ou 18 (pompiers)</li><li>Médecin le plus proche / pharmacie de garde : 3237</li><li>Office de tourisme de Gruissan : 04 68 75 41 10</li><li>Propriétaire : à compléter</li></ul>"}'::jsonb,
   '🆘', 11),
  ('adresses', '{"fr": "Bonnes adresses", "en": "Good addresses", "es": "Buenas direcciones", "de": "Gute Adressen"}'::jsonb,
   '{"fr": "<ul><li>Marché estival sur la place du Cadran Solaire (juillet-août)</li><li>Supérette et boulangerie à 200 m</li><li>Restaurants et glacier autour du Chalet</li><li>Village circulant et son château à 2 km</li></ul>"}'::jsonb,
   '📍', 12);

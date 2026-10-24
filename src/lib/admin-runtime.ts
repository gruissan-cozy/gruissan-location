/**
 * Utilitaires partagés par les pages du back office (/admin).
 *
 * Module côté client uniquement : il est importé par les <script> des pages
 * Astro (bundlé par Vite). Il contient :
 *   - un singleton d'état d'authentification partagé avec le garde du layout
 *   - des classes Tailwind réutilisables (champs, boutons, badges)
 *   - des helpers de formatage / échappement / notifications
 */

import { getSupabase } from './supabase';

// ---------------------------------------------------------------------------
// État d'authentification partagé
// ---------------------------------------------------------------------------

export interface AdminSession {
  email: string | null;
}

type AdminState = 'pending' | 'ready';

let state: AdminState = 'pending';
let session: AdminSession = { email: null };
const listeners = new Set<(s: AdminSession) => void>();

/**
 * Exécute `cb` dès que la session admin est confirmée par le garde du layout.
 * Si la session est déjà connue, `cb` est appelée immédiatement.
 */
export function onAdminReady(cb: (s: AdminSession) => void): void {
  if (state === 'ready') {
    cb(session);
    return;
  }
  listeners.add(cb);
}

/** Appelé par le garde d'authentification de AdminLayout une fois connecté. */
export function resolveAdminReady(s: AdminSession): void {
  if (state === 'ready') return;
  state = 'ready';
  session = s;
  for (const cb of [...listeners]) cb(s);
  listeners.clear();
}

/** Client Supabase garanti non nul (les pages ne rendent leur script que si configuré). */
export function sb(): NonNullable<ReturnType<typeof getSupabase>> {
  const client = getSupabase();
  if (!client) throw new Error('Supabase non configuré');
  return client;
}

// ---------------------------------------------------------------------------
// Classes Tailwind réutilisables (tokens ocean / sand / sunset)
// ---------------------------------------------------------------------------

export const CLS = {
  card: 'bg-white rounded-2xl border border-sand-200/70 shadow-card',
  cardPad: 'bg-white rounded-2xl border border-sand-200/70 shadow-card p-5 sm:p-6',
  pageTitle: 'font-display text-2xl sm:text-3xl font-semibold text-ocean-900',
  sectionTitle: 'font-display text-lg font-semibold text-ocean-900',
  label: 'block text-sm font-medium text-ocean-800 mb-1.5',
  hint: 'mt-1 text-xs text-ocean-700/60',
  input:
    'w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-ocean-900 placeholder:text-ocean-700/35 focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 focus:outline-none transition',
  inputError: 'border-rose-400 focus:border-rose-500 focus:ring-rose-200',
  select:
    'w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-ocean-900 focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 focus:outline-none transition',
  textarea:
    'w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-ocean-900 placeholder:text-ocean-700/35 focus:border-ocean-500 focus:ring-2 focus:ring-ocean-200 focus:outline-none transition font-mono leading-relaxed',
  checkbox: 'h-4 w-4 rounded border-sand-300 text-ocean-600 focus:ring-ocean-200',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-full bg-sunset-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sunset-600 disabled:opacity-50 disabled:cursor-not-allowed',
  btnGhost:
    'inline-flex items-center justify-center gap-2 rounded-full border border-sand-300 bg-white px-4 py-2 text-sm font-medium text-ocean-800 transition-colors hover:bg-sand-50 disabled:opacity-50 disabled:cursor-not-allowed',
  btnDanger:
    'inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed',
  btnSmall: 'px-3 py-1.5 text-xs',
  badge: 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1',
  th: 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ocean-700/70',
  td: 'px-4 py-3 text-sm text-ocean-900 align-top',
} as const;

/** Couleurs des badges de statut des messages. */
export const MESSAGE_STATUT_CLS: Record<string, string> = {
  nouveau: 'bg-sunset-400/15 text-sunset-600 ring-sunset-400/40',
  en_cours: 'bg-amber-50 text-amber-700 ring-amber-200',
  repondu: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archive: 'bg-sand-100 text-ocean-700/70 ring-sand-300',
};

/** Couleurs des badges de statut des disponibilités. */
export const DISPO_STATUT_CLS: Record<string, string> = {
  libre: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  partiel: 'bg-amber-50 text-amber-700 ring-amber-200',
  reserve: 'bg-rose-50 text-rose-700 ring-rose-200',
};

/** Couleurs des badges de statut des séjours. */
export const SEJOUR_STATUT_CLS: Record<string, string> = {
  option: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirme: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  annule: 'bg-rose-50 text-rose-700 ring-rose-200',
  termine: 'bg-sand-100 text-ocean-700/70 ring-sand-300',
};

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

/** « 12/10/2026 » — date seule, sans dépendance à une locale runtime. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** « 12/10/2026 à 14:35 » */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fmtDate(iso)} à ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** « Octobre 2026 » à partir d'une année et d'un index de mois (0-11). */
export function monthLabel(year: number, month: number): string {
  return `${MONTHS_FR[month] ?? ''} ${year}`;
}

/** « 01/10/2026 → 31/10/2026 » */
export function fmtRange(start: string, end: string): string {
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}

/** Prix en euros : 45 → « 45 € », 45.5 → « 45,50 € ». */
export function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const txt = Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
  return `${txt} €`;
}

// ---------------------------------------------------------------------------
// Échappement HTML (tout contenu saisi par un tiers passe par ici)
// ---------------------------------------------------------------------------

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Message d'erreur lisible depuis une erreur Supabase / JS. */
export function errText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const e = error as { message?: string; error_description?: string; details?: string };
  return e.message ?? e.error_description ?? e.details ?? JSON.stringify(error);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

let toastTimer: number | undefined;

/** Bandeau de notification éphémère (succès ou erreur). */
export function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  let host = document.getElementById('admin-toast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'admin-toast';
    host.className =
      'pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  host.innerHTML = `<div class="${
    kind === 'ok'
      ? 'bg-ocean-800 text-white'
      : 'bg-rose-600 text-white'
  } rounded-full px-5 py-2.5 text-sm font-medium shadow-card-hover">${esc(message)}</div>`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (host) host.innerHTML = '';
  }, 4000);
}

/** Affiche un message d'erreur dans un conteneur dédié d'un formulaire. */
export function showFieldError(el: HTMLElement | null, message: string): void {
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

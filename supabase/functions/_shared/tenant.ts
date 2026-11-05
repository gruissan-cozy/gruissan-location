import { createClient } from 'jsr:@supabase/supabase-js@2';

export const BUCKET = 'etats-des-lieux';
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-tenant-token, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Configuration Supabase absente.');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function validateTenantToken(token: string | null) {
  if (!token || token.length < 32 || token.length > 200) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('tenant_sessions')
    .select('id, reservation_id, email, expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return error ? null : data;
}

export function readTenantToken(req: Request): string | null {
  return req.headers.get('x-tenant-token');
}

export function normalizePdfText(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div|section)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/→/g, '->')
    .replace(/•/g, '-')
    .trim();
}

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config';

export const isConfigured =
  /^https?:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('SEU-PROJETO') && !SUPABASE_KEY.startsWith('COLE-AQUI');

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'http://localhost',
  isConfigured ? SUPABASE_KEY : 'x',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'fargusgram-auth',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  }
);

const PUBLIC_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/media/`;

// URL pública de um arquivo do bucket "media"
export function mediaUrl(path) {
  if (!path) return null;
  if (/^(blob:|data:|https?:)/.test(path)) return path;
  return PUBLIC_BASE + path.split('/').map(encodeURIComponent).join('/');
}

// Busca de músicas no catálogo do Apple Music (iTunes Search API).
// É grátis, não precisa de conta e devolve uma prévia de 30 s de cada faixa.
import { local } from './storage';

const ENDPOINT = 'https://itunes.apple.com/search';
const cache = new Map();

function toTrack(r) {
  if (!r?.previewUrl || !r.trackId) return null;
  let link = r.trackViewUrl || null;
  if (link) {
    try {
      const u = new URL(link);
      u.searchParams.delete('uo');
      link = u.toString();
    } catch {
      link = null;
    }
  }
  return {
    provider: 'apple',
    id: r.trackId,
    title: r.trackName || 'Música',
    artist: r.artistName || '',
    artwork: r.artworkUrl100 || r.artworkUrl60 || null,
    preview: r.previewUrl,
    link,
    explicit: r.trackExplicitness === 'explicit',
  };
}

// Plano B: se o navegador bloquear o acesso direto, pede a resposta como script (JSONP)
function jsonp(url, timeout = 9000) {
  return new Promise((resolve, reject) => {
    const cb = `fgMusic${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const s = document.createElement('script');
    const done = () => {
      clearTimeout(timer);
      delete window[cb];
      s.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('timeout'));
    }, timeout);
    window[cb] = (data) => {
      done();
      resolve(data);
    };
    s.onerror = () => {
      done();
      reject(new Error('network'));
    };
    s.src = `${url}&callback=${cb}`;
    document.head.appendChild(s);
  });
}

export async function searchSongs(term) {
  const q = term.trim().replace(/\s+/g, ' ');
  if (!q) return [];
  const key = q.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const url = `${ENDPOINT}?term=${encodeURIComponent(q)}&country=BR&media=music&entity=song&limit=30&lang=pt_br`;
  let data;
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    if (!navigator.onLine) throw new Error('Sem internet para buscar músicas.');
    try {
      data = await jsonp(url);
    } catch {
      throw new Error(/HTTP 403|HTTP 429/.test(String(err?.message)) ? 'Muitas buscas seguidas. Espere um minutinho.' : 'Não consegui buscar músicas agora. Tente de novo.');
    }
  }
  const seen = new Set();
  const list = (data?.results || [])
    .map(toTrack)
    .filter((t) => t && !seen.has(t.id) && seen.add(t.id));
  cache.set(key, list);
  return list;
}

// Músicas usadas por último neste aparelho
const RECENT_KEY = 'fargus-music-recent';

export function recentSongs() {
  try {
    const list = JSON.parse(local.get(RECENT_KEY, '[]'));
    return Array.isArray(list) ? list.filter((t) => t?.preview && t?.id).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function rememberSong(t) {
  const item = { provider: 'apple', id: t.id, title: t.title, artist: t.artist, artwork: t.artwork, preview: t.preview, link: t.link, explicit: !!t.explicit };
  const list = [item, ...recentSongs().filter((x) => x.id !== t.id)].slice(0, 12);
  local.set(RECENT_KEY, JSON.stringify(list));
}

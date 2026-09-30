// Vídeos publicados: como reconhecer e como baixar.
//
// O vídeo fica no Storage como .mp4, com uma foto (o primeiro quadro) em
// thumb_path, usada nas miniaturas e enquanto o vídeo carrega. Vídeo sem som
// (ou com música no lugar do som) termina em "-mudo.mp4".
//
// O arquivo é baixado inteiro (1 a 2 MB) e tocado a partir da memória: assim
// dá para voltar e repetir sem baixar de novo, e o service worker guarda uma
// cópia no celular (poupa o tráfego grátis do Supabase).
import { mediaUrl } from './supabase';

export const isVideoPath = (path) => typeof path === 'string' && /\.mp4$/i.test(path);
export const isSilentVideo = (path) => typeof path === 'string' && /-mudo\.mp4$/i.test(path);
// imagem que representa a mídia (miniaturas, capas, prévias)
export const stillOf = (path, thumb) => (isVideoPath(path) ? thumb || null : path || thumb || null);

const MAX_KEEP = 8; // vídeos guardados na memória (uns 12 MB)
const cache = new Map(); // path -> { promise, url, used }
const inUse = new Set();

function trim() {
  if (cache.size <= MAX_KEEP) return;
  const old = [...cache.entries()].filter(([p, e]) => e.url && !inUse.has(p)).sort((a, b) => a[1].used - b[1].used);
  for (const [p, e] of old.slice(0, cache.size - MAX_KEEP)) {
    URL.revokeObjectURL(e.url);
    cache.delete(p);
  }
}

// endereço local (blob:) do vídeo, baixando na primeira vez
export function loadVideo(path) {
  let e = cache.get(path);
  if (e) {
    e.used = Date.now();
    return e.promise;
  }
  e = { used: Date.now(), url: null, promise: null };
  e.promise = (async () => {
    const res = await fetch(mediaUrl(path));
    if (!res.ok) throw new Error('Não consegui carregar o vídeo.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob.type === 'video/mp4' ? blob : new Blob([blob], { type: 'video/mp4' }));
    e.url = url;
    trim();
    return url;
  })();
  e.promise.catch(() => cache.delete(path));
  cache.set(path, e);
  return e.promise;
}

// baixa antes de precisar (o próximo story, o próximo reel)
export function prefetchVideo(path) {
  if (isVideoPath(path)) loadVideo(path).catch(() => {});
}

export function markInUse(path, on) {
  if (!path) return;
  if (on) inUse.add(path);
  else inUse.delete(path);
}

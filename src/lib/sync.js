// Mantém as telas guardadas em cache em dia quando um post muda
// (ex.: comentou na tela de comentários e voltou para o feed).
import { on } from './events';
import { pageCache } from './storage';

function patchData(data, id, patch) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.items)) {
    return data.items.some((x) => x?.id === id) ? { ...data, items: data.items.map((x) => (x?.id === id ? { ...x, ...patch } : x)) } : data;
  }
  if (data.id === id && Array.isArray(data.media)) return { ...data, ...patch };
  return data;
}

function removeData(data, id) {
  if (Array.isArray(data?.items) && data.items.some((x) => x?.id === id)) {
    return { ...data, items: data.items.filter((x) => x?.id !== id) };
  }
  return data;
}

let started = false;
export function startCacheSync() {
  if (started) return;
  started = true;
  on('post:update', ({ id, patch }) => {
    for (const k of pageCache.keys()) if (!k.startsWith('scroll:')) pageCache.patch(k, (d) => patchData(d, id, patch));
  });
  on('post:delete', (id) => {
    for (const k of pageCache.keys()) {
      if (k.startsWith('scroll:')) continue;
      if (k.startsWith('post:' + id)) pageCache.delete(k);
      else pageCache.patch(k, (d) => removeData(d, id));
    }
  });
}

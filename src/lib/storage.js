// localStorage com proteção (modo privado / bloqueado não quebra o app)
export const local = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* ignora */
    }
  },
};

// Cache em memória das telas (para voltar e continuar de onde parou)
const cache = new Map();
export const pageCache = {
  get(key, maxAgeMs = 5 * 60 * 1000) {
    const v = cache.get(key);
    if (!v) return null;
    if (Date.now() - v.at > maxAgeMs) {
      cache.delete(key);
      return null;
    }
    return v.data;
  },
  set(key, data) {
    cache.set(key, { at: Date.now(), data });
  },
  patch(key, fn) {
    const v = cache.get(key);
    if (v) v.data = fn(v.data);
  },
  delete(key) {
    cache.delete(key);
  },
  clear() {
    cache.clear();
  },
  keys() {
    return [...cache.keys()];
  },
};

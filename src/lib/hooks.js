import { useCallback, useEffect, useRef, useState } from 'react';
import { pageCache } from './storage';
import { errorMessage } from './api';

// Lista com "carregar mais" (paginação por data) e cache para voltar sem recarregar.
// fetchPage(before) => Promise<array>; cada item precisa de created_at (ou getCursor)
export function useInfinite(key, fetchPage, { pageSize = 8, getCursor = (it) => it.created_at, enabled = true } = {}) {
  const cached = key ? pageCache.get(key) : null;
  const [items, setItems] = useState(cached?.items ?? []);
  const [done, setDone] = useState(cached?.done ?? false);
  const [loading, setLoading] = useState(!cached && enabled);
  const [error, setError] = useState(null);
  const busy = useRef(false);
  const req = useRef(0); // cada busca ganha um número; respostas antigas são ignoradas
  const keyRef = useRef(key);
  keyRef.current = key;
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const cursorRef = useRef(getCursor);
  cursorRef.current = getCursor;
  const stateRef = useRef({ items, done });
  stateRef.current = { items, done };

  const persist = useCallback((forKey, next) => {
    if (forKey) pageCache.set(forKey, { ...(pageCache.get(forKey) || {}), ...next });
  }, []);

  const load = useCallback(
    async (reset = false) => {
      if (!reset && (busy.current || stateRef.current.done)) return;
      const my = ++req.current;
      const forKey = keyRef.current;
      busy.current = true;
      setLoading(true);
      setError(null);
      try {
        const cur = reset ? [] : stateRef.current.items;
        const before = cur.length ? cursorRef.current(cur[cur.length - 1]) : null;
        const page = (await fetchRef.current(before)) || [];
        if (my !== req.current) return;
        const seen = new Set(cur.map((x) => x.id));
        const next = [...cur, ...page.filter((x) => !seen.has(x.id))];
        const isDone = page.length < pageSize;
        setItems(next);
        setDone(isDone);
        persist(forKey, { items: next, done: isDone });
      } catch (e) {
        if (my === req.current) setError(errorMessage(e));
      } finally {
        if (my === req.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [pageSize, persist]
  );

  useEffect(() => {
    if (!enabled) return;
    const c = key ? pageCache.get(key) : null;
    if (c) {
      req.current++; // descarta buscas antigas em andamento
      busy.current = false;
      setItems(c.items);
      setDone(c.done);
      setLoading(false);
      setError(null);
    } else {
      setItems([]);
      setDone(false);
      load(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  const update = useCallback(
    (fn) => {
      setItems((prev) => {
        const next = fn(prev);
        persist(keyRef.current, { items: next });
        return next;
      });
    },
    [persist]
  );

  return {
    items,
    loading,
    done,
    error,
    loadMore: () => load(false),
    reload: () => load(true),
    setItems: update,
  };
}

// Carrega um dado (com cache opcional: mostra o que já tinha e atualiza por trás)
export function useAsync(key, fn, deps = []) {
  const cached = key ? pageCache.get(key) : undefined;
  const [data, setData] = useState(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined || cached === null);
  const [error, setError] = useState(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const req = useRef(0);

  const reload = useCallback(async () => {
    const my = ++req.current;
    setError(null);
    try {
      const d = await fnRef.current();
      if (my !== req.current) return d;
      setData(d);
      if (key) pageCache.set(key, d);
      return d;
    } catch (e) {
      if (my === req.current) setError(errorMessage(e));
    } finally {
      if (my === req.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    const c = key ? pageCache.get(key) : null;
    if (c) {
      setData(c);
      setLoading(false);
    } else {
      setLoading(true);
      setData(null);
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  const mutate = useCallback(
    (fnOrValue) => {
      setData((prev) => {
        const next = typeof fnOrValue === 'function' ? fnOrValue(prev) : fnOrValue;
        if (key) pageCache.set(key, next);
        return next;
      });
    },
    [key]
  );

  return { data, loading, error, reload, mutate };
}

export function useInterval(fn, ms, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled || !ms) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Chama fn quando o elemento aparece na tela (rolagem infinita)
export function useOnVisible(fn, enabled = true) {
  const ref = useRef(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fnRef.current();
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}

// Segurar o dedo (toque longo) — funciona no iPhone, onde não existe "clique direito"
let lpTimer = null;
let lpStart = null;
export function longPress(fn, ms = 450) {
  const cancel = () => {
    clearTimeout(lpTimer);
    lpTimer = null;
  };
  return {
    onPointerDown: (e) => {
      cancel();
      lpStart = { x: e.clientX, y: e.clientY };
      lpTimer = setTimeout(() => {
        lpTimer = null;
        if (navigator.vibrate) navigator.vibrate(10);
        fn();
      }, ms);
    },
    onPointerMove: (e) => {
      if (lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  };
}

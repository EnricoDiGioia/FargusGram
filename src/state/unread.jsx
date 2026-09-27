import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import * as api from '../lib/api';
import { useSession } from './session';
import { useInterval } from '../lib/hooks';
import { emit, on } from '../lib/events';

const UnreadContext = createContext({ counts: {}, refresh: () => {} });

// Se o tempo real do Supabase estiver conectado, as telas consultam menos vezes
export const realtime = { ok: false };

export function UnreadProvider({ children }) {
  const { uid, characters } = useSession();
  const [counts, setCounts] = useState({});
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!uid || busy.current) return;
    busy.current = true;
    try {
      setCounts((await api.unreadCounts()) || {});
    } catch {
      /* sem internet: tenta depois */
    } finally {
      busy.current = false;
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh, characters.length]);

  useEffect(() => on('unread:refresh', refresh), [refresh]);

  // Voltou para o app: atualiza
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [refresh]);

  // Tempo real (quando disponível) + conferência periódica
  useEffect(() => {
    if (!uid) return;
    const channel = supabase
      .channel('fg-unread-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        refresh();
        emit('message:new', payload.new);
      })
      .subscribe((status) => {
        realtime.ok = status === 'SUBSCRIBED';
      });
    return () => {
      realtime.ok = false;
      supabase.removeChannel(channel);
    };
  }, [uid, refresh]);

  useInterval(refresh, 30000, !!uid);

  return <UnreadContext.Provider value={{ counts, refresh }}>{children}</UnreadContext.Provider>;
}

export function useUnread(characterId) {
  const { counts, refresh } = useContext(UnreadContext);
  const c = counts?.[characterId] || { notifications: 0, messages: 0 };
  const others = Object.entries(counts || {})
    .filter(([id]) => id !== characterId)
    .reduce((acc, [, v]) => acc + (v.notifications || 0) + (v.messages || 0), 0);
  return { ...c, others, all: counts, refresh };
}

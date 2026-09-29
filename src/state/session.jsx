import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, isConfigured } from '../lib/supabase';
import * as api from '../lib/api';
import { local, pageCache } from '../lib/storage';
import { pushLogout, setAppBadge } from '../lib/push';
import { getAppearance, normalizeAppearance, saveAppearance } from '../lib/theme';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(isConfigured ? undefined : null); // undefined = carregando
  const [me, setMe] = useState(undefined); // undefined = carregando; null = sem acesso
  const [meError, setMeError] = useState(null);
  const [activeId, setActiveId] = useState(() => local.get('fg-active'));

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setSession(data.session ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const uid = session?.user?.id ?? null;

  const refreshMe = useCallback(async () => {
    if (!uid) return null;
    try {
      const data = await api.me();
      setMe(data ?? null);
      setMeError(null);
      return data;
    } catch (e) {
      setMeError(api.errorMessage(e));
      return null;
    }
  }, [uid]);

  useEffect(() => {
    if (session === undefined) return;
    if (!uid) {
      setMe(null);
      pageCache.clear();
      return;
    }
    setMe(undefined);
    refreshMe();
  }, [uid, session === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  // tema guardado na conta vale em todos os aparelhos (quando o banco já tem)
  const savedAppearance = me?.appearance;
  useEffect(() => {
    if (!savedAppearance?.active) return;
    // (compara já normalizado: o banco guarda as chaves em outra ordem)
    if (JSON.stringify(getAppearance()) !== JSON.stringify(normalizeAppearance(savedAppearance))) saveAppearance(savedAppearance);
  }, [savedAppearance]);

  // escolher/criar tema: aplica na hora, guarda no aparelho e na conta
  const setAppearance = useCallback(
    async (a) => {
      const clean = saveAppearance(a);
      if (!me?.id || !Array.isArray(me.features) || !me.features.includes('temas')) return clean;
      setMe((m) => (m ? { ...m, appearance: clean } : m));
      await api.saveAppearance(me.id, clean);
      return clean;
    },
    [me?.id, me?.features]
  );

  const characters = useMemo(() => me?.characters ?? [], [me]);
  const active = characters.find((c) => c.id === activeId) || characters[0] || null;

  const setActive = useCallback((id) => {
    local.set('fg-active', id);
    setActiveId(id);
    window.scrollTo(0, 0);
  }, []);

  const patchCharacter = useCallback((c) => {
    setMe((m) => (m ? { ...m, characters: m.characters.map((x) => (x.id === c.id ? { ...x, ...c } : x)) } : m));
  }, []);

  const signOut = useCallback(async () => {
    await pushLogout();
    setAppBadge(0);
    await api.auth.signOut();
    local.set('fg-active', null);
    pageCache.clear();
    setMe(null);
  }, []);

  const value = {
    session,
    uid,
    me,
    meError,
    characters,
    active,
    isAdmin: !!me?.is_admin,
    setActive,
    refreshMe,
    patchCharacter,
    setAppearance,
    signOut,
    isMine: (characterId) => characters.some((c) => c.id === characterId),
    // recursos que dependem de atualização do banco ("destaques", "notas")
    can: (feature) => Array.isArray(me?.features) && me.features.includes(feature),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { pageCache } from '../lib/storage';

// Ao abrir uma tela nova, começa do topo. Ao voltar, continua de onde parou.
export default function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType();
  const current = useRef(location.key);

  useEffect(() => {
    const onScroll = () => pageCache.set('scroll:' + current.current, window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useLayoutEffect(() => {
    current.current = location.key;
    const saved = navType === 'POP' ? pageCache.get('scroll:' + location.key, 60 * 60 * 1000) : null;
    window.scrollTo(0, saved || 0);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

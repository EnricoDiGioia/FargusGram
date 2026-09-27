import { useEffect, useRef, useState } from 'react';
import { RiftMark } from './Brand';

// Puxar para baixo no topo da tela para atualizar (o app instalado não tem isso nativo)
export default function PullToRefresh({ onRefresh, children }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef(null);
  const pullRef = useRef(0);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const THRESHOLD = 70;

  useEffect(() => {
    const onStart = (e) => {
      if (window.scrollY > 0 || refreshing || document.documentElement.classList.contains('no-scroll')) return;
      start.current = { y: e.touches[0].clientY, x: e.touches[0].clientX };
    };
    const onMove = (e) => {
      if (!start.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = Math.abs(e.touches[0].clientX - start.current.x);
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        if (pullRef.current) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      const d = Math.min(120, dy * 0.5);
      pullRef.current = d;
      setPull(d);
      if (e.cancelable && d > 5) e.preventDefault();
    };
    const onEnd = async () => {
      if (!start.current) return;
      start.current = null;
      const d = pullRef.current;
      pullRef.current = 0;
      if (d >= THRESHOLD) {
        setRefreshing(true);
        setPull(THRESHOLD * 0.7);
        try {
          await refreshRef.current?.();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
      } else setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshing]);

  return (
    <div className="ptr">
      <div
        className={`ptr__indicator ${refreshing ? 'is-spinning' : ''}`}
        style={{ height: pull, opacity: Math.min(1, pull / THRESHOLD) }}
        aria-hidden={!refreshing}
      >
        <span style={{ transform: `rotate(${pull * 3}deg)` }}>
          <RiftMark size={26} />
        </span>
      </div>
      {children}
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { Spinner } from './ui';
import { mediaUrl } from '../lib/supabase';
import { videoHost, useVideoHost } from '../lib/videoHost';
import { fadeIn } from '../lib/fade';

// Caixa de um vídeo publicado: mostra a foto do primeiro quadro e, quando
// `active`, recebe o <video> do app (lib/videoHost.js) e toca.
// fit: 'cover' | 'contain' | '' (o CSS da tela decide)
export function HostedVideo({
  hostKey,
  path,
  poster,
  active,
  loop = true,
  sound = false,
  held = false,
  fit = 'cover',
  onEnded,
  className = '',
  eager = false,
  showSpinner = true,
  boxRef,
  children,
}) {
  const box = useRef(null);
  const s = useVideoHost();
  const mine = s.key === hostKey;
  const ended = useRef(onEnded);
  ended.current = onEnded;

  useLayoutEffect(() => {
    if (!active || !path) return undefined;
    videoHost.request(hostKey, { path, container: box.current, loop, sound, held, fit, onEnded: () => ended.current?.() });
    return () => videoHost.release(hostKey);
  }, [active, hostKey, path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (active) videoHost.update(hostKey, { loop, sound, held, fit });
  }, [active, hostKey, loop, sound, held, fit]);

  const ready = mine && s.ready;
  return (
    <div
      ref={(el) => {
        box.current = el;
        if (boxRef) boxRef.current = el;
      }}
      className={`hvideo ${ready ? 'is-ready' : ''} ${fit ? `hvideo--${fit}` : ''} ${className}`}
    >
      {poster && <img {...fadeIn} className="hvideo__poster" src={mediaUrl(poster)} alt="" draggable="false" loading={eager ? 'eager' : 'lazy'} decoding="async" />}
      {showSpinner && active && mine && !ready && s.status !== 'error' && (
        <span className="hvideo__spinner">
          <Spinner size={26} />
        </span>
      )}
      {children}
    </div>
  );
}

// Está bem visível na tela? (espera um pouquinho: passar rolando não baixa o vídeo)
export function useInView(ref, { threshold = 0.6, delay = 250 } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    let timer = null;
    const io = new IntersectionObserver(
      ([entry]) => {
        const now = entry.isIntersecting && entry.intersectionRatio >= threshold;
        clearTimeout(timer);
        if (now) timer = setTimeout(() => setInView(true), delay);
        else setInView(false);
      },
      { threshold: [0, threshold, 0.95] }
    );
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [ref, threshold, delay]);
  return inView;
}

// Símbolo de vídeo nas grades e miniaturas
export function VideoMark({ size = 16 }) {
  return (
    <span className="video-mark" aria-hidden="true">
      <Play size={size} fill="currentColor" strokeWidth={0} />
    </span>
  );
}

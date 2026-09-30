import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';

// limites do corte (iguais aos de lib/videoEdit.js, que só carrega com um vídeo)
export const MAX_SECONDS = 15;
export const MIN_SECONDS = 1;
export const MAX_VIDEOS_PER_POST = 3;

export const isVideoFile = (f) => !!f && (/^video\//i.test(f.type || '') || /\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name || ''));

const fmt = (t) => {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 9.95 ? '0' : ''}${r.toFixed(1)}`;
};
export const clipSeconds = (c) => Math.max(0, (c.end ?? c.duration) - (c.start || 0));

// Prévia do trecho escolhido, repetindo (vídeo original, do próprio celular)
export function ClipVideo({ clip, muted = true, paused = false, className = '', style, videoRef }) {
  const ref = useRef(null);
  const start = clip.start || 0;
  const end = clip.end ?? clip.duration;
  useEffect(() => {
    const v = ref.current;
    if (v) v.muted = muted;
  }, [muted]);
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    let raf;
    const keep = () => {
      if (v.currentTime >= end - 0.04 || v.currentTime < start - 0.25) {
        try {
          v.currentTime = start;
        } catch {
          /* ainda carregando */
        }
      }
      raf = requestAnimationFrame(keep);
    };
    try {
      if (Math.abs(v.currentTime - start) > 0.2) v.currentTime = start;
    } catch {
      /* ainda carregando */
    }
    if (paused) v.pause();
    else {
      v.play().catch(() => {});
      raf = requestAnimationFrame(keep);
    }
    return () => cancelAnimationFrame(raf);
  }, [clip.url, start, end, paused]);
  return (
    <video
      ref={(el) => {
        ref.current = el;
        if (videoRef) videoRef.current = el;
      }}
      className={`clip-video ${className}`}
      style={style}
      src={clip.url}
      poster={clip.poster?.url}
      muted
      playsInline
      autoPlay
      loop
      disablePictureInPicture
      disableRemotePlayback
      preload="auto"
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// quadros do vídeo para a tira do corte
async function filmstrip(url, duration, n, height = 64) {
  const el = document.createElement('video');
  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  el.src = url;
  await new Promise((res) => {
    el.addEventListener('loadeddata', res, { once: true });
    el.addEventListener('error', res, { once: true });
    setTimeout(res, 8000);
  });
  const out = [];
  const w = Math.round(height * ((el.videoWidth || 9) / (el.videoHeight || 16)));
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = height;
  const ctx = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    const t = Math.min(duration - 0.05, ((i + 0.5) / n) * duration);
    await new Promise((res) => {
      const done = () => {
        el.removeEventListener('seeked', done);
        res();
      };
      el.addEventListener('seeked', done);
      setTimeout(done, 2000);
      try {
        el.currentTime = t;
      } catch {
        done();
      }
    });
    try {
      ctx.drawImage(el, 0, 0, c.width, c.height);
      out.push(c.toDataURL('image/jpeg', 0.6));
    } catch {
      out.push(null);
    }
  }
  el.removeAttribute('src');
  el.load();
  return out;
}

// Escolher o trecho (até 15 s) e se vai com o som do vídeo
export function VideoTrimmer({ clip, onDone, onCancel, title = 'Cortar vídeo', noSound = false }) {
  const dur = clip.duration;
  const [start, setStart] = useState(clip.start || 0);
  const [end, setEnd] = useState(Math.min(dur, clip.end ?? dur, (clip.start || 0) + MAX_SECONDS));
  const [muted, setMuted] = useState(!!clip.muted || !clip.hasAudio);
  const [frames, setFrames] = useState([]);
  const [dragging, setDragging] = useState(false);
  const strip = useRef(null);
  const drag = useRef(null);
  const video = useRef(null);
  const head = useRef(null);

  useEffect(() => {
    let alive = true;
    filmstrip(clip.url, dur, 10).then((f) => alive && setFrames(f));
    return () => {
      alive = false;
    };
  }, [clip.url, dur]);

  // linha que mostra onde a prévia está tocando
  useEffect(() => {
    let raf;
    const tick = () => {
      const v = video.current;
      if (v && head.current) head.current.style.left = `${(v.currentTime / dur) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dur]);

  const toTime = (clientX) => {
    const r = strip.current.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((clientX - r.left) / r.width) * dur));
  };
  const onDown = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* segue sem captura */
    }
    drag.current = { mode, t0: toTime(e.clientX), start, end };
    setDragging(true);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const t = toTime(e.clientX);
    const v = video.current;
    if (d.mode === 'start') {
      const s = Math.max(0, d.end - MAX_SECONDS, Math.min(t, d.end - MIN_SECONDS));
      setStart(s);
      if (v) v.currentTime = s;
    } else if (d.mode === 'end') {
      const en = Math.min(dur, d.start + MAX_SECONDS, Math.max(t, d.start + MIN_SECONDS));
      setEnd(en);
      if (v) v.currentTime = Math.max(d.start, en - 0.05);
    } else {
      const len = d.end - d.start;
      const s = Math.max(0, Math.min(dur - len, d.start + (t - d.t0)));
      setStart(s);
      setEnd(s + len);
      if (v) v.currentTime = s;
    }
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const left = (start / dur) * 100;
  const width = ((end - start) / dur) * 100;
  const clipped = { ...clip, start, end };

  return createPortal(
    <div className="trimmer" role="dialog" aria-label={title}>
      <div className="trimmer__top">
        <button type="button" className="text-editor__cancel" onClick={onCancel}>
          Cancelar
        </button>
        <strong>{title}</strong>
        <button type="button" className="text-editor__done" onClick={() => onDone({ start, end, muted })}>
          Concluir
        </button>
      </div>
      <div className="trimmer__preview">
        <ClipVideo clip={clipped} muted={muted} paused={dragging} videoRef={video} />
      </div>
      <div className="trimmer__info">
        <span>
          {fmt(start)} – {fmt(end)} · <strong>{Math.round((end - start) * 10) / 10} s</strong>
        </span>
        {!noSound && clip.hasAudio && (
          <button type="button" className={`trimmer__sound ${muted ? '' : 'is-on'}`} aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {muted ? 'Sem som' : 'Com som'}
          </button>
        )}
      </div>
      <div className="trimmer__strip" ref={strip} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="trimmer__frames" aria-hidden="true">
          {frames.map((f, i) => (f ? <img key={i} src={f} alt="" draggable="false" /> : <span key={i} />))}
        </div>
        <div className="trimmer__shade" style={{ left: 0, width: `${left}%` }} />
        <div className="trimmer__shade" style={{ left: `${left + width}%`, right: 0 }} />
        <div
          className="trimmer__window"
          style={{ left: `${left}%`, width: `${width}%` }}
          onPointerDown={(e) => onDown(e, 'move')}
          role="slider"
          aria-label="Trecho do vídeo"
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          aria-valuenow={Math.round(start)}
        >
          <span className="trimmer__handle trimmer__handle--l" onPointerDown={(e) => onDown(e, 'start')} aria-label="Começo do trecho" />
          <span className="trimmer__handle trimmer__handle--r" onPointerDown={(e) => onDown(e, 'end')} aria-label="Fim do trecho" />
        </div>
        <span className="trimmer__head" ref={head} aria-hidden="true" />
      </div>
      <p className="trimmer__hint">
        Arraste as pontas ou o trecho. Cada vídeo pode ter até {MAX_SECONDS} segundos
        {dur > MAX_SECONDS ? ` (este tem ${Math.round(dur)} s)` : ''}.
      </p>
    </div>,
    document.body
  );
}

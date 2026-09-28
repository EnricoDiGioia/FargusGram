import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Play, Pause, ChevronLeft, Music2 } from 'lucide-react';
import { Sheet, Spinner } from './ui';
import { searchSongs, recentSongs, rememberSong } from '../lib/musicSearch';
import { artworkUrl, CLIP_SECONDS, formatTime, player, usePlayer } from '../lib/music';
import { useDebounced } from '../lib/hooks';

const PREVIEW = 'picker:preview';
const TRIM = 'picker:trim';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// "Onda" decorativa, sempre igual para a mesma música
function makeBars(seed, n) {
  let x = Math.abs(Math.floor(Number(seed) || 7)) % 2147483647 || 7;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  const out = [];
  let prev = 0.5;
  for (let i = 0; i < n; i++) {
    prev = prev * 0.4 + (0.2 + rnd() * 0.8) * 0.6;
    out.push(prev);
  }
  return out;
}

function Bars({ bars }) {
  return bars.map((h, i) => <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />);
}

function ClipTrimmer({ total, clip, start, seed, onChange, onScrub, progressRef }) {
  const strip = useRef(null);
  const drag = useRef(null);
  const bars = useMemo(() => makeBars(seed, 48), [seed]);
  const maxStart = Math.max(0, total - clip);
  const left = (start / total) * 100;
  const width = Math.min(100, (clip / total) * 100);

  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, start };
    onScrub(true);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || !strip.current) return;
    const next = d.start + ((e.clientX - d.x) / strip.current.clientWidth) * total;
    onChange(Math.round(clamp(next, 0, maxStart) * 10) / 10);
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    onScrub(false);
  };
  const key = (e) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    onChange(clamp(Math.round(start + step), 0, maxStart));
  };

  return (
    <div
      className="trim"
      ref={strip}
      role="slider"
      tabIndex={0}
      aria-label="Início do trecho"
      aria-valuemin={0}
      aria-valuemax={Math.round(maxStart)}
      aria-valuenow={Math.round(start)}
      aria-valuetext={`${formatTime(start)} até ${formatTime(start + clip)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <div className="trim__bars">
        <Bars bars={bars} />
      </div>
      <div className="trim__bars trim__bars--on" style={{ clipPath: `inset(0 ${Math.max(0, 100 - left - width)}% 0 ${left}%)` }}>
        <Bars bars={bars} />
      </div>
      <div className="trim__window" style={{ left: `${left}%`, width: `${width}%` }}>
        <span className="trim__progress" ref={progressRef} />
      </div>
    </div>
  );
}

function TrackRow({ t, playing, loading, onChoose, onPreview }) {
  return (
    <div className="music-row">
      <button type="button" className="music-row__main" onClick={() => onChoose(t)}>
        {t.artwork ? (
          <img className="music-row__art" src={artworkUrl(t.artwork, 100)} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="music-row__art music-row__art--empty">
            <Music2 size={20} />
          </span>
        )}
        <span className="music-row__text">
          <strong>{t.title}</strong>
          <span className="muted">
            {t.explicit && <span className="music-e">E</span>}
            {t.artist}
          </span>
        </span>
      </button>
      <button type="button" className="music-row__play" onClick={() => onPreview(t)} aria-label={playing ? 'Parar prévia' : `Ouvir ${t.title}`}>
        {loading ? <Spinner size={16} /> : playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
      </button>
    </div>
  );
}

// Linha "Adicionar música" (também usada na edição do post)
export function MusicDetailsLine({ music, onOpen, onClear }) {
  return (
    <div className="details__line details__line--music">
      <button type="button" className="details__line-main" onClick={onOpen}>
        <Music2 size={20} />
        {music ? (
          <span className="details__music">
            <strong>{music.title}</strong>
            {music.artist && <span className="muted">{music.artist}</span>}
          </span>
        ) : (
          <span>Adicionar música</span>
        )}
      </button>
      {music && (
        <button type="button" className="icon-btn details__clear" onClick={onClear} aria-label="Remover música">
          <X size={18} />
        </button>
      )}
    </div>
  );
}

// Escolher música e o trecho (usado ao criar post, editar post e criar story)
export default function MusicPicker({ open, onClose, value, onChange, story = false }) {
  const ps = usePlayer();
  const [step, setStep] = useState('search');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 380);
  const [found, setFound] = useState({ term: '', list: [], error: '' }); // resultado da última busca
  const [retry, setRetry] = useState(0);
  const [recents, setRecents] = useState([]);
  const [previewId, setPreviewId] = useState(null);
  const [sel, setSel] = useState(null);
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState(30);
  const [scrubbing, setScrubbing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [sticker, setSticker] = useState(true);
  const progress = useRef(null);
  const input = useRef(null);

  const clip = Math.min(CLIP_SECONDS, total);

  // abrir: começa na busca ou no trecho da música já escolhida
  useEffect(() => {
    if (!open) return;
    setRecents(recentSongs());
    setPaused(false);
    setTotal(30);
    if (value) {
      setSel(value);
      setStart(value.start || 0);
      setSticker(value.sticker !== null && value.sticker !== false);
      setStep('trim');
    } else {
      setSel(null);
      setStart(0);
      setSticker(true);
      setStep('search');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ao fechar ou trocar de etapa, para o som
  useEffect(() => {
    if (!open) {
      player.release(PREVIEW);
      player.release(TRIM);
      setPreviewId(null);
    } else if (step === 'search') {
      player.release(TRIM);
      setTimeout(() => input.current?.focus({ preventScroll: true }), 250);
    } else {
      player.release(PREVIEW);
      setPreviewId(null);
    }
  }, [open, step]);

  useEffect(() => () => {
    player.release(PREVIEW);
    player.release(TRIM);
  }, []);

  // busca (o resultado guarda o termo, para nunca mostrar a lista de outra busca)
  useEffect(() => {
    const term = dq.trim();
    if (!open || !term) return;
    let alive = true;
    searchSongs(term).then(
      (list) => alive && setFound({ term, list, error: '' }),
      (err) => alive && setFound({ term, list: [], error: err.message })
    );
    return () => {
      alive = false;
    };
  }, [dq, open, retry]);

  // toca o trecho escolhido em repetição
  useEffect(() => {
    if (!open || step !== 'trim' || !sel) return;
    player.request(TRIM, {
      src: sel.preview,
      start,
      duration: clip,
      meta: { title: sel.title, artist: sel.artist, artwork: sel.artwork },
    });
    player.hold(TRIM, scrubbing || paused);
  }, [open, step, sel, start, clip, scrubbing, paused]);

  // barra de progresso dentro do trecho + duração real da prévia
  useEffect(() => {
    if (!open || step !== 'trim') return;
    let raf;
    const tick = () => {
      if (player.isCurrent(TRIM)) {
        const d = player.duration();
        if (d > 5 && Math.abs(d - total) > 0.3) {
          setTotal(d);
          setStart((s) => Math.min(s, Math.max(0, d - Math.min(CLIP_SECONDS, d))));
        }
        const p = clamp((player.time() - start) / clip, 0, 1);
        if (progress.current) progress.current.style.width = `${p * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, step, start, clip, total]);

  const togglePreview = (t) => {
    if (previewId === t.id && ps.key === PREVIEW) {
      player.release(PREVIEW);
      setPreviewId(null);
      return;
    }
    setPreviewId(t.id);
    player.request(PREVIEW, { src: t.preview, start: 0, duration: 30, meta: t }, { loop: false });
    if (!ps.soundOn) player.setSound(true);
  };

  const choose = (t) => {
    const s0 = value && value.id === t.id ? value.start || 0 : 0;
    player.release(PREVIEW);
    // já pede o trecho aqui, durante o toque, para o iPhone deixar tocar
    player.request(TRIM, { src: t.preview, start: s0, duration: CLIP_SECONDS, meta: t });
    if (!ps.soundOn) player.setSound(true);
    setSel(t);
    setStart(s0);
    setPaused(false);
    setTotal(30);
    setStep('trim');
  };

  const done = () => {
    rememberSong(sel);
    onChange({ ...sel, start, duration: clip }, { sticker });
    onClose();
  };

  const remove = () => {
    onChange(null, { sticker: false });
    onClose();
  };

  const trimStatus = ps.key === TRIM ? ps.status : 'loading';
  const playingTrim = trimStatus === 'playing' && !paused && !scrubbing;
  const togglePlay = () => {
    if (trimStatus === 'blocked' || trimStatus === 'error' || !ps.soundOn) {
      setPaused(false);
      player.retry();
    } else setPaused((p) => !p);
  };

  // enquanto digita ou busca, esconde a lista antiga (para não tocar numa música errada)
  const term = q.trim();
  const ready = term === dq.trim() && found.term === term;
  const list = term ? (ready ? found.list : null) : recents;
  const previewStatus = ps.key === PREVIEW ? ps.status : null;

  return (
    <Sheet open={open} onClose={onClose} title={step === 'search' ? 'Música' : undefined} className="sheet--tall music-sheet">
      {step === 'search' && (
        <div className="music-search">
          <label className="search-field search-field--sheet">
            <Search size={16} />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar música ou artista"
              autoCapitalize="none"
              autoComplete="off"
              enterKeyHint="search"
              aria-label="Buscar música"
            />
            {q && (
              <button type="button" className="search-field__clear" onClick={() => setQ('')} aria-label="Limpar busca">
                <X size={14} />
              </button>
            )}
          </label>
          <div className="music-list">
            {!term && recents.length > 0 && <h4 className="music-list__title">Usadas recentemente</h4>}
            {!term && recents.length === 0 && (
              <div className="music-empty">
                <Music2 size={40} strokeWidth={1.4} />
                <p>Pesquise pelo nome da música ou do artista.</p>
              </div>
            )}
            {term && !ready && (
              <div className="center-pad">
                <Spinner />
              </div>
            )}
            {term && ready && found.error && (
              <div className="music-empty">
                <p className="form-error">{found.error}</p>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setFound({ term: '', list: [], error: '' });
                    setRetry((r) => r + 1);
                  }}
                >
                  Tentar de novo
                </button>
              </div>
            )}
            {term && ready && !found.error && found.list.length === 0 && <p className="muted center-pad">Nenhuma música encontrada.</p>}
            {list?.map((t) => (
              <TrackRow
                key={t.id}
                t={t}
                playing={previewId === t.id && previewStatus === 'playing'}
                loading={previewId === t.id && previewStatus === 'loading'}
                onChoose={choose}
                onPreview={togglePreview}
              />
            ))}
            <p className="music-credit muted small">Prévias de 30 segundos do Apple Music</p>
          </div>
        </div>
      )}

      {step === 'trim' && sel && (
        <div className="music-trim">
          <div className="music-trim__bar">
            <button type="button" className="icon-btn" onClick={() => setStep('search')} aria-label="Escolher outra música">
              <ChevronLeft size={26} strokeWidth={1.8} />
            </button>
            <span className="music-trim__heading">Escolha o trecho</span>
            <button type="button" className="link-accent" onClick={done}>
              Concluir
            </button>
          </div>
          <div className="music-trim__song">
            <button type="button" className="music-trim__art" onClick={togglePlay} aria-label={playingTrim ? 'Pausar' : 'Tocar'}>
              {sel.artwork ? <img src={artworkUrl(sel.artwork, 300)} alt="" /> : <Music2 size={48} />}
              <span className="music-trim__play">
                {trimStatus === 'loading' && !paused ? (
                  <Spinner size={26} />
                ) : playingTrim ? (
                  <Pause size={26} fill="currentColor" />
                ) : (
                  <Play size={26} fill="currentColor" />
                )}
              </span>
            </button>
            <strong className="music-trim__title">
              {sel.explicit && <span className="music-e">E</span>}
              {sel.title}
            </strong>
            <span className="muted">{sel.artist}</span>
          </div>
          <ClipTrimmer
            total={total}
            clip={clip}
            start={start}
            seed={sel.id}
            onChange={setStart}
            onScrub={setScrubbing}
            progressRef={progress}
          />
          <p className="music-trim__time">
            <strong>
              {formatTime(start)} – {formatTime(start + clip)}
            </strong>
            <span className="muted"> · arraste para escolher a parte da música</span>
          </p>
          {(trimStatus === 'blocked' || trimStatus === 'error') && (
            <p className="muted small center">
              {trimStatus === 'error' ? 'Não deu para tocar esta prévia agora.' : 'Toque na capa para ouvir.'}
            </p>
          )}
          {story && (
            <label className="music-trim__opt">
              <input type="checkbox" checked={sticker} onChange={(e) => setSticker(e.target.checked)} />
              <span>Mostrar adesivo da música no story</span>
            </label>
          )}
          {value && (
            <button type="button" className="btn btn--danger-ghost btn--block" onClick={remove}>
              Remover música
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

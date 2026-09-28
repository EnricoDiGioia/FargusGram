import { useEffect } from 'react';
import { Music2, Volume2, VolumeX, ExternalLink } from 'lucide-react';
import { Sheet } from './ui';
import { artworkUrl, clipOf, musicLabel, player, usePlayer } from '../lib/music';

// Toca a música do post enquanto ele estiver bem visível na tela
export function useMusicInView(ref, key, music) {
  const src = music?.preview;
  const start = music?.start;
  const duration = music?.duration;
  useEffect(() => {
    const el = ref.current;
    if (!src || !el || typeof IntersectionObserver === 'undefined') return;
    const clip = clipOf(music);
    let inView = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        const now = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        if (now === inView) return;
        inView = now;
        if (now) player.request(key, clip);
        else player.release(key);
      },
      { threshold: [0, 0.6, 0.9] }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      player.release(key);
    };
  }, [key, src, start, duration]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Botão de som (alto-falante) sobre a foto ou no story
export function SoundButton({ playerKey, className = '', size = 14, light = false }) {
  const s = usePlayer();
  const mine = s.key === playerKey;
  const blocked = mine && (s.status === 'blocked' || s.status === 'error');
  const on = s.soundOn && !blocked;
  const click = (e) => {
    e.stopPropagation();
    if (!s.soundOn) {
      player.focus(playerKey);
      player.setSound(true);
    } else if (blocked) {
      player.retry();
    } else if (!mine) {
      player.focus(playerKey);
    } else {
      player.setSound(false);
    }
  };
  return (
    <button
      type="button"
      data-sound-btn=""
      className={`sound-btn ${light ? 'sound-btn--light' : ''} ${className}`}
      aria-label={on ? 'Desligar o som' : 'Ligar o som'}
      aria-pressed={on}
      onClick={click}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      {on ? <Volume2 size={size} strokeWidth={2.2} /> : <VolumeX size={size} strokeWidth={2.2} />}
    </button>
  );
}

// Linha "♫ Artista · Música"
export function MusicLine({ music, onClick, className = '' }) {
  if (!music) return null;
  const content = (
    <>
      <Music2 size={12} strokeWidth={2.4} aria-hidden="true" />
      <span className="music-line__text">{musicLabel(music)}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={`music-line ${className}`} onClick={onClick} aria-label={`Música: ${musicLabel(music)}`}>
      {content}
    </button>
  ) : (
    <span className={`music-line ${className}`}>{content}</span>
  );
}

// Detalhes da música (capa, nome, link para o Apple Music e som)
export function MusicInfoSheet({ music, open, onClose }) {
  const s = usePlayer();
  if (!music) return null;
  return (
    <Sheet open={open} onClose={onClose} title="Música">
      <div className="music-info">
        {music.artwork ? (
          <img className="music-info__art" src={artworkUrl(music.artwork, 300)} alt="" />
        ) : (
          <span className="music-info__art music-info__art--empty">
            <Music2 size={36} />
          </span>
        )}
        <strong className="music-info__title">
          {music.explicit && <span className="music-e">E</span>}
          {music.title}
        </strong>
        {music.artist && <span className="muted">{music.artist}</span>}
        <div className="music-info__actions">
          <button type="button" data-sound-btn="" className="btn btn--secondary" onClick={() => player.setSound(!s.soundOn)}>
            {s.soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            {s.soundOn ? 'Som ligado' : 'Som desligado'}
          </button>
          {music.link && (
            <a className="btn btn--primary" href={music.link} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={18} />
              Apple Music
            </a>
          )}
        </div>
        <p className="muted small">Prévia de 30 segundos do Apple Music</p>
      </div>
    </Sheet>
  );
}

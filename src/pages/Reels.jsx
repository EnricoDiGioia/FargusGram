import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Heart, MessageCircle, Send, Camera, Clapperboard, Volume2, VolumeX, Pause } from 'lucide-react';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import ShareSheet from '../components/ShareSheet';
import { MusicInfoSheet, MusicLine, toggleSound } from '../components/Music';
import { HostedVideo } from '../components/Video';
import { Handle, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useInfinite } from '../lib/hooks';
import { emit, on } from '../lib/events';
import { pageCache } from '../lib/storage';
import { count } from '../lib/format';
import { cleanMusic, clipOf, player, usePlayer } from '../lib/music';
import { isSilentVideo, prefetchVideo } from '../lib/videoFiles';
import { videoHost } from '../lib/videoHost';
import { mediaUrl } from '../lib/supabase';
import * as api from '../lib/api';

// Um reel na tela: toque liga/desliga o som, segurar pausa, dois toques curte
function ReelSlide({ post, active }) {
  const { active: me } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const m = post.media[0];
  const music = useMemo(() => cleanMusic(post.music), [post.music]);
  const hostKey = `reel:${post.id}`;
  const musicKey = `reelmusic:${post.id}`;
  const ownSound = !music && !isSilentVideo(m.path);
  const soundKey = ownSound ? videoHost.soundKey(hostKey) : music ? musicKey : null;
  const ps = usePlayer();
  const [held, setHeld] = useState(false);
  const [burst, setBurst] = useState(0);
  const [flash, setFlash] = useState(null); // ícone do som que aparece depois do toque
  const [expanded, setExpanded] = useState(false);
  const [share, setShare] = useState(false);
  const [musicInfo, setMusicInfo] = useState(false);
  const press = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  // música do reel: toca junto (o vídeo vai sem o som dele)
  useEffect(() => {
    if (!active || !music) return undefined;
    player.request(musicKey, clipOf(music));
    return () => player.release(musicKey);
  }, [active, music, musicKey]);
  useEffect(() => {
    if (active && music) player.hold(musicKey, held);
  }, [active, music, musicKey, held]);

  const setLiked = async (liked) => {
    if (liked === post.liked) return;
    const before = { liked: post.liked, like_count: post.like_count };
    emit('post:update', { id: post.id, patch: { liked, like_count: post.like_count + (liked ? 1 : -1) } });
    try {
      if (liked) await api.like(post.id, me.id);
      else await api.unlike(post.id, me.id);
    } catch (e) {
      emit('post:update', { id: post.id, patch: before });
      toast(api.errorMessage(e));
    }
  };

  const onDown = (e) => {
    press.current = { x: e.clientX, y: e.clientY, t: Date.now(), timer: setTimeout(() => setHeld(true), 260) };
  };
  const onUp = (e) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (held) {
      setHeld(false);
      return;
    }
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return; // rolou
    const now = Date.now();
    const l = lastTap.current;
    if (now - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 40) {
      lastTap.current = { t: 0, x: 0, y: 0 };
      setBurst((b) => b + 1);
      setLiked(true);
    } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
    // o som muda na hora (precisa ser dentro do toque, por causa do iPhone);
    // no segundo toque volta, e fica só a curtida
    if (soundKey) {
      toggleSound(soundKey, ps);
      setFlash(Date.now());
    }
  };
  const onCancel = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
    setHeld(false);
  };
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(t);
  }, [flash]);

  const soundOn = !!soundKey && ps.soundOn && ps.key === soundKey && ps.status !== 'blocked';
  const blocked = !!soundKey && ps.key === soundKey && ps.status === 'blocked';
  const c = post.character;
  const caption = post.caption || '';
  const long = caption.length > 90 || caption.split('\n').length > 2;
  const tall = m.width / m.height < 0.7;

  return (
    <section className="reel" aria-label={`Reel de ${c.handle}`}>
      <HostedVideo hostKey={hostKey} path={m.path} poster={m.thumb_path} active={active} loop sound={ownSound} held={held} fit={tall ? 'cover' : 'contain'} eager={active} className="reel__video" />
      <div className="reel__tap" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onCancel} onContextMenu={(e) => e.preventDefault()} />
      {burst > 0 && (
        <span key={burst} className="heart-burst" aria-hidden="true">
          <Heart size={100} fill="currentColor" strokeWidth={0} />
        </span>
      )}
      {flash && soundKey && (
        <span className="reel__flash" aria-hidden="true">
          {soundOn ? <Volume2 size={28} /> : <VolumeX size={28} />}
        </span>
      )}
      {held && (
        <span className="reel__flash reel__flash--pause" aria-hidden="true">
          <Pause size={30} fill="currentColor" strokeWidth={0} />
        </span>
      )}
      {active && blocked && (
        <button type="button" data-sound-btn="" className="reel__tap-sound" onClick={() => player.retry()}>
          <VolumeX size={16} /> Toque para ouvir
        </button>
      )}

      <div className="reel__side">
        <button type="button" className={`reel__act ${post.liked ? 'is-liked' : ''}`} aria-label={post.liked ? 'Descurtir' : 'Curtir'} aria-pressed={post.liked} onClick={() => setLiked(!post.liked)}>
          <Heart size={28} strokeWidth={post.liked ? 0 : 1.9} fill={post.liked ? 'currentColor' : 'none'} />
          <span>{count(post.like_count)}</span>
        </button>
        <button type="button" className="reel__act" aria-label="Comentários" onClick={() => navigate(`/p/${post.id}/comentarios`)}>
          <MessageCircle size={27} strokeWidth={1.9} style={{ transform: 'scaleX(-1)' }} />
          <span>{count(post.comment_count)}</span>
        </button>
        <button type="button" className="reel__act" aria-label="Enviar" onClick={() => setShare(true)}>
          <Send size={25} strokeWidth={1.9} />
        </button>
        {soundKey && (
          <button
            type="button"
            data-sound-btn=""
            className="reel__act"
            aria-label={soundOn ? 'Desligar o som' : 'Ligar o som'}
            aria-pressed={soundOn}
            onClick={() => toggleSound(soundKey, ps)}
          >
            {soundOn ? <Volume2 size={25} /> : <VolumeX size={25} />}
          </button>
        )}
      </div>

      <div className="reel__info">
        <Link to={`/u/${c.handle}`} className="reel__who">
          <Avatar character={c} size={32} />
          <Handle character={c} className="strong" badge={13} />
        </Link>
        {caption && (
          <div className={`reel__caption ${expanded ? 'is-open' : ''}`} onClick={() => long && setExpanded((v) => !v)}>
            <RichText text={caption} />
          </div>
        )}
        {music && <MusicLine music={music} onClick={() => setMusicInfo(true)} className="reel__music" />}
      </div>
      <ShareSheet open={share} onClose={() => setShare(false)} post={post} />
      {music && <MusicInfoSheet music={music} open={musicInfo} onClose={() => setMusicInfo(false)} />}
    </section>
  );
}

export default function Reels() {
  const { active, can } = useSession();
  const navigate = useNavigate();
  const key = `reels-feed:${active.id}`; // (a aba Reels do perfil usa `reels:<id>`)
  const list = useInfinite(key, (b) => api.reels(active.id, b), { pageSize: 6, enabled: can('videos') });
  const scroller = useRef(null);
  const [cur, setCur] = useState(() => pageCache.get(`${key}:at`) || 0);

  // volta para o reel onde estava (ex.: depois de abrir os comentários)
  useEffect(() => {
    const el = scroller.current;
    if (el && cur) el.scrollTop = cur * el.clientHeight;
  }, [list.items.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const offU = on('post:update', ({ id, patch }) => list.setItems((xs) => xs.map((p) => (p.id === id ? { ...p, ...patch } : p))));
    const offD = on('post:delete', (id) => list.setItems((xs) => xs.filter((p) => p.id !== id)));
    const offC = on('post:create', () => list.reload());
    return () => {
      offU();
      offD();
      offC();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // o próximo já vai baixando
  useEffect(() => {
    pageCache.set(`${key}:at`, cur);
    const n = list.items[cur + 1];
    if (n) {
      prefetchVideo(n.media[0]?.path);
      if (n.media[0]?.thumb_path) new Image().src = mediaUrl(n.media[0].thumb_path);
    }
    if (cur >= list.items.length - 2 && !list.done && !list.loading) list.loadMore();
  }, [cur, list.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== cur) setCur(i);
  };

  const empty = !list.loading && !list.error && list.items.length === 0;
  return (
    <div className="reels">
      <div className="reels__top">
        <h1>Reels</h1>
        <button type="button" className="icon-btn icon-btn--light" aria-label="Criar reel" onClick={() => navigate('/criar/reel')}>
          <Camera size={26} />
        </button>
      </div>
      <div className="reels__scroller" ref={scroller} onScroll={onScroll}>
        {list.items.map((p, i) => (
          <ReelSlide key={p.id} post={p} active={i === cur} />
        ))}
        {list.loading && (
          <div className="reels__more">
            <Spinner size={28} />
          </div>
        )}
        {list.error && (
          <div className="reels__more">
            <ErrorBox onRetry={list.reload}>{list.error}</ErrorBox>
          </div>
        )}
        {empty && (
          <div className="reels__empty">
            <EmptyState
              icon={<Clapperboard size={48} strokeWidth={1.3} />}
              title="Ainda sem reels"
              action={
                <button type="button" className="btn btn--primary" onClick={() => navigate('/criar/reel')}>
                  Criar o primeiro
                </button>
              }
            >
              Vídeos curtos, em pé, de até 15 segundos. Todo mundo do grupo vê aqui.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { X, MoreHorizontal, Heart, Send, Eye, Trash2, VolumeX } from 'lucide-react';
import { Spinner, Sheet, SheetItem, Handle, useConfirm } from '../components/ui';
import Avatar from '../components/Avatar';
import CharacterRow from '../components/CharacterRow';
import { MusicInfoSheet, MusicLine, SoundButton } from '../components/Music';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { mediaUrl } from '../lib/supabase';
import { pageCache } from '../lib/storage';
import { emit } from '../lib/events';
import { timeShort } from '../lib/format';
import { cleanMusic, clipOf, player, usePlayer } from '../lib/music';
import * as api from '../lib/api';

const DURATION = 5500;

export default function StoryViewer() {
  const { characterId } = useParams();
  const { active, isMine, isAdmin } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const queue = useRef(pageCache.get('story-queue', 60 * 60 * 1000) || { order: [characterId] });
  const order = queue.current.order?.includes(characterId) ? queue.current.order : [characterId];
  const [ci, setCi] = useState(Math.max(0, order.indexOf(characterId)));
  const [group, setGroup] = useState(null); // { character, stories }
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loadedId, setLoadedId] = useState(null); // story cuja foto já apareceu
  const [reply, setReply] = useState('');
  const [menu, setMenu] = useState(false);
  const [viewers, setViewers] = useState(null);
  const [musicInfo, setMusicInfo] = useState(false);
  const [audioGiveUp, setAudioGiveUp] = useState(false);
  const ps = usePlayer();
  const bar = useRef(null);
  const elapsed = useRef(0);
  const touch = useRef(null);
  const changed = useRef(false);

  const cid = order[ci];
  const story = group?.stories?.[si];
  const loaded = !!story && loadedId === story.id;
  const own = group && isMine(group.character.id);
  const storyMusic = story?.music;
  const music = useMemo(() => cleanMusic(storyMusic), [storyMusic]);
  const musicKey = story ? `story:${story.id}` : null;
  const duration = music ? Math.round(music.duration * 1000) : DURATION;

  const close = useCallback(() => {
    if (changed.current) emit('story:change');
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  }, [navigate]);

  // carrega os stories do personagem atual
  useEffect(() => {
    let alive = true;
    setGroup(null);
    (async () => {
      const fromTray = queue.current.tray?.find((t) => t.character.id === cid);
      let g = fromTray;
      try {
        const fresh = await api.characterStories(cid, active.id);
        if (fresh?.stories?.length) g = fresh;
      } catch {
        /* usa a bandeja */
      }
      if (!alive) return;
      if (!g?.stories?.length) {
        if (ci < order.length - 1) setCi(ci + 1);
        else close();
        return;
      }
      setGroup(g);
      const firstUnseen = g.stories.findIndex((s) => !s.seen);
      setSi(firstUnseen >= 0 ? firstUnseen : 0);
    })();
    return () => {
      alive = false;
    };
  }, [cid]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = useCallback(() => {
    if (!group) return;
    if (si < group.stories.length - 1) setSi(si + 1);
    else if (ci < order.length - 1) setCi(ci + 1);
    else close();
  }, [group, si, ci, order.length, close]);

  const prev = () => {
    if (si > 0) setSi(si - 1);
    else if (ci > 0) setCi(ci - 1);
    else elapsed.current = 0;
  };

  // marca como visto
  useEffect(() => {
    if (!story || !loaded) return;
    elapsed.current = 0;
    if (!story.seen && !own) {
      api.markStorySeen(story.id, active.id);
      story.seen = true;
      changed.current = true;
    }
    // pré-carrega a próxima
    const n = group.stories[si + 1];
    if (n) new Image().src = mediaUrl(n.path);
  }, [story?.id, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    elapsed.current = 0;
  }, [story?.id]);

  // música do story: já carrega junto com a foto, toca quando a foto aparece
  // e pausa quando segura o dedo ou abre um menu
  const audioHeld = paused || menu || !!viewers || musicInfo || !loaded;
  useEffect(() => {
    if (!music || !musicKey) return;
    player.request(musicKey, clipOf(music), { held: audioHeld });
    return () => player.release(musicKey);
  }, [musicKey, music]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (musicKey) player.hold(musicKey, audioHeld);
  }, [musicKey, audioHeld]);
  // espera a música começar (no máximo 4 s depois da foto) antes de andar a barra
  useEffect(() => {
    setAudioGiveUp(false);
    if (!music || !loaded) return;
    const t = setTimeout(() => setAudioGiveUp(true), 4000);
    return () => clearTimeout(t);
  }, [story?.id, music, loaded]);
  const audioWaiting = !!music && loaded && ps.soundOn && !audioGiveUp && (ps.key !== musicKey || ps.status === 'loading');
  const audioBlocked = !!music && ps.soundOn && ps.key === musicKey && ps.status === 'blocked';

  // barra de progresso
  const holding = paused || menu || !!viewers || musicInfo || !loaded || audioWaiting || document.activeElement?.tagName === 'INPUT';
  useEffect(() => {
    if (!story) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last;
      last = now;
      if (!holding) elapsed.current += dt;
      const p = Math.min(1, elapsed.current / duration);
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      if (p >= 1) {
        next();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story, holding, next, duration]);

  const onPointerDown = (e) => {
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setPaused(true);
  };
  const onPointerUp = (e) => {
    const t = touch.current;
    touch.current = null;
    setPaused(false);
    if (!t) return;
    const dy = e.clientY - t.y;
    const dx = e.clientX - t.x;
    if (dy > 90 && Math.abs(dx) < 80) return close();
    if (Math.abs(dx) > 70 && Math.abs(dy) < 60) {
      if (dx < 0) {
        if (ci < order.length - 1) setCi(ci + 1);
        else close();
      } else if (ci > 0) setCi(ci - 1);
      return;
    }
    if (Date.now() - t.t > 300) return; // segurou: só pausou
    const w = e.currentTarget.clientWidth;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    if (x < w * 0.3) prev();
    else next();
  };

  const sendReply = async (body) => {
    const text = (body ?? reply).trim();
    if (!text) return;
    setReply('');
    document.activeElement?.blur();
    try {
      const conv = await api.startConversation(active.id, [group.character.id]);
      await api.sendMessage({ conversation: conv, sender: active.id, kind: 'story_reply', body: text, story: story.id });
      toast('Resposta enviada');
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  const remove = async () => {
    setMenu(false);
    const ok = await confirm({ title: 'Excluir story?', confirmText: 'Excluir', danger: true });
    if (!ok) return;
    try {
      await api.deleteStory(story);
      changed.current = true;
      const rest = group.stories.filter((s) => s.id !== story.id);
      if (!rest.length) return close();
      setGroup({ ...group, stories: rest });
      setSi(Math.min(si, rest.length - 1));
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  const openViewers = async () => {
    setViewers([]);
    try {
      setViewers((await api.storyViewers(story.id)) || []);
    } catch {
      setViewers([]);
    }
  };

  return (
    <div className="story-viewer" role="dialog" aria-label="Stories">
      {!group && (
        <div className="story-viewer__loading">
          <Spinner size={30} />
        </div>
      )}
      {group && story && (
        <>
          <div className="story-viewer__media" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => setPaused(false)} onContextMenu={(e) => e.preventDefault()}>
            <img key={story.id} src={mediaUrl(story.path)} alt="" draggable="false" onLoad={() => setLoadedId(story.id)} onError={() => setLoadedId(story.id)} />
            {!loaded && (
              <div className="story-viewer__loading">
                <Spinner size={30} />
              </div>
            )}
          </div>

          <div className="story-viewer__top">
            <div className="story-bars">
              {group.stories.map((s, i) => (
                <span key={s.id} className="story-bars__bar">
                  <span className="story-bars__fill" ref={i === si ? bar : null} style={{ transform: `scaleX(${i < si ? 1 : 0})` }} />
                </span>
              ))}
            </div>
            <div className="story-viewer__head">
              <div className="story-viewer__who">
                <button
                  type="button"
                  className="story-viewer__avatar"
                  aria-label={`Perfil de ${group.character.handle}`}
                  onClick={() => navigate(`/u/${group.character.handle}`, { replace: true })}
                >
                  <Avatar character={group.character} size={32} />
                </button>
                <div className="story-viewer__meta">
                  <button type="button" className="story-viewer__name" onClick={() => navigate(`/u/${group.character.handle}`, { replace: true })}>
                    <Handle character={group.character} className="strong" badge={13} />
                    <span className="story-viewer__time">{timeShort(story.created_at)}</span>
                  </button>
                  {music && <MusicLine music={music} onClick={() => setMusicInfo(true)} className="story-viewer__music" />}
                </div>
              </div>
              <div className="story-viewer__actions">
                {music && <SoundButton playerKey={musicKey} light size={22} />}
                {(own || isAdmin) && (
                  <button type="button" className="icon-btn icon-btn--light" aria-label="Opções" onClick={() => setMenu(true)}>
                    <MoreHorizontal size={24} />
                  </button>
                )}
                <button type="button" className="icon-btn icon-btn--light" aria-label="Fechar" onClick={close}>
                  <X size={28} />
                </button>
              </div>
            </div>
          </div>

          {audioBlocked && (
            <button type="button" data-sound-btn="" className="story-viewer__tap-sound" onClick={() => player.retry()}>
              <VolumeX size={16} /> Toque para ouvir a música
            </button>
          )}

          <div className="story-viewer__bottom">
            {own ? (
              <button type="button" className="story-viewer__seen" onClick={openViewers}>
                <Eye size={18} /> Visualizações
              </button>
            ) : (
              <form
                className="story-reply"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendReply();
                }}
              >
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                  placeholder={`Responder a ${group.character.handle}…`}
                  maxLength={500}
                />
                {reply.trim() ? (
                  <button type="submit" className="icon-btn icon-btn--light" aria-label="Enviar">
                    <Send size={24} />
                  </button>
                ) : (
                  <button type="button" className="icon-btn icon-btn--light" aria-label="Reagir com coração" onClick={() => sendReply('❤️')}>
                    <Heart size={26} />
                  </button>
                )}
              </form>
            )}
          </div>
        </>
      )}

      <MusicInfoSheet music={music} open={musicInfo} onClose={() => setMusicInfo(false)} />
      <Sheet open={menu} onClose={() => setMenu(false)}>
        <SheetItem icon={<Trash2 size={22} />} danger onClick={remove}>
          Excluir story
        </SheetItem>
      </Sheet>
      <Sheet open={!!viewers} onClose={() => setViewers(null)} title="Visto por" className="sheet--tall">
        {viewers?.length === 0 && <p className="muted center-pad">Ninguém viu ainda.</p>}
        {viewers?.map((v) => (
          <CharacterRow key={v.id} character={v} sub={timeShort(v.viewed_at)} />
        ))}
      </Sheet>
    </div>
  );
}

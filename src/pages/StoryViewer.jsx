import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { X, MoreHorizontal, Heart, Send, Eye, Trash2, VolumeX, Pencil, MinusCircle } from 'lucide-react';
import { Spinner, Sheet, SheetItem, Handle, useConfirm } from '../components/ui';
import Avatar from '../components/Avatar';
import CharacterRow from '../components/CharacterRow';
import { MusicInfoSheet, MusicLine, SoundButton } from '../components/Music';
import { AddToHighlightSheet, HighlightCover } from '../components/Highlights';
import { CloseBadge } from '../components/CloseFriends';
import { StickerOverlay } from '../components/StoryStickers';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { mediaUrl } from '../lib/supabase';
import { pageCache } from '../lib/storage';
import { emit } from '../lib/events';
import { timeShort } from '../lib/format';
import { cleanMusic, clipOf, player, usePlayer } from '../lib/music';
import * as api from '../lib/api';

const DURATION = 5500;

// Para o dono: respostas das caixinhas e votos das enquetes
function StoryResults({ st }) {
  const stickers = st.stickers || [];
  const polls = stickers.filter((s) => s.type === 'poll');
  const questions = stickers.filter((s) => s.type === 'question');
  if (!polls.length && !questions.length) return null;
  return (
    <div className="story-results">
      {questions.map((q) => {
        const answers = (st.answers || []).filter((a) => a.sticker_id === q.id);
        return (
          <div key={q.id}>
            <h4 className="story-results__title">Respostas · {q.prompt}</h4>
            {answers.length === 0 && <p className="muted small">Ninguém respondeu ainda.</p>}
            {answers.map((a) => (
              <div key={a.id} className="story-results__answer">
                <Avatar character={a.character} size={32} />
                <div>
                  <strong>{a.character.handle}</strong>
                  <span>{a.body}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {polls.map((p) => {
        const votes = (st.votes || []).filter((v) => v.sticker_id === p.id);
        return (
          <div key={p.id}>
            <h4 className="story-results__title">Enquete{p.question ? ` · ${p.question}` : ''}</h4>
            {p.options.map((o, i) => {
              const who = votes.filter((v) => v.option === i);
              return (
                <div key={i}>
                  <div className="story-results__opt">
                    <span>{o}</span>
                    <span>{who.length}</span>
                  </div>
                  <div className="story-results__voters">
                    {who.length ? who.map((v) => <span key={v.character.id}>@{v.character.handle}</span>) : <span>—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      <h4 className="story-results__title">Visto por</h4>
    </div>
  );
}

// mode "stories": os stories de 24 h (fila = personagens da bandeja)
// mode "highlight": um destaque do perfil (fila = destaques daquele perfil)
export default function StoryViewer({ mode = 'stories' }) {
  const params = useParams();
  const hl = mode === 'highlight';
  const startId = hl ? params.highlightId : params.characterId;
  const { active, isMine, isAdmin, can } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const queue = useRef(pageCache.get(hl ? 'highlight-queue' : 'story-queue', 60 * 60 * 1000) || { order: [startId] });
  const order = queue.current.order?.includes(startId) ? queue.current.order : [startId];
  const [ci, setCi] = useState(Math.max(0, order.indexOf(startId)));
  const [group, setGroup] = useState(null); // { character, stories, highlight? }
  const [si, setSi] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loadedId, setLoadedId] = useState(null); // story cuja foto já apareceu
  const [reply, setReply] = useState('');
  const [menu, setMenu] = useState(false);
  const [viewers, setViewers] = useState(null);
  const [musicInfo, setMusicInfo] = useState(false);
  const [highlightSheet, setHighlightSheet] = useState(false);
  const [audioGiveUp, setAudioGiveUp] = useState(false);
  const [inter, setInter] = useState({}); // figurinhas de cada story (enquetes, caixinhas…)
  const [asking, setAsking] = useState(null); // caixinha sendo respondida
  const [answer, setAnswer] = useState('');
  const [sendingAnswer, setSendingAnswer] = useState(false);
  const [rect, setRect] = useState(null); // onde a foto está na tela (as figurinhas vão por cima)
  const media = useRef(null);
  const imgRef = useRef(null);
  const ps = usePlayer();
  const bar = useRef(null);
  const elapsed = useRef(0);
  const touch = useRef(null);
  const changed = useRef(false);

  const cid = order[ci];
  const story = group?.stories?.[si];
  const withStickers = can('interacoes');
  const st = story ? inter[story.id] : null;
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

  // carrega os stories do personagem (ou do destaque) atual
  useEffect(() => {
    let alive = true;
    setGroup(null);
    (async () => {
      if (hl) {
        let h = null;
        try {
          h = await api.getHighlight(cid, active.id);
        } catch (err) {
          toast(api.errorMessage(err));
        }
        if (!alive) return;
        if (!h?.stories?.length) {
          if (ci < order.length - 1) setCi(ci + 1);
          else close();
          return;
        }
        setGroup({ character: h.character, stories: h.stories, highlight: h });
        setSi(0);
        return;
      }
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

  // figurinhas: estado das enquetes e caixinhas (deste story e do próximo)
  const loadInter = useCallback(
    async (id) => {
      try {
        const r = await api.storyInteractions(id, active.id);
        setInter((m) => ({ ...m, [id]: r || { stickers: [] } }));
        return r;
      } catch {
        setInter((m) => ({ ...m, [id]: m[id] || { stickers: [] } }));
        return null;
      }
    },
    [active.id]
  );
  useEffect(() => {
    if (!withStickers || !story) return;
    if (!inter[story.id]) loadInter(story.id);
    const n = group?.stories?.[si + 1];
    if (n && !inter[n.id]) loadInter(n.id);
  }, [story?.id, withStickers]); // eslint-disable-line react-hooks/exhaustive-deps

  // área da foto na tela (object-fit: contain ou cover)
  useLayoutEffect(() => {
    const box = media.current;
    if (!box || !story) return undefined;
    const measure = () => {
      const img = imgRef.current;
      if (!img) return;
      const b = box.getBoundingClientRect();
      const r = img.getBoundingClientRect();
      const W = story.width || 1080;
      const H = story.height || 1920;
      const cover = getComputedStyle(img).objectFit === 'cover';
      const sc = cover ? Math.max(r.width / W, r.height / H) : Math.min(r.width / W, r.height / H);
      const w = W * sc;
      const h = H * sc;
      const next = { left: r.left - b.left + (r.width - w) / 2, top: r.top - b.top + (r.height - h) / 2, width: w, height: h };
      setRect((p) => (p && Math.abs(p.left - next.left) < 0.5 && Math.abs(p.top - next.top) < 0.5 && Math.abs(p.width - next.width) < 0.5 ? p : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [story?.id, story?.width, story?.height, !!group]); // eslint-disable-line react-hooks/exhaustive-deps

  const vote = async (sk, option) => {
    if (!story) return;
    const id = story.id;
    setInter((m) => {
      const cur = m[id] || {};
      const counts = [...(cur.polls?.[sk.id]?.counts || [0, 0, 0, 0])];
      counts[option] += 1;
      return { ...m, [id]: { ...cur, polls: { ...cur.polls, [sk.id]: { counts, mine: option } }, mine: { ...cur.mine, [sk.id]: option } } };
    });
    try {
      await api.storyVote(id, sk.id, active.id, option);
      loadInter(id);
    } catch (err) {
      loadInter(id);
      toast(api.errorMessage(err));
    }
  };
  const ask = (sk) => {
    if (st?.is_owner) return openViewers();
    setAnswer('');
    setAsking(sk);
  };
  const sendAnswer = async (e) => {
    e?.preventDefault();
    const text = answer.trim();
    if (!text || !asking || sendingAnswer) return;
    setSendingAnswer(true);
    try {
      await api.storyAnswer(story.id, asking.id, active.id, text);
      setInter((m) => {
        const cur = m[story.id] || {};
        return { ...m, [story.id]: { ...cur, answered: [...(cur.answered || []), asking.id] } };
      });
      setAsking(null);
      toast('Resposta enviada');
    } catch (err) {
      toast(api.errorMessage(err));
    } finally {
      setSendingAnswer(false);
    }
  };

  // música do story: já carrega junto com a foto, toca quando a foto aparece
  // e pausa quando segura o dedo ou abre um menu
  const audioHeld = paused || menu || !!viewers || musicInfo || highlightSheet || !!asking || !loaded;
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
  const holding =
    paused || menu || !!viewers || musicInfo || highlightSheet || !!asking || !loaded || audioWaiting || document.activeElement?.tagName === 'INPUT';
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

  // tira o story da tela atual (depois de excluir ou de sair do destaque)
  const dropCurrent = () => {
    const rest = group.stories.filter((s) => s.id !== story.id);
    if (!rest.length) return close();
    setGroup({ ...group, stories: rest });
    setSi(Math.min(si, rest.length - 1));
  };

  const remove = async () => {
    setMenu(false);
    const withHighlights = can('destaques');
    const ok = await confirm({
      title: 'Excluir story?',
      message: withHighlights ? 'Se ele estiver em algum destaque, sai de lá também.' : undefined,
      confirmText: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteStory(story, { highlights: withHighlights });
      changed.current = true;
      emit('profile:change', { id: group.character.id });
      dropCurrent();
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  // destaque: tirar o story, editar ou excluir o destaque inteiro
  const removeFromHighlight = async () => {
    setMenu(false);
    try {
      await api.removeFromHighlight(group.highlight.id, story.id);
      emit('profile:change', { id: group.character.id });
      toast(`Removido de ${group.highlight.title}`);
      dropCurrent();
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };
  const editHighlight = () => {
    setMenu(false);
    navigate(`/destaques/${group.highlight.id}/editar`, { replace: true });
  };
  const deleteHighlight = async () => {
    setMenu(false);
    const ok = await confirm({
      title: 'Excluir destaque?',
      message: `"${group.highlight.title}" sai do perfil. Os stories continuam no seu arquivo.`,
      confirmText: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteHighlight(group.highlight.id);
      emit('profile:change', { id: group.character.id });
      close();
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  const openViewers = async () => {
    setViewers([]);
    if (withStickers && story) loadInter(story.id);
    try {
      setViewers((await api.storyViewers(story.id)) || []);
    } catch {
      setViewers([]);
    }
  };

  return (
    <div className="story-viewer" role="dialog" aria-label={hl ? 'Destaque' : 'Stories'}>
      {!group && (
        <div className="story-viewer__loading">
          <Spinner size={30} />
        </div>
      )}
      {group && story && (
        <>
          <div
            ref={media}
            className="story-viewer__media"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setPaused(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <img ref={imgRef} key={story.id} src={mediaUrl(story.path)} alt="" draggable="false" onLoad={() => setLoadedId(story.id)} onError={() => setLoadedId(story.id)} />
            {loaded && st?.stickers?.length > 0 && (
              <StickerOverlay
                stickers={st.stickers}
                state={st}
                rect={rect}
                onVote={vote}
                onAsk={ask}
                onMention={(sk) => navigate(`/u/${sk.handle}`, { replace: true })}
              />
            )}
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
                  {hl ? <HighlightCover cover={group.highlight.cover} size={32} /> : <Avatar character={group.character} size={32} />}
                </button>
                <div className="story-viewer__meta">
                  <button type="button" className="story-viewer__name" onClick={() => navigate(`/u/${group.character.handle}`, { replace: true })}>
                    {hl ? <strong className="story-viewer__title">{group.highlight.title}</strong> : <Handle character={group.character} className="strong" badge={13} />}
                    <span className="story-viewer__time">{timeShort(story.created_at)}</span>
                    {story.audience === 'close_friends' && <CloseBadge className="story-viewer__close" />}
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
              <div className="story-viewer__own">
                <button type="button" className="story-viewer__seen" onClick={openViewers}>
                  <Eye size={18} /> Visualizações
                </button>
                {!hl && can('destaques') && (
                  <button type="button" className="story-viewer__highlight" onClick={() => setHighlightSheet(true)}>
                    <span className="round-icon" aria-hidden="true">
                      <Heart size={12} strokeWidth={2.4} />
                    </span>
                    Destacar
                  </button>
                )}
              </div>
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
      <Sheet open={!!asking} onClose={() => setAsking(null)} title="Responder">
        {asking && (
          <form className="stk-answer" onSubmit={sendAnswer}>
            <div className="stk-answer__prompt">{asking.prompt}</div>
            {st?.answered?.includes(asking.id) && <p className="muted small">Você já respondeu. Pode mandar outra resposta.</p>}
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={`Responder a ${group?.character.handle}…`}
              maxLength={300}
              autoFocus
              aria-label="Sua resposta"
            />
            <button type="submit" className="btn btn--primary" disabled={!answer.trim() || sendingAnswer}>
              {sendingAnswer ? <Spinner size={16} className="spinner--inline" /> : 'Enviar'}
            </button>
          </form>
        )}
      </Sheet>
      <Sheet open={menu} onClose={() => setMenu(false)}>
        {hl ? (
          <>
            {own && (
              <SheetItem icon={<Pencil size={22} />} onClick={editHighlight}>
                Editar destaque
              </SheetItem>
            )}
            <SheetItem icon={<MinusCircle size={22} />} onClick={removeFromHighlight}>
              Remover do destaque
            </SheetItem>
            {own && (
              <SheetItem icon={<Trash2 size={22} />} danger onClick={deleteHighlight}>
                Excluir destaque
              </SheetItem>
            )}
          </>
        ) : (
          <SheetItem icon={<Trash2 size={22} />} danger onClick={remove}>
            Excluir story
          </SheetItem>
        )}
      </Sheet>
      {!hl && own && story && (
        <AddToHighlightSheet open={highlightSheet} onClose={() => setHighlightSheet(false)} story={story} character={group.character} />
      )}
      <Sheet open={!!viewers} onClose={() => setViewers(null)} title="Visto por" className="sheet--tall">
        {own && st && <StoryResults st={st} />}
        {viewers?.length === 0 && <p className="muted center-pad">Ninguém viu ainda.</p>}
        {viewers?.map((v) => (
          <CharacterRow key={v.id} character={v} sub={timeShort(v.viewed_at)} />
        ))}
      </Sheet>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router';
import { Image as ImageIcon, Info, Copy, Trash2, LogOut, Pencil, Reply, X, Sticker, BookmarkPlus } from 'lucide-react';
import { BackButton, IconButton, Spinner, EmptyState, Handle, Sheet, SheetItem, useConfirm } from '../components/ui';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import CharacterRow from '../components/CharacterRow';
import { ConversationAvatar, conversationTitle } from './Inbox';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { realtime } from '../state/unread';
import { mediaUrl, supabase } from '../lib/supabase';
import { fadeIn } from '../lib/fade';
import { on, emit } from '../lib/events';
import { chatStamp } from '../lib/format';
import { longPress } from '../lib/hooks';
import { prepareImage, renderDmImage } from '../lib/media';
import * as api from '../lib/api';
import { StickerTray, StickerImg, useSaveSticker } from '../components/Figurinhas';

const GAP = 30 * 60 * 1000;
const SWIPE = 56; // quanto arrastar para responder (px)

// Texto curto da mensagem citada
// reações das mensagens (as mesmas que o banco aceita)
const MSG_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];

function quoteText(r) {
  if (!r || r.deleted) return 'Mensagem apagada';
  if (r.kind === 'media') return 'Foto';
  if (r.kind === 'sticker') return 'Figurinha';
  if (r.kind === 'post') return 'Publicação';
  if (r.kind === 'story_mention') return 'Menção no story';
  return r.body || '';
}

// "Você respondeu a lara.explora", "lara.explora respondeu a você"...
function replyCaption(m, reply, meId, senderHandle) {
  const mine = m.sender_id === meId;
  const who = mine ? 'Você' : senderHandle || 'Alguém';
  if (!reply || reply.deleted) return `${who} respondeu a uma mensagem`;
  if (reply.sender_id === m.sender_id) return mine ? 'Você respondeu a si mesmo' : `${who} respondeu a si mesmo`;
  const target = reply.sender_id === meId ? 'você' : reply.handle || 'alguém';
  return `${who} respondeu a ${target}`;
}

function PostShare({ post }) {
  if (!post) return <div className="msg-card msg-card--gone">Publicação indisponível</div>;
  return (
    <Link to={`/p/${post.id}`} className="msg-card">
      <div className="msg-card__head">
        <Avatar character={post.character} size={24} />
        <Handle character={post.character} className="strong" badge={12} />
      </div>
      {post.thumb && <img {...fadeIn} src={mediaUrl(post.thumb)} alt="" loading="lazy" />}
      {post.caption && (
        <div className="msg-card__caption">
          <strong>{post.character.handle}</strong> {post.caption}
        </div>
      )}
    </Link>
  );
}

export default function Chat() {
  const { id } = useParams();
  const { active, uid, can } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const root = useRef(null);
  const scroller = useRef(null);
  const fileInput = useRef(null);
  const inputRef = useRef(null);
  const [info, setInfo] = useState(undefined);
  const [msgs, setMsgs] = useState(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [text, setText] = useState('');
  const [menuMsg, setMenuMsg] = useState(null);
  const [groupSheet, setGroupSheet] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // mensagem que está sendo respondida
  const [flashId, setFlashId] = useState(null);
  const [reactSheet, setReactSheet] = useState(null); // quem reagiu a uma mensagem
  const [tray, setTray] = useState(false);
  const saveSticker = useSaveSticker();
  const [heartPop, setHeartPop] = useState(null); // coração do toque duplo
  const lastTap = useRef({ id: null, t: 0 });
  const pendingJump = useRef(null);
  const swipe = useRef(null);
  const msgsRef = useRef(null);
  msgsRef.current = msgs;
  const stick = useRef(true);
  const keepOffset = useRef(null);

  const scrollToBottom = (smooth) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const loadInfo = useCallback(async () => {
    try {
      setInfo((await api.conversationInfo(id, active.id)) ?? null);
    } catch {
      /* mantém o que tinha */
    }
  }, [id, active.id]);

  const markRead = useCallback(async () => {
    if (document.visibilityState !== 'visible') return;
    await api.markConversationRead(id, active.id).catch(() => {});
    emit('unread:refresh');
  }, [id, active.id]);

  // primeira carga
  useEffect(() => {
    let alive = true;
    setMsgs(null);
    setInfo(undefined);
    setReplyTo(null);
    (async () => {
      await loadInfo();
      try {
        const data = await api.getMessages(id);
        if (!alive) return;
        setMsgs(data || []);
        setHasOlder((data || []).length >= 40);
        stick.current = true;
        markRead();
      } catch (e) {
        if (alive) {
          setMsgs([]);
          toast(api.errorMessage(e));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, active.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchNew = useCallback(async () => {
    const cur = msgsRef.current;
    if (!cur) return;
    const real = cur.filter((m) => !m.pending);
    const last = real[real.length - 1];
    try {
      const data = await api.getMessages(id, { after: last?.created_at });
      if (data?.length) {
        setMsgs((xs) => {
          const ids = new Set(xs.map((m) => m.id));
          return [...xs, ...data.filter((m) => !ids.has(m.id))];
        });
        if (data.some((m) => m.sender_id !== active.id)) markRead();
      }
    } catch {
      /* tenta de novo depois */
    }
  }, [id, active.id, markRead]);

  // reações: atualiza as das mensagens que estão na tela
  const canReact = can('reacoes');
  const refreshReactions = useCallback(async () => {
    if (!canReact) return;
    const first = msgsRef.current?.find((m) => !m.pending);
    if (!first) return;
    try {
      const map = (await api.messageReactionsSince(id, first.created_at)) || {};
      setMsgs((xs) =>
        xs?.map((m) => {
          if (m.pending || Date.parse(m.created_at) < Date.parse(first.created_at)) return m;
          const next = map[m.id] || [];
          const same = JSON.stringify(next) === JSON.stringify(m.reactions || []);
          return same ? m : { ...m, reactions: next };
        })
      );
    } catch {
      /* tenta de novo depois */
    }
  }, [id, canReact]);
  useEffect(() => {
    if (!canReact) return undefined;
    const ch = supabase
      .channel('fg-react-' + id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${id}` }, () => refreshReactions())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${id}` }, () => refreshReactions())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, () => refreshReactions())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, canReact, refreshReactions]);

  // reagir (null tira); tocar de novo no mesmo emoji também tira
  const react = async (m, emoji) => {
    if (!m || m.pending || m.failed) return;
    const mineNow = (m.reactions || []).find((r) => r.character_id === active.id)?.emoji || null;
    const next = mineNow === emoji ? null : emoji;
    const patch = (list) => [...(list || []).filter((r) => r.character_id !== active.id), ...(next ? [{ emoji: next, character_id: active.id }] : [])];
    setMsgs((xs) => xs.map((x) => (x.id === m.id ? { ...x, reactions: patch(x.reactions) } : x)));
    try {
      await api.reactMessage(m.id, active.id, next);
    } catch (err) {
      refreshReactions();
      toast(api.errorMessage(err));
    }
  };
  // toque duplo na mensagem: ❤️
  const onMsgTap = (e, m) => {
    if (!canReact || m.pending || m.failed || e.target.closest('button, a')) return;
    const now = Date.now();
    if (lastTap.current.id === m.id && now - lastTap.current.t < 320) {
      lastTap.current = { id: null, t: 0 };
      react(m, '❤️');
      setHeartPop({ id: m.id, key: now });
      setTimeout(() => setHeartPop((h) => (h?.key === now ? null : h)), 850);
    } else lastTap.current = { id: m.id, t: now };
  };

  // novas mensagens: tempo real + conferência periódica
  useEffect(() => on('message:new', (m) => m?.conversation_id === id && fetchNew()), [id, fetchNew]);
  useEffect(() => {
    let t;
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        await fetchNew();
        loadInfo();
        refreshReactions();
      }
      t = setTimeout(tick, realtime.ok ? 20000 : 3500);
    };
    t = setTimeout(tick, 3500);
    return () => clearTimeout(t);
  }, [fetchNew, loadInfo, refreshReactions]);

  // rolagem: fica no fim quando chega mensagem (se já estava no fim)
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !msgs) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (stick.current) scrollToBottom(false);
  }, [msgs]);

  // ---------- responder uma mensagem ----------
  const startReply = (m) => {
    setMenuMsg(null);
    const handle = m.sender_id === active.id ? active.handle : info?.members?.find((x) => x.id === m.sender_id)?.handle || '';
    setReplyTo({
      id: m.id,
      sender_id: m.sender_id,
      handle,
      kind: m.kind,
      body: m.body ? m.body.slice(0, 160) : null,
      media_path: m.media_path || null,
      created_at: m.created_at,
    });
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  // arrastar a mensagem para a direita (como no Instagram)
  const swipeStart = (e, m) => {
    if (m.pending || m.failed || e.pointerType === 'mouse') return;
    swipe.current = { x: e.clientX, y: e.clientY, d: 0, on: false, row: e.currentTarget.closest('.msg-row'), el: e.currentTarget, pid: e.pointerId };
  };
  const swipeMove = (e) => {
    const s = swipe.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > 12) {
        swipe.current = null;
        return;
      }
      if (dx < 12 || dx < Math.abs(dy) * 1.5) return;
      s.on = true;
      try {
        s.el.setPointerCapture(s.pid);
      } catch {
        /* sem captura: segue assim mesmo */
      }
    }
    const d = Math.max(0, Math.min(84, dx * 0.8));
    if (d >= SWIPE && s.d < SWIPE) navigator.vibrate?.(8);
    s.d = d;
    s.row?.classList.add('is-swiping');
    s.row?.style.setProperty('--swipe', String(d));
  };
  const swipeEnd = (m) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    s.row?.classList.remove('is-swiping');
    s.row?.style.setProperty('--swipe', '0');
    if (s.on && s.d >= SWIPE && m) startReply(m);
  };

  // tocar na citação: vai até a mensagem original (buscando as antigas se precisar)
  const showMsg = (msgId) => {
    const el = scroller.current?.querySelector(`[data-msg="${msgId}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setFlashId(msgId);
    setTimeout(() => setFlashId((f) => (f === msgId ? null : f)), 1600);
    return true;
  };
  const jumpTo = async (r) => {
    if (!r || r.deleted || showMsg(r.id)) return;
    const first = msgsRef.current?.find((m) => !m.pending);
    if (!first || !r.created_at) return;
    try {
      const data = await api.getMessages(id, {
        before: first.created_at,
        after: new Date(Date.parse(r.created_at) - 1).toISOString(),
        limit: 200,
      });
      if (!data?.some((m) => m.id === r.id)) {
        toast('Essa mensagem é antiga demais para mostrar aqui.');
        return;
      }
      keepOffset.current = scroller.current.scrollHeight - scroller.current.scrollTop;
      stick.current = false;
      pendingJump.current = r.id;
      setMsgs((xs) => {
        const ids = new Set(xs.map((m) => m.id));
        return [...data.filter((m) => !ids.has(m.id)), ...xs];
      });
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };
  useEffect(() => {
    if (!pendingJump.current) return;
    const target = pendingJump.current;
    pendingJump.current = null;
    requestAnimationFrame(() => showMsg(target));
  }, [msgs]);

  const onScroll = () => {
    const el = scroller.current;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 60 && hasOlder && !olderBusy) loadOlder();
  };

  const loadOlder = async () => {
    const first = msgs?.find((m) => !m.pending);
    if (!first) return;
    setOlderBusy(true);
    try {
      const data = await api.getMessages(id, { before: first.created_at });
      keepOffset.current = scroller.current.scrollHeight - scroller.current.scrollTop;
      setMsgs((xs) => [...(data || []), ...xs]);
      setHasOlder((data || []).length >= 40);
    } finally {
      setOlderBusy(false);
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    const reply = replyTo;
    setText('');
    setReplyTo(null);
    // key fixa: a bolha não "nasce de novo" (nem repete a animação) quando o envio confirma
    const tmpId = 'tmp-' + Date.now();
    const tmp = { id: tmpId, key: tmpId, pending: true, sender_id: active.id, kind: 'text', body, reply, created_at: new Date().toISOString() };
    stick.current = true;
    setMsgs((xs) => [...xs, tmp]);
    inputRef.current?.focus();
    try {
      const saved = await api.sendMessage({ conversation: id, sender: active.id, body, replyTo: reply?.id });
      setMsgs((xs) =>
        xs.some((m) => m.id === saved.id)
          ? xs.filter((m) => m.id !== tmp.id) // o tempo real já trouxe a mensagem: sem duplicar
          : xs.map((m) => (m.id === tmp.id ? { ...tmp, ...saved, pending: false } : m))
      );
    } catch (err) {
      setMsgs((xs) => xs.map((m) => (m.id === tmp.id ? { ...m, failed: true } : m)));
      toast(api.errorMessage(err));
    }
  };

  // figurinha: vai na hora (como no WhatsApp)
  const sendSticker = async (st) => {
    setTray(false);
    const reply = replyTo;
    try {
      await api.sendMessage({ conversation: id, sender: active.id, kind: 'sticker', media: { path: st.path, width: st.width, height: st.height }, replyTo: reply?.id });
      setReplyTo(null);
      stick.current = true;
      await fetchNew();
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  const sendImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const reply = replyTo;
    try {
      const prepared = await prepareImage(file, 1600);
      const { blob, width, height } = await renderDmImage(prepared.img);
      URL.revokeObjectURL(prepared.url);
      const path = await api.uploadImage(uid, active.id, 'dm', blob);
      await api.sendMessage({ conversation: id, sender: active.id, kind: 'media', media: { path, width, height }, replyTo: reply?.id });
      setReplyTo(null);
      stick.current = true;
      await fetchNew();
    } catch (err) {
      toast(api.errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removeMsg = async (m) => {
    setMenuMsg(null);
    const ok = await confirm({ title: 'Cancelar envio?', message: 'A mensagem some para todos na conversa.', confirmText: 'Cancelar envio', danger: true });
    if (!ok) return;
    try {
      await api.deleteMessage(m);
      setMsgs((xs) => xs.filter((x) => x.id !== m.id));
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  const leave = async () => {
    setGroupSheet(false);
    const ok = await confirm({ title: 'Sair do grupo?', message: 'Você não vai mais receber mensagens desta conversa.', confirmText: 'Sair', danger: true });
    if (!ok) return;
    try {
      await api.leaveConversation(id, active.id);
      navigate('/direct', { replace: true });
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  const rename = async () => {
    try {
      await api.renameConversation(id, renaming);
      setRenaming(null);
      loadInfo();
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  if (info === null)
    return (
      <div className="app app--full">
        <header className="topbar">
          <div className="topbar__left">
            <BackButton to="/direct" />
          </div>
        </header>
        <EmptyState title="Conversa não encontrada">Ela não existe ou você não participa dela com @{active.handle}.</EmptyState>
      </div>
    );

  const members = info?.members || [];
  const other = !info?.is_group ? members[0] : null;
  const myLast = [...(msgs || [])].reverse().find((m) => m.sender_id === active.id && !m.pending);
  const seen = other && myLast && other.last_read_at && new Date(other.last_read_at) >= new Date(myLast.created_at);
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));

  return (
    <div className="chat" ref={root}>
      <header className="topbar chat__bar">
        <div className="topbar__left">
          <BackButton to="/direct" />
        </div>
        <button type="button" className="chat__who" onClick={() => (info?.is_group ? setGroupSheet(true) : other && navigate(`/u/${other.handle}`))}>
          {info && <ConversationAvatar conv={info} size={32} />}
          <span className="chat__names">
            <strong>{info ? conversationTitle(info) : ''}</strong>
            <span className="muted">{info?.is_group ? `${members.length + 1} participantes` : other?.handle}</span>
          </span>
        </button>
        <div className="topbar__right">
          {info?.is_group && (
            <IconButton label="Detalhes do grupo" onClick={() => setGroupSheet(true)}>
              <Info size={24} strokeWidth={1.8} />
            </IconButton>
          )}
        </div>
      </header>

      <div className="chat__scroll" ref={scroller} onScroll={onScroll}>
        {olderBusy && (
          <div className="center-pad">
            <Spinner size={18} />
          </div>
        )}
        {msgs === null && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        {msgs && !hasOlder && other && (
          <div className="chat__intro">
            <Avatar character={other} size={88} />
            <strong>{other.name || other.handle}</strong>
            <span className="muted">{other.handle} · FargusGram</span>
            <Link to={`/u/${other.handle}`} className="btn btn--secondary btn--small">
              Ver perfil
            </Link>
          </div>
        )}
        {msgs?.map((m, i) => {
          const prev = msgs[i - 1];
          const next = msgs[i + 1];
          const mine = m.sender_id === active.id;
          const showStamp = !prev || new Date(m.created_at) - new Date(prev.created_at) > GAP;
          const lastOfRun = !next || next.sender_id !== m.sender_id || new Date(next.created_at) - new Date(m.created_at) > GAP;
          const firstOfRun = !prev || prev.sender_id !== m.sender_id || showStamp;
          const sender = byId[m.sender_id];
          const lp = longPress(() => !m.pending && setMenuMsg(m));
          return (
            <div key={m.key || m.id}>
              {showStamp && <div className="chat__stamp">{chatStamp(m.created_at)}</div>}
              <div className="msg-row" data-msg={m.id}>
                <span className="msg-row__reply" aria-hidden="true">
                  <Reply size={18} />
                </span>
                <div
                  className={`msg ${mine ? 'msg--mine' : 'msg--theirs'} ${lastOfRun ? 'msg--last' : ''} ${m.pending ? 'is-pending' : ''} ${m.failed ? 'is-failed' : ''} ${flashId === m.id ? 'is-flash' : ''}`}
                >
                  {!mine && <span className="msg__avatar">{lastOfRun && <Avatar character={sender} size={28} />}</span>}
                  <div
                    className="msg__content"
                    {...lp}
                    onPointerDown={(e) => {
                      lp.onPointerDown(e);
                      swipeStart(e, m);
                    }}
                    onPointerMove={(e) => {
                      lp.onPointerMove(e);
                      swipeMove(e);
                    }}
                    onPointerUp={(e) => {
                      lp.onPointerUp(e);
                      swipeEnd(m);
                      onMsgTap(e, m);
                    }}
                    onPointerCancel={(e) => {
                      lp.onPointerCancel(e);
                      swipeEnd(null);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!m.pending && !('ontouchstart' in window)) setMenuMsg(m);
                    }}
                  >
                    {info?.is_group && !mine && firstOfRun && sender && !m.reply && <span className="msg__sender">{sender.handle}</span>}
                    {m.reply && (
                      <div className="msg__reply">
                        <span className="msg__reply-who">
                          <Reply size={12} /> {replyCaption(m, m.reply, active.id, sender?.handle)}
                        </span>
                        <button type="button" className="msg__quote" onClick={() => jumpTo(m.reply)} disabled={!!m.reply.deleted || m.pending}>
                          {(m.reply.kind === 'media' || m.reply.kind === 'sticker') && m.reply.media_path && (
                            <img src={mediaUrl(m.reply.media_path)} alt="" loading="lazy" />
                          )}
                          <span>{quoteText(m.reply)}</span>
                        </button>
                      </div>
                    )}
                    {m.story_reply && (
                      <div className="msg__story">
                        <span className="muted">{mine ? 'Você respondeu ao story' : 'Respondeu ao seu story'}</span>
                        {m.story && !m.story.expired && <img src={mediaUrl(m.story.thumb_path || m.story.path)} alt="" loading="lazy" />}
                      </div>
                    )}
                    {m.kind === 'story_mention' && (
                      <div className="msg__story msg__story-mention">
                        <span className="muted">{mine ? 'Você mencionou no seu story' : 'Mencionou você no story'}</span>
                        {m.story && !m.story.expired ? (
                          <>
                            <button type="button" className="msg__story-open" onClick={() => navigate(`/stories/${m.story.character_id}`)} aria-label="Ver o story">
                              <img src={mediaUrl(m.story.thumb_path || m.story.path)} alt="" loading="lazy" />
                            </button>
                            {!mine && can('repost') && m.story.audience !== 'close_friends' && (
                              <button type="button" className="msg__story-add" onClick={() => navigate('/criar/story', { state: { repost: m.story.id } })}>
                                Adicionar ao seu story
                              </button>
                            )}
                          </>
                        ) : (
                          <span className="muted small">O story não está mais disponível.</span>
                        )}
                      </div>
                    )}
                    {m.kind === 'note_reply' && (
                      <div className="msg__note">
                        <span className="muted">{mine ? 'Você respondeu à nota' : 'Respondeu à sua nota'}</span>
                        {m.note_body && <span className="msg__note-bubble">{m.note_body}</span>}
                      </div>
                    )}
                    {m.kind === 'post' && <PostShare post={m.post} />}
                    {m.kind === 'sticker' && m.media_path && (
                      <div className="msg__sticker">
                        <StickerImg path={m.media_path} />
                      </div>
                    )}
                    {m.kind === 'media' && m.media_path && (
                      <button type="button" className="msg__image" onClick={() => setLightbox(m.media_path)}>
                        <img
                          {...fadeIn}
                          src={mediaUrl(m.media_path)}
                          alt=""
                          loading="lazy"
                          style={{ aspectRatio: m.media_width && m.media_height ? `${m.media_width} / ${m.media_height}` : undefined }}
                        />
                      </button>
                    )}
                    {m.body && m.kind !== 'post' && (
                      <div className="msg__bubble">
                        <RichText text={m.body} />
                      </div>
                    )}
                    {m.failed && <span className="msg__failed">Não enviada</span>}
                    {heartPop?.id === m.id && (
                      <span key={heartPop.key} className="msg__heart-pop" aria-hidden="true">
                        ❤️
                      </span>
                    )}
                    {m.reactions?.length > 0 && (
                      <button
                        type="button"
                        className={`msg__reactions ${m.reactions.some((r) => r.character_id === active.id) ? 'is-mine' : ''}`}
                        onClick={() => setReactSheet(m.id)}
                        aria-label={`Reações: ${m.reactions.map((r) => r.emoji).join(' ')}`}
                      >
                        {[...new Set(m.reactions.map((r) => r.emoji))].slice(0, 3).join('')}
                        {m.reactions.length > 1 && <b>{m.reactions.length}</b>}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {seen && myLast && msgs[msgs.length - 1]?.id === myLast.id && <div className="msg__seen">Visto</div>}
      </div>

      <form className="chat__composer" onSubmit={send}>
        {replyTo && (
          <div className="chat__replying">
            <Reply size={18} className="muted" />
            <div className="chat__replying-text">
              <span>
                Respondendo a <strong>{replyTo.sender_id === active.id ? 'você mesmo' : replyTo.handle || 'mensagem'}</strong>
              </span>
              <span className="muted">{quoteText(replyTo)}</span>
            </div>
            <IconButton label="Cancelar resposta" onClick={() => setReplyTo(null)}>
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="chat__input-wrap">
          {can('figurinhas') && (
            <IconButton label="Figurinhas" onClick={() => setTray(true)}>
              <Sticker size={22} strokeWidth={1.8} />
            </IconButton>
          )}
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setTimeout(() => stick.current && scrollToBottom(false), 250)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Mensagem…"
          />
          {text.trim() ? (
            <button type="submit" className="chat__send">
              Enviar
            </button>
          ) : (
            <IconButton label="Enviar foto" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Spinner size={18} /> : <ImageIcon size={22} strokeWidth={1.8} />}
            </IconButton>
          )}
        </div>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={sendImage} />
      </form>

      <Sheet open={!!menuMsg} onClose={() => setMenuMsg(null)}>
        {canReact && menuMsg && !menuMsg.failed && (
          <div className="msg-react-row" role="group" aria-label="Reagir à mensagem">
            {MSG_REACTIONS.map((em) => {
              const on = (menuMsg.reactions || []).some((r) => r.character_id === active.id && r.emoji === em);
              return (
                <button
                  key={em}
                  type="button"
                  className={on ? 'is-on' : ''}
                  aria-label={`Reagir com ${em}`}
                  onClick={() => {
                    react(menuMsg, em);
                    setMenuMsg(null);
                  }}
                >
                  {em}
                </button>
              );
            })}
          </div>
        )}
        {menuMsg && !menuMsg.failed && (
          <SheetItem icon={<Reply size={22} />} onClick={() => startReply(menuMsg)}>
            Responder
          </SheetItem>
        )}
        {menuMsg?.kind === 'sticker' && can('figurinhas') && (
          <SheetItem
            icon={<BookmarkPlus size={22} />}
            onClick={() => {
              saveSticker({ path: menuMsg.media_path, width: menuMsg.media_width, height: menuMsg.media_height });
              setMenuMsg(null);
            }}
          >
            Salvar figurinha
          </SheetItem>
        )}
        {menuMsg?.body && (
          <SheetItem
            icon={<Copy size={22} />}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(menuMsg.body);
                toast('Copiado');
              } catch {
                /* ignora */
              }
              setMenuMsg(null);
            }}
          >
            Copiar
          </SheetItem>
        )}
        {menuMsg?.sender_id === active.id && (
          <SheetItem icon={<Trash2 size={22} />} danger onClick={() => removeMsg(menuMsg)}>
            Cancelar envio
          </SheetItem>
        )}
      </Sheet>

      <Sheet open={!!reactSheet} onClose={() => setReactSheet(null)} title="Reações">
        {(msgs?.find((x) => x.id === reactSheet)?.reactions || []).map((r) => {
          const mine = r.character_id === active.id;
          const who = mine ? active : byId[r.character_id];
          if (!who) return null;
          return (
            <CharacterRow
              key={r.character_id}
              character={who}
              sub={mine ? 'Toque para tirar' : undefined}
              onClick={() => {
                if (mine) {
                  react(
                    msgs.find((x) => x.id === reactSheet),
                    r.emoji
                  );
                  setReactSheet(null);
                } else navigate(`/u/${who.handle}`);
              }}
              right={<span className="viewer-reaction">{r.emoji}</span>}
            />
          );
        })}
      </Sheet>

      <Sheet open={groupSheet} onClose={() => setGroupSheet(false)} title={info ? conversationTitle(info) : 'Grupo'}>
        {renaming !== null ? (
          <div className="pad-x rename-row">
            <input className="input" value={renaming} maxLength={60} onChange={(e) => setRenaming(e.target.value)} placeholder="Nome do grupo" autoFocus />
            <button type="button" className="btn btn--primary btn--small" onClick={rename}>
              Salvar
            </button>
          </div>
        ) : (
          <SheetItem icon={<Pencil size={22} />} onClick={() => setRenaming(info?.title || '')}>
            Renomear grupo
          </SheetItem>
        )}
        <h3 className="section-title section-title--pad">Participantes</h3>
        <CharacterRow character={active} sub="Você" onClick={() => {}} />
        {members.map((m) => (
          <CharacterRow key={m.id} character={m} />
        ))}
        <SheetItem icon={<LogOut size={22} />} danger onClick={leave}>
          Sair do grupo
        </SheetItem>
      </Sheet>

      {can('figurinhas') && <StickerTray open={tray} onClose={() => setTray(false)} onPick={sendSticker} />}

      {lightbox &&
        createPortal(
          <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Foto">
            <img src={mediaUrl(lightbox)} alt="" />
          </div>,
          document.body,
        )}
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router';
import { Image as ImageIcon, Info, Copy, Trash2, LogOut, Pencil } from 'lucide-react';
import { BackButton, IconButton, Spinner, EmptyState, Handle, Sheet, SheetItem, useConfirm } from '../components/ui';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import CharacterRow from '../components/CharacterRow';
import { ConversationAvatar, conversationTitle } from './Inbox';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { realtime } from '../state/unread';
import { mediaUrl } from '../lib/supabase';
import { on, emit } from '../lib/events';
import { chatStamp } from '../lib/format';
import { longPress } from '../lib/hooks';
import { prepareImage, renderDmImage } from '../lib/media';
import * as api from '../lib/api';

const GAP = 30 * 60 * 1000;

function PostShare({ post }) {
  if (!post) return <div className="msg-card msg-card--gone">Publicação indisponível</div>;
  return (
    <Link to={`/p/${post.id}`} className="msg-card">
      <div className="msg-card__head">
        <Avatar character={post.character} size={24} />
        <Handle character={post.character} className="strong" badge={12} />
      </div>
      {post.thumb && <img src={mediaUrl(post.thumb)} alt="" loading="lazy" />}
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
  const { active, uid } = useSession();
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

  // novas mensagens: tempo real + conferência periódica
  useEffect(() => on('message:new', (m) => m?.conversation_id === id && fetchNew()), [id, fetchNew]);
  useEffect(() => {
    let t;
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        await fetchNew();
        loadInfo();
      }
      t = setTimeout(tick, realtime.ok ? 20000 : 3500);
    };
    t = setTimeout(tick, 3500);
    return () => clearTimeout(t);
  }, [fetchNew, loadInfo]);

  // rolagem: fica no fim quando chega mensagem (se já estava no fim)
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !msgs) return;
    if (keepOffset.current !== null) {
      el.scrollTop = el.scrollHeight - keepOffset.current;
      keepOffset.current = null;
    } else if (stick.current) scrollToBottom(false);
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
    setText('');
    const tmp = { id: 'tmp-' + Date.now(), pending: true, sender_id: active.id, kind: 'text', body, created_at: new Date().toISOString() };
    stick.current = true;
    setMsgs((xs) => [...xs, tmp]);
    inputRef.current?.focus();
    try {
      const saved = await api.sendMessage({ conversation: id, sender: active.id, body });
      setMsgs((xs) => xs.map((m) => (m.id === tmp.id ? { ...tmp, ...saved, pending: false } : m)));
    } catch (err) {
      setMsgs((xs) => xs.map((m) => (m.id === tmp.id ? { ...m, failed: true } : m)));
      toast(api.errorMessage(err));
    }
  };

  const sendImage = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareImage(file, 1600);
      const { blob, width, height } = await renderDmImage(prepared.img);
      URL.revokeObjectURL(prepared.url);
      const path = await api.uploadImage(uid, active.id, 'dm', blob);
      await api.sendMessage({ conversation: id, sender: active.id, kind: 'media', media: { path, width, height } });
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
        <button
          type="button"
          className="chat__who"
          onClick={() => (info?.is_group ? setGroupSheet(true) : other && navigate(`/u/${other.handle}`))}
        >
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
          return (
            <div key={m.id}>
              {showStamp && <div className="chat__stamp">{chatStamp(m.created_at)}</div>}
              <div className={`msg ${mine ? 'msg--mine' : 'msg--theirs'} ${lastOfRun ? 'msg--last' : ''} ${m.pending ? 'is-pending' : ''} ${m.failed ? 'is-failed' : ''}`}>
                {!mine && <span className="msg__avatar">{lastOfRun && <Avatar character={sender} size={28} />}</span>}
                <div className="msg__content" {...longPress(() => !m.pending && setMenuMsg(m))}>
                  {info?.is_group && !mine && firstOfRun && sender && <span className="msg__sender">{sender.handle}</span>}
                  {m.story_reply && (
                    <div className="msg__story">
                      <span className="muted">{mine ? 'Você respondeu ao story' : 'Respondeu ao seu story'}</span>
                      {m.story && !m.story.expired && <img src={mediaUrl(m.story.path)} alt="" loading="lazy" />}
                    </div>
                  )}
                  {m.kind === 'post' && <PostShare post={m.post} />}
                  {m.kind === 'media' && m.media_path && (
                    <button type="button" className="msg__image" onClick={() => setLightbox(m.media_path)}>
                      <img
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
                </div>
              </div>
            </div>
          );
        })}
        {seen && myLast && msgs[msgs.length - 1]?.id === myLast.id && <div className="msg__seen">Visto</div>}
      </div>

      <form className="chat__composer" onSubmit={send}>
        <div className="chat__input-wrap">
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

      {lightbox &&
        createPortal(
          <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Foto">
            <img src={mediaUrl(lightbox)} alt="" />
          </div>,
          document.body
        )}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Heart, Pin, Trash2, X } from 'lucide-react';
import { TopBar, BackButton, Spinner, ErrorBox, Handle, useConfirm } from '../components/ui';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useAsync } from '../lib/hooks';
import { emit } from '../lib/events';
import { count, timeShort } from '../lib/format';
import * as api from '../lib/api';

const EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂'];
// reações dos comentários (as mesmas que o banco aceita)
export const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];

// Segurar o dedo (ou clicar com o botão direito) abre as reações
function useLongPress(onLong, ms = 450) {
  const t = useRef(null);
  const start = useRef(null);
  const cancel = () => {
    clearTimeout(t.current);
    t.current = null;
  };
  return {
    onPointerDown: (e) => {
      if (e.button > 0 || e.target.closest('button, a, input, textarea')) return;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      t.current = setTimeout(() => {
        t.current = null;
        onLong();
      }, ms);
    },
    onPointerMove: (e) => {
      if (t.current && start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => {
      if (e.target.closest('a')) return;
      e.preventDefault();
      cancel();
      onLong();
    },
  };
}

function reactionSummary(c) {
  const list = c.reactions?.length ? c.reactions : c.like_count > 0 ? ['❤️'] : [];
  if (!c.like_count) return null;
  if (list.length === 1 && list[0] === '❤️') return `${count(c.like_count)} ${c.like_count === 1 ? 'curtida' : 'curtidas'}`;
  return `${list.slice(0, 3).join('')} ${count(c.like_count)}`;
}

function Comment({ c, onReply, onLike, onReact, onPin, onDelete, canDelete, canPin, reactions, isReply }) {
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  const press = useLongPress(() => reactions && setPicking(true));
  const mineEmoji = c.my_reaction || (c.liked ? '❤️' : null);
  const summary = reactionSummary(c);
  return (
    <div className={`comment ${isReply ? 'comment--reply' : ''} ${c.pinned_at ? 'is-pinned' : ''}`} {...press}>
      {picking && (
        <div className="reaction-bar" role="menu" aria-label="Reagir ao comentário">
          {REACTIONS.map((em) => (
            <button
              key={em}
              type="button"
              role="menuitem"
              className={mineEmoji === em ? 'is-on' : ''}
              aria-label={`Reagir com ${em}`}
              onClick={() => {
                setPicking(false);
                onReact(c, mineEmoji === em ? null : em);
              }}
            >
              {em}
            </button>
          ))}
          <button type="button" className="reaction-bar__close" aria-label="Fechar" onClick={() => setPicking(false)}>
            <X size={16} />
          </button>
        </div>
      )}
      <Avatar character={c.character} size={isReply ? 28 : 36} onClick={() => navigate(`/u/${c.character.handle}`)} />
      <div className="comment__main">
        {c.pinned_at && (
          <div className="comment__pinned">
            <Pin size={11} strokeWidth={2.6} /> Fixado pelo autor
          </div>
        )}
        <div className="comment__head">
          <Link to={`/u/${c.character.handle}`}>
            <Handle character={c.character} className="strong" badge={12} />
          </Link>
          <span className="muted">{timeShort(c.created_at)}</span>
        </div>
        <div className="comment__body">
          <RichText text={c.body} />
        </div>
        <div className="comment__meta">
          {summary && <span className="comment__reactions">{summary}</span>}
          <button type="button" onClick={() => onReply(c)}>
            Responder
          </button>
          {reactions && (
            <button type="button" onClick={() => setPicking(true)}>
              Reagir
            </button>
          )}
          {canPin && !isReply && (
            <button type="button" onClick={() => onPin(c)}>
              {c.pinned_at ? 'Desafixar' : 'Fixar'}
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={() => onDelete(c)} aria-label="Excluir comentário">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        className={`icon-btn comment__like ${c.liked ? 'is-liked' : ''}`}
        aria-label={c.liked ? 'Tirar reação' : 'Curtir comentário'}
        onClick={() => onLike(c)}
      >
        {mineEmoji && mineEmoji !== '❤️' ? (
          <span className="comment__my-emoji">{mineEmoji}</span>
        ) : (
          <Heart size={14} fill={c.liked ? 'currentColor' : 'none'} strokeWidth={c.liked ? 0 : 2} />
        )}
      </button>
    </div>
  );
}

export default function Comments() {
  const { id } = useParams();
  const { active, isAdmin, isMine, can } = useSession();
  const reactions = can('interacoes');
  const toast = useToast();
  const confirm = useConfirm();
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState({});
  const input = useRef(null);
  const bottom = useRef(null);

  const post = useAsync(`post:${id}:${active.id}`, () => api.getPost(id, active.id), [id, active.id]);
  const list = useAsync(`comments:${id}:${active.id}`, () => api.comments(id, active.id), [id, active.id]);

  const tree = useMemo(() => {
    const all = list.data || [];
    // fixados primeiro (na ordem em que foram fixados), depois o resto
    const top = all
      .filter((c) => !c.parent_id)
      .map((c, i) => [c, i])
      .sort(([a, i], [b, j]) => (a.pinned_at ? 0 : 1) - (b.pinned_at ? 0 : 1) || String(a.pinned_at || '').localeCompare(String(b.pinned_at || '')) || i - j)
      .map(([c]) => c);
    const replies = {};
    for (const c of all) if (c.parent_id) (replies[c.parent_id] ||= []).push(c);
    return top.map((c) => ({ ...c, replies: replies[c.id] || [] }));
  }, [list.data]);

  useEffect(() => {
    document.documentElement.classList.add('has-composer');
    return () => document.documentElement.classList.remove('has-composer');
  }, []);

  const p = post.data;
  const postOwnerMine = p && isMine(p.character.id);

  const reply = (c) => {
    const root = c.parent_id || c.id;
    setReplyTo({ id: root, handle: c.character.handle });
    setOpen((o) => ({ ...o, [root]: true }));
    setBody(`@${c.character.handle} `);
    setTimeout(() => input.current?.focus(), 50);
  };

  const send = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api.addComment({ post: id, character: active.id, body: text, parent: replyTo?.id });
      setBody('');
      const wasReply = !!replyTo;
      setReplyTo(null);
      const fresh = await list.reload();
      if (fresh) emit('post:update', { id, patch: { comment_count: fresh.length } });
      if (!wasReply) setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      toast(api.errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  // reação: null tira; mantém a lista de emojis do resumo em dia na hora
  const react = async (c, emoji) => {
    const before = c.my_reaction || (c.liked ? '❤️' : null);
    if (before === emoji) return;
    const patch = (xs) =>
      xs.map((x) => {
        if (x.id !== c.id) return x;
        let rs = [...(x.reactions?.length ? x.reactions : x.like_count ? ['❤️'] : [])];
        const n = x.like_count + (emoji && !before ? 1 : !emoji && before ? -1 : 0);
        if (emoji && !rs.includes(emoji)) rs.push(emoji);
        if (!n) rs = [];
        return { ...x, liked: !!emoji, my_reaction: emoji, like_count: n, reactions: rs };
      });
    list.mutate(patch);
    try {
      if (reactions) await api.reactComment(c.id, active.id, emoji);
      else if (emoji) await api.likeComment(c.id, active.id);
      else await api.unlikeComment(c.id, active.id);
    } catch (err) {
      list.reload();
      toast(api.errorMessage(err));
    }
  };
  const like = (c) => react(c, c.liked ? null : '❤️');

  const pin = async (c) => {
    const pinning = !c.pinned_at;
    if (pinning && (list.data || []).filter((x) => x.pinned_at).length >= 3) {
      toast('Dá para fixar até 3 comentários. Desafixe um antes.');
      return;
    }
    list.mutate((xs) => xs.map((x) => (x.id === c.id ? { ...x, pinned_at: pinning ? new Date().toISOString() : null } : x)));
    try {
      await api.pinComment(c.id, pinning);
      toast(pinning ? 'Comentário fixado' : 'Comentário desafixado');
    } catch (err) {
      list.reload();
      toast(api.errorMessage(err));
    }
  };

  const remove = async (c) => {
    const ok = await confirm({ title: 'Excluir comentário?', confirmText: 'Excluir', danger: true });
    if (!ok) return;
    try {
      await api.deleteComment(c.id);
      const fresh = await list.reload();
      if (fresh) emit('post:update', { id, patch: { comment_count: fresh.length } });
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  const canDelete = (c) => isMine(c.character.id) || postOwnerMine || isAdmin;
  const cprops = { onReply: reply, onLike: like, onReact: react, onPin: pin, onDelete: remove, reactions, canPin: reactions && postOwnerMine };

  return (
    <div className="app app--full">
      <TopBar left={<BackButton />} title="Comentários" />
      <div className="comments">
        {p && p.caption && (
          <div className="comment comment--caption">
            <Avatar character={p.character} size={36} />
            <div className="comment__main">
              <div className="comment__head">
                <Link to={`/u/${p.character.handle}`}>
                  <Handle character={p.character} className="strong" badge={12} />
                </Link>
                <span className="muted">{timeShort(p.created_at)}</span>
              </div>
              <div className="comment__body">
                <RichText text={p.caption} />
              </div>
            </div>
          </div>
        )}
        {list.loading && !list.data && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        {list.error && <ErrorBox onRetry={list.reload}>{list.error}</ErrorBox>}
        {list.data && tree.length === 0 && (
          <div className="empty empty--small">
            <h3 className="empty__title">Ainda não há comentários</h3>
            <p className="empty__text">Inicie a conversa.</p>
          </div>
        )}
        {tree.map((c) => (
          <div key={c.id} className="comment-thread">
            <Comment c={c} {...cprops} canDelete={canDelete(c)} />
            {c.replies.length > 0 && (
              <div className="comment-replies">
                <button type="button" className="replies-toggle" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}>
                  <span className="replies-toggle__line" />
                  {open[c.id] ? 'Ocultar respostas' : `Ver ${c.replies.length === 1 ? '1 resposta' : `${c.replies.length} respostas`}`}
                </button>
                {open[c.id] &&
                  c.replies.map((r) => <Comment key={r.id} c={r} isReply {...cprops} canDelete={canDelete(r)} />)}
              </div>
            )}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form className="composer" onSubmit={send}>
        {replyTo && (
          <div className="composer__reply">
            <span className="muted">Respondendo a @{replyTo.handle}</span>
            <button
              type="button"
              aria-label="Cancelar resposta"
              onClick={() => {
                setReplyTo(null);
                setBody('');
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="composer__emojis">
          {EMOJIS.map((em) => (
            <button key={em} type="button" onClick={() => setBody((b) => b + em)} aria-label={`Inserir ${em}`}>
              {em}
            </button>
          ))}
        </div>
        <div className="composer__row">
          <Avatar character={active} size={34} />
          <textarea
            ref={input}
            className="composer__input"
            rows={1}
            value={body}
            maxLength={1000}
            placeholder={`Comentar como ${active.handle}…`}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="submit" className="composer__send" disabled={!body.trim() || sending}>
            {sending ? <Spinner size={16} className="spinner--inline" /> : 'Publicar'}
          </button>
        </div>
      </form>
    </div>
  );
}

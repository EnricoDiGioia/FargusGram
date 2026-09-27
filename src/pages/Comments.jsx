import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Heart, Trash2, X } from 'lucide-react';
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

function Comment({ c, onReply, onLike, onDelete, canDelete, isReply }) {
  const navigate = useNavigate();
  return (
    <div className={`comment ${isReply ? 'comment--reply' : ''}`}>
      <Avatar character={c.character} size={isReply ? 28 : 36} onClick={() => navigate(`/u/${c.character.handle}`)} />
      <div className="comment__main">
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
          {c.like_count > 0 && (
            <span>
              {count(c.like_count)} {c.like_count === 1 ? 'curtida' : 'curtidas'}
            </span>
          )}
          <button type="button" onClick={() => onReply(c)}>
            Responder
          </button>
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
        aria-label={c.liked ? 'Descurtir comentário' : 'Curtir comentário'}
        onClick={() => onLike(c)}
      >
        <Heart size={14} fill={c.liked ? 'currentColor' : 'none'} strokeWidth={c.liked ? 0 : 2} />
      </button>
    </div>
  );
}

export default function Comments() {
  const { id } = useParams();
  const { active, isAdmin, isMine } = useSession();
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
    const top = all.filter((c) => !c.parent_id);
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

  const like = async (c) => {
    const liked = !c.liked;
    const patch = (xs) => xs.map((x) => (x.id === c.id ? { ...x, liked, like_count: x.like_count + (liked ? 1 : -1) } : x));
    list.mutate(patch);
    try {
      if (liked) await api.likeComment(c.id, active.id);
      else await api.unlikeComment(c.id, active.id);
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
            <Comment c={c} onReply={reply} onLike={like} onDelete={remove} canDelete={canDelete(c)} />
            {c.replies.length > 0 && (
              <div className="comment-replies">
                <button type="button" className="replies-toggle" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))}>
                  <span className="replies-toggle__line" />
                  {open[c.id] ? 'Ocultar respostas' : `Ver ${c.replies.length === 1 ? '1 resposta' : `${c.replies.length} respostas`}`}
                </button>
                {open[c.id] &&
                  c.replies.map((r) => <Comment key={r.id} c={r} isReply onReply={reply} onLike={like} onDelete={remove} canDelete={canDelete(r)} />)}
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

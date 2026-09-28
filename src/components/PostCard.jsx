import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, UserRound, Trash2, Pencil, Link2, User, ChevronLeft, ChevronRight } from 'lucide-react';
import Avatar from './Avatar';
import RichText from './RichText';
import ShareSheet from './ShareSheet';
import { MusicInfoSheet, MusicLine, SoundButton, useMusicInView } from './Music';
import { Handle, Sheet, SheetItem, useConfirm } from './ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import * as api from '../lib/api';
import { mediaUrl } from '../lib/supabase';
import { emit } from '../lib/events';
import { count, timeLong } from '../lib/format';
import { cleanMusic } from '../lib/music';
import { fadeIn } from '../lib/fade';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function MediaCarousel({ media, onDoubleTap, tags = [], burstKey, index, onIndex, children }) {
  const track = useRef(null);
  const last = useRef({ t: 0, x: 0, y: 0 });
  const [showTags, setShowTags] = useState(false);
  const first = media[0] || { width: 1, height: 1 };
  const ratio = clamp(first.width / first.height, 0.8, 1.91);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) onIndex?.(i);
  };

  const go = (dir) => {
    const el = track.current;
    if (el) el.scrollTo({ left: el.scrollLeft + dir * el.clientWidth, behavior: 'smooth' });
  };

  const onPointerUp = (e) => {
    const now = Date.now();
    const l = last.current;
    if (now - l.t < 320 && Math.hypot(e.clientX - l.x, e.clientY - l.y) < 40) {
      last.current = { t: 0, x: 0, y: 0 };
      onDoubleTap?.();
    } else {
      last.current = { t: now, x: e.clientX, y: e.clientY };
    }
  };

  return (
    <div className="carousel" style={{ aspectRatio: String(ratio) }}>
      <div className="carousel__track" ref={track} onScroll={onScroll} onPointerUp={onPointerUp} onDoubleClick={(e) => e.preventDefault()}>
        {media.map((m, i) => (
          <div className="carousel__slide" key={m.path || i}>
            <img
              {...fadeIn}
              src={mediaUrl(m.path)}
              alt=""
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              draggable="false"
              width={m.width}
              height={m.height}
            />
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <span className="carousel__count">
          {(index || 0) + 1}/{media.length}
        </span>
      )}
      {media.length > 1 && (index || 0) > 0 && (
        <button type="button" className="carousel__arrow carousel__arrow--prev" aria-label="Foto anterior" onClick={() => go(-1)}>
          <ChevronLeft size={18} strokeWidth={2.5} />
        </button>
      )}
      {media.length > 1 && (index || 0) < media.length - 1 && (
        <button type="button" className="carousel__arrow carousel__arrow--next" aria-label="Próxima foto" onClick={() => go(1)}>
          <ChevronRight size={18} strokeWidth={2.5} />
        </button>
      )}
      {tags.length > 0 && (
        <>
          <button type="button" className="carousel__tagbtn" aria-label="Personagens marcados" onClick={() => setShowTags((v) => !v)}>
            <User size={14} fill="currentColor" />
          </button>
          {showTags && (
            <div className="carousel__tags">
              {tags.map((t) => (
                <Link key={t.id} to={`/u/${t.handle}`} className="tag-pill">
                  {t.handle}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      {burstKey > 0 && (
        <span key={burstKey} className="heart-burst" aria-hidden="true">
          <Heart size={96} fill="currentColor" strokeWidth={0} />
        </span>
      )}
      {children}
    </div>
  );
}

// Segunda linha do topo do post: local, música ou os dois se alternando
function PostSubline({ location, music, onMusic }) {
  if (location && music)
    return (
      <span className="post__sub post__sub--rotate">
        <span className="post__loc">{location}</span>
        <MusicLine music={music} onClick={onMusic} className="post__music" />
      </span>
    );
  if (music) return <MusicLine music={music} onClick={onMusic} className="post__music" />;
  if (location) return <span className="post__loc">{location}</span>;
  return null;
}

export function Dots({ total, index }) {
  if (total < 2) return null;
  return (
    <div className="dots" aria-hidden="true">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={i === index ? 'is-on' : ''} />
      ))}
    </div>
  );
}

export function LikeLine({ post }) {
  if (!post.like_count) return null;
  const first = post.likers?.[0];
  if (first) {
    const others = post.like_count - 1;
    return (
      <div className="post__likes">
        <Link to={`/p/${post.id}/curtidas`}>
          Curtido por <strong>{first.handle}</strong>
          {others > 0 && (
            <>
              {' '}
              e <strong>{others === 1 ? 'outra pessoa' : `outras ${count(others)} pessoas`}</strong>
            </>
          )}
        </Link>
      </div>
    );
  }
  return (
    <div className="post__likes">
      <Link to={`/p/${post.id}/curtidas`}>
        <strong>
          {count(post.like_count)} {post.like_count === 1 ? 'curtida' : 'curtidas'}
        </strong>
      </Link>
    </div>
  );
}

export default function PostCard({ post, showAllComments = false }) {
  const { active, isAdmin, isMine } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [share, setShare] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [burst, setBurst] = useState(0);
  const [index, setIndex] = useState(0);
  const [likeAnim, setLikeAnim] = useState(false);
  const [musicInfo, setMusicInfo] = useState(false);
  const media = useRef(null);
  const music = useMemo(() => cleanMusic(post.music), [post.music]);
  const musicKey = `post:${post.id}`;
  useMusicInView(media, musicKey, music);

  const mine = isMine(post.character?.id);
  const patch = (p) => emit('post:update', { id: post.id, patch: p });

  const setLiked = async (liked) => {
    if (!active || liked === post.liked) return;
    const before = { liked: post.liked, like_count: post.like_count };
    patch({ liked, like_count: post.like_count + (liked ? 1 : -1) });
    if (liked) {
      setLikeAnim(true);
      setTimeout(() => setLikeAnim(false), 400);
    }
    try {
      if (liked) await api.like(post.id, active.id);
      else await api.unlike(post.id, active.id);
    } catch (e) {
      patch(before);
      toast(api.errorMessage(e));
    }
  };

  const setSaved = async (saved) => {
    if (!active) return;
    patch({ saved });
    try {
      if (saved) await api.save(post.id, active.id);
      else await api.unsave(post.id, active.id);
      toast(saved ? 'Salvo nos seus itens salvos' : 'Removido dos salvos');
    } catch (e) {
      patch({ saved: !saved });
      toast(api.errorMessage(e));
    }
  };

  const onDoubleTap = () => {
    setBurst((b) => b + 1);
    setLiked(true);
  };

  const remove = async () => {
    setMenu(false);
    const ok = await confirm({
      title: 'Excluir publicação?',
      message: 'Isso não pode ser desfeito.',
      confirmText: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePost(post);
      emit('post:delete', post.id);
      toast('Publicação excluída');
    } catch (e) {
      toast(api.errorMessage(e));
    }
  };

  const copyLink = async () => {
    setMenu(false);
    const url = `${window.location.origin}${window.location.pathname}#/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado');
    } catch {
      toast(url);
    }
  };

  const caption = post.caption || '';
  const long = caption.length > 140 || caption.split('\n').length > 3;
  const shownCaption = long && !expanded ? caption.slice(0, 120).split('\n').slice(0, 3).join('\n').trimEnd() : caption;
  const c = post.character;

  return (
    <article className="post">
      <header className="post__head">
        <Avatar character={c} size={32} onClick={() => navigate(`/u/${c.handle}`)} />
        <div className="post__who">
          <Link to={`/u/${c.handle}`} className="post__handle">
            <Handle character={c} />
          </Link>
          <PostSubline location={post.location} music={music} onMusic={() => setMusicInfo(true)} />
        </div>
        <button type="button" className="icon-btn" aria-label="Mais opções" onClick={() => setMenu(true)}>
          <MoreHorizontal size={22} />
        </button>
      </header>

      <div ref={media}>
        <MediaCarousel media={post.media} tags={post.tags} onDoubleTap={onDoubleTap} burstKey={burst} index={index} onIndex={setIndex}>
          {music && <SoundButton playerKey={musicKey} className="carousel__sound" />}
        </MediaCarousel>
      </div>

      <div className="post__actions">
        <div className="post__actions-left">
          <button
            type="button"
            className={`icon-btn like-btn ${post.liked ? 'is-liked' : ''} ${likeAnim ? 'pop' : ''}`}
            aria-label={post.liked ? 'Descurtir' : 'Curtir'}
            aria-pressed={post.liked}
            onClick={() => setLiked(!post.liked)}
          >
            <Heart size={26} strokeWidth={post.liked ? 0 : 1.9} fill={post.liked ? 'currentColor' : 'none'} />
          </button>
          <button type="button" className="icon-btn" aria-label="Comentar" onClick={() => navigate(`/p/${post.id}/comentarios`)}>
            <MessageCircle size={25} strokeWidth={1.9} style={{ transform: 'scaleX(-1)' }} />
          </button>
          <button type="button" className="icon-btn" aria-label="Enviar" onClick={() => setShare(true)}>
            <Send size={24} strokeWidth={1.9} />
          </button>
        </div>
        <Dots total={post.media.length} index={index} />
        <button
          type="button"
          className="icon-btn post__save"
          aria-label={post.saved ? 'Remover dos salvos' : 'Salvar'}
          aria-pressed={post.saved}
          onClick={() => setSaved(!post.saved)}
        >
          <Bookmark size={25} strokeWidth={1.9} fill={post.saved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="post__body">
        <LikeLine post={post} />
        {caption && (
          <div className="post__caption">
            <Link to={`/u/${c.handle}`} className="post__caption-handle">
              <Handle character={c} badge={12} />
            </Link>{' '}
            <RichText text={shownCaption} />
            {long && !expanded && (
              <>
                {'… '}
                <button type="button" className="link-muted" onClick={() => setExpanded(true)}>
                  mais
                </button>
              </>
            )}
          </div>
        )}
        {!showAllComments && post.comment_count > 0 && (
          <Link to={`/p/${post.id}/comentarios`} className="post__more-comments">
            {post.comment_count === 1 ? 'Ver 1 comentário' : `Ver todos os ${count(post.comment_count)} comentários`}
          </Link>
        )}
        {!showAllComments &&
          (post.preview_comments || []).map((cm) => (
            <div key={cm.id} className="post__comment-preview">
              <Link to={`/u/${cm.handle}`} className="post__caption-handle">
                {cm.handle}
              </Link>{' '}
              <RichText text={cm.body.length > 120 ? cm.body.slice(0, 117) + '…' : cm.body} />
            </div>
          ))}
        <Link to={`/p/${post.id}`} className="post__time">
          {timeLong(post.created_at)}
          {post.edited_at ? ' · editado' : ''}
        </Link>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)}>
        {mine && (
          <SheetItem
            icon={<Pencil size={22} />}
            onClick={() => {
              setMenu(false);
              navigate(`/p/${post.id}/editar`);
            }}
          >
            Editar
          </SheetItem>
        )}
        <SheetItem
          icon={<UserRound size={22} />}
          onClick={() => {
            setMenu(false);
            navigate(`/u/${c.handle}`);
          }}
        >
          Sobre esta conta
        </SheetItem>
        <SheetItem icon={<Link2 size={22} />} onClick={copyLink}>
          Copiar link
        </SheetItem>
        {(mine || isAdmin) && (
          <SheetItem icon={<Trash2 size={22} />} danger onClick={remove}>
            {mine ? 'Excluir' : 'Excluir (admin)'}
          </SheetItem>
        )}
      </Sheet>

      <ShareSheet open={share} onClose={() => setShare(false)} post={post} />
      {music && <MusicInfoSheet music={music} open={musicInfo} onClose={() => setMusicInfo(false)} />}
    </article>
  );
}

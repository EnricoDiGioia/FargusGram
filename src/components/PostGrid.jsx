import { Link } from 'react-router';
import { Copy, Heart, MessageCircle, Clapperboard } from 'lucide-react';
import { mediaUrl } from '../lib/supabase';
import { count } from '../lib/format';
import { fadeIn } from '../lib/fade';
import { rememberList } from '../lib/postLists';

// source: { key, fetch, getCursor, pageSize, done } — de onde vêm os posts (para a
// página do post mostrar os próximos da mesma lista)
export default function PostGrid({ posts, source }) {
  return (
    <div className="grid">
      {posts.map((p) => (
        <Link
          key={p.id}
          to={`/p/${p.id}`}
          state={source ? { list: source.key } : undefined}
          onClick={() => source && rememberList(source.key, { ...source, items: posts })}
          className="grid__cell" aria-label={p.video && p.media_count <= 1 ? 'Abrir reel' : 'Abrir publicação'}>
          {p.thumb && <img {...fadeIn} src={mediaUrl(p.thumb)} alt="" loading="lazy" decoding="async" draggable="false" />}
          {p.media_count > 1 ? (
            <span className="grid__multi" aria-hidden="true">
              <Copy size={16} fill="currentColor" strokeWidth={1.5} />
            </span>
          ) : (
            p.video && (
              <span className="grid__multi" aria-hidden="true">
                <Clapperboard size={17} strokeWidth={2} />
              </span>
            )
          )}
          <span className="grid__hover" aria-hidden="true">
            <span>
              <Heart size={16} fill="currentColor" /> {count(p.like_count)}
            </span>
            <span>
              <MessageCircle size={16} fill="currentColor" /> {count(p.comment_count)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function GridSkeleton({ n = 9 }) {
  return (
    <div className="grid">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="grid__cell skeleton" />
      ))}
    </div>
  );
}

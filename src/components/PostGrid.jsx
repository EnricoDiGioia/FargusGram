import { Link } from 'react-router';
import { Copy, Heart, MessageCircle } from 'lucide-react';
import { mediaUrl } from '../lib/supabase';
import { count } from '../lib/format';

export default function PostGrid({ posts }) {
  return (
    <div className="grid">
      {posts.map((p) => (
        <Link key={p.id} to={`/p/${p.id}`} className="grid__cell" aria-label="Abrir publicação">
          {p.thumb && <img src={mediaUrl(p.thumb)} alt="" loading="lazy" decoding="async" draggable="false" />}
          {p.media_count > 1 && (
            <span className="grid__multi" aria-hidden="true">
              <Copy size={16} fill="currentColor" strokeWidth={1.5} />
            </span>
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

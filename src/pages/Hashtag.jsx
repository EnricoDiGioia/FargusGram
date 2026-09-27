import { useParams } from 'react-router';
import { Hash } from 'lucide-react';
import { TopBar, BackButton, Spinner, EmptyState, ErrorBox } from '../components/ui';
import PostGrid, { GridSkeleton } from '../components/PostGrid';
import { useInfinite, useOnVisible } from '../lib/hooks';
import * as api from '../lib/api';

export default function Hashtag() {
  const { tag } = useParams();
  const key = `tag:${tag}`;
  const list = useInfinite(key, (before) => api.hashtagPosts(tag, before), { pageSize: 30 });
  const sentinel = useOnVisible(list.loadMore, !list.done && !list.loading && list.items.length > 0);

  return (
    <div className="page">
      <TopBar left={<BackButton />} title={`#${tag}`} />
      <div className="tag-head">
        <span className="hash-circle hash-circle--big">
          <Hash size={40} />
        </span>
        <div>
          <h2>#{tag}</h2>
          <p className="muted">{list.done ? `${list.items.length} ${list.items.length === 1 ? 'publicação' : 'publicações'}` : 'Publicações'}</p>
        </div>
      </div>
      {list.items.length === 0 && list.loading && <GridSkeleton />}
      {list.error && <ErrorBox onRetry={list.reload}>{list.error}</ErrorBox>}
      {!list.loading && !list.error && list.items.length === 0 && <EmptyState title="Nenhuma publicação">Ninguém usou essa hashtag ainda.</EmptyState>}
      <PostGrid posts={list.items} />
      {list.loading && list.items.length > 0 && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      <div ref={sentinel} />
    </div>
  );
}

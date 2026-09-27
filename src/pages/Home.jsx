import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Send, Camera } from 'lucide-react';
import { TopBar, IconButton, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { Wordmark } from '../components/Brand';
import PostCard from '../components/PostCard';
import StoriesTray from '../components/StoriesTray';
import PullToRefresh from '../components/PullToRefresh';
import InstallBanner from '../components/InstallBanner';
import CharacterRow, { FollowButton } from '../components/CharacterRow';
import { useSession } from '../state/session';
import { useUnread } from '../state/unread';
import { useInfinite, useOnVisible, useAsync } from '../lib/hooks';
import { on } from '../lib/events';
import { pageCache } from '../lib/storage';
import * as api from '../lib/api';

export function usePostListEvents(setItems) {
  useEffect(() => {
    const offU = on('post:update', ({ id, patch }) => setItems((xs) => xs.map((p) => (p.id === id ? { ...p, ...patch } : p))));
    const offD = on('post:delete', (id) => setItems((xs) => xs.filter((p) => p.id !== id)));
    return () => {
      offU();
      offD();
    };
  }, [setItems]);
}

function Suggestions() {
  const { active } = useSession();
  const { data } = useAsync(`suggest:${active.id}`, () => api.suggested(active.id), [active.id]);
  if (!data?.length) return null;
  return (
    <section className="suggest">
      <h3 className="section-title">Sugestões para você</h3>
      {data.slice(0, 12).map((c) => (
        <CharacterRow key={c.id} character={c} sub={c.follows_you ? 'Segue você' : c.name} right={<FollowButton character={c} />} />
      ))}
    </section>
  );
}

export default function Home() {
  const { active } = useSession();
  const { messages } = useUnread(active.id);
  const navigate = useNavigate();
  const [trayKey, setTrayKey] = useState(0);
  const key = `feed:${active.id}`;
  const feed = useInfinite(key, (before) => api.feed(active.id, before), { pageSize: 8 });
  usePostListEvents(feed.setItems);
  const sentinel = useOnVisible(feed.loadMore, !feed.done && !feed.loading && feed.items.length > 0);

  const refresh = async () => {
    setTrayKey((k) => k + 1);
    pageCache.delete(`suggest:${active.id}`);
    await feed.reload();
  };

  useEffect(() => on('home:refresh', refresh));
  useEffect(
    () =>
      on('feed:stale', () => {
        pageCache.delete(key);
        feed.reload();
      }),
    [key] // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => on('post:create', () => feed.reload()), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page page--home">
      <TopBar
        left={
          <button type="button" className="logo-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="FargusGram">
            <Wordmark />
          </button>
        }
        right={
          <>
            <IconButton label="Novo story" onClick={() => navigate('/criar/story')}>
              <Camera size={25} strokeWidth={1.8} />
            </IconButton>
            <IconButton label="Direct" onClick={() => navigate('/direct')} badge={messages || 0}>
              <Send size={24} strokeWidth={1.8} />
            </IconButton>
          </>
        }
      />
      <PullToRefresh onRefresh={refresh}>
        <InstallBanner />
        <StoriesTray refreshKey={trayKey} />
        <div className="feed">
          {feed.items.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
          {feed.loading && (
            <div className="center-pad">
              <Spinner />
            </div>
          )}
          {feed.error && <ErrorBox onRetry={feed.reload}>{feed.error}</ErrorBox>}
          {!feed.loading && !feed.error && feed.items.length === 0 && (
            <>
              <EmptyState title="Seu feed está vazio">Siga outros personagens para ver as publicações deles aqui.</EmptyState>
              <Suggestions />
            </>
          )}
          {feed.done && feed.items.length > 0 && (
            <div className="feed-end">
              <p className="muted">Você está em dia ✨</p>
              <Suggestions />
            </div>
          )}
          <div ref={sentinel} />
        </div>
      </PullToRefresh>
    </div>
  );
}

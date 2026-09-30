import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { TopBar, BackButton, EmptyState, ErrorBox, PageLoader, Spinner } from '../components/ui';
import PostCard from '../components/PostCard';
import { useSession } from '../state/session';
import { useAsync, useOnVisible } from '../lib/hooks';
import { on } from '../lib/events';
import { getList, growList } from '../lib/postLists';
import * as api from '../lib/api';

const BATCH = 3;

// As próximas publicações da lista de onde o post foi aberto (a grade do
// perfil, os marcados, o explorar…), carregadas aos poucos enquanto rola
function MorePosts({ listKey, currentId }) {
  const { active } = useSession();
  const [cards, setCards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [end, setEnd] = useState(false);
  const shown = useRef(0);

  const loadNext = async () => {
    if (busy || end) return;
    const l = getList(listKey);
    const at = l ? l.items.findIndex((x) => x.id === currentId) : -1;
    if (at < 0) {
      setEnd(true);
      return;
    }
    setBusy(true);
    try {
      let start = at + 1 + shown.current;
      if (start + BATCH > l.items.length && !l.done) await growList(listKey).catch(() => false);
      const list = getList(listKey);
      start = list.items.findIndex((x) => x.id === currentId) + 1 + shown.current;
      const batch = list.items.slice(start, start + BATCH);
      if (!batch.length) {
        setEnd(true);
        return;
      }
      shown.current += batch.length;
      const got = await Promise.all(batch.map((x) => api.getPost(x.id, active.id).catch(() => null)));
      setCards((cs) => [...cs, ...got.filter(Boolean)]);
      if (start + batch.length >= list.items.length && list.done) setEnd(true);
    } finally {
      setBusy(false);
    }
  };
  const sentinel = useOnVisible(loadNext, !end && !busy);

  useEffect(() => {
    const offU = on('post:update', ({ id, patch }) => setCards((xs) => xs.map((p) => (p.id === id ? { ...p, ...patch } : p))));
    const offD = on('post:delete', (id) => setCards((xs) => xs.filter((p) => p.id !== id)));
    return () => {
      offU();
      offD();
    };
  }, []);

  return (
    <div className="more-posts">
      {cards.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
      {busy && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      <div ref={sentinel} />
    </div>
  );
}

export default function PostPage() {
  const { id } = useParams();
  const { active } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const listKey = getList(location.state?.list) ? location.state.list : null;
  const { data: post, loading, error, reload, mutate } = useAsync(`post:${id}:${active.id}`, () => api.getPost(id, active.id), [id, active.id]);

  useEffect(() => {
    const offU = on('post:update', ({ id: pid, patch }) => pid === id && mutate((p) => (p ? { ...p, ...patch } : p)));
    const offD = on('post:delete', (pid) => pid === id && navigate(-1));
    return () => {
      offU();
      offD();
    };
  }, [id, mutate, navigate]);

  // Chaves de propósito: nos navegadores novos scrollTo devolve uma Promise, e o
  // React chamaria essa Promise como "limpeza" ao sair da tela (a tela ficava preta)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  return (
    <div className="page">
      <TopBar left={<BackButton />} title={listKey ? 'Publicações' : 'Publicação'} />
      {loading && !post && <PageLoader />}
      {error && !post && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
      {!loading && !error && !post && <EmptyState title="Publicação não encontrada">Ela pode ter sido excluída.</EmptyState>}
      {post && <PostCard post={post} />}
      {post && listKey && <MorePosts key={`${listKey}:${id}`} listKey={listKey} currentId={id} />}
    </div>
  );
}

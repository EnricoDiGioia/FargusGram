import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { TopBar, BackButton, EmptyState, ErrorBox, PageLoader } from '../components/ui';
import PostCard from '../components/PostCard';
import { useSession } from '../state/session';
import { useAsync } from '../lib/hooks';
import { on } from '../lib/events';
import * as api from '../lib/api';

export default function PostPage() {
  const { id } = useParams();
  const { active } = useSession();
  const navigate = useNavigate();
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
      <TopBar left={<BackButton />} title="Publicação" />
      {loading && !post && <PageLoader />}
      {error && !post && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
      {!loading && !error && !post && <EmptyState title="Publicação não encontrada">Ela pode ter sido excluída.</EmptyState>}
      {post && <PostCard post={post} />}
    </div>
  );
}

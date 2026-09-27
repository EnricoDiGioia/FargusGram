import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { MapPin } from 'lucide-react';
import { TopBar, Spinner, PageLoader, ErrorBox } from '../components/ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useAsync } from '../lib/hooks';
import { mediaUrl } from '../lib/supabase';
import { emit } from '../lib/events';
import * as api from '../lib/api';

export default function EditPost() {
  const { id } = useParams();
  const { active, isMine } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: post, loading, error, reload } = useAsync(`post:${id}:${active.id}`, () => api.getPost(id, active.id), [id]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (post) {
      setCaption(post.caption || '');
      setLocation(post.location || '');
    }
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      await api.updatePost(id, { caption, location });
      emit('post:update', { id, patch: { caption, location, edited_at: new Date().toISOString() } });
      toast('Publicação atualizada');
      navigate(-1);
    } catch (err) {
      toast(api.errorMessage(err));
      setBusy(false);
    }
  };

  if (loading && !post) return <PageLoader />;
  if (error && !post) return <ErrorBox onRetry={reload}>{error}</ErrorBox>;
  if (!post || !isMine(post.character.id))
    return (
      <div className="app app--full">
        <TopBar title="Editar" />
        <p className="muted center-pad">Você só pode editar as suas publicações.</p>
      </div>
    );

  return (
    <div className="app app--full">
      <TopBar
        left={
          <button type="button" className="link-plain" onClick={() => navigate(-1)}>
            Cancelar
          </button>
        }
        title="Editar informações"
        right={
          <button type="button" className="link-accent" onClick={save} disabled={busy}>
            {busy ? <Spinner size={16} className="spinner--inline" /> : 'Concluir'}
          </button>
        }
        center
      />
      <div className="details">
        <div className="details__row">
          <div className="details__preview">
            <img src={mediaUrl(post.media[0]?.thumb_path || post.media[0]?.path)} alt="" />
          </div>
          <textarea className="details__caption" value={caption} maxLength={2200} rows={6} onChange={(e) => setCaption(e.target.value)} placeholder="Legenda" />
        </div>
        <label className="details__line">
          <MapPin size={20} />
          <input value={location} maxLength={100} onChange={(e) => setLocation(e.target.value)} placeholder="Local" />
        </label>
        <p className="muted small pad-x">Para trocar as fotos, exclua e publique de novo.</p>
      </div>
    </div>
  );
}

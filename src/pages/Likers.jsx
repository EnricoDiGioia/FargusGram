import { useParams } from 'react-router';
import { Heart } from 'lucide-react';
import { TopBar, BackButton, Spinner, EmptyState, ErrorBox } from '../components/ui';
import CharacterRow, { FollowButton } from '../components/CharacterRow';
import { useSession } from '../state/session';
import { useAsync } from '../lib/hooks';
import * as api from '../lib/api';

export default function Likers() {
  const { id } = useParams();
  const { active } = useSession();
  const { data, loading, error, reload } = useAsync(`likers:${id}:${active.id}`, () => api.likers(id, active.id), [id, active.id]);
  return (
    <div className="page">
      <TopBar left={<BackButton />} title="Curtidas" />
      {loading && !data && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      {error && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
      {data?.length === 0 && <EmptyState icon={<Heart size={40} strokeWidth={1.4} />} title="Nenhuma curtida ainda" />}
      {data?.map((c) => (
        <CharacterRow key={c.id} character={c} right={<FollowButton character={c} />} />
      ))}
    </div>
  );
}

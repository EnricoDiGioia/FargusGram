import { useNavigate, useParams } from 'react-router';
import { TopBar, BackButton, Spinner, EmptyState, ErrorBox } from '../components/ui';
import CharacterRow, { FollowButton } from '../components/CharacterRow';
import { useSession } from '../state/session';
import { useAsync } from '../lib/hooks';
import * as api from '../lib/api';

export default function FollowList() {
  const { handle, kind: kindParam } = useParams();
  const kind = kindParam === 'seguindo' ? 'following' : 'followers';
  const { active } = useSession();
  const navigate = useNavigate();
  const prof = useAsync(`profile:${handle}:${active.id}`, () => api.profile(handle, active.id), [handle, active.id]);
  const id = prof.data?.id;
  const list = useAsync(id ? `follows:${kind}:${id}:${active.id}` : null, () => (id ? api.followList(id, active.id, kind) : null), [id, kind]);

  return (
    <div className="page">
      <TopBar left={<BackButton />} title={handle} />
      <div className="tabs tabs--text">
        <button type="button" className={kind === 'followers' ? 'is-active' : ''} onClick={() => navigate(`/u/${handle}/seguidores`, { replace: true })}>
          Seguidores
        </button>
        <button type="button" className={kind === 'following' ? 'is-active' : ''} onClick={() => navigate(`/u/${handle}/seguindo`, { replace: true })}>
          Seguindo
        </button>
      </div>
      {(prof.loading || list.loading) && !list.data && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      {(prof.error || list.error) && <ErrorBox onRetry={list.reload}>{prof.error || list.error}</ErrorBox>}
      {list.data && list.data.length === 0 && (
        <EmptyState title={kind === 'followers' ? 'Nenhum seguidor ainda' : 'Não segue ninguém ainda'} />
      )}
      {list.data?.map((c) => (
        <CharacterRow key={c.id} character={c} right={<FollowButton character={c} />} />
      ))}
    </div>
  );
}

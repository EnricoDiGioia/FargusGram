import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import Avatar from './Avatar';
import { useSession } from '../state/session';
import { useAsync } from '../lib/hooks';
import { on } from '../lib/events';
import { pageCache } from '../lib/storage';
import * as api from '../lib/api';

export default function StoriesTray({ refreshKey }) {
  const { active } = useSession();
  const navigate = useNavigate();
  const key = `tray:${active.id}`;
  const { data, reload } = useAsync(key, () => api.storiesTray(active.id), [active.id]);

  useEffect(() => {
    if (refreshKey) reload();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => on('story:change', () => reload()), [reload]);

  const tray = data || [];
  const mine = tray.find((t) => t.character.id === active.id);
  const others = tray.filter((t) => t.character.id !== active.id);
  const order = tray.map((t) => t.character.id);

  const open = (id) => {
    pageCache.set('story-queue', { order, tray });
    navigate(`/stories/${id}`);
  };

  return (
    <div className="tray" role="list">
      <div className="tray__item" role="listitem">
        <div className="tray__avatar">
          <Avatar
            character={active}
            size={64}
            ring={mine ? (mine.all_seen ? 'seen' : 'unseen') : 'none'}
            onClick={() => (mine ? open(active.id) : navigate('/criar/story'))}
          />
          {!mine && (
            <button type="button" className="tray__plus" aria-label="Criar story" onClick={() => navigate('/criar/story')}>
              <Plus size={14} strokeWidth={3} />
            </button>
          )}
        </div>
        <span className="tray__label muted">Seu story</span>
      </div>
      {others.map((t) => (
        <div className="tray__item" role="listitem" key={t.character.id}>
          <Avatar character={t.character} size={64} ring={t.all_seen ? 'seen' : 'unseen'} onClick={() => open(t.character.id)} />
          <span className={`tray__label ${t.all_seen ? 'muted' : ''}`}>{t.character.handle}</span>
        </div>
      ))}
    </div>
  );
}

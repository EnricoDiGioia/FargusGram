import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Avatar from './Avatar';
import { Handle, Spinner } from './ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import * as api from '../lib/api';
import { emit } from '../lib/events';
import { pageCache } from '../lib/storage';

export function FollowButton({ character, small = true, onChange, className = '' }) {
  const { active } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(!!character.is_following);
  useEffect(() => setFollowing(!!character.is_following), [character.is_following]);

  if (!active || active.id === character.id) return null;

  const toggle = async (e) => {
    e.stopPropagation();
    const next = !following;
    setFollowing(next);
    setBusy(true);
    try {
      if (next) await api.follow(active.id, character.id);
      else await api.unfollow(active.id, character.id);
      onChange?.(next);
      pageCache.delete(`feed:${active.id}`);
      pageCache.delete(`tray:${active.id}`);
      emit('profile:change', { id: character.id });
      emit('feed:stale');
    } catch (err) {
      setFollowing(!next);
      toast(api.errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const label = following ? 'Seguindo' : character.follows_you ? 'Seguir de volta' : 'Seguir';
  return (
    <button
      type="button"
      className={`btn ${small ? 'btn--small' : ''} ${following ? 'btn--secondary' : 'btn--primary'} ${className}`}
      onClick={toggle}
      disabled={busy}
    >
      {busy ? <Spinner size={14} className="spinner--inline" /> : label}
    </button>
  );
}

export default function CharacterRow({ character, right, sub, onClick, size = 44 }) {
  const navigate = useNavigate();
  const go = onClick || (() => navigate(`/u/${character.handle}`));
  return (
    <div className="char-row" role="button" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
      <Avatar character={character} size={size} />
      <div className="char-row__names">
        <Handle character={character} />
        {(sub ?? character.name) && <span className="muted">{sub ?? character.name}</span>}
      </div>
      {right && <div className="char-row__right">{right}</div>}
    </div>
  );
}

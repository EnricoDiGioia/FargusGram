import { useNavigate } from 'react-router';
import { Check, Plus } from 'lucide-react';
import { Sheet, Handle } from './ui';
import Avatar from './Avatar';
import { useSession } from '../state/session';
import { useUnread } from '../state/unread';

export default function AccountSwitcher({ open, onClose }) {
  const { characters, active, setActive } = useSession();
  const { all } = useUnread(active?.id);
  const navigate = useNavigate();

  return (
    <Sheet open={open} onClose={onClose} title="Trocar de personagem">
      <div className="switcher">
        {characters.map((c) => {
          const n = (all?.[c.id]?.notifications || 0) + (all?.[c.id]?.messages || 0);
          return (
            <button
              key={c.id}
              type="button"
              className="switcher__item"
              onClick={() => {
                setActive(c.id);
                onClose();
                navigate('/');
              }}
            >
              <Avatar character={c} size={52} />
              <span className="switcher__names">
                <Handle character={c} />
                {c.name && <span className="muted">{c.name}</span>}
              </span>
              {n > 0 && c.id !== active?.id && <span className="count-pill">{n > 99 ? '99+' : n}</span>}
              <span className={`radio ${c.id === active?.id ? 'is-on' : ''}`}>{c.id === active?.id && <Check size={14} strokeWidth={3} />}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="switcher__item"
          onClick={() => {
            onClose();
            navigate('/novo-personagem');
          }}
        >
          <span className="switcher__plus">
            <Plus size={26} />
          </span>
          <span className="switcher__names">
            <strong>Criar novo personagem</strong>
            <span className="muted">Para NPCs, alter egos e afins</span>
          </span>
        </button>
      </div>
    </Sheet>
  );
}

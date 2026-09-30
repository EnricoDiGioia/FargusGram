import { useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { Home, Search, PlusSquare, Heart, Image as ImageIcon, CircleDashed, Clapperboard } from 'lucide-react';
import Avatar from './Avatar';
import AccountSwitcher from './AccountSwitcher';
import { Sheet, SheetItem } from './ui';
import { useSession } from '../state/session';
import { useUnread } from '../state/unread';
import { emit } from '../lib/events';

export default function BottomNav() {
  const { active, can } = useSession();
  // com vídeos, Reels ganha o lugar do coração, que vai para o topo do feed (como no Instagram)
  const reels = can('videos');
  const { notifications, others } = useUnread(active?.id);
  const location = useLocation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const press = useRef(null);

  const profilePath = active ? `/u/${active.handle}` : '/';
  const onProfile = location.pathname === profilePath;

  // Segurar o ícone do perfil abre a troca de personagem (como no Instagram)
  const startPress = () => {
    clearTimeout(press.current);
    press.current = setTimeout(() => {
      press.current = 'fired';
      if (navigator.vibrate) navigator.vibrate(10);
      setSwitchOpen(true);
    }, 450);
  };
  const cancelPress = () => {
    if (press.current !== 'fired') {
      clearTimeout(press.current);
      press.current = null;
    }
  };

  return (
    <>
      <nav className="bottomnav" aria-label="Navegação principal">
        <NavLink
          to="/"
          end
          className="bottomnav__item"
          aria-label="Início"
          onClick={(e) => {
            if (location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              emit('home:refresh');
            }
          }}
        >
          {({ isActive }) => <Home size={27} strokeWidth={isActive ? 2.6 : 1.8} />}
        </NavLink>
        <NavLink to="/explorar" className="bottomnav__item" aria-label="Explorar">
          {({ isActive }) => <Search size={27} strokeWidth={isActive ? 2.8 : 1.8} />}
        </NavLink>
        <button type="button" className="bottomnav__item" aria-label="Criar" onClick={() => setCreateOpen(true)}>
          <PlusSquare size={27} strokeWidth={1.8} />
        </button>
        {reels ? (
          <NavLink to="/reels" className="bottomnav__item" aria-label="Reels">
            {({ isActive }) => <Clapperboard size={27} strokeWidth={isActive ? 2.4 : 1.8} />}
          </NavLink>
        ) : (
          <NavLink to="/atividade" className="bottomnav__item" aria-label="Atividade">
            {({ isActive }) => (
              <span className="nav-icon-wrap">
                <Heart size={27} strokeWidth={isActive ? 2.4 : 1.8} fill={isActive ? 'currentColor' : 'none'} />
                {notifications > 0 && <span className="nav-dot" />}
              </span>
            )}
          </NavLink>
        )}
        <button
          type="button"
          className="bottomnav__item"
          aria-label="Seu perfil (segure para trocar de personagem)"
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          onClick={() => {
            if (press.current === 'fired') {
              press.current = null;
              return;
            }
            navigate(profilePath);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className={`nav-avatar ${onProfile ? 'is-active' : ''}`}>
            <Avatar character={active} size={26} />
            {others > 0 && <span className="nav-dot nav-dot--avatar" />}
          </span>
        </button>
      </nav>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Criar">
        <SheetItem
          icon={<ImageIcon size={24} />}
          onClick={() => {
            setCreateOpen(false);
            navigate('/criar/post');
          }}
        >
          Publicação
        </SheetItem>
        <SheetItem
          icon={<CircleDashed size={24} />}
          onClick={() => {
            setCreateOpen(false);
            navigate('/criar/story');
          }}
        >
          Story
        </SheetItem>
        {reels && (
          <SheetItem
            icon={<Clapperboard size={24} />}
            onClick={() => {
              setCreateOpen(false);
              navigate('/criar/reel');
            }}
          >
            Reel
          </SheetItem>
        )}
      </Sheet>

      <AccountSwitcher open={switchOpen} onClose={() => setSwitchOpen(false)} />
    </>
  );
}

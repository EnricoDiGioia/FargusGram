import { useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router';
import { useSession } from '../state/session';

// ---------------------------------------------------------------------
// Animações de troca de tela
//   ir para frente → a tela nova entra deslizando da direita
//   voltar         → entra deslizando da esquerda
//   abas de baixo  → só esmaece
//   criar          → sobe de baixo
//   stories        → abre com zoom
// Só a tela que entra é animada e, no fim, não sobra nenhum transform
// no elemento (isso bagunçaria as barras fixas).
// ---------------------------------------------------------------------

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const KINDS = {
  forward: { duration: 280, frames: [{ opacity: 0, transform: 'translate3d(28px, 0, 0)' }, { opacity: 1, transform: 'none' }] },
  back: { duration: 280, frames: [{ opacity: 0, transform: 'translate3d(-28px, 0, 0)' }, { opacity: 1, transform: 'none' }] },
  up: { duration: 320, frames: [{ opacity: 0, transform: 'translate3d(0, 44px, 0)' }, { opacity: 1, transform: 'none' }] },
  zoom: { duration: 260, frames: [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }] },
  fade: { duration: 200, frames: [{ opacity: 0 }, { opacity: 1 }] },
};

export function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function animateIn(el, kind, fadeOnly = false) {
  if (!el || typeof el.animate !== 'function' || reducedMotion()) return;
  const k = KINDS[fadeOnly ? 'fade' : kind] || KINDS.fade;
  try {
    el.animate(k.frames, { duration: k.duration, easing: EASE });
  } catch {
    /* navegador sem suporte: troca de tela sem animação */
  }
}

// tela anterior, para saber de onde a pessoa veio
let lastPath = null;

function kindFor(navType, path, prev, profilePath, back) {
  if (prev === null) return 'fade'; // app acabou de abrir
  if (prev.startsWith('/stories/')) return 'fade'; // fechando os stories
  if (path.startsWith('/stories/')) return navType === 'POP' ? 'fade' : 'zoom';
  if (navType === 'POP' || back) return 'back';
  if (navType === 'REPLACE') return 'fade';
  if (path.startsWith('/criar/')) return 'up';
  if (path === '/' || path === '/explorar' || path === '/atividade' || path === profilePath) return 'fade';
  return 'forward';
}

function useScreenMotion(ref, { fadeOnly = false, child = false } = {}) {
  const location = useLocation();
  const navType = useNavigationType();
  const { active } = useSession();
  useLayoutEffect(() => {
    const path = location.pathname;
    const prev = lastPath;
    lastPath = path;
    if (prev === path) return; // mesma tela (ex.: só mudou um parâmetro)
    const el = child ? ref.current?.firstElementChild : ref.current;
    const kind = kindFor(navType, path, prev, active ? `/u/${active.handle}` : null, !!location.state?.back);
    animateIn(el, kind, fadeOnly);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Área das telas que ficam com a barra de baixo
export function RouteView() {
  const ref = useRef(null);
  useScreenMotion(ref);
  return (
    <div className="route" ref={ref}>
      <Outlet />
    </div>
  );
}

// Telas cheias (Direct, comentários, criar, stories...). fadeOnly para as
// que têm barra fixa dentro (deslizar o pai tiraria a barra do lugar).
export function Screen({ children, fadeOnly = false }) {
  const ref = useRef(null);
  useScreenMotion(ref, { fadeOnly, child: true });
  return (
    <div className="screen" ref={ref}>
      {children}
    </div>
  );
}

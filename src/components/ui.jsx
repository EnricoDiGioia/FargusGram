import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { ChevronLeft, X } from 'lucide-react';

export function Spinner({ size = 24, className = '' }) {
  return <span className={`spinner ${className}`} style={{ width: size, height: size }} role="status" aria-label="Carregando" />;
}

export function PageLoader() {
  return (
    <div className="page-loader">
      <Spinner size={28} />
    </div>
  );
}

export function VerifiedBadge({ size = 14 }) {
  return (
    <svg className="verified" width={size} height={size} viewBox="0 0 24 24" aria-label="Verificado" role="img">
      <path
        fill="currentColor"
        d="M12 1.6l2.4 1.8 3-.2.9 2.8 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.8-3-.2L12 22.4l-2.4-1.8-3 .2-.9-2.8-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.8 3 .2z"
      />
      <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M7.8 12.3l2.8 2.8 5.6-5.8" />
    </svg>
  );
}

export function Handle({ character, className = '', badge = 13 }) {
  if (!character) return null;
  return (
    <span className={`handle ${className}`}>
      <span className="handle__text">{character.handle}</span>
      {character.is_verified && <VerifiedBadge size={badge} />}
    </span>
  );
}

export function IconButton({ label, children, className = '', badge, ...props }) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} {...props}>
      {children}
      {badge ? <span className="badge-dot">{badge === true ? '' : badge > 9 ? '9+' : badge}</span> : null}
    </button>
  );
}

export function BackButton({ to, label = 'Voltar' }) {
  const navigate = useNavigate();
  return (
    <IconButton
      label={label}
      onClick={() => {
        // back: true → a tela anterior entra com a animação de "voltar"
        if (to) navigate(to, { state: { back: true } });
        else if (window.history.state && window.history.state.idx > 0) navigate(-1);
        else navigate('/', { state: { back: true } });
      }}
    >
      <ChevronLeft size={28} strokeWidth={1.8} />
    </IconButton>
  );
}

export function TopBar({ left, title, right, className = '', center = false }) {
  return (
    <header className={`topbar ${center ? 'topbar--center' : ''} ${className}`}>
      <div className="topbar__left">{left}</div>
      <div className="topbar__title">{title}</div>
      <div className="topbar__right">{right}</div>
    </header>
  );
}

export function Button({ variant = 'primary', loading, children, className = '', disabled, ...props }) {
  return (
    <button type="button" className={`btn btn--${variant} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size={16} className="spinner--inline" /> : children}
    </button>
  );
}

export function EmptyState({ icon, title, children, action }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      {title && <h3 className="empty__title">{title}</h3>}
      {children && <p className="empty__text">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ children, onRetry }) {
  return (
    <div className="error-box">
      <p>{children}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Folha que sobe de baixo (menus)
// ---------------------------------------------------------------------
export function Sheet({ open, onClose, title, children, className = '' }) {
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const panel = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else if (visible) {
      setClosing(true);
      const t = setTimeout(() => {
        setVisible(false);
        setClosing(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.documentElement.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('no-scroll');
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const onPointerDown = (e) => {
    drag.current = { y: e.clientY, dy: 0 };
  };
  const onPointerMove = (e) => {
    if (!drag.current || !panel.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    panel.current.style.transform = `translateY(${dy}px)`;
  };
  const onPointerUp = () => {
    if (!drag.current || !panel.current) return;
    const { dy } = drag.current;
    drag.current = null;
    panel.current.style.transform = '';
    if (dy > 80) onClose?.();
  };

  return createPortal(
    <div className={`sheet-root ${closing ? 'is-closing' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className={`sheet ${className}`} ref={panel} role="dialog" aria-modal="true" aria-label={title || 'Menu'}>
        <div
          className="sheet__grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span />
        </div>
        {title && <div className="sheet__title">{title}</div>}
        <div className="sheet__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function SheetItem({ icon, children, danger, onClick, right }) {
  return (
    <button type="button" className={`sheet-item ${danger ? 'sheet-item--danger' : ''}`} onClick={onClick}>
      {icon && <span className="sheet-item__icon">{icon}</span>}
      <span className="sheet-item__label">{children}</span>
      {right && <span className="sheet-item__right">{right}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------
// Caixa de confirmação: const ok = await confirm({ title, message })
// ---------------------------------------------------------------------
const ConfirmContext = createContext(async () => false);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setState({ ...opts, resolve });
      }),
    []
  );
  const close = (v) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state &&
        createPortal(
          <div className="dialog-root">
            <div className="dialog-backdrop" onClick={() => close(false)} />
            <div className="dialog" role="alertdialog" aria-modal="true">
              <div className="dialog__content">
                <h3>{state.title}</h3>
                {state.message && <p>{state.message}</p>}
              </div>
              <button className={`dialog__btn ${state.danger ? 'dialog__btn--danger' : 'dialog__btn--strong'}`} onClick={() => close(true)}>
                {state.confirmText || 'Confirmar'}
              </button>
              <button className="dialog__btn" onClick={() => close(false)}>
                {state.cancelText || 'Cancelar'}
              </button>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

// Tela cheia simples (usada por editores)
export function FullScreen({ children, className = '' }) {
  useEffect(() => {
    document.documentElement.classList.add('fullscreen-mode');
    return () => document.documentElement.classList.remove('fullscreen-mode');
  }, []);
  return <div className={`fullscreen ${className}`}>{children}</div>;
}

export function CloseButton({ onClick, label = 'Fechar', size = 26 }) {
  return (
    <IconButton label={label} onClick={onClick}>
      <X size={size} strokeWidth={1.8} />
    </IconButton>
  );
}

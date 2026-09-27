import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((text, opts = {}) => {
    const id = ++idRef.current;
    setItems((xs) => [...xs.slice(-2), { id, text, kind: opts.kind || 'info', action: opts.action }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), opts.duration || 2600);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast__action"
                onClick={() => {
                  t.action.onClick();
                  setItems((xs) => xs.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

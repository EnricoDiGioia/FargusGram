import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { Button } from './ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { local } from '../lib/storage';
import * as push from '../lib/push';

const DISMISS_KEY = 'fg-push-prompt';

// Convite para ativar as notificações (aparece na tela de Atividade)
export default function PushPrompt() {
  const { uid } = useSession();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const s = push.pushSupport();
    const dismissed = Number(local.get(DISMISS_KEY) || 0);
    // só convida quando dá para ativar e a função já existe no Supabase
    if (!s.ok || s.permission === 'denied' || Date.now() - dismissed < 14 * 24 * 3600 * 1000) return;
    Promise.all([push.pushEnabled(uid), push.prefetchPushKey({ quiet: true })])
      .then(([on]) => alive && setShow(!on))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  if (!show) return null;

  const dismiss = () => {
    local.set(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const enable = async () => {
    setBusy(true);
    try {
      await push.enablePush(uid);
      toast('Notificações ativadas neste aparelho');
      setShow(false);
    } catch (err) {
      toast(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="push-prompt">
      <span className="push-prompt__icon">
        <BellRing size={22} />
      </span>
      <div className="push-prompt__text">
        <strong>Ative as notificações</strong>
        <span className="muted">Saiba na hora quando curtirem, comentarem ou mandarem mensagem, mesmo com o app fechado.</span>
        <div className="push-prompt__actions">
          <Button className="btn--small" loading={busy} onClick={enable}>
            Ativar
          </Button>
          <button type="button" className="link-muted" onClick={dismiss}>
            Agora não
          </button>
        </div>
      </div>
      <button type="button" className="icon-btn push-prompt__close" aria-label="Fechar" onClick={dismiss}>
        <X size={18} />
      </button>
    </div>
  );
}

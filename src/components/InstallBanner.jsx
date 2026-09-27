import { useEffect, useState } from 'react';
import { Share, SquarePlus, MoreVertical, Download, X, Smartphone } from 'lucide-react';
import { RiftMark } from './Brand';
import { canPromptInstall, isStandalone, onInstallChange, platform, promptInstall } from '../lib/pwa';
import { local } from '../lib/storage';

export function InstallSteps() {
  const p = platform();
  const [, force] = useState(0);
  useEffect(() => onInstallChange(() => force((x) => x + 1)), []);

  if (isStandalone()) return <p className="muted">O FargusGram já está instalado neste aparelho. ✨</p>;

  if (p.ios) {
    if (!p.safari || p.inApp)
      return (
        <p>
          Abra este site no <strong>Safari</strong> (toque em “Abrir no Safari” ou copie o link e cole lá). Dentro de outros apps não dá para instalar.
        </p>
      );
    return (
      <ol className="install-steps">
        <li>
          Toque em <Share size={16} className="inline-icon" /> <strong>Compartilhar</strong>, na barra do Safari.
        </li>
        <li>
          Role e toque em <SquarePlus size={16} className="inline-icon" /> <strong>Adicionar à Tela de Início</strong>.
        </li>
        <li>
          Confirme em <strong>Adicionar</strong>. O ícone aparece junto com os outros apps.
        </li>
      </ol>
    );
  }

  if (canPromptInstall())
    return (
      <button type="button" className="btn btn--primary" onClick={() => promptInstall()}>
        <Download size={16} /> Instalar o FargusGram
      </button>
    );

  if (p.android)
    return (
      <ol className="install-steps">
        <li>
          No Chrome, toque no menu <MoreVertical size={16} className="inline-icon" /> (canto de cima).
        </li>
        <li>
          Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
        </li>
      </ol>
    );

  return <p className="muted">No computador, use o ícone de instalar na barra de endereço do Chrome ou Edge.</p>;
}

// Na tela de login: dica para instalar antes de entrar
export function AuthInstallHint() {
  const [open, setOpen] = useState(false);
  const p = platform();
  if (isStandalone() || (!p.ios && !p.android)) return null;
  return (
    <div className="auth__card auth__install">
      <button type="button" className="link-accent" onClick={() => setOpen((v) => !v)}>
        <Smartphone size={16} /> Como instalar no celular
      </button>
      {open && (
        <div className="auth__install-steps">
          {p.ios && <p className="muted small">Dica: instale antes de entrar. No iPhone, o app instalado pede login de novo.</p>}
          <InstallSteps />
        </div>
      )}
    </div>
  );
}

export default function InstallBanner() {
  const [hidden, setHidden] = useState(() => {
    const t = Number(local.get('fg-install-dismissed', 0));
    return isStandalone() || Date.now() - t < 7 * 86400000;
  });
  const p = platform();
  if (hidden || (!p.ios && !p.android)) return null;
  return (
    <div className="install-banner">
      <button
        type="button"
        className="install-banner__close"
        aria-label="Dispensar"
        onClick={() => {
          local.set('fg-install-dismissed', String(Date.now()));
          setHidden(true);
        }}
      >
        <X size={18} />
      </button>
      <div className="install-banner__head">
        <span className="install-banner__icon">
          <RiftMark size={30} />
        </span>
        <div>
          <strong>Instale o FargusGram</strong>
          <p className="muted">Fica na tela inicial e abre em tela cheia, como um app.</p>
        </div>
      </div>
      <InstallSteps />
    </div>
  );
}

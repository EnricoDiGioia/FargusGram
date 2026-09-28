import { Component } from 'react';
import { useLocation } from 'react-router';
import { RiftMark } from './Brand';
import { pageCache } from '../lib/storage';

// ---------------------------------------------------------------------
// Rede de segurança: se alguma tela der erro, mostra um aviso com botões
// em vez de deixar o app inteiro em branco (ou preto, no tema escuro).
// ---------------------------------------------------------------------

// Erro de "pedaço do app que não existe mais": saiu uma versão nova com o
// app aberto e ele tentou baixar um arquivo da versão antiga
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk \S+ failed/i;

export function isChunkError(err) {
  return CHUNK_ERROR.test(String(err?.message || err || ''));
}

// Recarrega o app uma vez só: se já recarregou há pouco, não entra em loop
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem('fg-auto-reload') || 0);
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem('fg-auto-reload', String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

function CrashScreen({ error, onRetry, onHome, full }) {
  const chunk = isChunkError(error);
  const detail = String(error?.message || error || 'erro desconhecido');
  return (
    <div className={full ? 'crash crash--full' : 'crash'} role="alert">
      <RiftMark size={52} />
      <h2>{chunk ? 'Saiu uma versão nova do FargusGram' : 'Algo deu errado nesta tela'}</h2>
      <p className="muted">
        {chunk
          ? 'Recarregue para continuar usando o app.'
          : 'Toque em "Tentar de novo". Se continuar acontecendo, recarregue o app. O detalhe abaixo ajuda a descobrir o que houve.'}
      </p>
      <div className="crash__actions">
        {!chunk && (
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            Tentar de novo
          </button>
        )}
        <button type="button" className={`btn ${chunk ? 'btn--primary' : 'btn--secondary'}`} onClick={() => window.location.reload()}>
          Recarregar
        </button>
        {full && !chunk && (
          <button type="button" className="btn btn--secondary" onClick={onHome}>
            Ir para o início
          </button>
        )}
      </div>
      {!chunk && <code className="crash__detail">{detail}</code>}
    </div>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = () => {
      // um dado guardado pode ser o culpado: a tela busca tudo de novo
      for (const k of pageCache.keys()) if (!k.startsWith('scroll:')) pageCache.delete(k);
      this.setState({ error: null });
    };
    this.goHome = () => {
      const already = !window.location.hash || window.location.hash === '#/';
      window.location.hash = '#/';
      // dentro do app a troca de tela já zera o erro; fora dele (ou se já
      // estava no início) é preciso tentar de novo na mão
      if (already || this.props.resetKey === undefined) this.retry();
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[FargusGram] erro na tela:', error, info?.componentStack || '');
    if (isChunkError(error)) reloadOnce();
  }

  componentDidUpdate(prev) {
    // mudou de tela: tenta mostrar a tela nova normalmente
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.retry();
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashScreen error={this.state.error} onRetry={this.retry} onHome={this.goHome} full={this.props.full} />;
  }
}

// Versão que volta ao normal sozinha quando a pessoa troca de tela
export function RouteErrorBoundary({ children, full = false }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname} full={full}>
      {children}
    </ErrorBoundary>
  );
}

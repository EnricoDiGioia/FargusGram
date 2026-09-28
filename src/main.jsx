import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/unbounded/latin-700.css';
import './styles/app.css';
import App from './App';
import ErrorBoundary, { reloadOnce } from './components/ErrorBoundary';
import { initPwa, registerServiceWorker } from './lib/pwa';
import { applySavedTheme } from './lib/theme';
import { startCacheSync } from './lib/sync';
import { initAudioUnlock } from './lib/music';

applySavedTheme();
initPwa();
startCacheSync();
initAudioUnlock();
registerServiceWorker();

// Saiu versão nova com o app aberto e um pedaço antigo sumiu do servidor:
// recarrega uma vez para pegar a versão nova (em vez de quebrar a tela)
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary full>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

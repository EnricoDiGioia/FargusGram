import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/unbounded/latin-700.css';
import './styles/app.css';
import App from './App';
import { initPwa, registerServiceWorker } from './lib/pwa';
import { applySavedTheme } from './lib/theme';
import { startCacheSync } from './lib/sync';

applySavedTheme();
initPwa();
startCacheSync();
registerServiceWorker();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

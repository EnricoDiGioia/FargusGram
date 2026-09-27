// Instalação do app (PWA) e service worker
let deferredPrompt = null;
const listeners = new Set();

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function canPromptInstall() {
  return !!deferredPrompt;
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
  return outcome === 'accepted';
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function platform() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const inApp = /Instagram|FBAN|FBAV|WhatsApp|Line\/|Twitter|Snapchat|TikTok/i.test(ua);
  const safari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return { ios, android, inApp, safari };
}

// Registra o service worker e avisa quando houver versão nova
let pendingApply = null;
const updateListeners = new Set();

export function onSwUpdate(fn) {
  updateListeners.add(fn);
  if (pendingApply) fn(pendingApply);
  return () => updateListeners.delete(fn);
}

function notifyUpdate(apply) {
  pendingApply = apply;
  updateListeners.forEach((fn) => fn(apply));
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env?.DEV) return;
  const run = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const notify = (worker) => notifyUpdate(() => worker.postMessage('skipWaiting'));
      if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w);
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
      // procura atualização quando o app volta para a tela
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) {
      console.warn('Service worker não registrado', e);
    }
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}

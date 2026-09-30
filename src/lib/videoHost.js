// Um único <video> para o app inteiro (feed, post, reels e stories).
//
// Quem quer mostrar um vídeo faz um "pedido" com uma chave e a caixa onde ele
// deve aparecer; o pedido mais recente ganha e o <video> muda para aquela
// caixa (as outras mostram só a foto do primeiro quadro). Assim:
// - só um vídeo baixa e toca por vez (poupa internet e bateria);
// - no iPhone, depois que o som é liberado com um toque, vale para os
//   próximos vídeos também (a liberação é do elemento).
// O som segue o botão de som do app (lib/music.js): o vídeo entra na mesma
// fila das músicas, então nunca tocam dois sons juntos.
import { useSyncExternalStore } from 'react';
import { player, subscribe as subscribePlayer } from './music';
import { loadVideo, markInUse } from './videoFiles';

let el = null;
let counter = 0;
const requests = new Map(); // chave -> { path, container, loop, sound, held, fit, start, onEnded, at }
let current = null;
let curPath = null;
let loadSeq = 0;
let movedAt = 0; // o <video> mudou de caixa (alguns navegadores pausam ao mover)
let snap = { key: null, status: 'idle', ready: false };
const subs = new Set();

const soundKey = (key) => `video:${key}`;

function set(patch) {
  const next = { ...snap, ...patch };
  if (next.key === snap.key && next.status === snap.status && next.ready === snap.ready) return;
  snap = next;
  subs.forEach((fn) => fn());
}

function latest() {
  let top = null;
  for (const [key, r] of requests) if (!top || r.at > top.r.at) top = { key, r };
  return top;
}

function element() {
  if (el) return el;
  el = document.createElement('video');
  el.className = 'vhost';
  el.playsInline = true;
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', '');
  el.setAttribute('disableremoteplayback', '');
  el.disablePictureInPicture = true;
  el.muted = true;
  el.preload = 'auto';
  el.addEventListener('loadeddata', () => set({ ready: true }));
  el.addEventListener('playing', () => set({ status: 'playing', ready: true }));
  el.addEventListener('waiting', () => current && set({ status: 'loading' }));
  el.addEventListener('pause', onPause);
  el.addEventListener('ended', () => {
    const r = current && requests.get(current);
    if (r && !r.loop) r.onEnded?.();
  });
  el.addEventListener('error', () => {
    if (current && el.getAttribute('src')) set({ status: 'error' });
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return el;
}

// quer tocar agora?
function wantsPlay(r) {
  return !!r && !r.held && !document.hidden;
}

// O iPhone pausa o vídeo se o som for ligado sem um toque: volta sem som e
// avisa (o próximo toque na tela libera)
function onPause() {
  const r = current && requests.get(current);
  if (!r || !el.getAttribute('src')) return;
  if (wantsPlay(r) && !el.ended && performance.now() - movedAt < 400) {
    el.play().catch(() => {});
    return;
  }
  if (wantsPlay(r) && !el.ended && !el.muted) {
    el.muted = true;
    player.setBlocked(soundKey(current), true);
    el.play().catch(() => {});
    return;
  }
  if (!wantsPlay(r) || el.ended) set({ status: 'paused' });
}

function audible(key, r) {
  return !!r?.sound && player.audible(soundKey(key));
}

function play(key, r) {
  const v = element();
  v.muted = !audible(key, r);
  const p = v.play();
  if (p && typeof p.then === 'function') {
    p.catch((err) => {
      if (key !== current) return;
      if (err?.name === 'NotAllowedError') {
        if (!v.muted) {
          // com som o navegador não deixou: toca sem som e mostra o aviso
          v.muted = true;
          player.setBlocked(soundKey(key), true);
          v.play().catch(() => {});
        }
      } else if (err?.name !== 'AbortError') set({ status: 'error' });
    });
  }
}

function load(key, r) {
  const v = element();
  const seq = ++loadSeq;
  markInUse(curPath, false);
  curPath = r.path;
  markInUse(curPath, true);
  set({ status: 'loading', ready: false });
  v.removeAttribute('src');
  try {
    v.load();
  } catch {
    /* nada carregado */
  }
  loadVideo(r.path).then(
    (url) => {
      if (seq !== loadSeq) return;
      v.src = url;
      if (r.start) {
        try {
          v.currentTime = r.start;
        } catch {
          /* vai do começo */
        }
      }
      sync();
    },
    () => {
      if (seq !== loadSeq) return;
      set({ status: 'error' });
    }
  );
}

function sync() {
  const v = element();
  const top = latest();
  if (!top) {
    if (!v.paused) v.pause();
    if (current) player.release(soundKey(current));
    current = null;
    v.remove();
    set({ key: null, status: 'idle' });
    return;
  }
  const { key, r } = top;
  if (key !== current) {
    if (current) player.release(soundKey(current));
    current = key;
    set({ key });
  }
  if (r.container && v.parentNode !== r.container) {
    movedAt = performance.now();
    r.container.appendChild(v);
  }
  v.loop = !!r.loop;
  v.style.objectFit = r.fit || ''; // sem fit: quem decide é o CSS da tela
  if (curPath !== r.path) {
    load(key, r);
    return;
  }
  if (!v.getAttribute('src')) return; // ainda baixando
  if (r.sound) player.requestExternal(soundKey(key), { onRetry: () => retry(key), held: r.held });
  else player.release(soundKey(key));
  player.hold(soundKey(key), !!r.held);
  if (wantsPlay(r)) {
    if (v.paused) play(key, r);
    else v.muted = !audible(key, r);
  } else if (!v.paused) v.pause();
}

// chamado durante um toque (liberar o som no iPhone)
function retry(key) {
  const r = requests.get(key);
  if (!el || key !== current || !r) return;
  el.muted = false;
  el.play().catch(() => {});
}

// som ligado/desligado ou o vídeo virou (ou deixou de ser) o som da vez
subscribePlayer(() => {
  const r = current && requests.get(current);
  if (!el || !r || !el.getAttribute('src')) return;
  const want = audible(current, r);
  if (want === !el.muted) return;
  el.muted = !want;
  if (want && el.paused && wantsPlay(r)) play(current, r);
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!el) return;
    if (document.hidden) {
      if (!el.paused) el.pause();
    } else sync();
  });
}

export const videoHost = {
  // pede o <video> para a caixa `container`
  request(key, opts) {
    const r = requests.get(key);
    requests.set(key, { loop: true, sound: false, held: false, fit: 'cover', ...r, ...opts, at: r?.at ?? ++counter });
    sync();
  },
  // muda opções sem trazer para a frente
  update(key, patch) {
    const r = requests.get(key);
    if (!r) return;
    Object.assign(r, patch);
    sync();
  },
  // traz para a frente (ex.: o post que acabou de aparecer)
  focus(key) {
    const r = requests.get(key);
    if (!r) return;
    r.at = ++counter;
    sync();
  },
  release(key) {
    if (!requests.delete(key)) return;
    player.release(soundKey(key));
    sync();
  },
  hold(key, held) {
    const r = requests.get(key);
    if (!r || r.held === held) return;
    r.held = held;
    sync();
  },
  restart(key) {
    if (key !== current || !el) return;
    try {
      el.currentTime = requests.get(key)?.start || 0;
    } catch {
      /* ainda carregando */
    }
  },
  isCurrent: (key) => key === current,
  time: () => (el ? el.currentTime : 0),
  duration: () => (el && Number.isFinite(el.duration) ? el.duration : 0),
  element: () => element(),
  soundKey,
};

export function useVideoHost() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => snap,
    () => snap
  );
}

// Música em posts e stories.
//
// As músicas são as prévias de 30 segundos do Apple Music (grátis e sem conta).
// O banco guarda só título, artista, links e o trecho escolhido (uns 300 bytes);
// o áudio vem direto da Apple, então não gasta o espaço nem o tráfego do Supabase.
//
// Existe um único <audio> no app inteiro, então só uma música toca por vez.
// Quem quer tocar algo faz um "pedido" (request) com uma chave; o pedido mais
// recente ganha. Quando ele é liberado (release), volta a tocar o anterior.
// Vídeos com som entram na mesma fila como pedidos "de fora" (external): o
// <audio> para e quem tem o vídeo liga o som dele (lib/videoHost.js).
import { useSyncExternalStore } from 'react';
import { local } from './storage';

export const CLIP_SECONDS = 15;
const SOUND_KEY = 'fargus-sound';

// ---------------------------------------------------------------------
// Dados da música (vêm do banco, então conferimos antes de usar)
// ---------------------------------------------------------------------
const APPLE = /^https:\/\/([a-z0-9-]+\.)*(apple\.com|mzstatic\.com)\//i;
const APPLE_PAGE = /^https:\/\/([a-z0-9-]+\.)*apple\.com\//i;
const STICKER_STYLES = ['light', 'dark', 'pill'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function cleanMusic(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (typeof m.preview !== 'string' || !APPLE.test(m.preview)) return null;
  const s = m.sticker && typeof m.sticker === 'object' ? m.sticker : null;
  return {
    provider: 'apple',
    id: m.id ?? null,
    title: text(m.title, 200) || 'Música',
    artist: text(m.artist, 200),
    artwork: typeof m.artwork === 'string' && APPLE.test(m.artwork) ? m.artwork : null,
    link: typeof m.link === 'string' && APPLE_PAGE.test(m.link) ? m.link : null,
    preview: m.preview,
    explicit: !!m.explicit,
    start: clamp(num(m.start, 0), 0, 60),
    duration: clamp(num(m.duration, CLIP_SECONDS), 3, 30),
    sticker: s
      ? {
          x: clamp(num(s.x, 0.5), 0, 1),
          y: clamp(num(s.y, 0.7), 0, 1),
          style: STICKER_STYLES.includes(s.style) ? s.style : 'light',
        }
      : null,
  };
}

// Só o que vai para o banco
export function musicForDb(m, extra = {}) {
  if (!m) return null;
  const out = {
    provider: 'apple',
    id: m.id,
    title: text(m.title, 200),
    artist: text(m.artist, 200),
    artwork: m.artwork || null,
    link: m.link || null,
    preview: m.preview,
    start: Math.round(num(m.start, 0) * 10) / 10,
    duration: Math.round(num(m.duration, CLIP_SECONDS) * 10) / 10,
  };
  if (m.explicit) out.explicit = true;
  return { ...out, ...extra };
}

// Capa em outro tamanho (as URLs da Apple aceitam trocar o "100x100bb")
export function artworkUrl(url, size = 100) {
  if (!url) return null;
  return url.replace(/\/\d+x\d+[a-z]*(-\d+)?\.(jpg|jpeg|png|webp)$/i, `/${size}x${size}bb.jpg`);
}

export function musicLabel(m) {
  if (!m) return '';
  return m.artist ? `${m.artist} · ${m.title}` : m.title;
}

export function clipOf(m) {
  return {
    src: m.preview,
    start: m.start || 0,
    duration: m.duration || CLIP_SECONDS,
    meta: { title: m.title, artist: m.artist, artwork: m.artwork },
  };
}

export function formatTime(s) {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------
// Tocador
// ---------------------------------------------------------------------
let el = null;
let counter = 0;
const requests = new Map(); // chave -> { clip, loop, held, at, external, onRetry, blocked }
let current = null; // chave carregada no <audio>
let currentClip = null;
let status = 'idle'; // idle | loading | playing | paused | blocked | error
let soundOn = local.get(SOUND_KEY) !== '0';
let playSeq = 0;
let unlocked = false;
let resumeOnShow = false;
let snapshot = { key: null, status: 'idle', soundOn };
const subs = new Set();

function publish() {
  const next = { key: current, status, soundOn };
  if (next.key === snapshot.key && next.status === snapshot.status && next.soundOn === snapshot.soundOn) return;
  snapshot = next;
  subs.forEach((fn) => fn());
}

function setStatus(s) {
  status = s;
  publish();
}

function audio() {
  if (el) return el;
  el = new Audio();
  el.preload = 'auto';
  el.addEventListener('timeupdate', keepInsideClip);
  el.addEventListener('ended', onEnded);
  el.addEventListener('playing', () => current && setStatus('playing'));
  el.addEventListener('waiting', () => current && !el.paused && setStatus('loading'));
  el.addEventListener('pause', () => status === 'playing' && setStatus('paused'));
  el.addEventListener('loadedmetadata', () => {
    if (currentClip && Math.abs(el.currentTime - currentClip.start) > 0.5) seek(currentClip.start);
  });
  el.addEventListener('error', () => {
    if (current && el.getAttribute('src') !== SILENT) setStatus('error');
  });
  return el;
}

function seek(t) {
  try {
    el.currentTime = t;
  } catch {
    /* antes de carregar, alguns navegadores recusam; o loadedmetadata tenta de novo */
  }
}

function keepInsideClip() {
  const r = current && requests.get(current);
  if (!r || !currentClip) return;
  const end = Math.min(currentClip.start + currentClip.duration, el.duration || Infinity);
  if (el.currentTime >= end - 0.08) {
    if (r.loop) seek(currentClip.start);
    else release(current);
  } else if (el.currentTime < currentClip.start - 0.5) {
    seek(currentClip.start);
  }
}

function onEnded() {
  const r = current && requests.get(current);
  if (!r) return;
  if (r.loop && currentClip) {
    seek(currentClip.start);
    startPlaying();
  } else release(current);
}

function latest() {
  let top = null;
  for (const [key, r] of requests) if (!top || r.at > top.r.at) top = { key, r };
  return top;
}

function sameClip(a, b) {
  return a && b && a.src === b.src && a.start === b.start && a.duration === b.duration;
}

function setMediaSession(meta) {
  if (!('mediaSession' in navigator) || !meta || typeof window.MediaMetadata !== 'function') return;
  try {
    const art = artworkUrl(meta.artwork, 300);
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: meta.title || '',
      artist: meta.artist || '',
      album: 'FargusGram',
      artwork: art ? [{ src: art, sizes: '300x300', type: 'image/jpeg' }] : [],
    });
  } catch {
    /* opcional */
  }
}

function startPlaying() {
  const a = audio();
  const my = ++playSeq;
  if (status !== 'playing') setStatus('loading');
  const p = a.play();
  if (p && typeof p.then === 'function') {
    p.then(
      () => {
        if (my === playSeq) unlocked = true;
      },
      (err) => {
        if (my !== playSeq) return;
        if (err?.name === 'NotAllowedError') setStatus('blocked');
        else if (err?.name !== 'AbortError') setStatus('error');
      }
    );
  }
}

// Decide o que deve tocar agora
function sync() {
  const top = latest();
  const a = el;
  if (!top) {
    if (a && !a.paused) a.pause();
    current = null;
    currentClip = null;
    setStatus('idle');
    return;
  }
  const { key, r } = top;
  if (r.external) {
    // o som é de um vídeo: a música para e o vídeo decide o resto
    if (a && !a.paused) a.pause();
    ++playSeq;
    current = key;
    currentClip = null;
    setStatus(!soundOn || document.hidden || r.held ? 'paused' : r.blocked ? 'blocked' : 'playing');
    return;
  }
  const changed = key !== current || !sameClip(r.clip, currentClip);
  if (!soundOn || document.hidden) {
    if (a && !a.paused) a.pause();
    if (changed) {
      // som desligado: nem carrega, para poupar internet
      current = key;
      currentClip = null;
    }
    setStatus('paused');
    return;
  }
  const au = audio();
  if (changed || !currentClip) {
    const srcChanged = au.getAttribute('src') !== r.clip.src;
    current = key;
    currentClip = r.clip;
    if (srcChanged) au.src = r.clip.src;
    seek(r.clip.start);
    setMediaSession(r.clip.meta);
  }
  if (r.held) {
    // segurado: fica carregado e parado no ponto certo
    ++playSeq;
    if (!au.paused) au.pause();
    setStatus('paused');
    return;
  }
  if (changed || au.paused || status === 'blocked' || status === 'error') startPlaying();
}

export const player = {
  // Pede para tocar um trecho. Chamar de novo com a mesma chave não reinicia.
  request(key, clip, { loop = true, held = false } = {}) {
    const r = requests.get(key);
    if (r && sameClip(r.clip, clip) && r.loop === loop) return;
    requests.set(key, { clip, loop, held: r ? r.held : held, at: r?.at ?? ++counter });
    sync();
  },
  // Som vindo de outro lugar (um vídeo). onRetry é chamado durante um toque,
  // para o vídeo tentar tocar com som quando o navegador tinha bloqueado.
  requestExternal(key, { onRetry, held = false } = {}) {
    const r = requests.get(key);
    if (r?.external) {
      r.onRetry = onRetry;
      return;
    }
    requests.set(key, { clip: null, loop: true, held, at: r?.at ?? ++counter, external: true, onRetry, blocked: false });
    sync();
  },
  // O navegador não deixou o vídeo tocar com som (precisa de um toque)
  setBlocked(key, blocked) {
    const r = requests.get(key);
    if (!r?.external || r.blocked === blocked) return;
    r.blocked = blocked;
    sync();
  },
  // Traz um pedido para a frente (ex.: o post que acabou de aparecer na tela)
  focus(key) {
    const r = requests.get(key);
    if (!r) return;
    r.at = ++counter;
    sync();
  },
  release(key) {
    if (!requests.delete(key)) return;
    sync();
  },
  // Pausa sem esquecer a posição (ex.: segurar o dedo no story)
  hold(key, held) {
    const r = requests.get(key);
    if (!r || r.held === held) return;
    r.held = held;
    sync();
  },
  setSound(on) {
    soundOn = !!on;
    local.set(SOUND_KEY, soundOn ? '1' : '0');
    sync();
    publish();
  },
  // Tenta de novo depois que o navegador bloqueou (precisa ser chamado num toque)
  retry() {
    if (!soundOn) {
      player.setSound(true);
      return;
    }
    const r = current && requests.get(current);
    if (r?.external) {
      r.blocked = false;
      r.onRetry?.();
      sync();
      return;
    }
    if (current && currentClip && r && !r.held) startPlaying();
    else sync();
  },
  // Vídeo pode tocar com som agora? (é o pedido da vez, som ligado, sem bloqueio)
  audible(key) {
    const r = requests.get(key);
    return !!r && current === key && soundOn && !r.held && !r.blocked && !document.hidden;
  },
  time() {
    return el ? el.currentTime : 0;
  },
  duration() {
    return el && Number.isFinite(el.duration) ? el.duration : 0;
  },
  isCurrent(key) {
    return current === key;
  },
};

export const release = player.release;

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function usePlayer() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot
  );
}

// ---------------------------------------------------------------------
// Liberar o som no iPhone
// ---------------------------------------------------------------------
// O Safari só deixa um <audio> tocar sozinho depois que ele tocou uma vez
// durante um toque do usuário. No primeiro toque em qualquer lugar do app,
// tocamos um silêncio curtinho; depois disso as músicas começam sozinhas.
function silentWav() {
  const samples = 800; // 0,1 s a 8 kHz
  const buf = new Uint8Array(44 + samples);
  const dv = new DataView(buf.buffer);
  const str = (o, s) => [...s].forEach((c, i) => (buf[o + i] = c.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + samples, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true);
  dv.setUint32(28, 8000, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  str(36, 'data');
  dv.setUint32(40, samples, true);
  buf.fill(128, 44);
  let bin = '';
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}
const SILENT = typeof btoa === 'function' ? silentWav() : '';

function onGesture(e) {
  // o botão de som resolve sozinho (senão ligaria e desligaria no mesmo toque)
  if (e.target?.closest?.('[data-sound-btn]')) return;
  const top = latest();
  if (top?.r.external) {
    // vídeo bloqueado: o toque libera o som dele
    if (top.r.blocked && soundOn && !top.r.held) {
      top.r.blocked = false;
      top.r.onRetry?.();
      sync();
    }
    return;
  }
  if ((status === 'blocked' || status === 'error') && top && top.key === current && soundOn && !top.r.held) {
    startPlaying();
    return;
  }
  // não atrapalha uma música carregada (pausada ou segurada)
  if (unlocked || currentClip) return;
  const a = audio();
  if (!a.paused) return;
  a.src = SILENT;
  const p = a.play();
  unlocked = true;
  if (p && typeof p.then === 'function') {
    p.then(
      () => {
        if (a.getAttribute('src') === SILENT) a.pause();
      },
      () => {
        if (a.getAttribute('src') === SILENT) unlocked = false;
      }
    );
  }
}

let started = false;
export function initAudioUnlock() {
  if (started || typeof document === 'undefined') return;
  started = true;
  for (const ev of ['touchend', 'click', 'keydown']) {
    document.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
  // app em segundo plano: pausa; ao voltar, continua
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      resumeOnShow = !!(el && !el.paused);
      if (el && !el.paused) el.pause();
      if (current) setStatus('paused');
    } else if (resumeOnShow) {
      resumeOnShow = false;
      sync();
    }
  });
}

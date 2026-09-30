// Vídeos: abrir, cortar (até 15 s), montar cada quadro (recorte, filtro,
// textos por cima) e comprimir no próprio celular antes de enviar.
//
// Sai sempre um MP4 com H.264 (vídeo) e AAC (som), que qualquer celular toca,
// com 540 px de largura e ~0,7 Mbps: um vídeo de 15 s fica com cerca de 1,4 MB
// (uma foto tem uns 300 KB). Isso cuida do 1 GB de espaço e dos 5 GB de
// tráfego por mês do plano grátis do Supabase.
//
// Quem faz o trabalho pesado é a biblioteca Mediabunny, com o WebCodecs do
// navegador (iPhone com iOS 16.4+, Chrome no Android e no computador). Este
// arquivo só é carregado quando alguém escolhe um vídeo.
import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { canvasToBlob } from './media';

export const MAX_SECONDS = 15;
export const MIN_SECONDS = 1;
export const VIDEO_W = 540; // largura do vídeo publicado (story e reel: 540 × 960)
const FPS = 30;
const AUDIO_BITRATE = 64_000;
const AUDIO_RATE = 44_100;

// qualidade dada em bits por segundo (um número solto seria outra escala)
const bps = (n) => new Quality({ bitrate: Math.round(n) });
const even = (n) => Math.max(2, Math.round(n / 2) * 2);
// tamanho do vídeo para uma proporção (largura / altura)
export const videoSize = (aspect) => ({ width: VIDEO_W, height: even(VIDEO_W / aspect) });
// bits por segundo: cerca de 0,045 bit por pixel por quadro (540 × 960 → 0,7 Mbps)
export const videoBitrate = (w, h) => Math.max(350_000, Math.round((w * h * FPS * 0.045) / 10_000) * 10_000);

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function releaseCanvas(c) {
  if (!c) return;
  c.width = 1;
  c.height = 1;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------
// Este navegador consegue preparar vídeos?
// ---------------------------------------------------------------------
const NO_SUPPORT =
  'Este navegador não consegue preparar vídeos. No iPhone, atualize o iOS (16.4 ou mais novo); no Android e no computador, use o Chrome.';
let supportP = null;
export function videoSupport() {
  if (!supportP) {
    supportP = (async () => {
      if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return { ok: false, reason: NO_SUPPORT };
      try {
        if (await canEncodeVideo('avc', { width: VIDEO_W, height: 960, quality: bps(videoBitrate(VIDEO_W, 960)) })) return { ok: true };
      } catch {
        /* sem H.264 */
      }
      return { ok: false, reason: NO_SUPPORT };
    })();
  }
  return supportP;
}

// Alguns navegadores (Chrome no Linux, Firefox) não geram AAC: usa um
// codificador próprio (WebAssembly, ~1 MB, só baixado nesse caso)
let aacP = null;
function ensureAac() {
  if (!aacP) {
    aacP = (async () => {
      try {
        if (await canEncodeAudio('aac', { numberOfChannels: 1, sampleRate: AUDIO_RATE, quality: bps(AUDIO_BITRATE) })) return true;
      } catch {
        /* testa o outro */
      }
      try {
        const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
        registerAacEncoder();
        return true;
      } catch {
        return false;
      }
    })();
  }
  return aacP;
}

// ---------------------------------------------------------------------
// Abrir o vídeo escolhido
// ---------------------------------------------------------------------
// (alguns navegadores falham de vez em quando ao abrir: tenta de novo)
async function loadElement(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await loadElementOnce(url);
    } catch (e) {
      if (i >= tries) throw e;
      await wait(400 * i);
    }
  }
}
function loadElementOnce(url) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.preload = 'auto';
    let done = false;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, new Error('Não consegui abrir esse vídeo.')), 20000);
    el.addEventListener('loadeddata', () => finish(resolve, el), { once: true });
    el.addEventListener('error', () => finish(reject, new Error('Este aparelho não consegue abrir esse vídeo. Tente outro, ou grave de novo.')), { once: true });
    el.src = url;
    el.load();
  });
}

function seekElement(el, t) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener('seeked', done);
      resolve();
    };
    el.addEventListener('seeked', done);
    timer = setTimeout(done, 3000);
    try {
      el.currentTime = t;
    } catch {
      done();
    }
  });
}

async function decodeImage(blob) {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    await new Promise((res) => {
      img.onload = res;
      img.onerror = res;
    });
  }
  return { url, img };
}

// Um quadro do vídeo como imagem (miniaturas, cores do fundo do story)
export async function frameAt(el, t, maxSide = 720) {
  await seekElement(el, t);
  const vw = el.videoWidth || 1;
  const vh = el.videoHeight || 1;
  const sc = Math.min(1, maxSide / Math.max(vw, vh));
  const c = newCanvas(vw * sc, vh * sc);
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.82);
  const out = { ...(await decodeImage(blob)), width: c.width, height: c.height };
  releaseCanvas(c);
  return out;
}

// Devolve { video: true, file, url, width, height, duration, start, end,
// hasAudio, poster: { url, img, width, height } }. `url` é o arquivo original
// (para a prévia); width/height já vêm girados como o vídeo aparece.
export async function openVideo(file) {
  if (file.type && !file.type.startsWith('video/')) throw new Error('Escolha um arquivo de vídeo.');
  if (file.size > 500 * 1024 * 1024) throw new Error('Esse vídeo é grande demais. Escolha um mais curto.');
  // .mov do iPhone é quase igual a um .mp4; alguns navegadores só tocam com esse nome
  const url = URL.createObjectURL(/quicktime/i.test(file.type) ? new Blob([file], { type: 'video/mp4' }) : file);
  let el = null;
  try {
    el = await loadElement(url);
    let width = el.videoWidth;
    let height = el.videoHeight;
    let duration = el.duration;
    let hasAudio = true;
    let decodable = false;
    let fps = FPS;
    let rotation = 0;
    try {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      const vt = await input.getPrimaryVideoTrack();
      if (vt) {
        width = vt.displayWidth || width;
        height = vt.displayHeight || height;
        decodable = await vt.canDecode();
        rotation = (await vt.getRotation().catch(() => 0)) || 0;
        const stats = await vt.computePacketStats(60).catch(() => null);
        if (stats?.averagePacketRate > 1) fps = stats.averagePacketRate;
      }
      hasAudio = !!(await input.getPrimaryAudioTrack());
      const d = await input.computeDuration();
      if (Number.isFinite(d) && d > 0) duration = d;
      input.dispose?.();
    } catch {
      /* o aparelho toca, mas não deu para ler o arquivo: vai pelo caminho mais lento */
    }
    if (!width || !height || !Number.isFinite(duration) || duration <= 0) throw new Error('Não consegui abrir esse vídeo.');
    if (duration < 0.5) throw new Error('Esse vídeo é curto demais.');
    const poster = await frameAt(el, Math.min(0.05, duration / 2));
    return { video: true, file, url, width, height, duration, fps, rotation, hasAudio, decodable, start: 0, end: Math.min(duration, MAX_SECONDS), poster };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  } finally {
    if (el) {
      el.removeAttribute('src');
      el.load();
    }
  }
}

export function revokeVideo(v) {
  if (!v?.video) return;
  URL.revokeObjectURL(v.url);
  if (v.poster?.url) URL.revokeObjectURL(v.poster.url);
}

// ---------------------------------------------------------------------
// Exportar
// compose(ctx, frame): desenha um quadro do vídeo final no ctx (width × height).
//   frame = { width, height, draw(ctx, sx, sy, sw, sh, dx, dy, dw, dh) }, em
//   pixels do vídeo como ele aparece (já girado).
// Devolve { blob (mp4), poster (jpeg), width, height, duration, hasAudio }.
// ---------------------------------------------------------------------
export class VideoCanceled extends Error {
  constructor() {
    super('Cancelado');
    this.name = 'VideoCanceled';
  }
}

// medidas sempre em pixels do vídeo original (o quadro pode vir reduzido)
function sampleFrame(sample, width, height) {
  const kx = sample.displayWidth / width;
  const ky = sample.displayHeight / height;
  return {
    width,
    height,
    draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => sample.draw(ctx, sx * kx, sy * ky, sw * kx, sh * ky, dx, dy, dw, dh),
  };
}
function elementFrame(el, width, height) {
  // o <video> desenhado num canvas já sai girado; as medidas dele podem vir
  // num tamanho diferente do que lemos do arquivo, então convertemos
  const kx = (el.videoWidth || width) / width;
  const ky = (el.videoHeight || height) / height;
  return {
    width,
    height,
    draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => ctx.drawImage(el, sx * kx, sy * ky, sw * kx, sh * ky, dx, dy, dw, dh),
  };
}

// detail: quantos pixels do vídeo final cada pixel do original ocupa, no
// máximo (serve para girar vídeos "deitados" já num tamanho menor)
export async function exportVideo(src, { width, height, compose, keepAudio = true, onProgress, signal, readsPixels = false, detail }) {
  const start = Math.max(0, src.start || 0);
  const end = Math.min(src.duration, src.end || src.duration, start + MAX_SECONDS);
  const canvas = newCanvas(width, height);
  const ctx = canvas.getContext('2d', readsPixels ? { willReadFrequently: true } : undefined);
  let poster = null;
  const paint = (frame) => {
    ctx.save();
    compose(ctx, frame);
    ctx.restore();
    if (!poster) {
      poster = newCanvas(width, height);
      poster.getContext('2d').drawImage(canvas, 0, 0);
    }
  };
  const opts = { start, end, width, height, keepAudio: keepAudio && src.hasAudio, onProgress, signal, detail: detail ?? Math.max(width / src.width, height / src.height) };
  let out = null;
  try {
    if (src.decodable && !globalThis.__fgVideoFallback) {
      try {
        out = await viaWebCodecs(src, canvas, paint, opts);
      } catch (e) {
        if (e instanceof VideoCanceled) throw e;
        // algum detalhe do arquivo que o caminho rápido não aceita: vai pelo lento
        console.warn('vídeo: caminho rápido falhou, tentando tocando o vídeo:', e?.message, e);
        out = null;
      }
      if (!out) {
        releaseCanvas(poster);
        poster = null;
      }
    }
    if (!out) out = await viaElement(src, canvas, paint, opts);
    if (!poster) throw new Error('Não consegui preparar o vídeo.');
    const posterBlob = await canvasToBlob(poster, 'image/jpeg', 0.8);
    return { blob: out.blob, poster: posterBlob, width, height, duration: end - start, hasAudio: out.hasAudio };
  } finally {
    releaseCanvas(poster);
    releaseCanvas(canvas);
  }
}

// Caminho rápido: o navegador decodifica o vídeo quadro a quadro (mais
// rápido que tocar) e a Mediabunny corta, remonta e comprime
async function viaWebCodecs(src, canvas, paint, { start, end, width, height, keepAudio, onProgress, signal, detail }) {
  const audioOk = keepAudio && (await ensureAac());
  const input = new Input({ source: new BlobSource(src.file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  // vídeo gravado "deitado" (com giro no arquivo): a biblioteca endireita cada
  // quadro antes de nos entregar; endireitar já reduzido sai bem mais leve
  const k = src.rotation ? Math.min(1, Math.max(0.25, (detail || 1) * 1.15)) : 1;
  const size = k < 1 ? { width: Math.round((src.width * k) / 2) * 2, height: Math.round((src.height * k) / 2) * 2, fit: 'fill' } : {};
  try {
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      trim: { start, end },
      showWarnings: false,
      video: {
        codec: 'avc',
        quality: bps(videoBitrate(width, height)),
        frameRate: Math.min(FPS, Math.round(src.fps || FPS)),
        forceTranscode: true,
        allowTransformationMetadata: false,
        ...size,
        processedWidth: width,
        processedHeight: height,
        process: (sample) => {
          paint(sampleFrame(sample, src.width, src.height));
          return canvas;
        },
      },
      audio: audioOk ? { codec: 'aac', quality: bps(AUDIO_BITRATE), numberOfChannels: 1, sampleRate: AUDIO_RATE, forceTranscode: true } : { discard: true },
    });
    const videoGone = conversion.discardedTracks.find((d) => d.track.type === 'video' && d.reason !== 'discarded_by_user');
    if (videoGone || !conversion.isValid) return null; // tenta pelo caminho lento
    const hasAudio = audioOk && !conversion.discardedTracks.some((d) => d.track.type === 'audio');
    if (onProgress) conversion.onProgress = (p) => onProgress(Math.min(0.99, p));
    const abort = () => conversion.cancel();
    signal?.addEventListener('abort', abort);
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener('abort', abort);
    }
    if (signal?.aborted) throw new VideoCanceled();
    if (!target.buffer) throw new Error('Não consegui preparar o vídeo.');
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), hasAudio };
  } catch (e) {
    if (signal?.aborted) throw new VideoCanceled();
    throw e;
  } finally {
    input.dispose?.();
  }
}

// Caminho lento (vídeos que o WebCodecs não abre, mas o aparelho toca, como
// alguns HEVC): toca o trecho sem som e grava cada quadro que aparece
async function viaElement(src, canvas, paint, { start, end, width, height, keepAudio, onProgress, signal }) {
  const el = await loadElement(src.url);
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const videoSource = new CanvasSource(canvas, { codec: 'avc', quality: bps(videoBitrate(width, height)), keyFrameInterval: 2 });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  // som: decodificado à parte (AAC quase todo aparelho abre)
  let audioTrack = null;
  let audioSource = null;
  let input = null;
  if (keepAudio && (await ensureAac())) {
    try {
      input = new Input({ source: new BlobSource(src.file), formats: ALL_FORMATS });
      audioTrack = await input.getPrimaryAudioTrack();
      if (audioTrack && (await audioTrack.canDecode())) {
        audioSource = new AudioSampleSource({ codec: 'aac', quality: bps(AUDIO_BITRATE), transform: { numberOfChannels: 1, sampleRate: AUDIO_RATE } });
        output.addAudioTrack(audioSource);
      }
    } catch {
      audioSource = null;
    }
  }

  await output.start();
  let canceled = false;
  const abort = () => {
    canceled = true;
    el.pause();
  };
  signal?.addEventListener('abort', abort);
  try {
    if (audioSource) {
      const sink = new AudioSampleSink(audioTrack);
      for await (const sample of sink.samples(start, end)) {
        if (canceled) {
          sample.close();
          break;
        }
        const t = sample.timestamp - start;
        if (t < 0 || t >= end - start) {
          sample.close();
          continue;
        }
        sample.setTimestamp(t);
        await audioSource.add(sample);
        sample.close();
      }
      audioSource.close();
    }

    await seekElement(el, start);
    const total = end - start;
    let last = -1;
    let resolveDone;
    const done = new Promise((r) => (resolveDone = r));
    const queue = [];
    let busy = Promise.resolve();
    const onFrame = (mediaTime) => {
      const t = mediaTime - start;
      if (canceled || t >= total - 0.001 || el.ended) {
        el.pause();
        resolveDone();
        return false;
      }
      if (t >= 0 && t > last + 1 / (FPS + 1)) {
        last = t;
        paint(elementFrame(el, src.width, src.height));
        queue.push(t);
        busy = busy.then(() => videoSource.add(t, 1 / FPS));
        onProgress?.(Math.min(0.99, t / total));
      }
      return true;
    };
    if (typeof el.requestVideoFrameCallback === 'function') {
      const loop = (_, meta) => {
        if (onFrame(meta.mediaTime)) el.requestVideoFrameCallback(loop);
      };
      el.requestVideoFrameCallback(loop);
    } else {
      const loop = () => {
        if (onFrame(el.currentTime)) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    el.addEventListener('ended', () => resolveDone(), { once: true });
    await el.play();
    // segurança: se o vídeo travar, termina depois do tempo do trecho
    await Promise.race([done, wait((total + 8) * 1000)]);
    el.pause();
    await busy;
    if (canceled) throw new VideoCanceled();
    if (!queue.length) throw new Error('Não consegui preparar o vídeo.');
    videoSource.close();
    await output.finalize();
    return { blob: new Blob([target.buffer], { type: 'video/mp4' }), hasAudio: !!audioSource };
  } catch (e) {
    if (output.state === 'started') await output.cancel().catch(() => {});
    if (canceled) throw new VideoCanceled();
    throw e;
  } finally {
    signal?.removeEventListener('abort', abort);
    input?.dispose?.();
    el.removeAttribute('src');
    el.load();
  }
}

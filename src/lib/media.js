// Processamento de imagens no próprio celular: redimensiona, recorta,
// aplica filtro e comprime antes de enviar (economiza os 1 GB grátis).

import { canvasFont, fontOf, loadFonts } from './fonts';

export const POST_WIDTH = 1080;
export const THUMB_WIDTH = 480;
export const STORY_W = 1080;
export const STORY_H = 1920;

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar a imagem'))), type, quality);
    } else {
      const data = canvas.toDataURL(type, quality);
      const bin = atob(data.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      resolve(new Blob([arr], { type }));
    }
  });
}

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function releaseCanvas(c) {
  // Safari guarda a memória do canvas se não zerarmos
  c.width = 1;
  c.height = 1;
}

async function decode(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    await new Promise((res, rej) => {
      if (img.complete && img.naturalWidth) return res();
      img.onload = res;
      img.onerror = () => rej(new Error('Não consegui abrir essa imagem. Tente uma foto JPG ou PNG.'));
    });
  }
  if (!img.naturalWidth) throw new Error('Não consegui abrir essa imagem. Tente uma foto JPG ou PNG.');
  return img;
}

// Abre a foto escolhida e já reduz para no máximo `maxSide` px (poupa memória do celular)
export async function prepareImage(file, maxSide = 2048) {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  const srcUrl = URL.createObjectURL(file);
  try {
    const img = await decode(srcUrl);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = newCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    releaseCanvas(canvas);
    const url = URL.createObjectURL(blob);
    const out = await decode(url);
    return { url, img: out, width: w, height: h };
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

// ---------------------------------------------------------------------
// Filtros (mesma matemática dos filtros CSS, para a prévia bater com o resultado)
// ---------------------------------------------------------------------
export const FILTERS = [
  { id: 'normal', name: 'Normal', ops: [] },
  { id: 'fissura', name: 'Fissura', ops: [['contrast', 1.12], ['saturate', 1.15], ['hue-rotate', -10], ['brightness', 1.03]] },
  { id: 'brasa', name: 'Brasa', ops: [['sepia', 0.22], ['saturate', 1.4], ['contrast', 1.06], ['brightness', 1.04]] },
  { id: 'nevoa', name: 'Névoa', ops: [['contrast', 0.85], ['brightness', 1.1], ['saturate', 0.8]] },
  { id: 'aurora', name: 'Aurora', ops: [['hue-rotate', 14], ['saturate', 1.3], ['contrast', 1.05]] },
  { id: 'reliquia', name: 'Relíquia', ops: [['sepia', 0.5], ['contrast', 0.95], ['brightness', 1.06], ['saturate', 0.9]] },
  { id: 'noir', name: 'Noir', ops: [['grayscale', 1], ['contrast', 1.25], ['brightness', 0.96]] },
  { id: 'eco', name: 'Eco', ops: [['grayscale', 1], ['sepia', 0.35], ['contrast', 1.05]] },
];

export function filterCss(id) {
  const f = FILTERS.find((x) => x.id === id);
  if (!f || !f.ops.length) return 'none';
  return f.ops.map(([op, v]) => (op === 'hue-rotate' ? `hue-rotate(${v}deg)` : `${op}(${v})`)).join(' ');
}

// matrizes 4x4 (rgb + deslocamento), valores em 0..1
function opMatrix(op, v) {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  switch (op) {
    case 'brightness':
      return [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0, 0, 0, 0, 1];
    case 'contrast': {
      const t = 0.5 - 0.5 * v;
      return [v, 0, 0, t, 0, v, 0, t, 0, 0, v, t, 0, 0, 0, 1];
    }
    case 'saturate': {
      const s = v;
      return [
        0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0,
        0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0,
        0, 0, 0, 1,
      ];
    }
    case 'grayscale': {
      const a = 1 - Math.min(1, v);
      return [
        0.2126 + 0.7874 * a, 0.7152 - 0.7152 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 + 0.2848 * a, 0.0722 - 0.0722 * a, 0,
        0.2126 - 0.2126 * a, 0.7152 - 0.7152 * a, 0.0722 + 0.9278 * a, 0,
        0, 0, 0, 1,
      ];
    }
    case 'sepia': {
      const a = 1 - Math.min(1, v);
      return [
        0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a, 0,
        0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a, 0,
        0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a, 0,
        0, 0, 0, 1,
      ];
    }
    case 'hue-rotate': {
      const r = (v * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
        0, 0, 0, 1,
      ];
    }
    default:
      return I;
  }
}

function mul(a, b) {
  // a * b (4x4, linha-maior)
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) o[i * 4 + j] += a[i * 4 + k] * b[k * 4 + j];
  return o;
}

function applyFilter(ctx, w, h, filterId) {
  const f = FILTERS.find((x) => x.id === filterId);
  if (!f || !f.ops.length) return;
  // composição na ordem do CSS: a primeira operação é aplicada primeiro
  let m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const [op, v] of f.ops) m = mul(opMatrix(op, v), m);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [a0, a1, a2, a3, b0, b1, b2, b3, c0, c1, c2, c3] = m;
  const o0 = a3 * 255, o1 = b3 * 255, o2 = c3 * 255;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = a0 * r + a1 * g + a2 * b + o0;
    d[i + 1] = b0 * r + b1 * g + b2 * b + o1;
    d[i + 2] = c0 * r + c1 * g + c2 * b + o2;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------
// Recorte + filtro + compressão
// crop = { sx, sy, sw, sh } em pixels da imagem de origem
// ---------------------------------------------------------------------
export async function renderCrop(img, crop, outW, outH, filterId = 'normal', layers = null) {
  const canvas = newCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  applyFilter(ctx, canvas.width, canvas.height, filterId);
  await drawLayers(ctx, layers, canvas.width, canvas.height); // textos e fotos por cima (sem filtro)
  const full = await canvasToBlob(canvas, 'image/jpeg', 0.85);

  // miniatura para as grades (perfil / explorar)
  const tw = Math.min(THUMB_WIDTH, canvas.width);
  const th = Math.round((canvas.height * tw) / canvas.width);
  const t = newCanvas(tw, th);
  const tctx = t.getContext('2d');
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(canvas, 0, 0, tw, th);
  const thumb = await canvasToBlob(t, 'image/jpeg', 0.8);
  releaseCanvas(t);
  releaseCanvas(canvas);
  return { full, thumb, width: Math.round(outW), height: Math.round(outH) };
}

// Foto de perfil: quadrada, 400 px
export async function renderAvatar(img, crop) {
  const canvas = newCanvas(400, 400);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, 400, 400);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.88);
  releaseCanvas(canvas);
  return blob;
}

// Foto para mensagem direta: lado maior 1280 px, sem recorte
export async function renderDmImage(img) {
  const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = newCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.84);
  releaseCanvas(canvas);
  return { blob, width: w, height: h };
}

// ---------------------------------------------------------------------
// Story: fundo (foto recortada ou degradê) + textos
// ---------------------------------------------------------------------
export const STORY_BACKGROUNDS = [
  ['#0f172a', '#6d28d9'],
  ['#06b6d4', '#8b5cf6'],
  ['#f97316', '#db2777'],
  ['#10b981', '#0e7490'],
  ['#111827', '#374151'],
  ['#fde68a', '#f472b6'],
  ['#1e3a8a', '#0ea5e9'],
  ['#450a0a', '#b91c1c'],
];

// Fundo em degradê com as cores da própria foto (de cima e de baixo, um
// pouco mais escuras), como no Instagram quando a foto não cobre o story todo
export function photoColors(img) {
  try {
    const c = newCanvas(4, 8);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 4, 8);
    const d = ctx.getImageData(0, 0, 4, 8).data;
    releaseCanvas(c);
    const avg = (y0, y1) => {
      const t = [0, 0, 0];
      for (let y = y0; y < y1; y++)
        for (let x = 0; x < 4; x++) for (let k = 0; k < 3; k++) t[k] += d[(y * 4 + x) * 4 + k];
      const n = (y1 - y0) * 4;
      const hex = t.map((v) => Math.round((v / n) * 0.72).toString(16).padStart(2, '0')).join('');
      return `#${hex}`;
    };
    return [avg(0, 2), avg(6, 8)];
  } catch {
    return null;
  }
}

export const STORY_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function wrapLines(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else {
        out.push(line);
        line = words[i];
      }
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------
// Camadas por cima da imagem (story e publicação): textos e fotos
//   x, y: centro (0..1 da largura/altura); rot: giro em radianos;
//   scale: zoom da pinça; z: ordem (maior fica por cima)
//   texto: size em px numa imagem de 1080 de largura; font: id em fonts.js
//   foto: image = { img, width, height }; w = largura (fração da imagem)
// ---------------------------------------------------------------------
export const LAYER_REF_W = 1080;
export const TEXT_WRAP = 0.84; // o texto quebra linha em 84% da largura

export const layerOrder = (layers) => [...(layers || [])].sort((a, b) => (a.z || 0) - (b.z || 0));

function drawTextLayer(ctx, l, W) {
  const font = fontOf(l.font);
  const size = l.size * (W / LAYER_REF_W);
  const sc = l.scale || 1;
  ctx.font = canvasFont(font, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrapLines(ctx, font.upper ? l.text.toUpperCase() : l.text, W * TEXT_WRAP);
  const lh = size * font.lh;
  const top = -(lines.length * lh) / 2;
  lines.forEach((line, i) => {
    const y = top + lh * i + lh / 2;
    if (l.boxed) {
      const w = ctx.measureText(line).width + size * 0.7;
      ctx.fillStyle = l.color === '#ffffff' ? 'rgba(0,0,0,0.78)' : '#ffffff';
      roundRect(ctx, -w / 2, y - lh / 2, w, lh, size * 0.28);
      ctx.fill();
      ctx.fillStyle = l.color === '#ffffff' ? '#ffffff' : l.color;
    } else {
      ctx.fillStyle = l.color;
      // a sombra não acompanha o zoom do canvas: ajusta na mão
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = size * 0.18 * sc;
      ctx.shadowOffsetY = size * 0.04 * sc;
    }
    ctx.fillText(line, 0, y);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
}

// cantos arredondados e sombra (iguais aos da tela)
export const photoRadius = (w, h) => Math.min(w, h) * 0.04;
// story repostado: cartão mais arredondado, com o @ de quem fez no canto
export const layerRadius = (l, w, h) => (l.repost ? Math.min(w, h) * 0.07 : photoRadius(w, h));
export function repostBadge(w) {
  return { left: w * 0.05, top: w * 0.05, height: w * 0.085, fontSize: w * 0.042, padX: w * 0.035 };
}
function drawRepostBadge(ctx, l, w, h) {
  const b = repostBadge(w);
  ctx.save();
  ctx.font = `600 ${b.fontSize}px ${STORY_FONT}`;
  const text = `@${l.repost.handle}`;
  const bw = ctx.measureText(text).width + b.padX * 2;
  const x = -w / 2 + b.left;
  const y = -h / 2 + b.top;
  roundRect(ctx, x, y, bw, b.height, b.height / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + b.padX, y + b.height / 2);
  ctx.restore();
}

function drawPhotoLayer(ctx, l, W) {
  const w = l.w * W;
  const h = w * (l.image.height / l.image.width);
  // foto principal do story: sem cantos arredondados nem sombra
  if (l.base) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(l.image.img, -w / 2, -h / 2, w, h);
    return;
  }
  const r = layerRadius(l, w, h);
  const k = (W / LAYER_REF_W) * (l.scale || 1);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 24 * k;
  ctx.shadowOffsetY = 6 * k;
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(l.image.img, -w / 2, -h / 2, w, h);
  ctx.restore();
  if (l.repost) drawRepostBadge(ctx, l, w, h);
}

export async function drawLayers(ctx, layers, W, H) {
  if (!layers?.length) return;
  await loadFonts(layers.filter((l) => l.kind === 'text').map((l) => l.font));
  for (const l of layerOrder(layers)) {
    if (l.kind === 'text' && !l.text?.trim()) continue;
    if (l.kind !== 'text' && l.kind !== 'photo') continue; // figurinhas vão como dados, não na foto
    ctx.save();
    ctx.translate(l.x * W, l.y * H);
    ctx.rotate(l.rot || 0);
    ctx.scale(l.scale || 1, l.scale || 1);
    if (l.kind === 'photo') drawPhotoLayer(ctx, l, W);
    else drawTextLayer(ctx, l, W);
    ctx.restore();
  }
}

// layers: textos e fotos (veja acima)
// stickers: [{ canvas, x, y }] (adesivos já desenhados em pixels do story)
export async function renderStory({ img, crop, gradient, filterId, layers, stickers }) {
  const canvas = newCanvas(STORY_W, STORY_H);
  const ctx = canvas.getContext('2d');
  if (img && crop) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, STORY_W, STORY_H);
    applyFilter(ctx, STORY_W, STORY_H, filterId);
  } else {
    const [a, b] = gradient || STORY_BACKGROUNDS[0];
    const g = ctx.createLinearGradient(0, 0, STORY_W, STORY_H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
  }

  await drawLayers(ctx, layers, STORY_W, STORY_H);

  // adesivo da música por cima de tudo
  for (const st of stickers || []) {
    ctx.drawImage(st.canvas, Math.round(st.x * STORY_W - st.canvas.width / 2), Math.round(st.y * STORY_H - st.canvas.height / 2));
  }

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
  // miniatura (capas dos destaques e arquivo): 1/4 do tamanho, uns 15 KB
  const t = newCanvas(STORY_W / 4, STORY_H / 4);
  const tctx = t.getContext('2d');
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(canvas, 0, 0, t.width, t.height);
  const thumb = await canvasToBlob(t, 'image/jpeg', 0.8);
  releaseCanvas(t);
  releaseCanvas(canvas);
  return { blob, thumb, width: STORY_W, height: STORY_H };
}

// ---------------------------------------------------------------------
// Figurinhas (como as do WhatsApp): quadrado de 512 px com fundo
// transparente, em WebP (PNG onde o navegador não gera WebP)
//   shape: 'square' | 'round' | 'rounded'
//   removeWhite: apaga o fundo branco (ou quase) que encosta nas beiradas
//   outline: contorno branco em volta, como uma figurinha de verdade
//   text: legenda embaixo (fonte "Forte", branca com borda preta)
// ---------------------------------------------------------------------
export const STICKER_SIZE = 512;

// apaga o fundo claro ligado às beiradas (preenchimento a partir das bordas)
function clearWhiteBackground(ctx, x0, y0, w, h) {
  const data = ctx.getImageData(x0, y0, w, h);
  const d = data.data;
  const whiteness = (i) => {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max - min > 38 ? 0 : min; // colorido não conta como fundo
  };
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const k = y * w + x;
    if (seen[k]) return;
    seen[k] = 1;
    if (d[k * 4 + 3] > 0 && whiteness(k * 4) >= 222) stack.push(k);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  const cleared = new Uint8Array(w * h);
  while (stack.length) {
    const k = stack.pop();
    cleared[k] = 1;
    d[k * 4 + 3] = 0;
    const x = k % w;
    const y = (k - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  // suaviza a beirada: pixels claros encostados no que foi apagado ficam meio transparentes
  for (let k = 0; k < w * h; k++) {
    if (cleared[k]) continue;
    const x = k % w;
    const y = (k - x) / w;
    const near = (x > 0 && cleared[k - 1]) || (x < w - 1 && cleared[k + 1]) || (y > 0 && cleared[k - w]) || (y < h - 1 && cleared[k + w]);
    if (!near) continue;
    const wh = whiteness(k * 4);
    if (wh > 170) d[k * 4 + 3] = Math.round(d[k * 4 + 3] * (1 - (wh - 170) / 110));
  }
  ctx.putImageData(data, x0, y0);
}

// desenha a figurinha num canvas do tamanho pedido (para a prévia e para o arquivo)
export async function drawSticker(img, crop, { shape = 'square', removeWhite = false, outline = true, text = '' } = {}, size = STICKER_SIZE) {
  const canvas = newCanvas(size, size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const pad = Math.round(size * (outline ? 0.05 : 0.015));
  const inner = size - pad * 2;
  const base = newCanvas(size, size);
  const b = base.getContext('2d', { willReadFrequently: true });
  b.imageSmoothingQuality = 'high';
  b.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, pad, pad, inner, inner);
  if (removeWhite) clearWhiteBackground(b, pad, pad, inner, inner);
  if (shape !== 'square') {
    b.globalCompositeOperation = 'destination-in';
    b.fillStyle = '#000';
    if (shape === 'round') {
      b.beginPath();
      b.arc(size / 2, size / 2, inner / 2, 0, Math.PI * 2);
      b.fill();
    } else {
      roundRect(b, pad, pad, inner, inner, inner * 0.2);
      b.fill();
    }
    b.globalCompositeOperation = 'source-over';
  }
  const caption = text.trim().toUpperCase();
  if (caption) {
    await loadFonts(['forte']);
    const font = fontOf('forte');
    let fs = inner * 0.17;
    b.font = canvasFont(font, fs);
    let lines = wrapLines(b, caption, inner * 0.92).slice(0, 2);
    if (lines.some((l) => b.measureText(l).width > inner * 0.95)) {
      fs *= 0.8;
      b.font = canvasFont(font, fs);
      lines = wrapLines(b, caption, inner * 0.92).slice(0, 2);
    }
    b.textAlign = 'center';
    b.textBaseline = 'alphabetic';
    b.lineJoin = 'round';
    const lh = fs * 0.95;
    let y = pad + inner * 0.95 - lh * (lines.length - 1);
    for (const line of lines) {
      b.lineWidth = fs * 0.16;
      b.strokeStyle = '#000';
      b.strokeText(line, size / 2, y);
      b.fillStyle = '#fff';
      b.fillText(line, size / 2, y);
      y += lh;
    }
  }
  if (outline) {
    // contorno: a figura repetida em volta, pintada de branco, por baixo
    const r = pad * 0.8;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.drawImage(base, Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(base, 0, 0);
  releaseCanvas(base);
  return canvas;
}

export async function renderSticker(img, crop, opts) {
  const canvas = await drawSticker(img, crop, opts, STICKER_SIZE);
  let blob = await canvasToBlob(canvas, 'image/webp', 0.9);
  if (blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/png');
  releaseCanvas(canvas);
  return { blob, width: STICKER_SIZE, height: STICKER_SIZE };
}

// ---------------------------------------------------------------------
// Vídeo: cada quadro é montado com as mesmas contas da foto (recorte, filtro,
// camadas). Quem comprime é lib/videoEdit.js. O que fica parado (fundo,
// textos, fotos por cima) é desenhado uma vez só e reaproveitado.
// ---------------------------------------------------------------------
async function layersCanvas(layers, W, H, background) {
  if (!layers?.length && !background) return null;
  const c = newCanvas(W, H);
  const ctx = c.getContext('2d');
  if (background) background(ctx);
  await drawLayers(ctx, layers, W, H);
  return c;
}

// Publicação: recorte + filtro + camadas por cima. crop em pixels do vídeo.
export async function postVideoComposer({ crop, filterId = 'normal', layers, width: W, height: H }) {
  const over = await layersCanvas(layers, W, H);
  const filtered = !!FILTERS.find((f) => f.id === filterId)?.ops.length;
  return {
    readsPixels: filtered,
    compose(ctx, frame) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingQuality = 'high';
      frame.draw(ctx, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, W, H);
      if (filtered) applyFilter(ctx, W, H, filterId);
      if (over) ctx.drawImage(over, 0, 0);
    },
    release: () => over && releaseCanvas(over),
  };
}

// Story: fundo (degradê) + camadas de trás + o vídeo (na posição da camada
// dele) + camadas da frente + adesivo da música (em pixels do story de 1080)
export async function storyVideoComposer({ gradient, layers, stickers, width: W, height: H }) {
  const video = layers.find((l) => l.kind === 'photo' && l.image?.video);
  const vz = video.z || 0;
  const rest = layers.filter((l) => l !== video);
  const [a, b] = gradient || STORY_BACKGROUNDS[0];
  const under = await layersCanvas(
    rest.filter((l) => (l.z || 0) < vz),
    W,
    H,
    (ctx) => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  );
  const k = W / STORY_W;
  const front = rest.filter((l) => (l.z || 0) >= vz);
  // camadas da frente e, por cima de tudo, o adesivo da música (como na foto)
  const over =
    front.length || stickers?.length
      ? await (async () => {
          const c = (await layersCanvas(front, W, H)) || newCanvas(W, H);
          const cx = c.getContext('2d');
          for (const st of stickers || []) {
            cx.drawImage(st.canvas, st.x * W - (st.canvas.width * k) / 2, st.y * H - (st.canvas.height * k) / 2, st.canvas.width * k, st.canvas.height * k);
          }
          return c;
        })()
      : null;
  const w = video.w * W;
  const h = w * (video.image.height / video.image.width);
  // vídeo por cima (story repostado): cantos arredondados, sombra e o @ (como a foto)
  const r = layerRadius(video, w, h);
  const sk = (W / LAYER_REF_W) * (video.scale || 1);
  return {
    readsPixels: false,
    compose(ctx, frame) {
      ctx.drawImage(under, 0, 0);
      ctx.save();
      ctx.translate(video.x * W, video.y * H);
      ctx.rotate(video.rot || 0);
      ctx.scale(video.scale || 1, video.scale || 1);
      ctx.imageSmoothingQuality = 'high';
      if (video.base) frame.draw(ctx, 0, 0, frame.width, frame.height, -w / 2, -h / 2, w, h);
      else {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 24 * sk;
        ctx.shadowOffsetY = 6 * sk;
        roundRect(ctx, -w / 2, -h / 2, w, h, r);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
        ctx.save();
        roundRect(ctx, -w / 2, -h / 2, w, h, r);
        ctx.clip();
        frame.draw(ctx, 0, 0, frame.width, frame.height, -w / 2, -h / 2, w, h);
        ctx.restore();
        if (video.repost) drawRepostBadge(ctx, video, w, h);
      }
      ctx.restore();
      if (over) ctx.drawImage(over, 0, 0);
    },
    release: () => [under, over].forEach((c) => c && releaseCanvas(c)),
  };
}

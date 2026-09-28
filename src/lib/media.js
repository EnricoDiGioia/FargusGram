// Processamento de imagens no próprio celular: redimensiona, recorta,
// aplica filtro e comprime antes de enviar (economiza os 1 GB grátis).

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
export async function renderCrop(img, crop, outW, outH, filterId = 'normal') {
  const canvas = newCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  applyFilter(ctx, canvas.width, canvas.height, filterId);
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

// texts: [{ text, x, y (0..1 do centro), size (px no canvas 1080), color, boxed }]
// stickers: [{ canvas, x, y }] (adesivos já desenhados em pixels do story)
export async function renderStory({ img, crop, gradient, filterId, texts, stickers }) {
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

  for (const st of stickers || []) {
    ctx.drawImage(st.canvas, Math.round(st.x * STORY_W - st.canvas.width / 2), Math.round(st.y * STORY_H - st.canvas.height / 2));
  }

  for (const t of texts || []) {
    if (!t.text?.trim()) continue;
    const size = t.size;
    ctx.font = `700 ${size}px ${STORY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = wrapLines(ctx, t.text, STORY_W * 0.84);
    const lh = size * 1.25;
    const cx = t.x * STORY_W;
    const top = t.y * STORY_H - (lines.length * lh) / 2;
    lines.forEach((line, i) => {
      const y = top + lh * i + lh / 2;
      if (t.boxed) {
        const w = ctx.measureText(line).width + size * 0.7;
        ctx.fillStyle = t.color === '#ffffff' ? 'rgba(0,0,0,0.78)' : '#ffffff';
        roundRect(ctx, cx - w / 2, y - lh / 2, w, lh, size * 0.28);
        ctx.fill();
        ctx.fillStyle = t.color === '#ffffff' ? '#ffffff' : t.color;
        ctx.shadowColor = 'transparent';
      } else {
        ctx.fillStyle = t.color;
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = size * 0.18;
        ctx.shadowOffsetY = size * 0.04;
      }
      ctx.fillText(line, cx, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    });
  }

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.86);
  releaseCanvas(canvas);
  return { blob, width: STORY_W, height: STORY_H };
}

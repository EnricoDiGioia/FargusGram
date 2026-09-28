// Adesivo de música dos stories. É desenhado num canvas do mesmo tamanho que
// vai para o story (1080 px de largura), então a prévia no editor é igual ao
// resultado publicado.
import { STORY_FONT } from './media';
import { artworkUrl } from './music';

export const STICKER_STYLES = ['light', 'dark', 'pill'];
export const nextStickerStyle = (s) => STICKER_STYLES[(STICKER_STYLES.indexOf(s) + 1) % STICKER_STYLES.length];

// A capa vem da Apple com permissão de CORS; baixando como blob o canvas
// continua "limpo" e pode virar imagem.
export async function loadArtwork(url) {
  const src = artworkUrl(url, 300);
  if (!src) return null;
  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = objUrl;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(objUrl), 0);
    }
  } catch {
    return null;
  }
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

function fit(ctx, str, max) {
  if (ctx.measureText(str).width <= max) return str;
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(str.slice(0, mid).trimEnd() + '…').width <= max) lo = mid;
    else hi = mid - 1;
  }
  return str.slice(0, lo).trimEnd() + '…';
}

function drawArt(ctx, art, x, y, size, r) {
  ctx.save();
  roundRect(ctx, x, y, size, size, r);
  ctx.clip();
  if (art) {
    ctx.drawImage(art, x, y, size, size);
  } else {
    const g = ctx.createLinearGradient(x, y, x + size, y + size);
    g.addColorStop(0, '#06b6d4');
    g.addColorStop(0.52, '#8b5cf6');
    g.addColorStop(1, '#d946ef');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${size * 0.5}px ${STORY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♫', x + size / 2, y + size / 2 + size * 0.03);
  }
  ctx.restore();
}

function drawBars(ctx, x, cy, color) {
  const hs = [26, 42, 32];
  ctx.fillStyle = color;
  hs.forEach((h, i) => {
    roundRect(ctx, x + i * 14, cy - h / 2, 8, h, 4);
    ctx.fill();
  });
  return 3 * 14 - 6;
}

// Devolve um canvas com o adesivo (em pixels do story de 1080 px)
export function drawMusicSticker(music, style = 'light', art = null) {
  const pad = 26; // espaço para a sombra
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const title = music.title || 'Música';
  const artist = music.artist || '';

  if (style === 'pill') {
    const h = 92;
    ctx.font = `700 36px ${STORY_FONT}`;
    const label = fit(ctx, artist ? `${title} · ${artist}` : title, 700);
    const textW = ctx.measureText(label).width;
    const w = 34 + 36 + 16 + textW + 36;
    c.width = Math.ceil(w + pad * 2);
    c.height = h + pad * 2;
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, pad, pad, w, h, h / 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    const bw = drawBars(ctx, pad + 34, pad + h / 2, '#7c3aed');
    ctx.font = `700 36px ${STORY_FONT}`;
    ctx.fillStyle = '#111111';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pad + 34 + bw + 16, pad + h / 2 + 1);
    return c;
  }

  const dark = style === 'dark';
  const h = 156;
  const inner = 18;
  const art_ = 120;
  ctx.font = `700 40px ${STORY_FONT}`;
  const t = fit(ctx, title, 560);
  const tw = ctx.measureText(t).width;
  ctx.font = `500 33px ${STORY_FONT}`;
  const a = fit(ctx, artist, 560);
  const aw = ctx.measureText(a).width;
  const w = inner + art_ + 22 + Math.max(tw, aw, 160) + 30;
  c.width = Math.ceil(w + pad * 2);
  c.height = h + pad * 2;

  ctx.shadowColor = dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.26)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = dark ? 'rgba(20,20,24,0.9)' : '#ffffff';
  roundRect(ctx, pad, pad, w, h, 28);
  ctx.fill();
  ctx.shadowColor = 'transparent';

  drawArt(ctx, art, pad + inner, pad + inner, art_, 16);

  const tx = pad + inner + art_ + 22;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 40px ${STORY_FONT}`;
  ctx.fillStyle = dark ? '#ffffff' : '#111111';
  ctx.fillText(t, tx, pad + (a ? 58 : h / 2));
  if (a) {
    ctx.font = `500 33px ${STORY_FONT}`;
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.72)' : '#6b6b75';
    ctx.fillText(a, tx, pad + 104);
  }
  return c;
}

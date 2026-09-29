import { local } from './storage';

// ---------------------------------------------------------------------
// Temas do app. Um tema é um punhado de escolhas (modo claro/escuro, cor
// de destaque, cor do fundo e, se quiser, um papel de parede); as outras
// cores (superfícies, bordas, textos secundários) saem daí.
//   { id, name, mode: 'light'|'dark', accent, bg,
//     wallpaper: null | { kind: 'gradient', from, to, angle }
//                     | { kind: 'pattern', pattern, color }
//                     | { kind: 'image', url },
//     veil: 0..1 (quanto do fundo cobre o papel de parede, para ler bem) }
// 'auto', 'light' e 'dark' são os temas de sempre (seguem o CSS).
// ---------------------------------------------------------------------

export const BASIC_THEMES = [
  { id: 'auto', name: 'Automático', mode: 'auto', accent: '#8b5cf6', bg: '#000000', split: true },
  { id: 'light', name: 'Claro', mode: 'light', accent: '#7c3aed', bg: '#ffffff' },
  { id: 'dark', name: 'Escuro', mode: 'dark', accent: '#8b5cf6', bg: '#000000' },
];

export const PRESET_THEMES = [
  {
    id: 'fissura',
    name: 'Fissura',
    mode: 'dark',
    accent: '#d946ef',
    bg: '#0d0717',
    wallpaper: { kind: 'gradient', from: '#3b0764', to: '#0e7490', angle: 160 },
    veil: 0.78,
  },
  {
    id: 'oceano',
    name: 'Oceano',
    mode: 'dark',
    accent: '#22d3ee',
    bg: '#06121f',
    wallpaper: { kind: 'pattern', pattern: 'ondas', color: '#22d3ee' },
    veil: 0.86,
  },
  { id: 'floresta', name: 'Floresta', mode: 'dark', accent: '#4ade80', bg: '#0b1510', wallpaper: { kind: 'pattern', pattern: 'pontos', color: '#4ade80' }, veil: 0.9 },
  { id: 'noite', name: 'Noite estrelada', mode: 'dark', accent: '#facc15', bg: '#05060f', wallpaper: { kind: 'pattern', pattern: 'estrelas', color: '#fde68a' }, veil: 0.55 },
  { id: 'brasa', name: 'Brasa', mode: 'dark', accent: '#f97316', bg: '#140906', wallpaper: { kind: 'gradient', from: '#7c2d12', to: '#140906', angle: 180 }, veil: 0.75 },
  { id: 'papel', name: 'Papel', mode: 'light', accent: '#b45309', bg: '#f6f0e4', wallpaper: { kind: 'pattern', pattern: 'quadriculado', color: '#b45309' }, veil: 0.9 },
  { id: 'sakura', name: 'Sakura', mode: 'light', accent: '#db2777', bg: '#fff5f8', wallpaper: { kind: 'pattern', pattern: 'pontos', color: '#f472b6' }, veil: 0.85 },
  { id: 'por-do-sol', name: 'Pôr do sol', mode: 'light', accent: '#ea580c', bg: '#fff7ed', wallpaper: { kind: 'gradient', from: '#fed7aa', to: '#fbcfe8', angle: 180 }, veil: 0.55 },
  { id: 'menta', name: 'Menta', mode: 'light', accent: '#0d9488', bg: '#f0fdfa', wallpaper: { kind: 'pattern', pattern: 'listras', color: '#5eead4' }, veil: 0.88 },
];

export const PATTERNS = [
  { id: 'pontos', label: 'Pontinhos' },
  { id: 'quadriculado', label: 'Quadriculado' },
  { id: 'estrelas', label: 'Estrelas' },
  { id: 'ondas', label: 'Ondas' },
  { id: 'listras', label: 'Listras' },
];

// ------------------------------ cores ------------------------------
const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));
export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = ([r, g, b]) => '#' + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('');
// mistura a com b (t = quanto de b)
export function mix(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}
const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
function luminance(hex) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex).map(f);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const isDarkColor = (hex) => luminance(hex) < 0.2;
// texto que aparece em cima da cor (branco ou quase preto)
const onColor = (hex) => (luminance(hex) > 0.45 ? '#111111' : '#ffffff');

// variáveis CSS de um tema (as mesmas que o app.css usa)
export function themeVars(t) {
  const dark = t.mode === 'dark';
  const bg = t.bg || (dark ? '#000000' : '#ffffff');
  const text = dark ? mix('#f4f4f6', bg, 0.04) : mix('#0b0b0f', bg, 0.04);
  const accent = t.accent || '#8b5cf6';
  return {
    '--bg': bg,
    '--bg-elev': dark ? mix(bg, '#ffffff', 0.08) : mix(bg, '#ffffff', 0.7),
    '--surface': mix(bg, text, dark ? 0.1 : 0.06),
    '--surface-2': mix(bg, text, dark ? 0.16 : 0.11),
    '--border': mix(bg, text, dark ? 0.13 : 0.1),
    '--text': text,
    '--text-2': mix(text, bg, 0.36),
    '--text-3': mix(text, bg, 0.56),
    '--accent': accent,
    '--accent-2': mix(accent, '#000000', 0.12),
    '--accent-soft': mix(bg, accent, dark ? 0.24 : 0.14),
    '--on-accent': onColor(accent),
    '--link': dark ? mix(accent, '#ffffff', 0.4) : mix(accent, '#000000', 0.18),
    '--overlay': dark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.5)',
    '--shadow': dark ? '0 10px 40px rgba(0, 0, 0, 0.6)' : '0 10px 40px rgba(12, 10, 30, 0.14)',
  };
}

// papel de parede em CSS (camadas de background)
function patternCss(p, color) {
  const c = rgba(color, 0.5);
  const c2 = rgba(color, 0.28);
  switch (p) {
    case 'quadriculado':
      return { image: `linear-gradient(${c2} 1px, transparent 1px), linear-gradient(90deg, ${c2} 1px, transparent 1px)`, size: '28px 28px, 28px 28px' };
    case 'estrelas':
      return {
        image: [
          `radial-gradient(1.5px 1.5px at 20px 30px, ${rgba(color, 0.9)}, transparent)`,
          `radial-gradient(1px 1px at 90px 70px, ${c}, transparent)`,
          `radial-gradient(1.5px 1.5px at 150px 20px, ${rgba(color, 0.8)}, transparent)`,
          `radial-gradient(1px 1px at 60px 140px, ${c}, transparent)`,
          `radial-gradient(2px 2px at 130px 120px, ${rgba(color, 0.95)}, transparent)`,
          `radial-gradient(1px 1px at 175px 170px, ${c}, transparent)`,
        ].join(', '),
        size: '190px 190px',
      };
    case 'ondas':
      return {
        image: `radial-gradient(circle at 50% 100%, transparent 13px, ${c2} 14px, ${c2} 16px, transparent 17px)`,
        size: '36px 18px',
      };
    case 'listras':
      return { image: `repeating-linear-gradient(135deg, ${c2} 0 2px, transparent 2px 16px)`, size: 'auto' };
    default: // pontos
      return { image: `radial-gradient(${c} 1.6px, transparent 1.8px)`, size: '22px 22px' };
  }
}
export function wallpaperCss(t) {
  const w = t.wallpaper;
  if (!w) return null;
  const bg = t.bg || '#000000';
  if (w.kind === 'gradient') return { image: `linear-gradient(${w.angle ?? 160}deg, ${w.from}, ${w.to})`, size: 'cover', color: bg };
  if (w.kind === 'pattern') return { ...patternCss(w.pattern, w.color || t.accent), color: bg };
  if (w.kind === 'image' && w.url) return { image: `url("${w.url}")`, size: 'cover', position: 'center', color: bg };
  return null;
}
// estilo inline de uma área com o tema (prévia nos cartões)
export function themePreviewStyle(t) {
  const vars = themeVars(t);
  const w = wallpaperCss(t);
  const veil = rgba(vars['--bg'], t.veil ?? 0.8);
  return {
    ...vars,
    backgroundColor: vars['--bg'],
    backgroundImage: w ? `linear-gradient(${veil}, ${veil}), ${w.image}` : undefined,
    backgroundSize: w ? w.size : undefined, // (o véu é uma cor lisa: pode repetir junto)
    backgroundPosition: w?.position,
    color: vars['--text'],
  };
}

// ------------------------------ guardar ------------------------------
// aparência: { active: id, custom: [temas criados] }
const KEY = 'fg-appearance';
export const MAX_CUSTOM = 12;

// tema criado vindo do aparelho ou da conta: só passa o que é válido, para
// uma cor ou endereço estranho nunca quebrar o CSS da página
const HEX = /^#[0-9a-f]{6}$/i;
const hexOr = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
const PATTERN_IDS = new Set(PATTERNS.map((p) => p.id));
function cleanWallpaper(w, accent, bg) {
  if (!w || typeof w !== 'object') return null;
  if (w.kind === 'gradient') {
    const angle = Number(w.angle);
    return { kind: 'gradient', from: hexOr(w.from, accent), to: hexOr(w.to, bg), angle: Number.isFinite(angle) ? Math.round(angle) % 360 : 160 };
  }
  if (w.kind === 'pattern') return { kind: 'pattern', pattern: PATTERN_IDS.has(w.pattern) ? w.pattern : 'pontos', color: hexOr(w.color, accent) };
  if (w.kind === 'image' && typeof w.url === 'string' && /^https?:\/\/[^\s"'()\\]+$/i.test(w.url) && w.url.length < 1000) return { kind: 'image', url: w.url };
  return null;
}
export function cleanTheme(t) {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id) return null;
  const mode = t.mode === 'light' ? 'light' : 'dark';
  const accent = hexOr(t.accent, '#8b5cf6');
  const bg = hexOr(t.bg, mode === 'light' ? '#ffffff' : '#000000');
  const veil = Number(t.veil);
  return {
    id: t.id.slice(0, 40),
    name: String(t.name || 'Meu tema').slice(0, 24),
    mode,
    accent,
    bg,
    wallpaper: cleanWallpaper(t.wallpaper, accent, bg),
    veil: Number.isFinite(veil) ? Math.min(0.95, Math.max(0.05, veil)) : 0.8,
  };
}
const cleanList = (list) => (Array.isArray(list) ? list.map(cleanTheme).filter(Boolean).slice(0, MAX_CUSTOM) : []);

export function getAppearance() {
  let a = null;
  try {
    a = JSON.parse(local.get(KEY, 'null'));
  } catch {
    a = null;
  }
  if (a && typeof a === 'object') return normalizeAppearance(a);
  // antes dos temas: só claro/escuro/automático
  return { active: local.get('fg-theme', 'auto') || 'auto', custom: [] };
}
export function findTheme(id, appearance = getAppearance()) {
  return BASIC_THEMES.find((t) => t.id === id) || PRESET_THEMES.find((t) => t.id === id) || appearance.custom.find((t) => t.id === id) || BASIC_THEMES[0];
}

const VAR_NAMES = Object.keys(themeVars({ mode: 'dark' }));
function setMeta(color) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (color) m.setAttribute('content', color);
    else m.setAttribute('content', (m.getAttribute('media') || '').includes('dark') ? '#000000' : '#ffffff');
  });
}

// aplica um tema na página (sem guardar: serve também para a prévia do editor)
export function applyTheme(t) {
  const root = document.documentElement;
  for (const v of VAR_NAMES) root.style.removeProperty(v);
  root.classList.remove('has-wallpaper');
  root.style.removeProperty('--wallpaper');
  root.style.removeProperty('--wallpaper-size');
  root.style.removeProperty('--wallpaper-position');
  root.style.removeProperty('--wallpaper-veil');
  root.style.removeProperty('color-scheme');
  if (!t || t.mode === 'auto') {
    root.removeAttribute('data-theme');
    setMeta(null);
    return;
  }
  root.setAttribute('data-theme', t.mode);
  root.style.setProperty('color-scheme', t.mode);
  if (t.id === 'light' || t.id === 'dark') {
    setMeta(t.mode === 'dark' ? '#000000' : '#ffffff');
    return;
  }
  const vars = themeVars(t);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const w = wallpaperCss(t);
  if (w) {
    root.classList.add('has-wallpaper');
    root.style.setProperty('--wallpaper', w.image);
    root.style.setProperty('--wallpaper-size', w.size || 'auto');
    root.style.setProperty('--wallpaper-position', w.position || '0 0');
    const veil = rgba(vars['--bg'], t.veil ?? 0.8);
    root.style.setProperty('--wallpaper-veil', `linear-gradient(${veil}, ${veil})`);
  }
  setMeta(vars['--bg']);
}

const listeners = new Set();
export function onAppearanceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// guarda no aparelho e aplica; a conta é salva pela sessão (state/session)
export const normalizeAppearance = (a) => ({ active: typeof a?.active === 'string' && a.active ? a.active.slice(0, 40) : 'auto', custom: cleanList(a?.custom) });
export function saveAppearance(a) {
  const clean = normalizeAppearance(a);
  local.set(KEY, JSON.stringify(clean));
  local.set('fg-theme', null);
  applyTheme(findTheme(clean.active, clean));
  listeners.forEach((fn) => fn(clean));
  return clean;
}

// compatível com a escolha antiga (automático / claro / escuro)
export function getTheme() {
  const id = getAppearance().active;
  return id === 'light' || id === 'dark' ? id : 'auto';
}
export function setTheme(id) {
  saveAppearance({ ...getAppearance(), active: id });
}

export function applySavedTheme() {
  const a = getAppearance();
  applyTheme(findTheme(a.active, a));
}

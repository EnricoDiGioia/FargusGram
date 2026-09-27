import { local } from './storage';

// 'auto' | 'light' | 'dark'
export function getTheme() {
  return local.get('fg-theme', 'auto');
}

export function setTheme(t) {
  local.set('fg-theme', t === 'auto' ? null : t);
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');
  // cor da barra do navegador / status bar
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const isDarkMeta = (m.getAttribute('media') || '').includes('dark');
    const color = t === 'dark' ? '#000000' : t === 'light' ? '#ffffff' : isDarkMeta ? '#000000' : '#ffffff';
    m.setAttribute('content', color);
  });
}

export function applySavedTheme() {
  const t = getTheme();
  if (t !== 'auto') setTheme(t);
}

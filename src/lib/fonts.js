// Fontes dos textos dos editores (story e publicação). Os arquivos das
// fontes vêm junto com o app (@fontsource) e só são carregados nos editores.
// lh: altura da linha; upper: tudo maiúsculo.
export const TEXT_FONTS = [
  { id: 'classica', label: 'Clássica', family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', weight: 700, lh: 1.25 },
  { id: 'moderna', label: 'Moderna', family: '"Unbounded", sans-serif', weight: 700, lh: 1.3 },
  { id: 'maquina', label: 'Máquina', family: '"Special Elite", "Courier New", monospace', weight: 400, lh: 1.3 },
  { id: 'caneta', label: 'Caneta', family: '"Pacifico", cursive', weight: 400, lh: 1.55 },
  { id: 'forte', label: 'Forte', family: '"Bebas Neue", Impact, sans-serif', weight: 400, lh: 1.1, upper: true },
  { id: 'elegante', label: 'Elegante', family: '"Playfair Display", Georgia, serif', weight: 700, italic: true, lh: 1.3 },
];

export function fontOf(id) {
  return TEXT_FONTS.find((f) => f.id === id) || TEXT_FONTS[0];
}

export function canvasFont(font, size) {
  return `${font.italic ? 'italic ' : ''}${font.weight} ${Math.round(size)}px ${font.family}`;
}

// estilo para mostrar o texto na tela igual ao que vai para a imagem
export function cssFont(font) {
  return {
    fontFamily: font.family,
    fontWeight: font.weight,
    fontStyle: font.italic ? 'italic' : 'normal',
    lineHeight: font.lh,
    textTransform: font.upper ? 'uppercase' : 'none',
  };
}

// Espera as fontes usadas carregarem antes de desenhar no canvas
// (sem isso o canvas usaria a fonte padrão)
export async function loadFonts(ids) {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const uniq = [...new Set(ids)].map(fontOf).filter((f) => f.id !== 'classica');
  await Promise.race([
    Promise.all(uniq.map((f) => document.fonts.load(canvasFont(f, 48), 'AaÇãé').catch(() => null))),
    new Promise((r) => setTimeout(r, 4000)), // sem internet e sem cache: desenha com o que tiver
  ]);
}

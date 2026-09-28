// Fotos aparecem suavemente quando terminam de carregar, em vez de "pipocar".
// Uso: <img {...fadeIn} src=... />  (o CSS cuida da transição)
// A marca fica num atributo que o React não controla, então uma nova
// renderização nunca esconde de novo uma foto que já apareceu.

// Fotos que já apareceram nesta sessão estão no cache: ao voltar para uma
// tela elas surgem na hora. Idem se carregar muito rápido. Só as fotos que
// vêm da internet pela primeira vez esmaecem.
const seen = new Set();
const QUICK_MS = 120;

function show(el) {
  if (!el.hasAttribute('data-shown')) el.setAttribute('data-shown', '');
  if (el.src) seen.add(el.src);
}

export const fadeIn = {
  'data-fade': '',
  ref(el) {
    if (!el) return;
    if ((el.complete && el.naturalWidth > 0) || seen.has(el.src)) show(el);
    else if (el.__fgMounted === undefined) el.__fgMounted = performance.now();
  },
  onLoad(e) {
    const el = e.currentTarget;
    if (!el.hasAttribute('data-shown') && performance.now() - (el.__fgMounted ?? 0) < QUICK_MS) el.style.transition = 'none';
    show(el);
  },
  onError(e) {
    e.currentTarget.setAttribute('data-shown', '');
  },
};

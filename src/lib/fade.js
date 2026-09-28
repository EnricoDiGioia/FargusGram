// Fotos aparecem suavemente quando terminam de carregar, em vez de "pipocar".
// Uso: <img {...fadeIn} src=... />  (o CSS cuida da transição)
// A marca fica num atributo que o React não controla, então uma nova
// renderização nunca esconde de novo uma foto que já apareceu.
function show(el) {
  if (el && !el.hasAttribute('data-shown')) el.setAttribute('data-shown', '');
}

export const fadeIn = {
  'data-fade': '',
  // foto que já estava no cache aparece na hora, sem esmaecer
  ref(el) {
    if (el && el.complete && el.naturalWidth > 0) show(el);
  },
  onLoad(e) {
    show(e.currentTarget);
  },
  onError(e) {
    show(e.currentTarget);
  },
};

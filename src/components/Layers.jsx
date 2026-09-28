import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MoveDiagonal2, RotateCw, Trash2, X } from 'lucide-react';
import '@fontsource/special-elite/latin-400.css';
import '@fontsource/pacifico/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/playfair-display/latin-700-italic.css';
import { TEXT_FONTS, fontOf, cssFont } from '../lib/fonts';
import { LAYER_REF_W, TEXT_WRAP, photoRadius, prepareImage } from '../lib/media';

// ---------------------------------------------------------------------
// Camadas por cima da foto (story e publicação): textos e fotos.
//   arrastar move · alça ↻ gira · alça ⤡ muda o tamanho · ✕ tira
//   dois dedos também giram e mudam o tamanho; no computador, a rodinha
//   do mouse muda o tamanho (com Shift, gira)
// O desenho final (lib/media.js → drawLayers) usa as mesmas medidas.
// ---------------------------------------------------------------------

export const TEXT_COLORS = ['#ffffff', '#000000', '#f43f5e', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#8b5cf6', '#d946ef'];
export const MAX_PHOTO_LAYERS = 6;
export const MAX_TEXT_LAYERS = 12;

let seq = 0;
const newId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;
const topZ = (layers) => layers.reduce((m, l) => Math.max(m, l.z || 0), 0);

// textos novos entram um pouco abaixo do anterior (senão um cobriria o outro)
export function newTextLayer(layers, fields) {
  const n = layers.filter((l) => l.kind === 'text').length;
  return { id: newId(), kind: 'text', x: 0.5, y: 0.34 + (n % 5) * 0.1, rot: 0, scale: 1, z: topZ(layers) + 1, font: 'classica', size: 76, color: '#ffffff', boxed: false, ...fields };
}

// Foto principal do story (a da galeria): é uma camada como as outras (dá
// para mover, girar e mudar o tamanho), mas fica sempre atrás, sem cantos
// arredondados nem sombra, e entra inteira no quadro. ratio = altura / largura.
export function newBaseLayer(image, ratio = 16 / 9) {
  const w = Math.min(1, ratio / (image.height / image.width));
  return { id: newId(), kind: 'photo', base: true, image, x: 0.5, y: 0.5, rot: 0, scale: 1, z: 0, w };
}
const isOverlayPhoto = (l) => l.kind === 'photo' && !l.base;

// área ocupada por uma foto, em larguras do quadro (ratio = altura / largura do quadro)
function photoBox(l, ratio) {
  const w = l.w * (l.scale || 1);
  const h = w * (l.image.height / l.image.width);
  return { x: l.x - w / 2, y: l.y * ratio - h / 2, w, h };
}
const overlap = (a, b) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

// Onde as fotos novas entram: a primeira, sozinha, no meio; as outras numa
// grade (2 colunas; 3 linhas no story, começando pela do meio), nos lugares
// que menos cobrem as fotos que já estão lá. ratio = altura / largura do quadro.
export function placePhotos(layers, images, ratio = 16 / 9) {
  const existing = layers.filter(isOverlayPhoto);
  let z = topZ(layers);
  if (!existing.length && images.length === 1) {
    const image = images[0];
    const w = Math.min(0.62, (0.62 * ratio) / (image.height / image.width));
    return [{ id: newId(), kind: 'photo', image, x: 0.5, y: 0.5, rot: 0, scale: 1, z: z + 1, w }];
  }
  const cols = ratio < 0.75 ? 3 : 2;
  const rows = ratio >= 1.4 ? 3 : 2;
  const MX = 0.04; // margens (em fração da largura / altura)
  const MY = 0.06;
  const slots = [];
  for (const r of rows === 3 ? [1, 2, 0] : [0, 1])
    for (let c = 0; c < cols; c++) slots.push({ x: MX + ((c + 0.5) * (1 - 2 * MX)) / cols, y: MY + ((r + 0.5) * (1 - 2 * MY)) / rows });
  const taken = existing.map((l) => photoBox(l, ratio));
  return images.map((image, i) => {
    const ir = image.height / image.width;
    const w = Math.min((0.9 * (1 - 2 * MX)) / cols, (0.9 * (1 - 2 * MY) * ratio) / rows / ir);
    const h = w * ir;
    let best = null;
    for (const s of slots) {
      const b = { x: s.x - w / 2, y: s.y * ratio - h / 2, w, h };
      const cost = taken.reduce((sum, o) => sum + overlap(b, o), 0);
      if (!best || cost < best.cost - 1e-6) best = { s, b, cost };
    }
    // grade cheia: desloca um pouco para não ficar exatamente em cima de outra
    const nudge = best.cost > 0 ? 0.05 * ((i % 3) + 1) : 0;
    const x = Math.min(0.95, best.s.x + nudge);
    const y = Math.min(0.95, best.s.y + nudge / ratio);
    taken.push({ ...best.b, x: x - w / 2, y: y * ratio - h / 2 });
    z += 1;
    return { id: newId(), kind: 'photo', image, x, y, rot: 0, scale: 1, z, w };
  });
}

// abre as fotos escolhidas (menores que a principal: poupa memória)
export async function photoLayersFrom(files, layers, onError, ratio) {
  const room = MAX_PHOTO_LAYERS - layers.filter(isOverlayPhoto).length;
  const images = [];
  for (const file of [...files].slice(0, Math.max(0, room))) {
    try {
      images.push(await prepareImage(file, 1400));
    } catch (err) {
      onError?.(err.message);
    }
  }
  if (files.length > room) onError?.(`Dá para colocar até ${MAX_PHOTO_LAYERS} fotos por cima.`);
  return images.length ? placePhotos(layers, images, ratio) : [];
}

export function revokeLayers(layers) {
  for (const l of layers || []) if (l.kind === 'photo') URL.revokeObjectURL(l.image.url);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const pt = (e) => ({ x: e.clientX, y: e.clientY });
// gruda no reto (0°, 90°, 180°) quando passa perto
function snap(a) {
  let r = Math.atan2(Math.sin(a), Math.cos(a));
  for (const t of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI]) if (Math.abs(r - t) < 0.05) r = t;
  return r;
}
const scaleLimits = (l) => (l.kind === 'photo' ? [0.15, 4] : [0.3, 5]);
const isHandle = (mode) => mode === 'rotate' || mode === 'resize';
// sem try, um navegador que recusa a captura interromperia o gesto
const capture = (e) => {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* segue sem captura */
  }
};

const PAD = 10; // folga da moldura em volta da camada
const EDGE = 24; // as alças (e a área de toque delas) nunca saem do quadro
const TIP_KEY = 'fg-layer-tip';

function TextLines({ l }) {
  if (!l.boxed) return l.text;
  return l.text.split('\n').map((line, i) => (
    <span key={i} className="layer__line">
      {line}
    </span>
  ));
}

// lugares preferidos de cada alça: os cantos da camada e, se estiverem todos
// ocupados por botões (camada do tamanho do quadro), o meio das beiradas
const CORNER_PREFS = [
  ['resize', ['br', 'bl', 'tr', 'tl', 'b', 'r', 'l', 't']],
  ['rotate', ['tr', 'tl', 'br', 'bl', 't', 'r', 'l', 'b']],
  ['remove', ['tl', 'bl', 'tr', 'br', 'l', 't', 'b', 'r']],
];
const HIT = 23; // raio da área de toque das alças

// readOnly: só mostra (prévia), sem gestos
// avoid: seletor dos botões que ficam por cima do quadro (as alças fogem deles)
export function LayerStage({ layers, onChange, onEditText, className = '', readOnly = false, avoid = '' }) {
  const box = useRef(null);
  const uiBox = useRef(null);
  const els = useRef(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState(null);
  const [gesturing, setGesturing] = useState(false);
  const [dims, setDims] = useState(null);
  const [tip, setTip] = useState(false);
  const [prevLayers, setPrevLayers] = useState(layers);
  const [obstacles, setObstacles] = useState([]);
  const corners = useRef(null); // cantos das alças, fixos durante um gesto
  const g = useRef(null); // gesto com os dedos / mouse
  const gs = useRef(null); // gesto do Safari (pinça do iPhone / trackpad)
  const tipShown = useRef(false);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // camada nova (foto ou texto) já vem escolhida, com as alças à mostra;
  // camada apagada por fora (ex.: no editor de texto) sai da seleção
  if (layers !== prevLayers) {
    setPrevLayers(layers);
    const fresh = readOnly ? [] : layers.filter((l) => !prevLayers.some((p) => p.id === l.id));
    if (fresh.length) setSel(fresh[fresh.length - 1].id);
    else if (sel && !layers.some((l) => l.id === sel)) setSel(null);
  }

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // tamanho da camada escolhida (sem giro nem escala), para a moldura e as
  // alças; acompanha o texto mudando, a fonte carregando e a tela girando
  const ready = size.w > 0;
  useLayoutEffect(() => {
    const el = sel && els.current.get(sel);
    if (!el) return undefined;
    const measure = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setDims((p) => (p && p.id === sel && p.w === w && p.h === h ? p : { id: sel, w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sel, ready]);

  // onde estão os botões por cima do quadro (em relação a ele)
  useLayoutEffect(() => {
    if (!avoid || !sel || !box.current) return;
    const b = box.current.getBoundingClientRect();
    const list = [...document.querySelectorAll(avoid)]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => ({ x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height }));
    setObstacles((p) => (JSON.stringify(p) === JSON.stringify(list) ? p : list));
  }, [avoid, sel, size.w, size.h]);

  // tocar fora das camadas tira a seleção
  useEffect(() => {
    if (!sel) return undefined;
    const onDown = (e) => {
      if (!e.target.closest?.('.layer, .layer-ctl')) setSel(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [sel]);

  // dica rápida nas primeiras vezes
  useEffect(() => {
    if (!sel || readOnly || tipShown.current) return;
    tipShown.current = true;
    let n = 3;
    try {
      n = Number(localStorage.getItem(TIP_KEY)) || 0;
      if (n < 3) localStorage.setItem(TIP_KEY, String(n + 1));
    } catch {
      /* sem armazenamento: mostra mesmo assim */
      n = 0;
    }
    if (n < 3) setTip(true);
  }, [sel, readOnly]);
  useEffect(() => {
    if (!tip) return undefined;
    const t = setTimeout(() => setTip(false), 5000);
    return () => clearTimeout(t);
  }, [tip]);

  // só lê refs: pode ser chamada de dentro dos ouvintes nativos
  const update = (id, patch) => {
    const next = layersRef.current.map((l) => (l.id === id ? { ...l, ...patch } : l));
    layersRef.current = next;
    onChangeRef.current(next);
  };
  const remove = (id) => {
    const l = layersRef.current.find((x) => x.id === id);
    if (l?.kind === 'photo') URL.revokeObjectURL(l.image.url);
    const next = layersRef.current.filter((x) => x.id !== id);
    layersRef.current = next;
    onChangeRef.current(next);
    setSel(null);
  };

  // Ouvintes nativos (precisam poder cancelar o padrão do navegador):
  // - arrastar com o dedo não rola nem dá zoom na página
  // - Safari (iPhone e trackpad do Mac): a pinça vira giro/tamanho da camada
  //   em vez de zoom na página
  // - computador: rodinha do mouse muda o tamanho; com Shift ou Alt, gira
  useEffect(() => {
    if (readOnly) return undefined;
    const targets = [box.current, uiBox.current].filter(Boolean);
    const layerAt = (e) => {
      const id = g.current?.id || e.target.closest?.('[data-layer]')?.dataset.layer;
      return id ? layersRef.current.find((x) => x.id === id) : null;
    };
    const onTouchMove = (e) => {
      if (g.current) e.preventDefault();
    };
    const onGestureStart = (e) => {
      e.preventDefault();
      const l = layerAt(e);
      gs.current = l ? { id: l.id, start: l } : null;
      if (l) setSel(l.id);
    };
    const onGestureChange = (e) => {
      e.preventDefault();
      const S = gs.current;
      const G = g.current;
      // com dois dedos registrados, o gesto normal já está cuidando disso
      if (!S || (G && (G.mode === 'pinch' || isHandle(G.mode)))) return;
      const [lo, hi] = scaleLimits(S.start);
      update(S.id, { scale: clamp((S.start.scale || 1) * e.scale, lo, hi), rot: snap((S.start.rot || 0) + (e.rotation * Math.PI) / 180) });
    };
    const onGestureEnd = (e) => {
      e.preventDefault();
      gs.current = null;
    };
    const onWheel = (e) => {
      const l = layerAt(e);
      if (!l) return;
      e.preventDefault();
      const d = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : 1); // Shift+rodinha vira deltaX em alguns sistemas
      if (e.shiftKey || e.altKey) update(l.id, { rot: snap((l.rot || 0) + d * 0.004) });
      else {
        const [lo, hi] = scaleLimits(l);
        // ctrl + rodinha é a pinça do trackpad
        update(l.id, { scale: clamp((l.scale || 1) * Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015)), lo, hi) });
      }
      setSel(l.id);
    };
    const opts = { passive: false };
    for (const t of targets) {
      t.addEventListener('touchmove', onTouchMove, opts);
      t.addEventListener('gesturestart', onGestureStart, opts);
      t.addEventListener('gesturechange', onGestureChange, opts);
      t.addEventListener('gestureend', onGestureEnd, opts);
      t.addEventListener('wheel', onWheel, opts);
    }
    return () => {
      for (const t of targets) {
        t.removeEventListener('touchmove', onTouchMove, opts);
        t.removeEventListener('gesturestart', onGestureStart, opts);
        t.removeEventListener('gesturechange', onGestureChange, opts);
        t.removeEventListener('gestureend', onGestureEnd, opts);
        t.removeEventListener('wheel', onWheel, opts);
      }
    };
    // (update só lê refs, por isso não entra na lista)
  }, [readOnly]);

  // (re)começa o gesto a partir dos dedos que estão na tela agora
  const begin = () => {
    const G = g.current;
    const pts = [...G.pointers.values()];
    G.start = layersRef.current.find((l) => l.id === G.id);
    G.p0 = pts.map((p) => ({ ...p }));
    if (isHandle(G.mode)) return;
    if (pts.length >= 2) {
      G.mode = 'pinch';
      G.moved = true;
      G.d0 = dist(pts[0], pts[1]) || 1;
      G.a0 = angle(pts[0], pts[1]);
      G.m0 = mid(pts[0], pts[1]);
    } else G.mode = 'move';
  };

  const onLayerDown = (e, l) => {
    e.stopPropagation();
    capture(e);
    const G = g.current;
    // primeiro dedo (ou clique): sempre um gesto novo, mesmo que um anterior
    // tenha ficado sem o "soltar"
    if (G && !e.isPrimary && G.pointers.size > 0) {
      if (isHandle(G.mode)) return;
      // segundo dedo, nesta ou em outra camada: aumenta/gira a que já está sendo mexida
      G.pointers.set(e.pointerId, pt(e));
      begin();
      return;
    }
    g.current = { id: l.id, pointers: new Map([[e.pointerId, pt(e)]]), moved: false, t0: Date.now(), mode: 'move' };
    // a camada tocada vem para a frente (a foto principal fica sempre atrás)
    const z = topZ(layersRef.current);
    if (!l.base && (l.z || 0) < z) update(l.id, { z: z + 1 });
    setSel(l.id);
    setGesturing(true);
    begin();
  };

  // segundo dedo em qualquer lugar da foto, durante um gesto
  const onStageDown = (e) => {
    const G = g.current;
    if (!G || !G.pointers.size || isHandle(G.mode)) return;
    e.stopPropagation();
    capture(e);
    G.pointers.set(e.pointerId, pt(e));
    begin();
  };

  // alças: ↻ gira em volta do centro · ⤡ muda o tamanho (um dedo ou o mouse)
  const onHandleDown = (e, l, mode) => {
    e.stopPropagation();
    capture(e);
    const G = g.current;
    if (G && !e.isPrimary && G.pointers.size > 0) {
      if (isHandle(G.mode)) return;
      G.pointers.set(e.pointerId, pt(e));
      begin();
      return;
    }
    const r = box.current.getBoundingClientRect();
    const center = { x: r.left + l.x * r.width, y: r.top + l.y * r.height };
    const p = pt(e);
    g.current = { id: l.id, pointers: new Map([[e.pointerId, p]]), mode, moved: true, t0: Date.now(), center, start: l, a0: angle(center, p), d0: Math.max(8, dist(center, p)) };
    setSel(l.id);
    setGesturing(true);
    setTip(false);
  };

  const onMove = (e) => {
    const G = g.current;
    if (!G || !G.pointers.has(e.pointerId)) return;
    G.pointers.set(e.pointerId, pt(e));
    const pts = [...G.pointers.values()];
    const s = G.start;
    if (!s) return;
    const [lo, hi] = scaleLimits(s);
    if (G.mode === 'rotate') {
      update(G.id, { rot: snap((s.rot || 0) + angle(G.center, pts[0]) - G.a0) });
    } else if (G.mode === 'resize') {
      update(G.id, { scale: clamp(((s.scale || 1) * dist(G.center, pts[0])) / G.d0, lo, hi) });
    } else if (G.mode === 'pinch' && pts.length >= 2) {
      const m = mid(pts[0], pts[1]);
      update(G.id, {
        scale: clamp(((s.scale || 1) * dist(pts[0], pts[1])) / G.d0, lo, hi),
        rot: snap((s.rot || 0) + angle(pts[0], pts[1]) - G.a0),
        x: clamp(s.x + (m.x - G.m0.x) / size.w, 0.02, 0.98),
        y: clamp(s.y + (m.y - G.m0.y) / size.h, 0.02, 0.98),
      });
    } else if (G.mode === 'move') {
      const dx = pts[0].x - G.p0[0].x;
      const dy = pts[0].y - G.p0[0].y;
      if (Math.abs(dx) + Math.abs(dy) > 5) G.moved = true;
      if (G.moved) update(G.id, { x: clamp(s.x + dx / size.w, 0.02, 0.98), y: clamp(s.y + dy / size.h, 0.02, 0.98) });
    }
  };

  const onUp = (e) => {
    const G = g.current;
    if (!G || !G.pointers.has(e.pointerId)) return;
    G.pointers.delete(e.pointerId);
    if (G.pointers.size > 0) {
      begin(); // tirou um dos dois dedos: continua arrastando com o outro
      return;
    }
    g.current = null;
    setGesturing(false);
    // toque rápido no texto: abre para editar
    if (!G.moved && G.mode === 'move' && Date.now() - G.t0 < 450) {
      const l = layersRef.current.find((x) => x.id === G.id);
      if (l?.kind === 'text' && onEditText) {
        setSel(null);
        onEditText(l);
      }
    }
  };

  const k = size.w / LAYER_REF_W;
  // os eventos das camadas e das alças sobem até aqui (inclusive com captura)
  const handlers = readOnly ? {} : { onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  // moldura e alças da camada escolhida: ficam numa folha própria, acima das
  // ferramentas, e nunca saem do quadro (senão não daria para pegá-las)
  let controls = null;
  const cur = !readOnly && sel && size.w > 0 ? layers.find((l) => l.id === sel) : null;
  if (cur) {
    const d =
      cur.kind === 'photo'
        ? { w: cur.w * size.w, h: cur.w * size.w * (cur.image.height / cur.image.width) }
        : dims && dims.id === cur.id
          ? dims
          : null;
    if (d) {
      const s = cur.scale || 1;
      const rot = cur.rot || 0;
      const hw = (d.w * s) / 2 + PAD;
      const hh = (d.h * s) / 2 + PAD;
      const cx = cur.x * size.w;
      const cy = cur.y * size.h;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const turn = `translate(-50%, -50%) rotate(${rot}rad)`;
      // camada pequena: as alças não ficam uma em cima da outra
      const ex = Math.max(hw, 30);
      const ey = Math.max(hh, 30);
      const at = (dx, dy) => ({
        left: clamp(cx + dx * cos - dy * sin, EDGE, size.w - EDGE),
        top: clamp(cy + dx * sin + dy * cos, EDGE, size.h - EDGE),
        transform: turn,
      });
      const spots = { tl: at(-ex, -ey), tr: at(ex, -ey), br: at(ex, ey), bl: at(-ex, ey), t: at(0, -ey), r: at(ex, 0), b: at(0, ey), l: at(-ex, 0) };
      // cada alça vai para o primeiro canto livre (que não caia em cima de um
      // botão); durante um gesto ficam onde estavam, para não pular do dedo
      if (!gesturing || corners.current?.id !== cur.id) {
        const blocked = (p) => obstacles.some((o) => p.left + HIT > o.x - 4 && p.left - HIT < o.x + o.w + 4 && p.top + HIT > o.y - 4 && p.top - HIT < o.y + o.h + 4);
        const taken = new Set();
        const pick = {};
        // perto demais de uma alça já posta (acontece quando as duas vão para a beirada)
        const crowded = (k) => [...taken].some((t) => Math.hypot(spots[k].left - spots[t].left, spots[k].top - spots[t].top) < HIT * 2);
        for (const [name, prefs] of CORNER_PREFS) {
          const c =
            prefs.find((k) => !taken.has(k) && !blocked(spots[k]) && !crowded(k)) ||
            prefs.find((k) => !taken.has(k) && !crowded(k)) ||
            prefs.find((k) => !taken.has(k));
          taken.add(c);
          pick[name] = c;
        }
        corners.current = { id: cur.id, pick };
      }
      const { pick } = corners.current;
      const what = cur.kind === 'photo' ? ['a foto', 'da foto'] : ['o texto', 'do texto'];
      controls = (
        <>
          <div className="layer-frame" style={{ left: cx, top: cy, width: hw * 2, height: hh * 2, transform: turn }} />
          <button
            type="button"
            className="layer-ctl layer-ctl--remove"
            data-layer={cur.id}
            style={{ ...spots[pick.remove], transform: 'translate(-50%, -50%)' }}
            aria-label={cur.kind === 'photo' ? 'Tirar foto' : 'Apagar texto'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => remove(cur.id)}
          >
            <X size={16} strokeWidth={3} />
          </button>
          <span
            className="layer-ctl layer-ctl--rotate"
            data-layer={cur.id}
            style={spots[pick.rotate]}
            role="presentation"
            title={`Arraste para girar ${what[0]}`}
            onPointerDown={(e) => onHandleDown(e, cur, 'rotate')}
          >
            <RotateCw size={17} strokeWidth={2.6} />
          </span>
          <span
            className="layer-ctl layer-ctl--resize"
            data-layer={cur.id}
            style={spots[pick.resize]}
            role="presentation"
            title={`Arraste para mudar o tamanho ${what[1]}`}
            onPointerDown={(e) => onHandleDown(e, cur, 'resize')}
          >
            <MoveDiagonal2 size={17} strokeWidth={2.6} />
          </span>
        </>
      );
    }
  }

  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  return (
    <>
      <div
        ref={box}
        className={`layers ${gesturing ? 'is-gesturing' : ''} ${readOnly ? 'layers--static' : ''} ${className}`}
        onPointerDown={readOnly ? undefined : onStageDown}
        {...handlers}
      >
        {size.w > 0 &&
          layers.map((l) => {
            const selected = sel === l.id;
            const common = {
              'data-layer': l.id,
              ref: (el) => (el ? els.current.set(l.id, el) : els.current.delete(l.id)),
              onPointerDown: readOnly ? undefined : (e) => onLayerDown(e, l),
            };
            const place = {
              left: `${l.x * 100}%`,
              top: `${l.y * 100}%`,
              zIndex: l.z || 0,
              transform: `translate(-50%, -50%) rotate(${l.rot || 0}rad) scale(${l.scale || 1})`,
            };
            if (l.kind === 'photo') {
              const w = l.w * size.w;
              const h = w * (l.image.height / l.image.width);
              return (
                <div
                  key={l.id}
                  {...common}
                  className={`layer layer--photo ${l.base ? 'layer--base' : ''} ${selected ? 'is-selected' : ''}`}
                  style={{ ...place, width: w, height: h }}
                >
                  <img
                    src={l.image.url}
                    alt=""
                    draggable="false"
                    style={l.base ? undefined : { borderRadius: photoRadius(w, h), boxShadow: `0 ${6 * k * (l.scale || 1)}px ${24 * k * (l.scale || 1)}px rgba(0,0,0,.35)` }}
                  />
                </div>
              );
            }
            const font = fontOf(l.font);
            return (
              <div
                key={l.id}
                {...common}
                className={`layer layer--text ${l.boxed ? 'layer--boxed' : ''} ${selected ? 'is-selected' : ''}`}
                style={{
                  ...place,
                  ...cssFont(font),
                  maxWidth: `${TEXT_WRAP * 100}%`,
                  fontSize: l.size * k,
                  color: l.boxed && l.color === '#ffffff' ? '#fff' : l.color,
                  '--box-bg': l.color === '#ffffff' ? 'rgba(0,0,0,.78)' : '#fff',
                }}
              >
                <TextLines l={l} />
              </div>
            );
          })}
      </div>
      {!readOnly && (
        <div ref={uiBox} className="layers-ui" {...handlers}>
          {tip && controls && (
            <div className="layers__tip" role="status">
              Arraste para mover · <RotateCw size={12} strokeWidth={2.8} aria-label="alça de girar" /> gira ·{' '}
              <MoveDiagonal2 size={12} strokeWidth={2.8} aria-label="alça de tamanho" /> muda o tamanho
              {coarse ? ' · ou use dois dedos' : ' · ou a rodinha do mouse'}
            </div>
          )}
          {controls}
        </div>
      )}
    </>
  );
}

// Escrever ou editar um texto: fonte, cor, fundo e tamanho
export function TextEditor({ initial, onDone, onDelete, scale }) {
  const [text, setText] = useState(initial.text || '');
  const [color, setColor] = useState(initial.color || '#ffffff');
  const [boxed, setBoxed] = useState(!!initial.boxed);
  const [size, setSize] = useState(initial.size || 76);
  const [font, setFont] = useState(initial.font || 'classica');
  const ref = useRef(null);
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 60);
  }, []);
  const f = fontOf(font);
  const style = {
    ...cssFont(f),
    color: boxed ? (color === '#ffffff' ? '#fff' : color) : color,
    fontSize: size * scale,
    background: boxed ? (color === '#ffffff' ? 'rgba(0,0,0,.78)' : '#fff') : 'transparent',
  };
  return (
    <div className="text-editor">
      <div className="text-editor__top">
        {initial.id ? (
          <button type="button" className="icon-btn icon-btn--light" aria-label="Apagar texto" onClick={onDelete}>
            <Trash2 size={22} />
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="text-editor__done" onClick={() => onDone({ ...initial, text, color, boxed, size, font })}>
          Concluir
        </button>
      </div>
      <div className="text-editor__body">
        <input
          type="range"
          className="text-editor__size"
          min={40}
          max={150}
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          aria-label="Tamanho do texto"
        />
        <textarea ref={ref} value={text} onChange={(e) => setText(e.target.value)} placeholder="Digite…" rows={3} style={style} maxLength={220} />
      </div>
      <div className="text-editor__fonts" role="radiogroup" aria-label="Fonte">
        {TEXT_FONTS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={font === x.id}
            className={`font-chip ${font === x.id ? 'is-on' : ''}`}
            style={{ ...cssFont(x), lineHeight: 1 }}
            onClick={() => setFont(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="text-editor__bottom">
        <button type="button" className={`text-editor__box ${boxed ? 'is-on' : ''}`} onClick={() => setBoxed((b) => !b)} aria-label="Fundo no texto">
          A
        </button>
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch ${color === c ? 'is-on' : ''}`}
            style={{ background: c }}
            onClick={() => setColor(c)}
            aria-label={`Cor ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

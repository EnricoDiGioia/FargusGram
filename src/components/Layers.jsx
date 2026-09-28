import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import '@fontsource/special-elite/latin-400.css';
import '@fontsource/pacifico/latin-400.css';
import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/playfair-display/latin-700-italic.css';
import { TEXT_FONTS, fontOf, cssFont } from '../lib/fonts';
import { LAYER_REF_W, TEXT_WRAP, photoRadius, prepareImage } from '../lib/media';

// ---------------------------------------------------------------------
// Camadas por cima da foto (story e publicação): textos e fotos.
//   um dedo arrasta · dois dedos aumentam e giram · no computador, a
//   bolinha do canto gira e muda o tamanho · ✕ tira a camada
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

// fotos novas entram em cascata, levemente giradas, para não ficarem uma em cima da outra
export function newPhotoLayer(layers, image, i = 0) {
  const n = layers.filter((l) => l.kind === 'photo').length + i;
  return {
    id: newId(),
    kind: 'photo',
    image,
    x: 0.5 + ((n % 3) - 1) * 0.08,
    y: 0.44 + (n % 3) * 0.06,
    rot: n ? (n % 2 ? 0.07 : -0.06) : 0,
    scale: 1,
    z: topZ(layers) + 1 + i,
    w: 0.56,
  };
}

// abre as fotos escolhidas (menores que a principal: poupa memória)
export async function photoLayersFrom(files, layers, onError) {
  const room = MAX_PHOTO_LAYERS - layers.filter((l) => l.kind === 'photo').length;
  const out = [];
  for (const file of [...files].slice(0, Math.max(0, room))) {
    try {
      const image = await prepareImage(file, 1400);
      out.push(newPhotoLayer(layers, image, out.length));
    } catch (err) {
      onError?.(err.message);
    }
  }
  if (files.length > room) onError?.(`Dá para colocar até ${MAX_PHOTO_LAYERS} fotos por cima.`);
  return out;
}

export function revokeLayers(layers) {
  for (const l of layers || []) if (l.kind === 'photo') URL.revokeObjectURL(l.image.url);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
// gruda no reto (0°, 90°, 180°) quando passa perto
function snap(a) {
  let r = Math.atan2(Math.sin(a), Math.cos(a));
  for (const t of [-Math.PI, -Math.PI / 2, 0, Math.PI / 2, Math.PI]) if (Math.abs(r - t) < 0.05) r = t;
  return r;
}
const scaleLimits = (l) => (l.kind === 'photo' ? [0.2, 3] : [0.3, 5]);

function TextLines({ l }) {
  if (!l.boxed) return l.text;
  return l.text.split('\n').map((line, i) => (
    <span key={i} className="layer__line">
      {line}
    </span>
  ));
}

// readOnly: só mostra (prévia), sem gestos
export function LayerStage({ layers, onChange, onEditText, className = '', readOnly = false }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState(null);
  const [gesturing, setGesturing] = useState(false);
  const g = useRef(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;

  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // tocar fora das camadas tira a seleção
  useEffect(() => {
    if (!sel) return undefined;
    const onDown = (e) => {
      if (!e.target.closest?.('.layer')) setSel(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [sel]);

  // camada apagada por fora (ex.: no editor de texto)
  useEffect(() => {
    if (sel && !layers.some((l) => l.id === sel)) setSel(null);
  }, [layers, sel]);

  const update = (id, patch) => onChange(layersRef.current.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id) => {
    const l = layersRef.current.find((x) => x.id === id);
    if (l?.kind === 'photo') URL.revokeObjectURL(l.image.url);
    onChange(layersRef.current.filter((x) => x.id !== id));
    setSel(null);
  };

  // (re)começa o gesto a partir dos dedos que estão na tela agora
  const begin = () => {
    const G = g.current;
    const pts = [...G.pointers.values()];
    G.start = layersRef.current.find((l) => l.id === G.id);
    G.p0 = pts.map((p) => ({ ...p }));
    if (G.mode === 'handle') return;
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
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (g.current && g.current.mode !== 'handle' && g.current.pointers.size > 0 && g.current.id !== l.id) {
      // dedo extra em outra camada: continua o gesto da que já está sendo mexida
      g.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      begin();
      return;
    }
    if (!g.current || g.current.id !== l.id) {
      g.current = { id: l.id, pointers: new Map(), moved: false, t0: Date.now(), mode: 'move' };
      // a camada tocada vem para a frente
      const z = topZ(layersRef.current);
      if ((l.z || 0) < z) update(l.id, { z: z + 1 });
    }
    g.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setSel(l.id);
    setGesturing(true);
    begin();
  };

  // segundo dedo em qualquer lugar da foto, durante um gesto
  const onStageDown = (e) => {
    if (!g.current || g.current.mode === 'handle') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    g.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    begin();
  };

  // bolinha do canto: gira e muda o tamanho com um dedo (ou o mouse)
  const onHandleDown = (e, l) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = box.current.getBoundingClientRect();
    const center = { x: r.left + l.x * r.width, y: r.top + l.y * r.height };
    const p = { x: e.clientX, y: e.clientY };
    g.current = { id: l.id, pointers: new Map([[e.pointerId, p]]), mode: 'handle', moved: true, t0: Date.now(), center, start: l, a0: angle(center, p), d0: dist(center, p) || 1 };
    setGesturing(true);
  };

  const onMove = (e) => {
    const G = g.current;
    if (!G || !G.pointers.has(e.pointerId)) return;
    G.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...G.pointers.values()];
    const s = G.start;
    if (!s) return;
    const [lo, hi] = scaleLimits(s);
    if (G.mode === 'handle') {
      const p = pts[0];
      update(G.id, { rot: snap(s.rot + angle(G.center, p) - G.a0), scale: clamp((s.scale * dist(G.center, p)) / G.d0, lo, hi) });
    } else if (G.mode === 'pinch' && pts.length >= 2) {
      const m = mid(pts[0], pts[1]);
      update(G.id, {
        scale: clamp((s.scale * dist(pts[0], pts[1])) / G.d0, lo, hi),
        rot: snap(s.rot + angle(pts[0], pts[1]) - G.a0),
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
      if (l?.kind === 'text') onEditText?.(l);
    }
  };

  const k = size.w / LAYER_REF_W;
  const handlers = readOnly ? {} : { onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  return (
    <div
      ref={box}
      className={`layers ${gesturing ? 'is-gesturing' : ''} ${readOnly ? 'layers--static' : ''} ${className}`}
      onPointerDown={readOnly ? undefined : onStageDown}
      {...handlers}
    >
      {size.w > 0 &&
        layers.map((l) => {
          const selected = sel === l.id;
          const inv = { transform: `scale(${1 / (l.scale || 1)})` };
          const common = {
            'data-layer': l.id,
            onPointerDown: readOnly ? undefined : (e) => onLayerDown(e, l),
            ...handlers,
          };
          const place = {
            left: `${l.x * 100}%`,
            top: `${l.y * 100}%`,
            zIndex: l.z || 0,
            transform: `translate(-50%, -50%) rotate(${l.rot || 0}rad) scale(${l.scale || 1})`,
          };
          const ui = selected && (
            <>
              <button
                type="button"
                className="layer__remove"
                style={inv}
                aria-label={l.kind === 'photo' ? 'Tirar foto' : 'Apagar texto'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => remove(l.id)}
              >
                <X size={14} strokeWidth={3} />
              </button>
              <span
                className="layer__handle"
                style={inv}
                role="presentation"
                title="Arraste para girar e mudar o tamanho"
                onPointerDown={(e) => onHandleDown(e, l)}
                {...handlers}
              />
            </>
          );
          if (l.kind === 'photo') {
            const w = l.w * size.w;
            const h = w * (l.image.height / l.image.width);
            return (
              <div key={l.id} {...common} className={`layer layer--photo ${selected ? 'is-selected' : ''}`} style={{ ...place, width: w, height: h }}>
                <img
                  src={l.image.url}
                  alt=""
                  draggable="false"
                  style={{ borderRadius: photoRadius(w, h), boxShadow: `0 ${6 * k * (l.scale || 1)}px ${24 * k * (l.scale || 1)}px rgba(0,0,0,.35)` }}
                />
                {ui}
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
              {ui}
            </div>
          );
        })}
    </div>
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

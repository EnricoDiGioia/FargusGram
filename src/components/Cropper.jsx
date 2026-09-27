import { useEffect, useRef, useState } from 'react';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function defaultCrop(image) {
  return { z: 1, cx: image.width / 2, cy: image.height / 2 };
}

// Área visível (em pixels da imagem) para um recorte com esta proporção
export function cropRect(image, aspect, state) {
  const iw = image.width;
  const ih = image.height;
  let sw;
  let sh;
  if (iw / ih > aspect) {
    sh = ih / state.z;
    sw = sh * aspect;
  } else {
    sw = iw / state.z;
    sh = sw / aspect;
  }
  const sx = clamp(state.cx - sw / 2, 0, iw - sw);
  const sy = clamp(state.cy - sh / 2, 0, ih - sh);
  return { sx, sy, sw, sh };
}

function clampState(image, aspect, s) {
  const z = clamp(s.z, 1, 5);
  const r = cropRect(image, aspect, { ...s, z });
  return { z, cx: r.sx + r.sw / 2, cy: r.sy + r.sh / 2 };
}

// Moldura com a foto: arraste para posicionar, pinça (ou roda do mouse) para zoom
export default function Cropper({ image, aspect, value, onChange, filter = 'none', round = false, grid = true, className = '' }) {
  const frame = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const state = value || defaultCrop(image);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const emit = (s) => onChange?.(clampState(image, aspect, s));

  const onPointerDown = (e) => {
    frame.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    startGesture();
  };

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const s = stateRef.current;
    if (pts.length === 1) gesture.current = { type: 'pan', x: pts[0].x, y: pts[0].y, s };
    else if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      gesture.current = { type: 'pinch', d, s };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g || !size.w) return;
    const pts = [...pointers.current.values()];
    const r = cropRect(image, aspect, g.s);
    const scale = size.w / r.sw; // px da tela por px da imagem
    if (g.type === 'pan' && pts.length === 1) {
      const dx = pts[0].x - g.x;
      const dy = pts[0].y - g.y;
      emit({ ...g.s, cx: g.s.cx - dx / scale, cy: g.s.cy - dy / scale });
    } else if (g.type === 'pinch' && pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      emit({ ...g.s, z: g.s.z * (d / (g.d || d)) });
    }
  };

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      setDragging(false);
    } else startGesture();
  };

  const onWheel = (e) => {
    e.preventDefault();
    const s = stateRef.current;
    emit({ ...s, z: s.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08) });
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // posição da imagem na tela
  let style = { visibility: 'hidden' };
  if (size.w) {
    const r = cropRect(image, aspect, state);
    const scale = size.w / r.sw;
    style = {
      width: image.width * scale,
      height: image.height * scale,
      transform: `translate3d(${-r.sx * scale}px, ${-r.sy * scale}px, 0)`,
      filter,
    };
  }

  return (
    <div
      ref={frame}
      className={`cropper ${round ? 'cropper--round' : ''} ${className}`}
      style={{ aspectRatio: String(aspect) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <img src={image.url} alt="" draggable="false" style={style} />
      {grid && dragging && <div className="cropper__grid" />}
      {round && <div className="cropper__round-mask" />}
    </div>
  );
}

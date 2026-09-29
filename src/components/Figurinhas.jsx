import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Check } from 'lucide-react';
import '@fontsource/bebas-neue/latin-400.css';
import { Sheet, Spinner, useConfirm } from './ui';
import Cropper, { cropRect, defaultCrop } from './Cropper';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { mediaUrl } from '../lib/supabase';
import { drawSticker, prepareImage, renderSticker } from '../lib/media';
import * as api from '../lib/api';

// ---------------------------------------------------------------------
// Figurinhas, como as do WhatsApp: cada jogador tem as dele (criadas a
// partir de uma foto ou salvas de quem mandou) e usa no Direct e nos
// comentários.
// ---------------------------------------------------------------------

// lista em memória, compartilhada pelas telas (carrega uma vez)
let cache = null;
let cacheUid = null; // de qual jogador é a lista (troca de conta no mesmo aparelho)
let loading = null;
const subs = new Set();
const publish = (list) => {
  cache = list;
  subs.forEach((fn) => fn(list));
};
export function useMyStickers(enabled = true) {
  const { uid } = useSession();
  if (cacheUid !== uid) {
    cacheUid = uid;
    cache = null;
    loading = null;
  }
  const [list, setList] = useState(cache);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    subs.add(setList);
    if (!cache && !loading) {
      loading = api
        .myStickers()
        .then((l) => publish(l || []))
        .catch((e) => setError(api.errorMessage(e)))
        .finally(() => {
          loading = null;
        });
    } else if (cache) setList(cache);
    return () => subs.delete(setList);
  }, [enabled]);
  return { list, error };
}
// (lista ainda não carregada: fica para quando abrir a bandeja)
const addToCache = (s) => s && cache && publish([s, ...cache.filter((x) => x.id !== s.id && x.path !== s.path)]);
const hasPath = (path) => (cache || []).some((s) => s.path === path);

// Salvar a figurinha que alguém mandou (Direct ou comentário)
export function useSaveSticker() {
  const toast = useToast();
  return useCallback(
    async (m) => {
      if (hasPath(m.path)) {
        toast('Essa figurinha já está nas suas');
        return;
      }
      try {
        const s = await api.saveSticker(m);
        if (s) addToCache(s);
        toast(s ? 'Figurinha salva nas suas' : 'Essa figurinha já está nas suas');
      } catch (err) {
        toast(api.errorMessage(err));
      }
    },
    [toast]
  );
}

export function StickerImg({ path, className = '', alt = 'Figurinha', ...rest }) {
  return <img src={mediaUrl(path)} alt={alt} className={`sticker-img ${className}`} loading="lazy" draggable="false" {...rest} />;
}

// Escolher uma figurinha (ou criar uma nova)
export function StickerTray({ open, onClose, onPick }) {
  const { list, error } = useMyStickers(open);
  const confirm = useConfirm();
  const toast = useToast();
  const fileInput = useRef(null);
  const [file, setFile] = useState(null);
  const press = useRef(null);

  const remove = async (s) => {
    const ok = await confirm({ title: 'Tirar das suas figurinhas?', message: 'Quem já recebeu continua vendo.', confirmText: 'Tirar', danger: true });
    if (!ok) return;
    try {
      await api.removeSticker(s.id);
      publish((cache || []).filter((x) => x.id !== s.id));
    } catch (err) {
      toast(api.errorMessage(err));
    }
  };

  return (
    <>
      <Sheet open={open && !file} onClose={onClose} title="Figurinhas" className="sheet--tall">
        <div className="sticker-grid">
          <button type="button" className="sticker-grid__new" onClick={() => fileInput.current?.click()}>
            <Plus size={26} />
            <span>Criar</span>
          </button>
          {list?.map((s) => (
            <button
              key={s.id}
              type="button"
              className="sticker-grid__item"
              aria-label="Enviar figurinha"
              onClick={() => {
                if (press.current === s.id) return;
                onPick(s);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                remove(s);
              }}
              onPointerDown={() => {
                press.current = null;
                clearTimeout(press.t);
                press.t = setTimeout(() => {
                  press.current = s.id;
                  remove(s);
                }, 550);
              }}
              onPointerUp={() => clearTimeout(press.t)}
              onPointerLeave={() => clearTimeout(press.t)}
              onPointerCancel={() => clearTimeout(press.t)}
            >
              <StickerImg path={s.path} />
            </button>
          ))}
        </div>
        {!list && !error && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        {error && <p className="muted center-pad">{error}</p>}
        {list?.length === 0 && (
          <p className="muted center small sticker-grid__empty">
            Crie figurinhas com as suas fotos, ou salve as que mandarem para você (segure a figurinha e toque em "Salvar figurinha").
          </p>
        )}
        {list?.length > 0 && <p className="muted center small sticker-grid__hint">Segure uma figurinha para tirar da lista.</p>}
      </Sheet>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setFile(f);
        }}
      />
      {file && (
        <StickerMaker
          file={file}
          onCancel={() => setFile(null)}
          onDone={(s) => {
            setFile(null);
            addToCache(s);
          }}
        />
      )}
    </>
  );
}

const SHAPES = [
  { id: 'square', label: 'Quadrada' },
  { id: 'rounded', label: 'Arredondada' },
  { id: 'round', label: 'Redonda' },
];

// Criar figurinha a partir de uma foto: recorte quadrado, formato, fundo
// branco apagado, contorno e legenda
export function StickerMaker({ file, onDone, onCancel }) {
  const { uid, active } = useSession();
  const toast = useToast();
  const [image, setImage] = useState(null);
  const [crop, setCrop] = useState(null);
  const [opts, setOpts] = useState({ shape: 'rounded', removeWhite: false, outline: true, text: '' });
  const [saving, setSaving] = useState(false);
  const preview = useRef(null);

  useEffect(() => {
    let alive = true;
    let url;
    prepareImage(file, 1400)
      .then((img) => {
        url = img.url;
        if (!alive) return URL.revokeObjectURL(img.url);
        setImage(img);
        setCrop(defaultCrop(img));
      })
      .catch((err) => {
        toast(err.message);
        onCancel();
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  // prévia de como fica (redesenha quando muda o recorte ou uma opção)
  useEffect(() => {
    if (!image || !crop) return undefined;
    let alive = true;
    const t = setTimeout(async () => {
      const c = await drawSticker(image.img, cropRect(image, 1, crop), opts, 200);
      const el = preview.current;
      if (!alive || !el) return;
      const ctx = el.getContext('2d');
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(c, 0, 0, el.width, el.height);
    }, 60);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [image, crop, opts]);

  const save = async () => {
    if (!image || saving) return;
    setSaving(true);
    try {
      const { blob } = await renderSticker(image.img, cropRect(image, 1, crop), opts);
      const s = await api.createSticker(uid, active.id, blob);
      toast('Figurinha criada');
      onDone(s);
    } catch (err) {
      toast(api.errorMessage(err));
      setSaving(false);
    }
  };
  const set = (patch) => setOpts((o) => ({ ...o, ...patch }));

  return createPortal(
    <div className="sticker-maker" role="dialog" aria-label="Criar figurinha">
      <div className="sticker-maker__top">
        <button type="button" className="text-editor__cancel" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <strong>Nova figurinha</strong>
        <button type="button" className="text-editor__done" onClick={save} disabled={!image || saving}>
          {saving ? <Spinner size={16} className="spinner--inline" /> : 'Salvar'}
        </button>
      </div>
      {!image ? (
        <div className="center-pad">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="sticker-maker__crop">
            <Cropper image={image} aspect={1} value={crop} onChange={setCrop} round={opts.shape === 'round'} />
          </div>
          <div className="sticker-maker__row">
            <canvas ref={preview} width={200} height={200} className="sticker-maker__preview" aria-label="Prévia da figurinha" />
            <div className="sticker-maker__opts">
              <div className="sticker-maker__chips" role="radiogroup" aria-label="Formato">
                {SHAPES.map((sh) => (
                  <button key={sh.id} type="button" role="radio" aria-checked={opts.shape === sh.id} className={opts.shape === sh.id ? 'is-on' : ''} onClick={() => set({ shape: sh.id })}>
                    {sh.label}
                  </button>
                ))}
              </div>
              <button type="button" className={`sticker-maker__toggle ${opts.removeWhite ? 'is-on' : ''}`} aria-pressed={opts.removeWhite} onClick={() => set({ removeWhite: !opts.removeWhite })}>
                {opts.removeWhite ? <Check size={16} /> : <X size={16} />} Tirar fundo branco
              </button>
              <button type="button" className={`sticker-maker__toggle ${opts.outline ? 'is-on' : ''}`} aria-pressed={opts.outline} onClick={() => set({ outline: !opts.outline })}>
                {opts.outline ? <Check size={16} /> : <X size={16} />} Contorno branco
              </button>
              <input className="sticker-maker__text" value={opts.text} onChange={(e) => set({ text: e.target.value })} placeholder="Legenda (opcional)" maxLength={40} aria-label="Legenda" />
            </div>
          </div>
          <p className="muted small center sticker-maker__hint">Arraste e use dois dedos (ou a rodinha) para enquadrar.</p>
        </>
      )}
    </div>,
    document.body
  );
}

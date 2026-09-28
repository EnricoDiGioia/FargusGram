import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { X, Type, Images, Palette, Trash2, ChevronRight, Music2 } from 'lucide-react';
import { Spinner, useConfirm, FullScreen } from '../components/ui';
import Cropper, { cropRect, defaultCrop } from '../components/Cropper';
import Avatar from '../components/Avatar';
import MusicPicker from '../components/MusicPicker';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { prepareImage, renderStory, STORY_BACKGROUNDS, STORY_FONT, STORY_W } from '../lib/media';
import { emit } from '../lib/events';
import { pageCache } from '../lib/storage';
import { clipOf, musicForDb, musicLabel, player } from '../lib/music';
import { drawMusicSticker, loadArtwork, nextStickerStyle } from '../lib/musicSticker';
import * as api from '../lib/api';

const COLORS = ['#ffffff', '#000000', '#f43f5e', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#8b5cf6', '#d946ef'];
const ASPECT = 9 / 16;
const EDITOR_MUSIC = 'story-editor';

function TextEditor({ initial, onDone, onDelete, scale }) {
  const [text, setText] = useState(initial.text || '');
  const [color, setColor] = useState(initial.color || '#ffffff');
  const [boxed, setBoxed] = useState(!!initial.boxed);
  const [size, setSize] = useState(initial.size || 76);
  const ref = useRef(null);
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 60);
  }, []);
  const style = {
    color: boxed ? (color === '#ffffff' ? '#fff' : color) : color,
    fontSize: size * scale,
    background: boxed ? (color === '#ffffff' ? 'rgba(0,0,0,.78)' : '#fff') : 'transparent',
    fontFamily: STORY_FONT,
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
        <button type="button" className="text-editor__done" onClick={() => onDone({ ...initial, text, color, boxed, size })}>
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
      <div className="text-editor__bottom">
        <button type="button" className={`text-editor__box ${boxed ? 'is-on' : ''}`} onClick={() => setBoxed((b) => !b)} aria-label="Fundo no texto">
          A
        </button>
        {COLORS.map((c) => (
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

export default function CreateStory() {
  const { active, uid, can } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef(null);
  const frame = useRef(null);
  const [image, setImage] = useState(null);
  const [crop, setCrop] = useState(null);
  const [gi, setGi] = useState(0);
  const [texts, setTexts] = useState([]);
  const [editing, setEditing] = useState(null);
  const [scale, setScale] = useState(0.35);
  const [busy, setBusy] = useState(false);
  const [music, setMusic] = useState(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [sticker, setSticker] = useState(null); // { x, y, style }
  const [art, setArt] = useState(null);
  const [stickerImg, setStickerImg] = useState(null); // { canvas, url }
  const drag = useRef(null);

  // capa da música (para o adesivo)
  useEffect(() => {
    let alive = true;
    setArt(null);
    if (music?.artwork) loadArtwork(music.artwork).then((img) => alive && setArt(img));
    return () => {
      alive = false;
    };
  }, [music?.artwork]);

  // desenha o adesivo igual ao que vai para o story
  const stickerStyle = sticker?.style;
  useEffect(() => {
    if (!music || !stickerStyle) {
      setStickerImg(null);
      return;
    }
    const canvas = drawMusicSticker(music, stickerStyle, art);
    let url;
    try {
      url = canvas.toDataURL('image/png');
    } catch {
      // se a capa "sujou" o canvas, desenha sem ela
      const plain = drawMusicSticker(music, stickerStyle, null);
      setStickerImg({ canvas: plain, url: plain.toDataURL('image/png') });
      return;
    }
    setStickerImg({ canvas, url });
  }, [music, stickerStyle, art]);

  // toca o trecho escolhido enquanto edita (o seletor toca o dele quando está aberto)
  useEffect(() => {
    if (!music || musicOpen) {
      player.release(EDITOR_MUSIC);
      return;
    }
    player.request(EDITOR_MUSIC, clipOf(music));
  }, [music, musicOpen]);
  useEffect(() => () => player.release(EDITOR_MUSIC), []);

  const chooseMusic = (m, { sticker: show } = {}) => {
    setMusic(m);
    if (!m || !show) setSticker(null);
    else setSticker((st) => st || { x: 0.5, y: 0.74, style: 'light' });
  };

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / STORY_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const img = await prepareImage(file, 2200);
      setImage(img);
      setCrop(defaultCrop(img));
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doneText = (t) => {
    setEditing(null);
    if (!t.text.trim()) {
      if (t.id) setTexts((xs) => xs.filter((x) => x.id !== t.id));
      return;
    }
    if (t.id) setTexts((xs) => xs.map((x) => (x.id === t.id ? t : x)));
    else setTexts((xs) => [...xs, { ...t, id: Date.now(), x: 0.5, y: 0.42 }]);
  };

  // arrastar textos e o adesivo de música (id 'sticker')
  const onTextDown = (e, t) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { id: t.id, sx: e.clientX, sy: e.clientY, x: t.x, y: t.y, moved: false };
  };
  const onTextMove = (e) => {
    const d = drag.current;
    if (!d || !frame.current) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    const w = frame.current.clientWidth;
    const h = frame.current.clientHeight;
    const x = Math.max(0.05, Math.min(0.95, d.x + dx / w));
    const y = Math.max(0.04, Math.min(0.96, d.y + dy / h));
    if (d.id === 'sticker') setSticker((st) => (st ? { ...st, x, y } : st));
    else setTexts((xs) => xs.map((t) => (t.id === d.id ? { ...t, x, y } : t)));
  };
  const onTextUp = (t) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    // toque no adesivo troca o estilo; toque no texto abre a edição
    if (t.id === 'sticker') setSticker((st) => (st ? { ...st, style: nextStickerStyle(st.style) } : st));
    else setEditing(t);
  };

  const close = async () => {
    if (image || texts.length || music) {
      const ok = await confirm({ title: 'Descartar story?', confirmText: 'Descartar', danger: true });
      if (!ok) return;
    }
    navigate(-1);
  };

  const share = async () => {
    if (!image && !texts.length && !music) {
      toast('Escolha uma foto, escreva um texto ou coloque uma música');
      return;
    }
    setBusy(true);
    let path;
    let thumbPath;
    try {
      const { blob, thumb, width, height } = await renderStory({
        img: image?.img,
        crop: image ? cropRect(image, ASPECT, crop) : null,
        gradient: STORY_BACKGROUNDS[gi],
        texts,
        stickers: music && sticker && stickerImg ? [{ canvas: stickerImg.canvas, x: sticker.x, y: sticker.y }] : [],
      });
      path = await api.uploadImage(uid, active.id, 'stories', blob);
      // miniatura só quando o banco já tem destaques (senão não há onde guardar)
      if (can('destaques')) thumbPath = await api.uploadImage(uid, active.id, 'stories', thumb);
      await api.createStory({
        character: active.id,
        path,
        thumbPath,
        width,
        height,
        music: music ? musicForDb(music, { sticker: sticker ? { x: sticker.x, y: sticker.y, style: sticker.style } : null }) : null,
      });
      player.release(EDITOR_MUSIC);
      pageCache.delete(`tray:${active.id}`);
      emit('story:change');
      toast('Story publicado!');
      navigate('/', { replace: true });
    } catch (err) {
      if (path) api.removeFiles([path, thumbPath]).catch(() => {});
      toast(api.errorMessage(err));
      setBusy(false);
    }
  };

  const [a, b] = STORY_BACKGROUNDS[gi];

  return (
    <FullScreen className={`story-editor ${editing ? 'is-editing' : ''}`}>
      <div className="story-editor__frame" ref={frame}>
        {image ? (
          <Cropper image={image} aspect={ASPECT} value={crop} onChange={setCrop} grid={false} className="story-editor__photo" />
        ) : (
          <button
            type="button"
            className="story-editor__bg"
            style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}
            onClick={() => setEditing({})}
            aria-label="Escrever texto"
          >
            {!texts.length && <span>Toque para escrever</span>}
          </button>
        )}

        {music && sticker && stickerImg && (
          <img
            className="story-sticker"
            src={stickerImg.url}
            alt={`Música: ${musicLabel(music)}`}
            draggable="false"
            style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: stickerImg.canvas.width * scale }}
            onPointerDown={(e) => onTextDown(e, { id: 'sticker', ...sticker })}
            onPointerMove={onTextMove}
            onPointerUp={() => onTextUp({ id: 'sticker' })}
            onPointerCancel={() => (drag.current = null)}
          />
        )}

        {texts.map((t) => (
          <div
            key={t.id}
            className={`story-text ${t.boxed ? 'story-text--boxed' : ''}`}
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
              fontSize: t.size * scale,
              color: t.boxed && t.color === '#ffffff' ? '#fff' : t.color,
              '--box-bg': t.color === '#ffffff' ? 'rgba(0,0,0,.78)' : '#fff',
              fontFamily: STORY_FONT,
            }}
            onPointerDown={(e) => onTextDown(e, t)}
            onPointerMove={onTextMove}
            onPointerUp={() => onTextUp(t)}
            onPointerCancel={() => (drag.current = null)}
          >
            {t.boxed ? (
              t.text.split('\n').map((line, i) => (
                <span key={i} className="story-text__line">
                  {line}
                </span>
              ))
            ) : (
              t.text
            )}
          </div>
        ))}

        <div className="story-editor__top">
          <button type="button" className="icon-btn icon-btn--light" onClick={close} aria-label="Fechar">
            <X size={28} />
          </button>
          <div className="story-editor__tools">
            <button type="button" className="icon-btn icon-btn--light" onClick={() => setEditing({})} aria-label="Adicionar texto">
              <Type size={26} />
            </button>
            <button
              type="button"
              className={`icon-btn icon-btn--light ${music ? 'is-on' : ''}`}
              onClick={() => setMusicOpen(true)}
              aria-label={music ? `Música: ${musicLabel(music)}` : 'Adicionar música'}
            >
              <Music2 size={25} />
            </button>
            {!image && (
              <button type="button" className="icon-btn icon-btn--light" onClick={() => setGi((g) => (g + 1) % STORY_BACKGROUNDS.length)} aria-label="Trocar fundo">
                <Palette size={26} />
              </button>
            )}
            {image && (
              <button type="button" className="icon-btn icon-btn--light" onClick={() => setImage(null)} aria-label="Remover foto">
                <Trash2 size={24} />
              </button>
            )}
          </div>
        </div>

        <button type="button" className="story-editor__gallery" onClick={() => fileInput.current?.click()} aria-label="Escolher foto da galeria">
          {busy && !image ? <Spinner size={20} /> : <Images size={26} />}
        </button>
      </div>

      <div className="story-editor__bar">
        <button type="button" className="story-share" onClick={share} disabled={busy}>
          <Avatar character={active} size={28} />
          <span>Seu story</span>
          {busy ? <Spinner size={16} className="spinner--inline" /> : <ChevronRight size={18} />}
        </button>
      </div>

      <input ref={fileInput} type="file" accept="image/*" hidden onChange={pick} />
      <MusicPicker open={musicOpen} onClose={() => setMusicOpen(false)} value={music && { ...music, sticker }} onChange={chooseMusic} story />
      {editing && (
        <TextEditor
          initial={editing}
          scale={scale}
          onDone={doneText}
          onDelete={() => {
            setTexts((xs) => xs.filter((x) => x.id !== editing.id));
            setEditing(null);
          }}
        />
      )}
    </FullScreen>
  );
}

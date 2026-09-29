import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { X, Type, Images, Palette, Trash2, ChevronRight, Music2, Star, ListChecks, ImagePlus, Sticker } from 'lucide-react';
import { Spinner, useConfirm, FullScreen } from '../components/ui';
import Avatar from '../components/Avatar';
import MusicPicker from '../components/MusicPicker';
import { CloseFriendsSheet } from '../components/CloseFriends';
import { MAX_STICKERS, MentionPicker, StickerEditor, StickerPicker, newSticker, nextTimeStyle, stickersForDb, timeFields } from '../components/StoryStickers';
import { LayerStage, TextEditor, newBaseLayer, newRepostLayer, newTextLayer, photoLayersFrom, repostHotspots, revokeLayers, MAX_TEXT_LAYERS } from '../components/Layers';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { photoColors, prepareImage, renderStory, STORY_BACKGROUNDS, STORY_W } from '../lib/media';
import { emit } from '../lib/events';
import { pageCache } from '../lib/storage';
import { clipOf, musicForDb, musicLabel, player } from '../lib/music';
import { drawMusicSticker, loadArtwork, nextStickerStyle } from '../lib/musicSticker';
import * as api from '../lib/api';
import { mediaUrl } from '../lib/supabase';

const ASPECT = 9 / 16;
const EDITOR_MUSIC = 'story-editor';

export default function CreateStory() {
  const { active, uid, can } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef(null);
  const photoInput = useRef(null);
  const frame = useRef(null);
  const [gi, setGi] = useState(0); // fundo: -1 = cores da foto; 0… = degradês prontos
  const [photoBg, setPhotoBg] = useState(null);
  // textos e fotos (components/Layers); a foto da galeria é a camada `base`
  const [layers, setLayers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [stickerMenu, setStickerMenu] = useState(false);
  const [stickerEdit, setStickerEdit] = useState(null); // enquete, perguntas ou local sendo escrito
  const [mentionFor, setMentionFor] = useState(undefined); // undefined: fechado; null: nova; id: trocar
  const [scale, setScale] = useState(0.35);
  const [busy, setBusy] = useState(false);
  const [music, setMusic] = useState(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [sticker, setSticker] = useState(null); // { x, y, style }
  const [art, setArt] = useState(null);
  const [stickerImg, setStickerImg] = useState(null); // { canvas, url }
  const [closeSheet, setCloseSheet] = useState(false);
  const [closePending, setClosePending] = useState(false); // publicar assim que a lista tiver alguém
  const [sendingTo, setSendingTo] = useState(null); // qual botão mostra o "carregando"
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

  const layersRef = useRef(layers);
  layersRef.current = layers;
  useEffect(() => () => revokeLayers(layersRef.current), []);

  // fotos por cima (colagem)
  const pickPhotos = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    const added = await photoLayersFrom(files, layersRef.current, toast, 1 / ASPECT);
    setLayers((ls) => [...ls, ...added]);
    setBusy(false);
  };

  const addText = () => {
    if (layers.filter((l) => l.kind === 'text').length >= MAX_TEXT_LAYERS) {
      toast(`Dá para colocar até ${MAX_TEXT_LAYERS} textos.`);
      return;
    }
    setEditing({});
  };

  // foto da galeria: entra inteira no quadro, atrás de tudo, e dá para mover,
  // girar e mudar o tamanho como as outras; o fundo pega as cores dela
  const base = layers.find((l) => l.base);
  const repost = layers.find((l) => l.repost);
  const photoForBg = base || repost;

  // "Adicionar ao seu story" (story em que você foi marcado): entra como um
  // cartão com o @ de quem fez, e o fundo pega as cores dele
  const location = useLocation();
  const repostId = location.state?.repost;
  useEffect(() => {
    if (!repostId || !can('repost')) return undefined;
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const orig = await api.storyForRepost(repostId, active.id);
        const res = await fetch(mediaUrl(orig.path));
        if (!res.ok) throw new Error('Não consegui abrir o story.');
        const img = await prepareImage(await res.blob(), 1600);
        if (!alive) return URL.revokeObjectURL(img.url);
        setLayers((ls) => (ls.some((l) => l.repost) ? ls : [...ls, newRepostLayer(ls, img, orig)]));
        const colors = photoColors(img.img);
        if (colors) {
          setPhotoBg(colors);
          setGi(-1);
        }
      } catch (err) {
        if (alive) toast(api.errorMessage(err));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [repostId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const img = await prepareImage(file, 2200);
      const old = layersRef.current.find((l) => l.base);
      if (old) URL.revokeObjectURL(old.image.url);
      setLayers((ls) => [...ls.filter((l) => !l.base), newBaseLayer(img, 1 / ASPECT)]);
      const colors = photoColors(img.img);
      setPhotoBg(colors);
      if (colors) setGi(-1);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };
  const removeBase = () => {
    const old = layersRef.current.find((l) => l.base);
    if (old) URL.revokeObjectURL(old.image.url);
    setLayers((ls) => ls.filter((l) => !l.base));
  };
  const nextBackground = () =>
    setGi((g) => {
      const n = STORY_BACKGROUNDS.length;
      if (photoForBg && photoBg) return g + 1 >= n ? -1 : g + 1;
      return (Math.max(0, g) + 1) % n;
    });
  const bg = gi === -1 && photoForBg && photoBg ? photoBg : STORY_BACKGROUNDS[Math.max(0, gi)];

  const doneText = (t) => {
    setEditing(null);
    const { text, color, boxed, size, font } = t;
    if (!text.trim()) {
      if (t.id) setLayers((ls) => ls.filter((x) => x.id !== t.id));
      return;
    }
    if (t.id) setLayers((ls) => ls.map((x) => (x.id === t.id ? { ...x, text, color, boxed, size, font } : x)));
    else setLayers((ls) => [...ls, newTextLayer(ls, { text, color, boxed, size, font })]);
  };

  // figurinhas (enquete, perguntas, menção, local, horário)
  const pickSticker = (type) => {
    setStickerMenu(false);
    if (layers.filter((l) => l.kind === 'sticker').length >= MAX_STICKERS) {
      toast(`Dá para colocar até ${MAX_STICKERS} figurinhas.`);
      return;
    }
    if (type === 'time') setLayers((ls) => [...ls, newSticker(ls, 'time', timeFields())]);
    else if (type === 'mention') setMentionFor(null);
    else setStickerEdit({ type });
  };
  const doneSticker = (st) => {
    setStickerEdit(null);
    if (st.id) setLayers((ls) => ls.map((l) => (l.id === st.id ? { ...l, ...st } : l)));
    else {
      const { type, ...fields } = st;
      setLayers((ls) => [...ls, newSticker(ls, type, fields)]);
    }
  };
  const pickMention = (c) => {
    const id = mentionFor;
    setMentionFor(undefined);
    const fields = { character_id: c.id, handle: c.handle };
    if (id) setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...fields } : l)));
    else setLayers((ls) => [...ls, newSticker(ls, 'mention', fields)]);
  };
  // tocar numa camada: texto abre o editor; figurinha abre o dela (horário troca o estilo)
  const editLayer = (l) => {
    if (l.kind !== 'sticker') return setEditing(l);
    if (l.type === 'time') setLayers((ls) => ls.map((x) => (x.id === l.id ? { ...x, style: nextTimeStyle(x.style) } : x)));
    else if (l.type === 'mention') setMentionFor(l.id);
    else setStickerEdit(l);
  };

  // arrastar o adesivo de música; tocar troca o estilo
  const onStickerDown = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, x: sticker.x, y: sticker.y, moved: false };
  };
  const onStickerMove = (e) => {
    const d = drag.current;
    if (!d || !frame.current) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    const x = Math.max(0.05, Math.min(0.95, d.x + dx / frame.current.clientWidth));
    const y = Math.max(0.04, Math.min(0.96, d.y + dy / frame.current.clientHeight));
    setSticker((st) => (st ? { ...st, x, y } : st));
  };
  const onStickerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) setSticker((st) => (st ? { ...st, style: nextStickerStyle(st.style) } : st));
  };

  const close = async () => {
    if (layers.length || music) {
      const ok = await confirm({ title: 'Descartar story?', confirmText: 'Descartar', danger: true });
      if (!ok) return;
    }
    navigate(-1);
  };

  const isEmpty = () => {
    if (layers.length || music) return false;
    toast('Escolha uma foto, escreva um texto ou coloque uma música');
    return true;
  };

  // "Melhores amigos": com a lista vazia, abre a lista primeiro
  const shareClose = async () => {
    if (busy || isEmpty()) return;
    setBusy(true);
    setSendingTo('close_friends');
    let n = 0;
    try {
      n = (await api.closeFriendsList(active.id)).count;
    } catch (err) {
      toast(api.errorMessage(err));
      setBusy(false);
      return;
    }
    setBusy(false);
    if (n > 0) share('close_friends');
    else {
      setClosePending(true);
      setCloseSheet(true);
    }
  };

  const share = async (audience = 'all') => {
    if (isEmpty()) return;
    setBusy(true);
    setSendingTo(audience);
    let path;
    let thumbPath;
    try {
      const { blob, thumb, width, height } = await renderStory({
        gradient: bg,
        layers,
        stickers: music && sticker && stickerImg ? [{ canvas: stickerImg.canvas, x: sticker.x, y: sticker.y }] : [],
      });
      const figurinhas = can('interacoes') ? [...stickersForDb(layers), ...(can('repost') ? repostHotspots(layers) : [])] : [];
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
        audience,
        stickers: figurinhas,
      });
      player.release(EDITOR_MUSIC);
      pageCache.delete(`tray:${active.id}`);
      emit('story:change');
      toast(audience === 'close_friends' ? 'Story publicado para os melhores amigos!' : 'Story publicado!');
      navigate('/', { replace: true });
    } catch (err) {
      if (path) api.removeFiles([path, thumbPath]).catch(() => {});
      toast(api.errorMessage(err));
      setBusy(false);
    }
  };

  const [a, b] = bg;

  return (
    <FullScreen className={`story-editor ${editing || stickerEdit ? 'is-editing' : ''}`}>
      <div className="story-editor__frame" ref={frame}>
        <button
          type="button"
          className="story-editor__bg"
          style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}
          onClick={() => !layers.length && addText()}
          aria-label="Escrever texto"
          tabIndex={layers.length ? -1 : 0}
        >
          {!layers.length && <span>Toque para escrever</span>}
        </button>

        <LayerStage layers={layers} onChange={setLayers} onEditText={editLayer} avoid=".story-editor__top > *, .story-editor__gallery" />

        {music && sticker && stickerImg && (
          <img
            className="story-sticker"
            src={stickerImg.url}
            alt={`Música: ${musicLabel(music)}`}
            draggable="false"
            style={{ left: `${sticker.x * 100}%`, top: `${sticker.y * 100}%`, width: stickerImg.canvas.width * scale }}
            onPointerDown={onStickerDown}
            onPointerMove={onStickerMove}
            onPointerUp={onStickerUp}
            onPointerCancel={() => (drag.current = null)}
          />
        )}

        <div className="story-editor__top">
          <button type="button" className="icon-btn icon-btn--light" onClick={close} aria-label="Fechar">
            <X size={28} />
          </button>
          <div className="story-editor__tools">
            <button type="button" className="icon-btn icon-btn--light" onClick={addText} aria-label="Adicionar texto">
              <Type size={26} />
            </button>
            <button type="button" className="icon-btn icon-btn--light" onClick={() => photoInput.current?.click()} aria-label="Colocar foto por cima" disabled={busy}>
              <ImagePlus size={25} />
            </button>
            {can('interacoes') && (
              <button type="button" className="icon-btn icon-btn--light" onClick={() => setStickerMenu(true)} aria-label="Figurinhas">
                <Sticker size={25} />
              </button>
            )}
            <button
              type="button"
              className={`icon-btn icon-btn--light ${music ? 'is-on' : ''}`}
              onClick={() => setMusicOpen(true)}
              aria-label={music ? `Música: ${musicLabel(music)}` : 'Adicionar música'}
            >
              <Music2 size={25} />
            </button>
            <button type="button" className="icon-btn icon-btn--light" onClick={nextBackground} aria-label="Trocar fundo">
              <Palette size={26} />
            </button>
            {base && (
              <button type="button" className="icon-btn icon-btn--light" onClick={removeBase} aria-label="Remover foto">
                <Trash2 size={24} />
              </button>
            )}
          </div>
        </div>

        <button type="button" className="story-editor__gallery" onClick={() => fileInput.current?.click()} aria-label="Escolher foto da galeria">
          {busy ? <Spinner size={20} /> : <Images size={26} />}
        </button>
      </div>

      <div className="story-editor__bar">
        {can('melhores_amigos') ? (
          <>
            <button type="button" className="story-share" onClick={() => share()} disabled={busy}>
              <Avatar character={active} size={28} />
              <span>Seu story</span>
              {busy && sendingTo === 'all' && <Spinner size={16} className="spinner--inline" />}
            </button>
            <button type="button" className="story-share story-share--close" onClick={shareClose} disabled={busy}>
              <span className="story-share__star" aria-hidden="true">
                <Star size={15} fill="currentColor" strokeWidth={0} />
              </span>
              <span>Melhores amigos</span>
              {busy && sendingTo === 'close_friends' && <Spinner size={16} className="spinner--inline" />}
            </button>
            <button type="button" className="story-share__list" onClick={() => setCloseSheet(true)} disabled={busy} aria-label="Editar lista de melhores amigos">
              <ListChecks size={20} />
            </button>
          </>
        ) : (
          <button type="button" className="story-share" onClick={() => share()} disabled={busy}>
            <Avatar character={active} size={28} />
            <span>Seu story</span>
            {busy ? <Spinner size={16} className="spinner--inline" /> : <ChevronRight size={18} />}
          </button>
        )}
      </div>
      <CloseFriendsSheet
        open={closeSheet}
        onClose={() => {
          setCloseSheet(false);
          setClosePending(false);
        }}
        onDone={(n) => {
          if (closePending && n > 0) share('close_friends');
        }}
      />

      <input ref={fileInput} type="file" accept="image/*" hidden onChange={pick} />
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={pickPhotos} />
      <MusicPicker open={musicOpen} onClose={() => setMusicOpen(false)} value={music && { ...music, sticker }} onChange={chooseMusic} story />
      <StickerPicker open={stickerMenu} onClose={() => setStickerMenu(false)} onPick={pickSticker} />
      <MentionPicker open={mentionFor !== undefined} onClose={() => setMentionFor(undefined)} onPick={pickMention} viewer={active.id} />
      {stickerEdit && (
        <StickerEditor
          initial={stickerEdit}
          onDone={doneSticker}
          onCancel={() => setStickerEdit(null)}
          onDelete={() => {
            setLayers((ls) => ls.filter((x) => x.id !== stickerEdit.id));
            setStickerEdit(null);
          }}
        />
      )}
      {editing && (
        <TextEditor
          initial={editing}
          scale={scale}
          onDone={doneText}
          onDelete={() => {
            setLayers((ls) => ls.filter((x) => x.id !== editing.id));
            setEditing(null);
          }}
        />
      )}
    </FullScreen>
  );
}

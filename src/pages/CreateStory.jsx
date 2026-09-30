import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { X, Type, Images, Palette, Trash2, ChevronRight, Music2, Star, ListChecks, ImagePlus, Sticker, Scissors, Volume2, VolumeX } from 'lucide-react';
import { Spinner, useConfirm, FullScreen } from '../components/ui';
import Avatar from '../components/Avatar';
import MusicPicker from '../components/MusicPicker';
import { CloseFriendsSheet } from '../components/CloseFriends';
import { MAX_STICKERS, MentionPicker, StickerEditor, StickerPicker, newSticker, nextTimeStyle, stickersForDb, timeFields } from '../components/StoryStickers';
import { LayerStage, TextEditor, newBaseLayer, newRepostLayer, newTextLayer, photoLayersFrom, repostHotspots, revokeImage, revokeLayers, MAX_TEXT_LAYERS } from '../components/Layers';
import { VideoTrimmer, isVideoFile, MAX_SECONDS } from '../components/VideoEditParts';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { photoColors, prepareImage, renderStory, storyVideoComposer, STORY_BACKGROUNDS, STORY_W } from '../lib/media';
import { isVideoPath } from '../lib/videoFiles';
import { emit } from '../lib/events';
import { pageCache } from '../lib/storage';
import { clipOf, musicForDb, musicLabel, player } from '../lib/music';
import { drawMusicSticker, loadArtwork, nextStickerStyle } from '../lib/musicSticker';
import * as api from '../lib/api';
import { mediaUrl } from '../lib/supabase';

const ASPECT = 9 / 16;
const EDITOR_MUSIC = 'story-editor';
const VIDEO_W = 540; // story em vídeo: 540 × 960 (a foto é 1080 × 1920)
const VIDEO_H = 960;
const NO_VIDEOS = 'Vídeos ainda não estão ligados: falta rodar a atualização do banco (veja o README).';

// abre um vídeo (a biblioteca de vídeo só carrega aqui)
async function openClip(file) {
  const ve = await import('../lib/videoEdit');
  const support = await ve.videoSupport();
  if (!support.ok) throw new Error(support.reason);
  return ve.openVideo(file);
}

export default function CreateStory() {
  const { active, uid, can } = useSession();
  const videosOn = can('videos');
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
  const [trimming, setTrimming] = useState(false);
  const [progress, setProgress] = useState(null); // preparando o vídeo (0..1)
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
  // o vídeo do story (da galeria ou o story repostado); só cabe um
  const videoLayer = layers.find((l) => l.kind === 'photo' && l.image?.video);

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
        let img;
        if (isVideoPath(orig.path)) {
          // story em vídeo: entra como vídeo (ou, sem vídeo neste aparelho, a foto do começo)
          let clip = null;
          if (videosOn) {
            try {
              const res = await fetch(mediaUrl(orig.path));
              if (res.ok) clip = await openClip(new File([await res.blob()], 'story.mp4', { type: 'video/mp4' }));
            } catch {
              clip = null;
            }
          }
          if (clip) img = clip;
          else {
            if (!orig.thumb_path) throw new Error('Não consegui abrir o story.');
            const res = await fetch(mediaUrl(orig.thumb_path));
            if (!res.ok) throw new Error('Não consegui abrir o story.');
            img = await prepareImage(await res.blob(), 1600);
          }
        } else {
          const res = await fetch(mediaUrl(orig.path));
          if (!res.ok) throw new Error('Não consegui abrir o story.');
          img = await prepareImage(await res.blob(), 1600);
        }
        if (!alive) return revokeImage(img);
        setLayers((ls) => (ls.some((l) => l.repost) ? ls : [...ls, newRepostLayer(ls, img, orig)]));
        const colors = photoColors(img.video ? img.poster.img : img.img);
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
      let img;
      if (isVideoFile(file)) {
        if (!videosOn) throw new Error(NO_VIDEOS);
        if (layersRef.current.some((l) => l.repost && l.image?.video)) throw new Error('Este story já tem um vídeo (o repostado). Escolha uma foto.');
        img = await openClip(file);
      } else img = await prepareImage(file, 2200);
      const old = layersRef.current.find((l) => l.base);
      if (old) revokeImage(old.image);
      setLayers((ls) => [...ls.filter((l) => !l.base), newBaseLayer(img, 1 / ASPECT)]);
      const colors = photoColors(img.video ? img.poster.img : img.img);
      setPhotoBg(colors);
      if (colors) setGi(-1);
      // vídeo com mais de 15 s: já abre para escolher o trecho
      if (img.video && img.duration > MAX_SECONDS + 0.05) setTrimming(true);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };
  const removeBase = () => {
    const old = layersRef.current.find((l) => l.base);
    if (old) revokeImage(old.image);
    setLayers((ls) => ls.filter((l) => !l.base));
  };
  const setVideo = (patch) => setLayers((ls) => ls.map((l) => (l.kind === 'photo' && l.image?.video ? { ...l, image: { ...l.image, ...patch } } : l)));
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
      const musicStickers = music && sticker && stickerImg ? [{ canvas: stickerImg.canvas, x: sticker.x, y: sticker.y }] : [];
      const figurinhas = can('interacoes') ? [...stickersForDb(layers), ...(can('repost') ? repostHotspots(layers) : [])] : [];
      let width;
      let height;
      if (videoLayer) {
        // story em vídeo: cada quadro sai igual ao editor (fundo, vídeo, textos, adesivo)
        setProgress(0);
        const ve = await import('../lib/videoEdit');
        const comp = await storyVideoComposer({ gradient: bg, layers, stickers: musicStickers, width: VIDEO_W, height: VIDEO_H });
        let res;
        try {
          res = await ve.exportVideo(videoLayer.image, {
            width: VIDEO_W,
            height: VIDEO_H,
            compose: comp.compose,
            keepAudio: !music && !videoLayer.image.muted,
            detail: Math.min(1, (videoLayer.w * VIDEO_W * (videoLayer.scale || 1)) / videoLayer.image.width),
            onProgress: setProgress,
          });
        } finally {
          comp.release();
        }
        setProgress(1);
        path = await api.uploadVideo(uid, active.id, 'stories', res.blob, { silent: !res.hasAudio });
        thumbPath = await api.uploadImage(uid, active.id, 'stories', res.poster);
        width = VIDEO_W;
        height = VIDEO_H;
      } else {
        const r = await renderStory({ gradient: bg, layers, stickers: musicStickers });
        width = r.width;
        height = r.height;
        path = await api.uploadImage(uid, active.id, 'stories', r.blob);
        // miniatura só quando o banco já tem destaques (senão não há onde guardar)
        if (can('destaques')) thumbPath = await api.uploadImage(uid, active.id, 'stories', r.thumb);
      }
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
      setProgress(null);
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
            {videoLayer && (
              <button type="button" className="icon-btn icon-btn--light" onClick={() => setTrimming(true)} aria-label="Cortar vídeo">
                <Scissors size={24} />
              </button>
            )}
            {videoLayer?.image.hasAudio && (
              <button
                type="button"
                className={`icon-btn icon-btn--light ${!videoLayer.image.muted && !music ? 'is-on' : ''}`}
                onClick={() => (music ? toast('Com música, o vídeo vai sem o som dele.') : setVideo({ muted: !videoLayer.image.muted }))}
                aria-label={videoLayer.image.muted || music ? 'Vídeo sem som (tocar para ligar)' : 'Vídeo com som (tocar para tirar)'}
                aria-pressed={!videoLayer.image.muted && !music}
              >
                {videoLayer.image.muted || music ? <VolumeX size={24} /> : <Volume2 size={24} />}
              </button>
            )}
            {base && (
              <button type="button" className="icon-btn icon-btn--light" onClick={removeBase} aria-label={base.image.video ? 'Remover vídeo' : 'Remover foto'}>
                <Trash2 size={24} />
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          className="story-editor__gallery"
          onClick={() => fileInput.current?.click()}
          aria-label={videosOn ? 'Escolher foto ou vídeo da galeria' : 'Escolher foto da galeria'}
        >
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

      <input ref={fileInput} type="file" accept={videosOn ? 'image/*,video/*' : 'image/*'} hidden onChange={pick} />
      {trimming && videoLayer && (
        <VideoTrimmer
          clip={videoLayer.image}
          noSound={!!music}
          onCancel={() => setTrimming(false)}
          onDone={({ start, end, muted }) => {
            setTrimming(false);
            setVideo({ start, end, muted });
          }}
        />
      )}
      {progress !== null && (
        <div className="overlay-progress">
          <Spinner size={34} />
          <p>{progress < 1 ? `Preparando o vídeo ${Math.round(progress * 100)}%…` : 'Enviando…'}</p>
          <span className="overlay-progress__bar">
            <span style={{ transform: `scaleX(${progress})` }} />
          </span>
        </div>
      )}
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

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ImagePlus, Plus, X, Crop, MapPin, UserPlus, Search, Check, ChevronLeft, Type, Scissors, Volume2, VolumeX, Clapperboard, Play } from 'lucide-react';
import { TopBar, CloseButton, IconButton, Spinner, Sheet, Handle, useConfirm, FullScreen } from '../components/ui';
import Cropper, { cropRect, defaultCrop } from '../components/Cropper';
import Avatar from '../components/Avatar';
import MusicPicker, { MusicDetailsLine } from '../components/MusicPicker';
import { LayerStage, TextEditor, newTextLayer, photoLayersFrom, revokeLayers, MAX_TEXT_LAYERS } from '../components/Layers';
import { VideoTrimmer, clipSeconds, isVideoFile, MAX_SECONDS, MAX_VIDEOS_PER_POST } from '../components/VideoEditParts';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { FILTERS, filterCss, prepareImage, renderCrop, postVideoComposer, POST_WIDTH } from '../lib/media';
import { useDebounced } from '../lib/hooks';
import { emit } from '../lib/events';
import { pageCache } from '../lib/storage';
import { musicForDb } from '../lib/music';
import * as api from '../lib/api';

const MAX = 10;
const REEL_ASPECT = 9 / 16;
// miniatura de um item (foto ou o primeiro quadro do vídeo)
const stillUrl = (image) => (image.video ? image.poster?.url : image.url);
function revokeItem(it) {
  URL.revokeObjectURL(it.image.url);
  if (it.image.poster?.url) URL.revokeObjectURL(it.image.poster.url);
  revokeLayers(it.layers);
}
const secs = (t) => `0:${String(Math.round(t)).padStart(2, '0')}`;
const ASPECTS = [
  { id: '4:5', label: '4:5', value: 4 / 5 },
  { id: '1:1', label: '1:1', value: 1 },
  { id: '16:9', label: '16:9', value: 1.91 },
  { id: 'orig', label: 'Original', value: null },
];

function TagPicker({ open, onClose, value, onChange }) {
  const { active } = useSession();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const dq = useDebounced(q, 250);
  useEffect(() => {
    if (!open) return;
    const run = dq.trim() ? api.searchCharacters(dq.replace(/^@/, ''), active.id) : api.followList(active.id, active.id, 'following');
    run.then((r) => setList((r || []).filter((c) => c.id !== active.id)), () => setList([]));
  }, [dq, open, active.id]);
  const toggle = (c) => onChange(value.some((x) => x.id === c.id) ? value.filter((x) => x.id !== c.id) : [...value, c]);
  return (
    <Sheet open={open} onClose={onClose} title="Marcar personagens" className="sheet--tall">
      <label className="search-field search-field--sheet">
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar" autoCapitalize="none" />
      </label>
      <div className="share-list">
        {!list && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        {list?.length === 0 && <p className="muted center-pad">Ninguém encontrado. Pesquise pelo nome.</p>}
        {list?.map((c) => {
          const on = value.some((x) => x.id === c.id);
          return (
            <div key={c.id} className="char-row" role="button" tabIndex={0} onClick={() => toggle(c)}>
              <Avatar character={c} size={40} />
              <div className="char-row__names">
                <Handle character={c} />
                {c.name && <span className="muted">{c.name}</span>}
              </div>
              <span className={`radio ${on ? 'is-on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
            </div>
          );
        })}
      </div>
      <div className="pad-x pad-y">
        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          Concluir
        </button>
      </div>
    </Sheet>
  );
}

// reel: um vídeo só, em pé (9:16)
export default function CreatePost({ reel = false }) {
  const { active, uid, can } = useSession();
  const videosOn = can('videos');
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef(null);
  const photoInput = useRef(null);
  const [step, setStep] = useState('pick'); // pick | edit | details
  const [items, setItems] = useState([]); // { image, crop, filter, layers }
  const [editing, setEditing] = useState(null); // texto aberto no editor
  const [stageW, setStageW] = useState(360);
  const canvasRef = useRef(null);
  const [current, setCurrent] = useState(0);
  const [aspectId, setAspectId] = useState('4:5');
  const [preparing, setPreparing] = useState(null);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [music, setMusic] = useState(null);
  const [musicOpen, setMusicOpen] = useState(false);
  const [publishing, setPublishing] = useState(null);
  const [trimming, setTrimming] = useState(null); // índice do vídeo sendo cortado

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach(revokeItem), []);

  // largura da foto na tela (tamanho do texto no editor)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  const first = items[0]?.image;
  const aspectDef = ASPECTS.find((a) => a.id === aspectId);
  const aspect = reel ? REEL_ASPECT : aspectDef.value ?? (first ? Math.max(0.8, Math.min(1.91, first.width / first.height)) : 1);

  const addFiles = async (e) => {
    const files = [...(e.target.files || [])].slice(0, (reel ? 1 : MAX) - items.length);
    e.target.value = '';
    if (!files.length) return;
    const added = [];
    let videos = items.filter((it) => it.image.video).length;
    let trimFirst = null;
    let longOnes = 0;
    for (let i = 0; i < files.length; i++) {
      setPreparing({ done: i, total: files.length });
      const f = files[i];
      try {
        if (isVideoFile(f)) {
          if (!videosOn) {
            toast('Vídeos ainda não estão ligados: falta rodar a atualização do banco (veja o README).');
            continue;
          }
          if (!reel && videos >= MAX_VIDEOS_PER_POST) {
            toast(`Dá para colocar até ${MAX_VIDEOS_PER_POST} vídeos por publicação.`);
            continue;
          }
          const ve = await import('../lib/videoEdit');
          const support = await ve.videoSupport();
          if (!support.ok) {
            toast(support.reason);
            continue;
          }
          const image = await ve.openVideo(f);
          videos += 1;
          added.push({ image, crop: defaultCrop(image), filter: 'normal', layers: [] });
          if (image.duration > MAX_SECONDS + 0.05) {
            longOnes += 1;
            if (trimFirst === null) trimFirst = items.length + added.length - 1;
          }
        } else {
          if (reel) {
            toast('Escolha um vídeo para o reel.');
            continue;
          }
          const image = await prepareImage(f, 1600);
          added.push({ image, crop: defaultCrop(image), filter: 'normal', layers: [] });
        }
      } catch (err) {
        toast(err.message);
      }
    }
    setPreparing(null);
    if (!added.length) return;
    const startIndex = items.length;
    setItems((xs) => [...xs, ...added]);
    setCurrent(trimFirst ?? startIndex);
    setStep('edit');
    // vídeo com mais de 15 s: já abre o corte (os outros ficam com os primeiros 15 s)
    if (trimFirst !== null) {
      setTrimming(trimFirst);
      if (longOnes > 1) toast(`Os vídeos longos ficaram com os primeiros ${MAX_SECONDS} s. Toque na tesoura para escolher outro trecho.`);
    }
  };

  const removeItem = (i) => {
    revokeItem(items[i]);
    const next = items.filter((_, j) => j !== i);
    setItems(next);
    setCurrent((c) => Math.max(0, Math.min(c, next.length - 1)));
    if (!next.length) setStep('pick');
  };

  const setItem = (i, patch) => setItems((xs) => xs.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const setLayers = (i, fn) => setItems((xs) => xs.map((it, j) => (j === i ? { ...it, layers: typeof fn === 'function' ? fn(it.layers) : fn } : it)));

  // textos e fotos por cima da foto que está na tela
  const addText = () => {
    if (items[current].layers.filter((l) => l.kind === 'text').length >= MAX_TEXT_LAYERS) {
      toast(`Dá para colocar até ${MAX_TEXT_LAYERS} textos em cada foto.`);
      return;
    }
    setEditing({});
  };
  const doneText = (t) => {
    setEditing(null);
    const { text, color, boxed, size, font } = t;
    if (!text.trim()) {
      if (t.id) setLayers(current, (ls) => ls.filter((x) => x.id !== t.id));
      return;
    }
    if (t.id) setLayers(current, (ls) => ls.map((x) => (x.id === t.id ? { ...x, text, color, boxed, size, font } : x)));
    else setLayers(current, (ls) => [...ls, newTextLayer(ls, { text, color, boxed, size, font })]);
  };
  const pickPhotos = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    const i = current;
    setPreparing({ done: 0, total: files.length });
    const added = await photoLayersFrom(files, itemsRef.current[i].layers, toast, 1 / aspect);
    setPreparing(null);
    setLayers(i, (ls) => [...ls, ...added]);
  };

  const cancel = async () => {
    if (items.length) {
      const ok = await confirm({ title: 'Descartar publicação?', message: 'Se sair agora, as edições serão perdidas.', confirmText: 'Descartar', danger: true });
      if (!ok) return;
    }
    navigate(-1);
  };

  const publish = async () => {
    setPublishing({ done: 0, total: items.length });
    const uploaded = [];
    try {
      const outW = POST_WIDTH;
      const outH = Math.round(POST_WIDTH / aspect);
      const media = [];
      const nVideos = items.filter((it) => it.image.video).length;
      let vi = 0;
      for (let i = 0; i < items.length; i++) {
        setPublishing({ done: i, total: items.length });
        const it = items[i];
        if (it.image.video) {
          // vídeo: monta cada quadro (recorte, filtro, textos) e comprime aqui mesmo
          vi += 1;
          const label = nVideos > 1 ? `Preparando o vídeo ${vi} de ${nVideos}` : 'Preparando o vídeo';
          setPublishing({ done: i, total: items.length, label, progress: 0 });
          const ve = await import('../lib/videoEdit');
          const { width, height } = ve.videoSize(aspect);
          const crop = cropRect(it.image, aspect, it.crop);
          const comp = await postVideoComposer({ crop, filterId: it.filter, layers: it.layers, width, height });
          let res;
          try {
            res = await ve.exportVideo(it.image, {
              width,
              height,
              compose: comp.compose,
              readsPixels: comp.readsPixels,
              keepAudio: !music && !it.image.muted,
              detail: width / crop.sw,
              onProgress: (p) => setPublishing({ done: i, total: items.length, label, progress: p }),
            });
          } finally {
            comp.release();
          }
          setPublishing({ done: i, total: items.length, label: nVideos > 1 ? `Enviando o vídeo ${vi} de ${nVideos}` : 'Enviando o vídeo' });
          const path = await api.uploadVideo(uid, active.id, 'posts', res.blob, { silent: !res.hasAudio });
          uploaded.push(path);
          const thumbPath = await api.uploadImage(uid, active.id, 'posts', res.poster);
          uploaded.push(thumbPath);
          media.push({ path, thumb_path: thumbPath, width, height });
          continue;
        }
        const { full, thumb, width, height } = await renderCrop(it.image.img, cropRect(it.image, aspect, it.crop), outW, outH, it.filter, it.layers);
        const path = await api.uploadImage(uid, active.id, 'posts', full);
        uploaded.push(path);
        const thumbPath = await api.uploadImage(uid, active.id, 'posts', thumb);
        uploaded.push(thumbPath);
        media.push({ path, thumb_path: thumbPath, width, height });
      }
      setPublishing({ done: items.length, total: items.length });
      const id = await api.createPost({
        character: active.id,
        caption,
        location,
        media,
        tags: tags.map((t) => t.id),
        music: musicForDb(music),
      });
      pageCache.delete(`feed:${active.id}`);
      pageCache.delete(`grid:${active.id}`);
      pageCache.delete('explore');
      pageCache.delete(`reels:${active.id}`);
      pageCache.delete(`reels-feed:${active.id}`);
      emit('post:create', { id });
      toast(reel ? 'Reel publicado!' : 'Publicado!');
      navigate(reel ? '/reels' : '/', { replace: true });
    } catch (err) {
      await api.removeFiles(uploaded).catch(() => {});
      toast(api.errorMessage(err));
      setPublishing(null);
    }
  };

  const cur = items[current];

  return (
    <FullScreen className="create">
      {step === 'pick' && (
        <>
          <TopBar left={<CloseButton onClick={cancel} />} title={reel ? 'Novo reel' : 'Nova publicação'} />
          <div className="picker">
            <div className="picker__art">{reel ? <Clapperboard size={64} strokeWidth={1.2} /> : <ImagePlus size={64} strokeWidth={1.2} />}</div>
            <h2>{reel ? 'Escolha um vídeo' : videosOn ? 'Escolha fotos ou vídeos' : 'Escolha as fotos'}</h2>
            <p className="muted">
              {reel
                ? `Um vídeo em pé, de até ${MAX_SECONDS} segundos. Você publica como @${active.handle}.`
                : videosOn
                  ? `Até ${MAX} por publicação (vídeos de até ${MAX_SECONDS} s). Você publica como @${active.handle}.`
                  : `Até ${MAX} fotos por publicação. Você publica como @${active.handle}.`}
            </p>
            <button type="button" className="btn btn--primary" onClick={() => fileInput.current?.click()} disabled={!!preparing}>
              {preparing ? `Preparando ${preparing.done + 1}/${preparing.total}…` : 'Escolher da galeria'}
            </button>
          </div>
        </>
      )}

      {step === 'edit' && cur && (
        <>
          <TopBar
            left={<CloseButton onClick={cancel} />}
            title="Editar"
            right={
              <button type="button" className="link-accent" onClick={() => setStep('details')}>
                Avançar
              </button>
            }
          />
          <div className="editor">
            <div className="editor__stage" style={{ '--ar': aspect }}>
              <div className="editor__canvas" ref={canvasRef}>
                <Cropper
                  key={current + ':' + aspectId}
                  image={cur.image}
                  aspect={aspect}
                  value={cur.crop}
                  onChange={(crop) => setItem(current, { crop })}
                  filter={filterCss(cur.filter)}
                />
                <LayerStage
                  key={current}
                  layers={cur.layers}
                  onChange={(ls) => setLayers(current, ls)}
                  onEditText={setEditing}
                  avoid=".editor__tools, .editor__aspect"
                />
              </div>
              <div className="editor__tools">
                <button type="button" className="editor__tool" onClick={addText} aria-label="Adicionar texto">
                  <Type size={20} />
                </button>
                <button type="button" className="editor__tool" onClick={() => photoInput.current?.click()} aria-label="Colocar foto por cima" disabled={!!preparing}>
                  <ImagePlus size={20} />
                </button>
                {cur.image.video && (
                  <button type="button" className="editor__tool" onClick={() => setTrimming(current)} aria-label="Cortar vídeo">
                    <Scissors size={20} />
                  </button>
                )}
                {cur.image.video && cur.image.hasAudio && (
                  <button
                    type="button"
                    className="editor__tool"
                    onClick={() => setItem(current, { image: { ...cur.image, muted: !cur.image.muted } })}
                    aria-label={cur.image.muted ? 'Vídeo sem som (tocar para ligar)' : 'Vídeo com som (tocar para tirar)'}
                    aria-pressed={!cur.image.muted}
                  >
                    {cur.image.muted || music ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                )}
              </div>
              {cur.image.video && <span className="editor__duration">{secs(clipSeconds(cur.image))}</span>}
              {!reel && (
              <button
                type="button"
                className="editor__aspect"
                onClick={() => {
                  const i = ASPECTS.findIndex((a) => a.id === aspectId);
                  setAspectId(ASPECTS[(i + 1) % ASPECTS.length].id);
                }}
                aria-label="Mudar proporção"
              >
                <Crop size={16} /> {aspectDef.label}
              </button>
              )}
            </div>

            <div className="editor__thumbs">
              {items.map((it, i) => (
                <div key={it.image.url} className={`editor__thumb ${i === current ? 'is-current' : ''}`}>
                  <button type="button" onClick={() => setCurrent(i)} aria-label={`${it.image.video ? 'Vídeo' : 'Foto'} ${i + 1}`}>
                    <img src={stillUrl(it.image)} alt="" style={{ filter: filterCss(it.filter) }} />
                    {it.image.video && (
                      <span className="editor__thumb-video" aria-hidden="true">
                        <Play size={10} fill="currentColor" strokeWidth={0} />
                      </span>
                    )}
                  </button>
                  <button type="button" className="editor__remove" onClick={() => removeItem(i)} aria-label="Remover foto">
                    <X size={12} strokeWidth={3} />
                  </button>
                </div>
              ))}
              {!reel && items.length < MAX && (
                <button type="button" className="editor__add" onClick={() => fileInput.current?.click()} aria-label="Adicionar fotos" disabled={!!preparing}>
                  {preparing ? <Spinner size={18} /> : <Plus size={22} />}
                </button>
              )}
            </div>

            <div className="filters" role="listbox" aria-label="Filtros">
              {FILTERS.map((f) => (
                <button
                  type="button"
                  key={f.id}
                  role="option"
                  aria-selected={cur.filter === f.id}
                  className={`filters__item ${cur.filter === f.id ? 'is-active' : ''}`}
                  onClick={() => setItem(current, { filter: f.id })}
                >
                  <span className="filters__name">{f.name}</span>
                  <img src={stillUrl(cur.image)} alt="" style={{ filter: filterCss(f.id) }} />
                </button>
              ))}
            </div>
            <p className="muted center small">
              {cur.layers.length
                ? 'Toque numa camada: ↻ gira · ⤡ muda o tamanho · ✕ tira · toque no texto para editar'
                : cur.image.video
                  ? 'Arraste para enquadrar · dois dedos para zoom · ✂ escolhe o trecho'
                  : 'Arraste para enquadrar · dois dedos para zoom · Aa para escrever por cima'}
            </p>
            {music && items.some((it) => it.image.video && it.image.hasAudio) && (
              <p className="muted center small">Com música, o vídeo vai sem o som dele.</p>
            )}
          </div>
        </>
      )}

      {step === 'details' && (
        <>
          <TopBar
            left={
              <IconButton label="Voltar para edição" onClick={() => setStep('edit')}>
                <ChevronLeft size={28} strokeWidth={1.8} />
              </IconButton>
            }
            title={reel ? 'Novo reel' : 'Nova publicação'}
            right={
              <button type="button" className="link-accent" onClick={publish} disabled={!!publishing}>
                Compartilhar
              </button>
            }
          />
          <div className="details">
            <div className="details__row">
              <div className="details__preview" style={{ aspectRatio: String(aspect) }}>
                <img src={stillUrl(items[0].image)} alt="" style={{ filter: filterCss(items[0].filter) }} />
                {items[0].layers.length > 0 && <LayerStage layers={items[0].layers} readOnly />}
                {items.length > 1 && <span className="details__count">{items.length}</span>}
              </div>
              <textarea
                className="details__caption"
                value={caption}
                maxLength={2200}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Escreva uma legenda… use @ para mencionar e # para hashtags"
                rows={5}
              />
            </div>
            <label className="details__line">
              <MapPin size={20} />
              <input value={location} maxLength={100} onChange={(e) => setLocation(e.target.value)} placeholder="Adicionar local (ex.: Fissura de Pinheiros)" />
            </label>
            <button type="button" className="details__line" onClick={() => setTagOpen(true)}>
              <UserPlus size={20} />
              <span>{tags.length ? tags.map((t) => '@' + t.handle).join(', ') : 'Marcar personagens'}</span>
            </button>
            <MusicDetailsLine music={music} onOpen={() => setMusicOpen(true)} onClear={() => setMusic(null)} />
            <div className="details__as">
              <Avatar character={active} size={28} />
              <span className="muted">
                Publicando como <strong>@{active.handle}</strong>
              </span>
            </div>
          </div>
          <TagPicker open={tagOpen} onClose={() => setTagOpen(false)} value={tags} onChange={setTags} />
          <MusicPicker open={musicOpen} onClose={() => setMusicOpen(false)} value={music} onChange={(m) => setMusic(m)} />
        </>
      )}

      <input
        ref={fileInput}
        type="file"
        accept={reel ? 'video/*' : videosOn ? 'image/*,video/*' : 'image/*'}
        multiple={!reel}
        hidden
        onChange={addFiles}
      />
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={pickPhotos} />
      {editing && step === 'edit' && cur && (
        <TextEditor
          initial={editing}
          scale={stageW / POST_WIDTH}
          onDone={doneText}
          onDelete={() => {
            setLayers(current, (ls) => ls.filter((x) => x.id !== editing.id));
            setEditing(null);
          }}
        />
      )}

      {trimming !== null && items[trimming]?.image.video && (
        <VideoTrimmer
          clip={items[trimming].image}
          noSound={!!music}
          onCancel={() => setTrimming(null)}
          onDone={({ start, end, muted }) => {
            const i = trimming;
            setTrimming(null);
            setItems((xs) => xs.map((it, j) => (j === i ? { ...it, image: { ...it.image, start, end, muted } } : it)));
          }}
        />
      )}

      {publishing && (
        <div className="overlay-progress">
          <Spinner size={34} />
          <p>
            {publishing.label
              ? `${publishing.label}${publishing.progress !== undefined ? ` ${Math.round(publishing.progress * 100)}%` : ''}…`
              : publishing.done < publishing.total
                ? `Enviando foto ${publishing.done + 1} de ${publishing.total}…`
                : 'Publicando…'}
          </p>
          {publishing.progress !== undefined && (
            <span className="overlay-progress__bar">
              <span style={{ transform: `scaleX(${publishing.progress})` }} />
            </span>
          )}
        </div>
      )}
    </FullScreen>
  );
}

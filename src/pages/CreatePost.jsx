import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ImagePlus, Plus, X, Crop, MapPin, UserPlus, Search, Check, ChevronLeft } from 'lucide-react';
import { TopBar, CloseButton, IconButton, Spinner, Sheet, Handle, useConfirm, FullScreen } from '../components/ui';
import Cropper, { cropRect, defaultCrop } from '../components/Cropper';
import Avatar from '../components/Avatar';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { FILTERS, filterCss, prepareImage, renderCrop, POST_WIDTH } from '../lib/media';
import { useDebounced } from '../lib/hooks';
import { emit } from '../lib/events';
import { pageCache } from '../lib/storage';
import * as api from '../lib/api';

const MAX = 10;
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

export default function CreatePost() {
  const { active, uid } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef(null);
  const [step, setStep] = useState('pick'); // pick | edit | details
  const [items, setItems] = useState([]); // { image, crop, filter }
  const [current, setCurrent] = useState(0);
  const [aspectId, setAspectId] = useState('4:5');
  const [preparing, setPreparing] = useState(null);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState([]);
  const [tagOpen, setTagOpen] = useState(false);
  const [publishing, setPublishing] = useState(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.image.url)), []);

  const first = items[0]?.image;
  const aspectDef = ASPECTS.find((a) => a.id === aspectId);
  const aspect = aspectDef.value ?? (first ? Math.max(0.8, Math.min(1.91, first.width / first.height)) : 1);

  const addFiles = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX - items.length);
    e.target.value = '';
    if (!files.length) return;
    const added = [];
    for (let i = 0; i < files.length; i++) {
      setPreparing({ done: i, total: files.length });
      try {
        const image = await prepareImage(files[i], 1600);
        added.push({ image, crop: defaultCrop(image), filter: 'normal' });
      } catch (err) {
        toast(err.message);
      }
    }
    setPreparing(null);
    if (!added.length) return;
    const startIndex = items.length;
    setItems((xs) => [...xs, ...added]);
    setCurrent(startIndex);
    setStep('edit');
  };

  const removeItem = (i) => {
    URL.revokeObjectURL(items[i].image.url);
    const next = items.filter((_, j) => j !== i);
    setItems(next);
    setCurrent((c) => Math.max(0, Math.min(c, next.length - 1)));
    if (!next.length) setStep('pick');
  };

  const setItem = (i, patch) => setItems((xs) => xs.map((it, j) => (j === i ? { ...it, ...patch } : it)));

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
      for (let i = 0; i < items.length; i++) {
        setPublishing({ done: i, total: items.length });
        const it = items[i];
        const { full, thumb, width, height } = await renderCrop(it.image.img, cropRect(it.image, aspect, it.crop), outW, outH, it.filter);
        const path = await api.uploadImage(uid, active.id, 'posts', full);
        uploaded.push(path);
        const thumbPath = await api.uploadImage(uid, active.id, 'posts', thumb);
        uploaded.push(thumbPath);
        media.push({ path, thumb_path: thumbPath, width, height });
      }
      setPublishing({ done: items.length, total: items.length });
      const id = await api.createPost({ character: active.id, caption, location, media, tags: tags.map((t) => t.id) });
      pageCache.delete(`feed:${active.id}`);
      pageCache.delete(`grid:${active.id}`);
      pageCache.delete('explore');
      emit('post:create', { id });
      toast('Publicado!');
      navigate('/', { replace: true });
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
          <TopBar left={<CloseButton onClick={cancel} />} title="Nova publicação" />
          <div className="picker">
            <div className="picker__art">
              <ImagePlus size={64} strokeWidth={1.2} />
            </div>
            <h2>Escolha as fotos</h2>
            <p className="muted">Até {MAX} fotos por publicação. Você publica como @{active.handle}.</p>
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
              <Cropper
                key={current + ':' + aspectId}
                image={cur.image}
                aspect={aspect}
                value={cur.crop}
                onChange={(crop) => setItem(current, { crop })}
                filter={filterCss(cur.filter)}
              />
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
            </div>

            <div className="editor__thumbs">
              {items.map((it, i) => (
                <div key={it.image.url} className={`editor__thumb ${i === current ? 'is-current' : ''}`}>
                  <button type="button" onClick={() => setCurrent(i)} aria-label={`Foto ${i + 1}`}>
                    <img src={it.image.url} alt="" style={{ filter: filterCss(it.filter) }} />
                  </button>
                  <button type="button" className="editor__remove" onClick={() => removeItem(i)} aria-label="Remover foto">
                    <X size={12} strokeWidth={3} />
                  </button>
                </div>
              ))}
              {items.length < MAX && (
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
                  <img src={cur.image.url} alt="" style={{ filter: filterCss(f.id) }} />
                </button>
              ))}
            </div>
            <p className="muted center small">Arraste para enquadrar · dois dedos para zoom</p>
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
            title="Nova publicação"
            right={
              <button type="button" className="link-accent" onClick={publish} disabled={!!publishing}>
                Compartilhar
              </button>
            }
          />
          <div className="details">
            <div className="details__row">
              <div className="details__preview" style={{ aspectRatio: String(aspect) }}>
                <img src={items[0].image.url} alt="" style={{ filter: filterCss(items[0].filter) }} />
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
            <div className="details__as">
              <Avatar character={active} size={28} />
              <span className="muted">
                Publicando como <strong>@{active.handle}</strong>
              </span>
            </div>
          </div>
          <TagPicker open={tagOpen} onClose={() => setTagOpen(false)} value={tags} onChange={setTags} />
        </>
      )}

      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={addFiles} />

      {publishing && (
        <div className="overlay-progress">
          <Spinner size={34} />
          <p>
            {publishing.done < publishing.total ? `Enviando foto ${publishing.done + 1} de ${publishing.total}…` : 'Publicando…'}
          </p>
        </div>
      )}
    </FullScreen>
  );
}

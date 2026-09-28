import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Check, ChevronLeft, ChevronRight, Camera, Trash2 } from 'lucide-react';
import { TopBar, BackButton, Button, Spinner, EmptyState, ErrorBox, IconButton, CloseButton, useConfirm } from '../components/ui';
import { HighlightCover, HIGHLIGHT_TITLE_MAX } from '../components/Highlights';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useInfinite, useOnVisible } from '../lib/hooks';
import { mediaUrl } from '../lib/supabase';
import { fadeIn } from '../lib/fade';
import { emit } from '../lib/events';
import * as api from '../lib/api';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const thumbOf = (s) => s.thumb_path || s.path;
const byDate = (a, b) => new Date(a.created_at) - new Date(b.created_at);

function ArchiveCell({ story, on, onToggle }) {
  const d = new Date(story.created_at);
  return (
    <button
      type="button"
      className={`archive-cell ${on ? 'is-on' : ''}`}
      onClick={() => onToggle(story)}
      aria-pressed={on}
      aria-label={`Story de ${d.toLocaleDateString('pt-BR')}`}
    >
      <img {...fadeIn} src={mediaUrl(thumbOf(story))} alt="" loading="lazy" decoding="async" draggable="false" />
      <span className="archive-cell__date" aria-hidden="true">
        <strong>{d.getDate()}</strong>
        {MONTHS[d.getMonth()]}
      </span>
      <span className="archive-cell__check" aria-hidden="true">
        {on && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}

// /destaques/novo (criar) e /destaques/:id/editar
export default function HighlightEditor() {
  const { id } = useParams();
  const editing = !!id;
  const { active } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [step, setStep] = useState(editing ? 'details' : 'pick');
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState(null);
  const [coverPick, setCoverPick] = useState(false);
  const [original, setOriginal] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(false);
  // sem cache: um story publicado agora já tem que aparecer aqui
  const archive = useInfinite(null, (before) => api.storyArchive(active.id, before), { pageSize: 60 });
  const sentinel = useOnVisible(archive.loadMore, step === 'pick' && !archive.done && !archive.loading && archive.items.length > 0);

  useEffect(() => {
    if (!editing) return undefined;
    let alive = true;
    api.getHighlight(id, active.id).then(
      (h) => {
        if (!alive) return;
        if (!h || h.character_id !== active.id) {
          setLoadError('Esse destaque não é deste personagem.');
          return;
        }
        setOriginal(h);
        setSelected(h.stories.map((s) => s.id));
        setTitle(h.title);
        setCover(h.cover_story_id);
      },
      (e) => alive && setLoadError(api.errorMessage(e))
    );
    return () => {
      alive = false;
    };
  }, [id, active.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // stories conhecidos: os do destaque (podem ser antigos) + os do arquivo
  const known = useMemo(() => {
    const m = {};
    for (const s of original?.stories || []) m[s.id] = s;
    for (const s of archive.items) m[s.id] = s;
    return m;
  }, [original, archive.items]);
  const chosen = selected.map((sid) => known[sid]).filter(Boolean).sort(byDate);
  // capa: a escolhida (se ainda estiver marcada) ou o story mais antigo, igual ao banco
  const coverStory = (cover && selected.includes(cover) && known[cover]) || chosen[0] || null;

  const toggle = (s) => setSelected((xs) => (xs.includes(s.id) ? xs.filter((x) => x !== s.id) : [...xs, s.id]));

  const dirty = editing
    ? !!original &&
      (title !== original.title ||
        cover !== original.cover_story_id ||
        [...selected].sort().join() !== original.stories.map((s) => s.id).sort().join())
    : selected.length > 0 || title.trim() !== '';

  const leave = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(`/u/${active.handle}`, { replace: true });
  };
  const leaveAsk = async () => {
    if (dirty) {
      const ok = await confirm({ title: 'Descartar alterações?', message: 'O que você mudou aqui não vai ser salvo.', confirmText: 'Descartar', danger: true });
      if (!ok) return;
    }
    leave();
  };

  const save = async () => {
    if (!selected.length) {
      toast('Escolha pelo menos um story');
      return;
    }
    setBusy(true);
    try {
      await api.saveHighlight({
        id,
        character: active.id,
        title: title.trim() || 'Destaque',
        stories: selected,
        cover: cover && selected.includes(cover) ? cover : null,
      });
      emit('profile:change', { id: active.id });
      toast(editing ? 'Destaque atualizado' : 'Destaque criado');
      leave();
    } catch (e) {
      toast(api.errorMessage(e));
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Excluir destaque?',
      message: `"${original.title}" sai do perfil. Os stories continuam no seu arquivo.`,
      confirmText: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteHighlight(id);
      emit('profile:change', { id: active.id });
      toast('Destaque excluído');
      leave();
    } catch (e) {
      toast(api.errorMessage(e));
    }
  };

  if (loadError)
    return (
      <div className="app app--full">
        <TopBar left={<BackButton />} title="Destaque" />
        <ErrorBox>{loadError}</ErrorBox>
      </div>
    );
  if (editing && !original)
    return (
      <div className="app app--full">
        <TopBar left={<BackButton />} title="Editar destaque" />
        <div className="center-pad">
          <Spinner />
        </div>
      </div>
    );

  if (step === 'pick')
    return (
      <div className="app app--full hl-editor">
        <TopBar
          left={
            editing ? (
              <IconButton label="Voltar" onClick={() => setStep('details')}>
                <ChevronLeft size={28} strokeWidth={1.8} />
              </IconButton>
            ) : (
              <CloseButton onClick={leaveAsk} />
            )
          }
          title={editing ? 'Escolher stories' : 'Novo destaque'}
          right={
            <button type="button" className="link-accent" disabled={!selected.length} onClick={() => setStep('details')}>
              {editing ? 'Pronto' : 'Avançar'}
            </button>
          }
        />
        <p className="muted hl-editor__hint">
          Seus stories ficam aqui por 30 dias depois que somem da bandeja. Os que entram num destaque ficam para sempre.
        </p>
        {archive.error && <ErrorBox onRetry={archive.reload}>{archive.error}</ErrorBox>}
        {!archive.error && archive.loading && !archive.items.length && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        {!archive.error && !archive.loading && !archive.items.length && (
          <EmptyState
            icon={<Camera size={44} strokeWidth={1.3} />}
            title="Nenhum story por aqui"
            action={
              <Button variant="primary" onClick={() => navigate('/criar/story', { replace: true })}>
                Criar story
              </Button>
            }
          >
            Publique um story e ele aparece aqui para você destacar.
          </EmptyState>
        )}
        <div className="archive-grid">
          {archive.items.map((s) => (
            <ArchiveCell key={s.id} story={s} on={selected.includes(s.id)} onToggle={toggle} />
          ))}
        </div>
        {archive.loading && archive.items.length > 0 && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        <div ref={sentinel} />
      </div>
    );

  return (
    <div className="app app--full hl-editor">
      <TopBar
        left={
          editing ? (
            <CloseButton onClick={leaveAsk} />
          ) : (
            <IconButton label="Voltar" onClick={() => setStep('pick')}>
              <ChevronLeft size={28} strokeWidth={1.8} />
            </IconButton>
          )
        }
        title={editing ? 'Editar destaque' : 'Novo destaque'}
        right={
          <button type="button" className="link-accent" onClick={save} disabled={busy || !selected.length}>
            {busy ? <Spinner size={18} /> : 'Concluir'}
          </button>
        }
      />
      <div className="hl-edit">
        <button type="button" className="hl-edit__cover" onClick={() => setCoverPick((v) => !v)} aria-expanded={coverPick}>
          <HighlightCover cover={coverStory && thumbOf(coverStory)} size={104} />
          <span className="link-accent">Editar capa</span>
        </button>
        {coverPick && (
          <div className="hl-covers" role="list" aria-label="Escolha a capa">
            {chosen.map((s) => (
              <div key={s.id} role="listitem">
                <button
                  type="button"
                  className={`hl-covers__item ${coverStory?.id === s.id ? 'is-on' : ''}`}
                  onClick={() => setCover(s.id)}
                  aria-pressed={coverStory?.id === s.id}
                  aria-label="Usar como capa"
                >
                  <img {...fadeIn} src={mediaUrl(thumbOf(s))} alt="" loading="lazy" decoding="async" draggable="false" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="field hl-edit__field">
          <span>Nome</span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={HIGHLIGHT_TITLE_MAX}
            placeholder="Destaque"
            enterKeyHint="done"
          />
        </label>
        {editing ? (
          <>
            <button type="button" className="hl-edit__row" onClick={() => setStep('pick')}>
              <span>Stories</span>
              <span className="muted">{selected.length}</span>
              <ChevronRight size={18} />
            </button>
            <button type="button" className="btn btn--danger-ghost hl-edit__delete" onClick={remove}>
              <Trash2 size={18} /> Excluir destaque
            </button>
          </>
        ) : (
          <p className="muted hl-edit__count">
            {selected.length === 1 ? '1 story' : `${selected.length} stories`}
          </p>
        )}
      </div>
    </div>
  );
}

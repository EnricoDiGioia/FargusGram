import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, Check } from 'lucide-react';
import { Sheet, Spinner, Button } from './ui';
import { useToast } from '../state/toast';
import { mediaUrl } from '../lib/supabase';
import { fadeIn } from '../lib/fade';
import { pageCache } from '../lib/storage';
import { emit } from '../lib/events';
import * as api from '../lib/api';

export const HIGHLIGHT_TITLE_MAX = 20;

// Capa redonda de um destaque (miniatura do story)
export function HighlightCover({ cover, size = 64, className = '' }) {
  return (
    <span className={`highlight__cover ${className}`} style={{ width: size, height: size }}>
      {cover && <img {...fadeIn} src={mediaUrl(cover)} alt="" loading="lazy" decoding="async" draggable="false" />}
    </span>
  );
}

// Fileira de destaques no perfil (o dono vê o "Novo" no fim)
export function HighlightsRow({ highlights, editable }) {
  const navigate = useNavigate();
  const list = highlights || [];
  if (!list.length && !editable) return null;

  const open = (id) => {
    // arrastar para o lado no visualizador passa para o próximo destaque
    pageCache.set('highlight-queue', { order: list.map((h) => h.id) });
    navigate(`/destaques/${id}`);
  };

  return (
    <div className="highlights" role="list" aria-label="Destaques">
      {list.map((h) => (
        <div key={h.id} role="listitem">
          <button type="button" className="highlight" onClick={() => open(h.id)} aria-label={`Destaque ${h.title}`}>
            <span className="highlight__ring">
              <HighlightCover cover={h.cover} />
            </span>
            <span className="highlight__label">{h.title}</span>
          </button>
        </div>
      ))}
      {editable && (
        <div role="listitem">
          <button type="button" className="highlight" onClick={() => navigate('/destaques/novo')} aria-label="Novo destaque">
            <span className="highlight__ring highlight__ring--new">
              <Plus size={30} strokeWidth={1.5} />
            </span>
            <span className="highlight__label">Novo</span>
          </button>
        </div>
      )}
    </div>
  );
}

// "Destacar": põe (ou tira) o story que está aberto num destaque
export function AddToHighlightSheet({ open, onClose, story, character }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!open || !story) return undefined;
    let alive = true;
    setList(null);
    setCreating(false);
    setTitle('');
    api.characterHighlights(character.id, story.id).then(
      (l) => {
        if (!alive) return;
        setList(l || []);
        if (!l?.length) setCreating(true); // ainda não tem nenhum: já abre o "Novo"
      },
      (e) => {
        if (!alive) return;
        setList([]);
        toast(api.errorMessage(e));
      }
    );
    return () => {
      alive = false;
    };
  }, [open, story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = () => emit('profile:change', { id: character.id });

  const toggle = async (h) => {
    setBusy(h.id);
    try {
      // o próprio ✓ na bolinha mostra o resultado (um aviso cobriria a lista)
      if (h.has_story) await api.removeFromHighlight(h.id, story.id);
      else await api.addToHighlight(h.id, story.id);
      setList((l) =>
        l
          .map((x) => (x.id === h.id ? { ...x, has_story: !x.has_story, count: x.count + (x.has_story ? -1 : 1) } : x))
          .filter((x) => x.count > 0)
      );
      changed();
    } catch (e) {
      toast(api.errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const create = async (e) => {
    e.preventDefault();
    const name = title.trim() || 'Destaque';
    setBusy('new');
    try {
      await api.saveHighlight({ character: character.id, title: name, stories: [story.id] });
      toast(`Adicionado a ${name}`);
      changed();
      onClose();
    } catch (err) {
      toast(api.errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={creating ? 'Novo destaque' : 'Adicionar ao destaque'}>
      {creating ? (
        <form className="hl-new" onSubmit={create}>
          <HighlightCover cover={story?.thumb_path || story?.path} size={88} />
          <input
            className="input hl-new__title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={HIGHLIGHT_TITLE_MAX}
            placeholder="Destaque"
            aria-label="Nome do destaque"
            autoFocus
          />
          <Button type="submit" variant="primary" className="btn--block" loading={busy === 'new'}>
            Adicionar
          </Button>
          {list?.length > 0 && (
            <button type="button" className="link-muted" onClick={() => setCreating(false)}>
              Escolher um destaque que já existe
            </button>
          )}
        </form>
      ) : (
        <div className="hl-pick" role="list">
          <div role="listitem">
            <button type="button" className="highlight" onClick={() => setCreating(true)}>
              <span className="highlight__ring highlight__ring--new">
                <Plus size={30} strokeWidth={1.5} />
              </span>
              <span className="highlight__label">Novo</span>
            </button>
          </div>
          {list === null && (
            <div className="hl-pick__loading">
              <Spinner />
            </div>
          )}
          {list?.map((h) => (
            <div key={h.id} role="listitem">
              <button
                type="button"
                className={`highlight ${h.has_story ? 'is-on' : ''}`}
                onClick={() => toggle(h)}
                disabled={busy === h.id}
                aria-pressed={h.has_story}
              >
                <span className="highlight__ring">
                  <HighlightCover cover={h.cover} />
                  {h.has_story && (
                    <span className="highlight__check" aria-hidden="true">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="highlight__label">{h.title}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Search, Hash, X } from 'lucide-react';
import { Spinner, EmptyState, ErrorBox } from '../components/ui';
import PostGrid, { GridSkeleton } from '../components/PostGrid';
import CharacterRow from '../components/CharacterRow';
import PullToRefresh from '../components/PullToRefresh';
import { useSession } from '../state/session';
import { useDebounced, useInfinite, useOnVisible } from '../lib/hooks';
import { local } from '../lib/storage';
import { on } from '../lib/events';
import * as api from '../lib/api';
import { count } from '../lib/format';

function SearchResults({ query }) {
  const { active } = useSession();
  const navigate = useNavigate();
  const q = useDebounced(query.trim(), 250);
  const [tab, setTab] = useState(query.trim().startsWith('#') ? 'tags' : 'contas');
  const [chars, setChars] = useState(null);
  const [tags, setTags] = useState(null);

  useEffect(() => {
    if (query.trim().startsWith('#')) setTab('tags');
  }, [query]);

  useEffect(() => {
    let alive = true;
    if (!q) {
      setChars(null);
      setTags(null);
      return;
    }
    setChars(null);
    setTags(null);
    const clean = q.replace(/^[@#]/, '');
    api.searchCharacters(clean, active.id).then((r) => alive && setChars(r || []), () => alive && setChars([]));
    api.searchHashtags(clean).then((r) => alive && setTags(r || []), () => alive && setTags([]));
    return () => {
      alive = false;
    };
  }, [q, active.id]);

  const [recent, setRecent] = useState(() => {
    try {
      return JSON.parse(local.get('fg-recent-search', '[]')) || [];
    } catch {
      return [];
    }
  });
  const remember = (c) => {
    const next = [c, ...recent.filter((x) => x.id !== c.id)].slice(0, 8);
    local.set('fg-recent-search', JSON.stringify(next));
    setRecent(next);
  };

  if (!q) {
    if (!recent.length) return <p className="muted center-pad">Pesquise personagens pelo nome ou @, ou hashtags com #.</p>;
    return (
      <div className="search-results">
        <div className="section-head">
          <h3 className="section-title">Recentes</h3>
          <button
            type="button"
            className="link-accent"
            onClick={() => {
              local.set('fg-recent-search', '[]');
              setRecent([]);
            }}
          >
            Limpar
          </button>
        </div>
        {recent.map((c) => (
          <CharacterRow key={c.id} character={c} onClick={() => remember(c) || navigate(`/u/${c.handle}`)} />
        ))}
      </div>
    );
  }

  return (
    <div className="search-results">
      <div className="tabs tabs--text">
        <button type="button" className={tab === 'contas' ? 'is-active' : ''} onClick={() => setTab('contas')}>
          Contas
        </button>
        <button type="button" className={tab === 'tags' ? 'is-active' : ''} onClick={() => setTab('tags')}>
          Tags
        </button>
      </div>
      {tab === 'contas' &&
        (chars === null ? (
          <div className="center-pad">
            <Spinner />
          </div>
        ) : chars.length === 0 ? (
          <p className="muted center-pad">Nenhum personagem encontrado.</p>
        ) : (
          chars.map((c) => (
            <CharacterRow
              key={c.id}
              character={c}
              sub={c.is_following ? `${c.name ? c.name + ' • ' : ''}Seguindo` : c.name}
              onClick={() => {
                remember(c);
                navigate(`/u/${c.handle}`);
              }}
            />
          ))
        ))}
      {tab === 'tags' &&
        (tags === null ? (
          <div className="center-pad">
            <Spinner />
          </div>
        ) : tags.length === 0 ? (
          <p className="muted center-pad">Nenhuma hashtag encontrada.</p>
        ) : (
          tags.map((t) => (
            <div key={t.tag} className="char-row" role="button" tabIndex={0} onClick={() => navigate(`/tag/${encodeURIComponent(t.tag)}`)}>
              <span className="hash-circle">
                <Hash size={22} />
              </span>
              <div className="char-row__names">
                <strong>#{t.tag}</strong>
                <span className="muted">
                  {count(t.count)} {t.count === 1 ? 'publicação' : 'publicações'}
                </span>
              </div>
            </div>
          ))
        ))}
    </div>
  );
}

export default function Explore() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const key = 'explore';
  const list = useInfinite(key, (before) => api.explore(before), { pageSize: 30 });
  const sentinel = useOnVisible(list.loadMore, !searching && !list.done && !list.loading && list.items.length > 0);

  useEffect(() => {
    const offD = on('post:delete', (id) => list.setItems((xs) => xs.filter((p) => p.id !== id)));
    const offC = on('post:create', () => list.reload());
    return () => {
      offD();
      offC();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <header className="topbar topbar--search">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearching(true)}
            placeholder="Pesquisar"
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
          />
          {query && (
            <button type="button" className="search-field__clear" aria-label="Limpar" onClick={() => setQuery('')}>
              <X size={14} />
            </button>
          )}
        </label>
        {searching && (
          <button
            type="button"
            className="link-plain"
            onClick={() => {
              setSearching(false);
              setQuery('');
            }}
          >
            Cancelar
          </button>
        )}
      </header>

      {searching ? (
        <SearchResults query={query} />
      ) : (
        <PullToRefresh onRefresh={list.reload}>
          {list.items.length === 0 && list.loading && <GridSkeleton n={12} />}
          {list.error && <ErrorBox onRetry={list.reload}>{list.error}</ErrorBox>}
          {!list.loading && !list.error && list.items.length === 0 && (
            <EmptyState title="Nada por aqui ainda">Quando alguém publicar, as fotos aparecem aqui.</EmptyState>
          )}
          <PostGrid posts={list.items} source={{ key, fetch: (b) => api.explore(b), getCursor: (it) => it.created_at, pageSize: 30, done: list.done }} />
          {list.loading && list.items.length > 0 && (
            <div className="center-pad">
              <Spinner />
            </div>
          )}
          <div ref={sentinel} />
        </PullToRefresh>
      )}
    </div>
  );
}

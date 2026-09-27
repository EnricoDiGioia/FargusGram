import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, X } from 'lucide-react';
import { TopBar, BackButton, Spinner, Handle } from '../components/ui';
import Avatar from '../components/Avatar';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useDebounced } from '../lib/hooks';
import * as api from '../lib/api';

export default function NewMessage() {
  const { active } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState('');
  const [base, setBase] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const q = useDebounced(query, 250);

  useEffect(() => {
    api.suggested(active.id).then(
      async (sug) => {
        const following = await api.followList(active.id, active.id, 'following').catch(() => []);
        const seen = new Set(following.map((f) => f.id));
        setBase([...following, ...(sug || []).filter((s) => !seen.has(s.id))]);
      },
      () => setBase([])
    );
  }, [active.id]);

  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    api.searchCharacters(q.replace(/^@/, ''), active.id).then(
      (r) => setResults((r || []).filter((c) => c.id !== active.id)),
      () => setResults([])
    );
  }, [q, active.id]);

  const toggle = (c) => {
    setSelected((s) => (s.some((x) => x.id === c.id) ? s.filter((x) => x.id !== c.id) : [...s, c]));
    if (query) {
      setQuery('');
      setResults(null);
    }
  };

  const start = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      const conv = await api.startConversation(
        active.id,
        selected.map((s) => s.id),
        selected.length > 1 ? title : null
      );
      navigate(`/direct/${conv}`, { replace: true });
    } catch (e) {
      toast(api.errorMessage(e));
      setBusy(false);
    }
  };

  const list = (results ?? base)?.filter((c) => c.id !== active.id);

  return (
    <div className="app app--full">
      <TopBar
        left={<BackButton />}
        title="Nova mensagem"
        right={
          <button type="button" className="link-accent" disabled={!selected.length || busy} onClick={start}>
            {busy ? <Spinner size={16} className="spinner--inline" /> : selected.length > 1 ? 'Criar grupo' : 'Conversar'}
          </button>
        }
      />
      <div className="to-field">
        <span className="to-field__label">Para:</span>
        {selected.map((s) => (
          <button key={s.id} type="button" className="chip" onClick={() => toggle(s)}>
            {s.handle} <X size={12} />
          </button>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar…" autoFocus autoCapitalize="none" />
      </div>
      {selected.length > 1 && (
        <div className="pad-x">
          <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do grupo (opcional)" />
        </div>
      )}
      <h3 className="section-title section-title--pad">{results ? 'Resultados' : 'Sugestões'}</h3>
      {!list && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      {list?.length === 0 && <p className="muted center-pad">Nenhum personagem encontrado.</p>}
      {list?.map((c) => {
        const on = selected.some((s) => s.id === c.id);
        return (
          <div key={c.id} className="char-row" role="button" tabIndex={0} onClick={() => toggle(c)}>
            <Avatar character={c} size={44} />
            <div className="char-row__names">
              <Handle character={c} />
              {c.name && <span className="muted">{c.name}</span>}
            </div>
            <span className={`radio ${on ? 'is-on' : ''}`}>{on && <Check size={14} strokeWidth={3} />}</span>
          </div>
        );
      })}
    </div>
  );
}

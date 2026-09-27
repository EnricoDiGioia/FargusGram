import { useEffect, useState } from 'react';
import { Check, Link2, Search } from 'lucide-react';
import { Sheet, Spinner, Handle } from './ui';
import Avatar from './Avatar';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import * as api from '../lib/api';
import { useDebounced } from '../lib/hooks';

// Enviar uma publicação no Direct (para uma conversa ou personagem)
export default function ShareSheet({ open, onClose, post }) {
  const { active } = useSession();
  const toast = useToast();
  const [targets, setTargets] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [sent, setSent] = useState({});
  const q = useDebounced(query, 250);

  useEffect(() => {
    if (!open || !active) return;
    setSent({});
    setQuery('');
    (async () => {
      try {
        const [convs, following] = await Promise.all([
          api.inbox(active.id),
          api.followList(active.id, active.id, 'following'),
        ]);
        const list = [];
        const seen = new Set();
        for (const c of convs || []) {
          if (c.is_group) list.push({ key: 'c' + c.id, conv: c.id, label: c.title || c.members.map((m) => m.handle).join(', '), character: c.members[0], group: true });
          else if (c.members[0]) {
            seen.add(c.members[0].id);
            list.push({ key: 'c' + c.id, conv: c.id, label: c.members[0].handle, character: c.members[0] });
          }
        }
        for (const f of following || []) {
          if (!seen.has(f.id)) list.push({ key: 'u' + f.id, to: f.id, label: f.handle, character: f });
        }
        setTargets(list);
      } catch {
        setTargets([]);
      }
    })();
  }, [open, active]);

  useEffect(() => {
    if (!q.trim() || !active) {
      setResults(null);
      return;
    }
    api.searchCharacters(q, active.id).then(
      (r) => setResults((r || []).filter((c) => c.id !== active.id).map((c) => ({ key: 'u' + c.id, to: c.id, label: c.handle, character: c }))),
      () => setResults([])
    );
  }, [q, active]);

  const send = async (t) => {
    if (sent[t.key]) return;
    setSent((s) => ({ ...s, [t.key]: 'sending' }));
    try {
      const conv = t.conv || (await api.startConversation(active.id, [t.to]));
      await api.sendMessage({ conversation: conv, sender: active.id, kind: 'post', post: post.id });
      setSent((s) => ({ ...s, [t.key]: 'ok' }));
    } catch (e) {
      setSent((s) => ({ ...s, [t.key]: null }));
      toast(api.errorMessage(e));
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado');
    } catch {
      toast(url);
    }
  };

  const list = results ?? targets;

  return (
    <Sheet open={open} onClose={onClose} title="Compartilhar" className="sheet--tall">
      <label className="search-field search-field--sheet">
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar" enterKeyHint="search" />
      </label>
      <div className="share-list">
        {list === null && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        {list?.length === 0 && <p className="muted center-pad">Ninguém por aqui ainda. Siga alguém para enviar.</p>}
        {list?.map((t) => (
          <div key={t.key} className="share-row">
            <Avatar character={t.character} size={44} />
            <div className="share-row__names">
              {t.group ? <strong>{t.label}</strong> : <Handle character={t.character} />}
              {!t.group && t.character?.name && <span className="muted">{t.character.name}</span>}
            </div>
            <button type="button" className={`btn btn--small ${sent[t.key] === 'ok' ? 'btn--secondary' : 'btn--primary'}`} onClick={() => send(t)}>
              {sent[t.key] === 'ok' ? <Check size={16} /> : sent[t.key] === 'sending' ? <Spinner size={14} className="spinner--inline" /> : 'Enviar'}
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="sheet-item" onClick={copyLink}>
        <span className="sheet-item__icon">
          <Link2 size={22} />
        </span>
        <span className="sheet-item__label">Copiar link</span>
      </button>
    </Sheet>
  );
}

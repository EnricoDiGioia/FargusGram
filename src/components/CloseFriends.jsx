import { useEffect, useRef, useState } from 'react';
import { Check, Search, Star, X } from 'lucide-react';
import Avatar from './Avatar';
import { Button, Handle, Sheet, Spinner } from './ui';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useDebounced } from '../lib/hooks';
import * as api from '../lib/api';

// Estrela verde dos "Melhores amigos"
export function CloseStar({ size = 12 }) {
  return (
    <span className="close-star" aria-hidden="true">
      <Star size={size} fill="currentColor" strokeWidth={0} />
    </span>
  );
}

export function CloseBadge({ className = '' }) {
  return (
    <span className={`close-badge ${className}`}>
      <Star size={10} fill="currentColor" strokeWidth={0} aria-hidden="true" /> Melhores amigos
    </span>
  );
}

const people = (n) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;

// Lista do personagem ativo: tocar no círculo põe ou tira da lista na hora
export function CloseFriendsList({ onCount }) {
  const { active } = useSession();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 250);
  const [data, setData] = useState(null);
  const count = useRef(0);

  useEffect(() => {
    let alive = true;
    api.closeFriendsList(active.id, q).then(
      (d) => {
        if (!alive) return;
        setData(d);
        count.current = d.count;
        onCount?.(d.count);
      },
      (e) => {
        if (!alive) return;
        setData({ count: 0, characters: [] });
        toast(api.errorMessage(e));
      }
    );
    return () => {
      alive = false;
    };
  }, [active.id, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (c) => {
    const on = !c.is_close;
    const apply = (value) => {
      count.current += value ? 1 : -1;
      onCount?.(count.current);
      setData((d) => ({ count: count.current, characters: d.characters.map((x) => (x.id === c.id ? { ...x, is_close: value } : x)) }));
    };
    apply(on); // a ordem não muda enquanto a pessoa mexe, para nada pular de lugar
    try {
      await api.setCloseFriend(active.id, c.id, on);
    } catch (e) {
      apply(!on);
      toast(api.errorMessage(e));
    }
  };

  return (
    <div className="close-list">
      <label className="search-field search-field--sheet">
        <Search size={16} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar" autoCapitalize="none" aria-label="Pesquisar personagem" />
        {query && (
          <button type="button" className="search-field__clear" onClick={() => setQuery('')} aria-label="Limpar busca">
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </label>
      {data && !q && (
        <p className="close-list__count">
          <CloseStar size={11} /> {data.count ? `${people(data.count)} na lista` : 'Ninguém na lista ainda'}
        </p>
      )}
      {!data && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      {data?.characters.length === 0 && <p className="muted center-pad">Nenhum personagem encontrado.</p>}
      {data?.characters.map((c) => (
        <div
          key={c.id}
          className="char-row"
          role="checkbox"
          aria-checked={c.is_close}
          tabIndex={0}
          onClick={() => toggle(c)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggle(c);
            }
          }}
        >
          <Avatar character={c} size={44} />
          <div className="char-row__names">
            <Handle character={c} />
            <span className="muted">{[c.name, c.follows_you && 'Segue você'].filter(Boolean).join(' · ')}</span>
          </div>
          <span className={`radio radio--close ${c.is_close ? 'is-on' : ''}`}>{c.is_close && <Check size={14} strokeWidth={3} />}</span>
        </div>
      ))}
    </div>
  );
}

export function CloseFriendsIntro() {
  return (
    <div className="close-intro">
      <span className="close-intro__icon">
        <Star size={26} fill="currentColor" strokeWidth={0} />
      </span>
      <p>
        Só quem está na lista vê os stories e as notas que você marcar como <strong>Melhores amigos</strong>. Ninguém fica sabendo quando
        entra ou sai.
      </p>
    </div>
  );
}

// Folha que sobe por cima (story ou nota em andamento não se perdem)
export function CloseFriendsSheet({ open, onClose, onDone, onCount }) {
  const [n, setN] = useState(0);
  return (
    <Sheet open={open} onClose={onClose} title="Melhores amigos" className="sheet--tall">
      {open && (
        <>
          <CloseFriendsIntro />
          <CloseFriendsList
            onCount={(c) => {
              setN(c);
              onCount?.(c);
            }}
          />
          <div className="close-sheet__done">
            <Button
              variant="primary"
              className="btn--block"
              onClick={() => {
                onDone?.(n);
                onClose();
              }}
            >
              Pronto
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

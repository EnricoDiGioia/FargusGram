import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { SquarePen, Search, Send } from 'lucide-react';
import { TopBar, BackButton, IconButton, Spinner, EmptyState, ErrorBox, Handle, Button } from '../components/ui';
import Avatar from '../components/Avatar';
import PullToRefresh from '../components/PullToRefresh';
import { NotesRow } from '../components/Notes';
import { useSession } from '../state/session';
import { useUnread } from '../state/unread';
import { useAsync, useInterval } from '../lib/hooks';
import { on } from '../lib/events';
import { timeShort } from '../lib/format';
import * as api from '../lib/api';

export function ConversationAvatar({ conv, size = 56 }) {
  const m = conv.members || [];
  if (conv.is_group && m.length > 1) {
    const s = Math.round(size * 0.72);
    return (
      <span className="group-avatar" style={{ width: size, height: size }}>
        <Avatar character={m[1]} size={s} className="group-avatar__back" />
        <Avatar character={m[0]} size={s} className="group-avatar__front" />
      </span>
    );
  }
  return <Avatar character={m[0]} size={size} />;
}

export function conversationTitle(conv) {
  if (conv.title) return conv.title;
  const m = conv.members || [];
  if (!m.length) return 'Só você';
  if (!conv.is_group) return m[0].name || m[0].handle;
  return m.map((x) => x.name || x.handle).join(', ');
}

function preview(conv, meId) {
  const lm = conv.last_message;
  if (!lm) return 'Diga oi 👋';
  const mine = lm.sender_id === meId;
  let t;
  if (lm.kind === 'post') t = mine ? 'Você enviou uma publicação' : 'Enviou uma publicação';
  else if (lm.kind === 'media') t = mine ? 'Você enviou uma foto' : 'Enviou uma foto';
  else if (lm.is_story_reply) t = mine ? `Você respondeu ao story: ${lm.body}` : `Respondeu ao seu story: ${lm.body}`;
  else if (lm.is_note_reply) t = mine ? `Você respondeu à nota: ${lm.body}` : `Respondeu à sua nota: ${lm.body}`;
  else t = mine ? `Você: ${lm.body}` : lm.body;
  return t;
}

export default function Inbox() {
  const { active, can } = useSession();
  const { refresh: refreshUnread } = useUnread(active.id);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, loading, error, reload } = useAsync(`inbox:${active.id}`, () => api.inbox(active.id), [active.id]);

  useInterval(reload, 15000);
  useEffect(() => on('message:new', () => reload()), [reload]);
  useEffect(() => {
    refreshUnread();
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const all = data || [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter((c) => conversationTitle(c).toLowerCase().includes(s) || c.members.some((m) => m.handle.includes(s)));
  }, [data, q]);

  return (
    <div className="page">
      <TopBar
        left={<BackButton to="/" />}
        title={<Handle character={active} />}
        right={
          <IconButton label="Nova mensagem" onClick={() => navigate('/direct/novo')}>
            <SquarePen size={24} strokeWidth={1.8} />
          </IconButton>
        }
      />
      <PullToRefresh
        onRefresh={async () => {
          setRefreshKey((k) => k + 1);
          await reload();
        }}
      >
        {(data?.length || 0) > 0 && (
          <div className="pad-x">
            <label className="search-field">
              <Search size={16} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar" />
            </label>
          </div>
        )}
        {/* notas: só aparecem quando o banco já tem a atualização */}
        {can('notas') && <NotesRow refreshKey={refreshKey} />}
        <h3 className="section-title section-title--pad">Mensagens</h3>
        {loading && !data && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        {error && !data && <ErrorBox onRetry={reload}>{error}</ErrorBox>}
        {data && data.length === 0 && (
          <EmptyState
            icon={<Send size={44} strokeWidth={1.3} />}
            title="Suas mensagens"
            action={
              <Button variant="primary" onClick={() => navigate('/direct/novo')}>
                Enviar mensagem
              </Button>
            }
          >
            Mande mensagens privadas para outros personagens — ou crie um grupo.
          </EmptyState>
        )}
        {list.map((c) => (
          <div key={c.id} className={`inbox-row ${c.unread ? 'is-unread' : ''}`} role="button" tabIndex={0} onClick={() => navigate(`/direct/${c.id}`)}>
            <ConversationAvatar conv={c} />
            <div className="inbox-row__text">
              <span className="inbox-row__name">{conversationTitle(c)}</span>
              <span className="inbox-row__preview">
                <span className="inbox-row__msg">{preview(c, active.id)}</span>
                <span className="muted inbox-row__time">· {timeShort(c.last_message?.created_at || c.last_message_at)}</span>
              </span>
            </div>
            {c.unread && <span className="unread-dot" aria-label="Não lida" />}
          </div>
        ))}
      </PullToRefresh>
    </div>
  );
}

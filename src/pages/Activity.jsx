import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Heart } from 'lucide-react';
import { TopBar, Spinner, EmptyState, ErrorBox, Handle } from '../components/ui';
import Avatar from '../components/Avatar';
import { FollowButton } from '../components/CharacterRow';
import PullToRefresh from '../components/PullToRefresh';
import PushPrompt from '../components/PushPrompt';
import { useSession } from '../state/session';
import { useUnread } from '../state/unread';
import { useInfinite, useOnVisible } from '../lib/hooks';
import { mediaUrl } from '../lib/supabase';
import { fadeIn } from '../lib/fade';
import { activityBucket, timeShort } from '../lib/format';
import * as api from '../lib/api';

function text(n) {
  const quote = n.comment ? `: ${n.comment}` : '';
  switch (n.type) {
    case 'like':
      return 'curtiu sua publicação.';
    case 'comment':
      return `comentou${quote}`;
    case 'reply':
      return `respondeu ao seu comentário${quote}`;
    case 'comment_like':
      return `curtiu seu comentário${quote}`;
    case 'follow':
      return 'começou a seguir você.';
    case 'mention':
      return n.comment ? `mencionou você num comentário${quote}` : 'mencionou você numa publicação.';
    case 'tag':
      return 'marcou você numa publicação.';
    default:
      return '';
  }
}

function Item({ n }) {
  const navigate = useNavigate();
  const go = () => {
    if (n.type === 'follow') navigate(`/u/${n.actor.handle}`);
    else if (n.comment_id) navigate(`/p/${n.post_id}/comentarios`);
    else if (n.post_id) navigate(`/p/${n.post_id}`);
  };
  return (
    <div className={`notif ${n.read ? '' : 'is-unread'}`} role="button" tabIndex={0} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go()}>
      <Avatar
        character={n.actor}
        size={44}
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/u/${n.actor.handle}`);
        }}
      />
      <p className="notif__text">
        <Handle character={n.actor} className="strong" /> {text(n)} <span className="muted">{timeShort(n.created_at)}</span>
      </p>
      {n.type === 'follow' ? (
        <FollowButton character={{ ...n.actor, is_following: n.is_following_actor, follows_you: true }} />
      ) : n.post_thumb ? (
        <img {...fadeIn} className="notif__thumb" src={mediaUrl(n.post_thumb)} alt="" loading="lazy" />
      ) : null}
    </div>
  );
}

export default function Activity() {
  const { active } = useSession();
  const { refresh: refreshUnread } = useUnread(active.id);
  const key = `notif:${active.id}`;
  const list = useInfinite(key, (before) => api.notifications(active.id, before), { pageSize: 40 });
  const sentinel = useOnVisible(list.loadMore, !list.done && !list.loading && list.items.length > 0);

  // Abriu a tela: marca tudo como lido
  useEffect(() => {
    if (list.loading || !list.items.some((n) => !n.read)) return;
    const t = setTimeout(async () => {
      await api.markNotificationsRead(active.id);
      refreshUnread();
    }, 1200);
    return () => clearTimeout(t);
  }, [list.loading, list.items, active.id, refreshUnread]);

  useEffect(() => {
    // sempre busca as novidades ao abrir
    list.reload();
  }, [active.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [];
  for (const n of list.items) {
    const b = activityBucket(n.created_at);
    if (!groups.length || groups[groups.length - 1].title !== b) groups.push({ title: b, items: [] });
    groups[groups.length - 1].items.push(n);
  }

  return (
    <div className="page">
      <TopBar title="Notificações" />
      <PullToRefresh
        onRefresh={async () => {
          await list.reload();
          refreshUnread();
        }}
      >
        <PushPrompt />
        {list.error && <ErrorBox onRetry={list.reload}>{list.error}</ErrorBox>}
        {!list.loading && !list.error && list.items.length === 0 && (
          <EmptyState icon={<Heart size={44} strokeWidth={1.4} />} title="Nenhuma notificação">
            Quando alguém curtir, comentar ou seguir @{active.handle}, aparece aqui.
          </EmptyState>
        )}
        {groups.map((g) => (
          <section key={g.title}>
            <h3 className="section-title section-title--pad">{g.title}</h3>
            {g.items.map((n) => (
              <Item key={n.id} n={n} />
            ))}
          </section>
        ))}
        {list.loading && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}
        <div ref={sentinel} />
      </PullToRefresh>
    </div>
  );
}

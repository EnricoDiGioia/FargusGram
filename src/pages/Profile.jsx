import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ChevronDown, Menu, PlusSquare, Grid3x3, SquareUserRound, Bookmark, MoreHorizontal, Link2, Camera, Star, Clapperboard } from 'lucide-react';
import { TopBar, BackButton, IconButton, Spinner, EmptyState, ErrorBox, Handle, Button, Sheet, SheetItem, PageLoader } from '../components/ui';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import PostGrid, { GridSkeleton } from '../components/PostGrid';
import AccountSwitcher from '../components/AccountSwitcher';
import PullToRefresh from '../components/PullToRefresh';
import { FollowButton } from '../components/CharacterRow';
import { HighlightsRow } from '../components/Highlights';
import { NoteBubble, NoteEditorSheet, NoteViewSheet } from '../components/Notes';
import { useSession } from '../state/session';
import { useToast } from '../state/toast';
import { useAsync, useInfinite, useOnVisible } from '../lib/hooks';
import { on } from '../lib/events';
import { pageCache } from '../lib/storage';
import { count } from '../lib/format';
import * as api from '../lib/api';

function PostsTab({ kind, character }) {
  const key = `${kind}:${character.id}`;
  const fetcher = {
    grid: (b) => api.characterPosts(character.id, b),
    reels: (b) => api.characterReels(character.id, b),
    tagged: (b) => api.taggedPosts(character.id, b),
    saved: (b) => api.savedPosts(character.id, b),
  }[kind];
  const getCursor = (it) => it.saved_at || it.created_at;
  const list = useInfinite(key, fetcher, { pageSize: 30, getCursor });
  const sentinel = useOnVisible(list.loadMore, !list.done && !list.loading && list.items.length > 0);

  useEffect(() => {
    const offD = on('post:delete', (id) => list.setItems((xs) => xs.filter((p) => p.id !== id)));
    const offC = on('post:create', () => list.reload());
    const offU = on('post:update', ({ id, patch }) => {
      if (kind === 'saved' && patch.saved === false) list.setItems((xs) => xs.filter((p) => p.id !== id));
      else if (kind === 'saved' && patch.saved === true) pageCache.delete(key);
    });
    return () => {
      offD();
      offC();
      offU();
    };
  }, [kind, character.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (list.error) return <ErrorBox onRetry={list.reload}>{list.error}</ErrorBox>;
  if (list.loading && !list.items.length) return <GridSkeleton n={6} />;
  if (!list.items.length) {
    if (kind === 'grid')
      return (
        <EmptyState icon={<Camera size={44} strokeWidth={1.3} />} title="Ainda sem publicações">
          As fotos que @{character.handle} publicar aparecem aqui.
        </EmptyState>
      );
    if (kind === 'reels')
      return (
        <EmptyState icon={<Clapperboard size={44} strokeWidth={1.3} />} title="Nenhum reel">
          Os vídeos que @{character.handle} publicar sozinhos aparecem aqui.
        </EmptyState>
      );
    if (kind === 'tagged')
      return (
        <EmptyState icon={<SquareUserRound size={44} strokeWidth={1.3} />} title="Nenhuma marcação">
          Quando marcarem @{character.handle} numa foto, ela aparece aqui.
        </EmptyState>
      );
    return (
      <EmptyState icon={<Bookmark size={44} strokeWidth={1.3} />} title="Nada salvo">
        Toque no marcador de uma publicação para salvar. Só você vê o que salvou.
      </EmptyState>
    );
  }
  return (
    <>
      <PostGrid posts={list.items} source={{ key, fetch: fetcher, getCursor, pageSize: 30, done: list.done }} />
      {list.loading && (
        <div className="center-pad">
          <Spinner />
        </div>
      )}
      <div ref={sentinel} />
    </>
  );
}

export default function Profile() {
  const { handle } = useParams();
  const { active, isMine, setActive, can } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('grid');
  const [switchOpen, setSwitchOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [msgBusy, setMsgBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [noteEdit, setNoteEdit] = useState(false);
  const [noteView, setNoteView] = useState(null);
  const key = `profile:${handle}:${active.id}`;
  const { data: p, loading, error, reload, mutate } = useAsync(key, () => api.profile(handle, active.id), [handle, active.id]);

  useEffect(() => on('profile:change', ({ id }) => p && id === p.id && reload()), [p, reload]);
  useEffect(() => on('story:change', () => reload()), [reload]);
  useEffect(() => {
    setTab('grid');
  }, [handle]);

  if (loading && !p) return <PageLoader />;
  if (error && !p)
    return (
      <div className="page">
        <TopBar left={<BackButton />} title={handle} />
        <ErrorBox onRetry={reload}>{error}</ErrorBox>
      </div>
    );
  if (!p)
    return (
      <div className="page">
        <TopBar left={<BackButton />} title={handle} />
        <EmptyState title="Esta página não está disponível">O perfil @{handle} não existe ou foi excluído.</EmptyState>
      </div>
    );

  const isActive = p.id === active.id;
  const mine = isMine(p.id);

  const openStory = () => {
    if (!p.has_story) return isActive ? navigate('/criar/story') : null;
    pageCache.set('story-queue', { order: [p.id] });
    navigate(`/stories/${p.id}`);
  };

  const message = async () => {
    setMsgBusy(true);
    try {
      const conv = await api.startConversation(active.id, [p.id]);
      navigate(`/direct/${conv}`);
    } catch (e) {
      toast(api.errorMessage(e));
      setMsgBusy(false);
    }
  };

  const copyLink = async () => {
    setMenu(false);
    const url = `${window.location.origin}${window.location.pathname}#/u/${p.handle}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link do perfil copiado');
    } catch {
      toast(url);
    }
  };

  // melhores amigos: a lista é do personagem ativo (quem entra não fica sabendo)
  const toggleClose = async () => {
    setMenu(false);
    const on = !p.is_close_friend;
    mutate((x) => (x ? { ...x, is_close_friend: on } : x));
    try {
      await api.setCloseFriend(active.id, p.id, on);
      toast(on ? `${p.handle} entrou nos seus melhores amigos` : `${p.handle} saiu dos seus melhores amigos`);
    } catch (e) {
      mutate((x) => (x ? { ...x, is_close_friend: !on } : x));
      toast(api.errorMessage(e));
    }
  };

  const followedBy = p.followed_by || [];
  // nota: o banco atualizado sempre manda o campo "note" (mesmo vazio)
  const showNote = p.note !== undefined && (!!p.note || isActive);

  return (
    <div className="page">
      {isActive ? (
        <TopBar
          left={
            <button type="button" className="handle-switch" onClick={() => setSwitchOpen(true)} aria-label="Trocar de personagem">
              <Handle character={p} badge={16} />
              <ChevronDown size={18} />
            </button>
          }
          right={
            <>
              <IconButton label="Criar publicação" onClick={() => navigate('/criar/post')}>
                <PlusSquare size={25} strokeWidth={1.8} />
              </IconButton>
              <IconButton label="Configurações" onClick={() => navigate('/configuracoes')}>
                <Menu size={26} strokeWidth={1.8} />
              </IconButton>
            </>
          }
        />
      ) : (
        <TopBar
          left={<BackButton />}
          title={<Handle character={p} badge={15} />}
          right={
            <IconButton label="Mais" onClick={() => setMenu(true)}>
              <MoreHorizontal size={24} />
            </IconButton>
          }
        />
      )}

      <PullToRefresh
        onRefresh={async () => {
          pageCache.delete(`grid:${p.id}`);
          pageCache.delete(`reels:${p.id}`);
          pageCache.delete(`tagged:${p.id}`);
          pageCache.delete(`saved:${p.id}`);
          await reload();
          setRefreshKey((k) => k + 1);
        }}
      >
        <section className={`profile ${showNote ? 'profile--note' : ''}`}>
          <div className="profile__top">
            <div className="profile__avatar">
              <Avatar character={p} size={86} ring={p.has_story ? (p.story_seen ? 'seen' : p.story_close ? 'close' : 'unseen') : 'none'} onClick={openStory} />
              {showNote && (
                <button
                  type="button"
                  className="profile__note"
                  onClick={() => (isActive ? setNoteEdit(true) : setNoteView(p.note))}
                  aria-label={p.note ? `Nota de ${p.handle}` : 'Deixar uma nota'}
                >
                  <NoteBubble note={p.note} placeholder="Nota..." />
                </button>
              )}
            </div>
            <div className="profile__stats">
              <div>
                <strong>{count(p.post_count)}</strong>
                <span>{p.post_count === 1 ? 'publicação' : 'publicações'}</span>
              </div>
              <Link to={`/u/${p.handle}/seguidores`}>
                <strong>{count(p.follower_count)}</strong>
                <span>{p.follower_count === 1 ? 'seguidor' : 'seguidores'}</span>
              </Link>
              <Link to={`/u/${p.handle}/seguindo`}>
                <strong>{count(p.following_count)}</strong>
                <span>seguindo</span>
              </Link>
            </div>
          </div>
          <div className="profile__info">
            {p.name && <h1 className="profile__name">{p.name}</h1>}
            {p.bio && (
              <p className="profile__bio">
                <RichText text={p.bio} />
              </p>
            )}
            {!isActive && followedBy.length > 0 && (
              <p className="profile__followed muted">
                Seguido por <strong>{followedBy.join(', ')}</strong>
                {p.followed_by_count > followedBy.length && ` e mais ${p.followed_by_count - followedBy.length}`}
              </p>
            )}
          </div>
          <div className="profile__buttons">
            {isActive ? (
              <>
                <Button variant="secondary" onClick={() => navigate('/editar-perfil')}>
                  Editar perfil
                </Button>
                <Button variant="secondary" onClick={copyLink}>
                  Compartilhar perfil
                </Button>
              </>
            ) : (
              <>
                <FollowButton
                  character={p}
                  small={false}
                  onChange={(next) =>
                    mutate((x) => ({ ...x, is_following: next, follower_count: x.follower_count + (next ? 1 : -1) }))
                  }
                />
                {mine ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActive(p.id);
                      navigate(`/u/${p.handle}`, { replace: true });
                    }}
                  >
                    Usar este personagem
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={message} loading={msgBusy}>
                    Mensagem
                  </Button>
                )}
              </>
            )}
          </div>
        </section>

        {/* destaques: só aparecem quando o banco já tem a atualização */}
        {Array.isArray(p.highlights) && <HighlightsRow highlights={p.highlights} editable={isActive} />}

        <div className="tabs tabs--icons" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'grid'} className={tab === 'grid' ? 'is-active' : ''} onClick={() => setTab('grid')} aria-label="Publicações">
            <Grid3x3 size={24} strokeWidth={tab === 'grid' ? 2.2 : 1.6} />
          </button>
          {can('videos') && (
            <button type="button" role="tab" aria-selected={tab === 'reels'} className={tab === 'reels' ? 'is-active' : ''} onClick={() => setTab('reels')} aria-label="Reels">
              <Clapperboard size={24} strokeWidth={tab === 'reels' ? 2.2 : 1.6} />
            </button>
          )}
          <button type="button" role="tab" aria-selected={tab === 'tagged'} className={tab === 'tagged' ? 'is-active' : ''} onClick={() => setTab('tagged')} aria-label="Marcados">
            <SquareUserRound size={24} strokeWidth={tab === 'tagged' ? 2.2 : 1.6} />
          </button>
          {isActive && (
            <button type="button" role="tab" aria-selected={tab === 'saved'} className={tab === 'saved' ? 'is-active' : ''} onClick={() => setTab('saved')} aria-label="Salvos">
              <Bookmark size={24} strokeWidth={tab === 'saved' ? 2.2 : 1.6} />
            </button>
          )}
        </div>
        <PostsTab key={`${tab}:${p.id}:${refreshKey}`} kind={tab} character={p} />
      </PullToRefresh>

      <AccountSwitcher open={switchOpen} onClose={() => setSwitchOpen(false)} />
      {showNote && isActive && <NoteEditorSheet open={noteEdit} onClose={() => setNoteEdit(false)} note={p.note} onSaved={reload} />}
      {showNote && !isActive && <NoteViewSheet note={noteView} onClose={() => setNoteView(null)} />}
      <Sheet open={menu} onClose={() => setMenu(false)}>
        {can('melhores_amigos') && p.is_close_friend !== undefined && (
          <SheetItem icon={<span className={`close-toggle ${p.is_close_friend ? 'is-on' : ''}`}><Star size={16} fill={p.is_close_friend ? 'currentColor' : 'none'} /></span>} onClick={toggleClose}>
            {p.is_close_friend ? 'Remover dos melhores amigos' : 'Adicionar aos melhores amigos'}
          </SheetItem>
        )}
        <SheetItem icon={<Link2 size={22} />} onClick={copyLink}>
          Copiar link do perfil
        </SheetItem>
      </Sheet>
    </div>
  );
}

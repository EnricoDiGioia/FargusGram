import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { SessionProvider, useSession } from './state/session';
import { UnreadProvider } from './state/unread';
import { ToastProvider, useToast } from './state/toast';
import { ConfirmProvider, PageLoader, Button } from './components/ui';
import BottomNav from './components/BottomNav';
import ScrollManager from './components/ScrollManager';
import ViewportWatcher from './components/ViewportWatcher';
import { RouteErrorBoundary } from './components/ErrorBoundary';
import { RouteView, Screen } from './components/Motion';
import { RiftMark } from './components/Brand';
import { isConfigured } from './lib/supabase';
import { onSwUpdate } from './lib/pwa';
import { syncPush } from './lib/push';
import { emit } from './lib/events';
import * as api from './lib/api';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Hashtag from './pages/Hashtag';
import Activity from './pages/Activity';
import Profile from './pages/Profile';
import FollowList from './pages/FollowList';
import PostPage from './pages/PostPage';
import Likers from './pages/Likers';
import Comments from './pages/Comments';
import Inbox from './pages/Inbox';
import Chat from './pages/Chat';
import NewMessage from './pages/NewMessage';
import Settings from './pages/Settings';
import EditProfile from './pages/EditProfile';
import NewCharacter from './pages/NewCharacter';

const CreatePost = lazy(() => import('./pages/CreatePost'));
const CreateStory = lazy(() => import('./pages/CreateStory'));
const StoryViewer = lazy(() => import('./pages/StoryViewer'));
const EditPost = lazy(() => import('./pages/EditPost'));
const Admin = lazy(() => import('./pages/Admin'));

// Avisa quando existe uma versão nova do app publicada
function UpdateNotice() {
  const toast = useToast();
  useEffect(
    () =>
      onSwUpdate((apply) =>
        toast('Nova versão do FargusGram disponível', { action: { label: 'Atualizar', onClick: apply }, duration: 60000 })
      ),
    [toast]
  );
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <UpdateNotice />
        <ConfirmProvider>
          <SessionProvider>
            <Gate />
          </SessionProvider>
        </ConfirmProvider>
      </ToastProvider>
    </HashRouter>
  );
}

function Splash() {
  return (
    <div className="splash">
      <RiftMark size={72} className="splash__mark" />
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="center-screen">
      <RiftMark size={56} />
      <h2>Falta configurar o Supabase</h2>
      <p className="muted">
        Abra o arquivo <code>src/config.js</code> e cole a URL e a chave pública do seu projeto Supabase. O passo a passo está no README.
      </p>
    </div>
  );
}

function NoAccess() {
  const { signOut, meError, refreshMe } = useSession();
  return (
    <div className="center-screen">
      <RiftMark size={56} />
      <h2>{meError ? 'Não deu para carregar sua conta' : 'Conta sem acesso'}</h2>
      <p className="muted">
        {meError ||
          'Esta conta existe, mas não entrou no grupo pelo código de convite. Peça ajuda ao admin ou crie uma conta nova com o código.'}
      </p>
      {meError && (
        <Button variant="primary" onClick={refreshMe}>
          Tentar de novo
        </Button>
      )}
      <Button variant="secondary" onClick={signOut}>
        Sair
      </Button>
    </div>
  );
}

function Gate() {
  const { session, me, meError, characters } = useSession();
  if (!isConfigured) return <NotConfigured />;
  if (session === undefined) return <Splash />;
  if (!session)
    return (
      <Routes>
        <Route path="/cadastro" element={<Signup />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  if (me === undefined && !meError) return <Splash />;
  if (!me) return <NoAccess />;
  if (characters.length === 0)
    return (
      <div className="app">
        <NewCharacter first />
      </div>
    );
  return (
    <UnreadProvider>
      <AppRoutes />
    </UnreadProvider>
  );
}

// Notificações no celular: abrir no lugar certo e no personagem certo
function PushBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const { uid, characters, active, setActive } = useSession();

  // confere a assinatura deste aparelho ao abrir o app
  useEffect(() => {
    if (uid) syncPush(uid);
  }, [uid]);

  // mensagens do service worker (aviso chegou / tocaram no aviso)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e) => {
      const m = e.data || {};
      if (m.type === 'fg-push') emit('unread:refresh');
      if (m.type === 'fg-open' && typeof m.url === 'string') {
        try {
          const hash = new URL(m.url).hash;
          if (hash.startsWith('#/')) navigate(hash.slice(1));
        } catch {
          /* endereço estranho: ignora */
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);

  // ?como=<personagem>: o aviso era para um personagem específico (ex.: NPC do mestre)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('como');
    if (!id) return;
    if (characters.some((c) => c.id === id) && active?.id !== id) setActive(id);
    params.delete('como');
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true });
  }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function Shell() {
  return (
    <div className="app">
      <RouteErrorBoundary>
        <RouteView />
      </RouteErrorBoundary>
      <BottomNav />
    </div>
  );
}

// telas cheias ganham a animação de entrada (fadeOnly: só esmaece)
const screen = (el, { fadeOnly = false } = {}) => <Screen fadeOnly={fadeOnly}>{el}</Screen>;

function AppRoutes() {
  const { characters } = useSession();

  useEffect(() => {
    // limpa stories vencidos dos meus personagens (libera espaço no Storage)
    api.cleanupExpiredStories(characters.map((c) => c.id)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RouteErrorBoundary full>
      <Suspense fallback={<PageLoader />}>
        <ScrollManager />
        <ViewportWatcher />
        <PushBridge />
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="explorar" element={<Explore />} />
            <Route path="tag/:tag" element={<Hashtag />} />
            <Route path="atividade" element={<Activity />} />
            <Route path="u/:handle" element={<Profile />} />
            <Route path="u/:handle/:kind" element={<FollowList />} />
            <Route path="p/:id" element={<PostPage />} />
            <Route path="p/:id/curtidas" element={<Likers />} />
            <Route path="direct" element={<Inbox />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="admin" element={<Admin />} />
            <Route path="editar-perfil" element={<EditProfile />} />
            <Route path="novo-personagem" element={<NewCharacter />} />
          </Route>
          {/* telas cheias; comentários só esmaecem porque o campo de texto é fixo */}
          <Route path="p/:id/comentarios" element={screen(<Comments />, { fadeOnly: true })} />
          <Route path="p/:id/editar" element={screen(<EditPost />)} />
          <Route path="direct/novo" element={screen(<NewMessage />)} />
          <Route path="direct/:id" element={screen(<Chat />)} />
          <Route path="criar/post" element={screen(<CreatePost />)} />
          <Route path="criar/story" element={screen(<CreateStory />)} />
          <Route path="stories/:characterId" element={screen(<StoryViewer />)} />
          <Route path="cadastro" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

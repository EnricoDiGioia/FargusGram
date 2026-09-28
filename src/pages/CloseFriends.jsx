import { TopBar, BackButton, EmptyState } from '../components/ui';
import { CloseFriendsIntro, CloseFriendsList } from '../components/CloseFriends';
import { useSession } from '../state/session';

// Configurações → Melhores amigos (lista do personagem ativo)
export default function CloseFriends() {
  const { active, can } = useSession();
  return (
    <div className="page">
      <TopBar left={<BackButton />} title="Melhores amigos" />
      {can('melhores_amigos') ? (
        <>
          <p className="close-page__who muted">Lista de @{active.handle}</p>
          <CloseFriendsIntro />
          <CloseFriendsList />
        </>
      ) : (
        <EmptyState title="Ainda não disponível">
          O banco precisa da atualização de melhores amigos. O admin roda o arquivo supabase/atualizacoes/2026-09-melhores-amigos.sql no
          SQL Editor do Supabase.
        </EmptyState>
      )}
    </div>
  );
}

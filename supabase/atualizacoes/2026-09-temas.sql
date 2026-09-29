-- =====================================================================
--  FargusGram — atualização: temas do app guardados na conta (o tema
--  escolhido e os criados valem em todos os aparelhos do jogador)
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Sem ela os temas funcionam do mesmo jeito, mas ficam só no aparelho.
-- =====================================================================

-- Tema do app de cada jogador (o escolhido e os que ele criou), para valer em
-- todos os aparelhos dele
alter table public.players add column if not exists appearance jsonb not null default '{}'::jsonb;
alter table public.players drop constraint if exists players_appearance_ok;
alter table public.players add constraint players_appearance_ok
  check (jsonb_typeof(appearance) = 'object' and pg_column_size(appearance) <= 32768);

grant update (display_name, push_prefs, appearance) on public.players to authenticated;

create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'appearance', p.appearance,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos', 'interacoes', 'reacoes', 'figurinhas', 'repost', 'extras', 'temas'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

notify pgrst, 'reload schema';

select 'FargusGram: temas na conta ativados ✔' as resultado;

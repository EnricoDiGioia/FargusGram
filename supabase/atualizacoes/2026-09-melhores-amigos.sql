-- =====================================================================
--  FargusGram — atualização: Melhores amigos (close friends)
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa das atualizações anteriores (a última é a de destaques e notas).
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Lista de melhores amigos: cada personagem tem a sua, e só o dono vê
-- quem está nela (quem entra não fica sabendo, só passa a ver os
-- stories e notas marcados como "Melhores amigos").
-- ---------------------------------------------------------------------
create table if not exists public.close_friends (
  character_id uuid not null references public.characters (id) on delete cascade,
  friend_id    uuid not null references public.characters (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (character_id, friend_id),
  check (character_id <> friend_id)
);
create index if not exists close_friends_friend_idx on public.close_friends (friend_id);
alter table public.close_friends enable row level security;

-- Para quem é cada story e cada nota: todo mundo ou só os melhores amigos
alter table public.stories add column if not exists audience text not null default 'all';
alter table public.stories drop constraint if exists stories_audience_check;
alter table public.stories add constraint stories_audience_check check (audience in ('all', 'close_friends'));
alter table public.notes add column if not exists audience text not null default 'all';
alter table public.notes drop constraint if exists notes_audience_check;
alter table public.notes add constraint notes_audience_check check (audience in ('all', 'close_friends'));


-- ---------------------------------------------------------------------
-- Quem pode ver
-- ---------------------------------------------------------------------

-- Algum personagem do jogador logado está na lista de p_character?
-- (só responde sobre o próprio jogador: não dá para espiar a lista dos outros)
create or replace function public.is_close_friend_of(p_character uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.close_friends cf
    join public.characters c on c.id = cf.friend_id
    where cf.character_id = p_character and c.owner_id = (select auth.uid())
  );
$$;

-- O personagem p_viewer (que tem que ser do jogador logado) está na lista de p_owner?
create or replace function public.in_close_friends(p_owner uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.close_friends cf
    join public.characters c on c.id = cf.friend_id
    where cf.character_id = p_owner and cf.friend_id = p_viewer and c.owner_id = (select auth.uid())
  );
$$;

-- Um story ou nota de p_owner aparece para o personagem p_viewer?
create or replace function public.visible_to(p_owner uuid, p_audience text, p_viewer uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(p_audience, 'all') <> 'close_friends'
      or p_owner = p_viewer
      or public.in_close_friends(p_owner, p_viewer);
$$;

-- stories: o grupo todo vê, menos os de "Melhores amigos" (só o dono e a lista)
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select to authenticated
  using (
    (select public.is_member())
    and (audience = 'all' or public.owns_character(character_id) or public.is_close_friend_of(character_id))
  );

-- notas: mesma regra
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
  using (
    (select public.is_member())
    and (audience = 'all' or public.owns_character(character_id) or public.is_close_friend_of(character_id))
  );

-- a lista: só o dono lê e mexe
drop policy if exists close_friends_select on public.close_friends;
create policy close_friends_select on public.close_friends for select to authenticated
  using (public.owns_character(character_id));
drop policy if exists close_friends_insert on public.close_friends;
create policy close_friends_insert on public.close_friends for insert to authenticated
  with check (public.owns_character(character_id) and (select public.is_member()));
drop policy if exists close_friends_delete on public.close_friends;
create policy close_friends_delete on public.close_friends for delete to authenticated
  using (public.owns_character(character_id));


-- ---------------------------------------------------------------------
-- Funções que o app chama (agora respeitam a lista do personagem ativo)
-- ---------------------------------------------------------------------

-- Bandeja de stories: 'close_friends' deixa o anel verde
create or replace function public.stories_tray(p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.is_me desc, q.all_seen, q.latest desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'character', public._char(c.id),
        'stories', (
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'width', s.width, 'height', s.height, 'created_at', s.created_at,
            'music', s.music, 'audience', s.audience,
            'seen', exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
          ) order by s.created_at)
          from public.stories s
          where s.character_id = c.id and s.expires_at > now() and public.visible_to(s.character_id, s.audience, p_viewer)
        ),
        'all_seen', vis.all_seen,
        'close_friends', vis.close_friends
      ) as x,
      (c.id = p_viewer) as is_me,
      vis.all_seen,
      vis.latest
    from public.characters c
    cross join lateral (
      select
        count(*) as n,
        max(s.created_at) as latest,
        bool_and(exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)) as all_seen,
        bool_or(s.audience = 'close_friends') as close_friends
      from public.stories s
      where s.character_id = c.id and s.expires_at > now() and public.visible_to(s.character_id, s.audience, p_viewer)
    ) vis
    where (c.id = p_viewer or c.id in (select f.followee_id from public.follows f where f.follower_id = p_viewer))
      and vis.n > 0
  ) q;
$$;

create or replace function public.character_stories(p_character uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'character', public._char(p_character),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'width', s.width, 'height', s.height, 'created_at', s.created_at,
        'music', s.music, 'audience', s.audience,
        'seen', exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
      ) order by s.created_at)
      from public.stories s
      where s.character_id = p_character and s.expires_at > now() and public.visible_to(s.character_id, s.audience, p_viewer)
    ), '[]'::jsonb)
  );
$$;

-- Resumo de um destaque, contando só os stories que quem olha pode ver
drop function if exists public._highlight(uuid);
create or replace function public._highlight(p_highlight uuid, p_viewer uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', h.id,
    'title', h.title,
    'character_id', h.character_id,
    'updated_at', h.updated_at,
    'cover_story_id', cv.id,
    'cover', coalesce(cv.thumb_path, cv.path),
    'count', (
      select count(*) from public.highlight_items i
      join public.stories s on s.id = i.story_id
      where i.highlight_id = h.id and (p_viewer is null or public.visible_to(s.character_id, s.audience, p_viewer))
    )
  )
  from public.highlights h
  left join lateral (
    -- a capa escolhida, se ainda estiver no destaque (e visível); senão, o story mais antigo
    select s.id, s.path, s.thumb_path
    from public.highlight_items i
    join public.stories s on s.id = i.story_id
    where i.highlight_id = h.id and (p_viewer is null or public.visible_to(s.character_id, s.audience, p_viewer))
    order by (s.id = h.cover_story_id) desc, s.created_at
    limit 1
  ) cv on true
  where h.id = p_highlight;
$$;

-- Destaques de um personagem (p_story: marca em quais este story já está).
-- Destaque só com stories de "Melhores amigos" some para quem não está na lista.
drop function if exists public.character_highlights(uuid, uuid);
create or replace function public.character_highlights(p_character uuid, p_story uuid default null, p_viewer uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(
    public._highlight(h.id, p_viewer) || jsonb_build_object(
      'has_story', p_story is not null
        and exists (select 1 from public.highlight_items i where i.highlight_id = h.id and i.story_id = p_story)
    ) order by h.updated_at desc
  ), '[]'::jsonb)
  from public.highlights h
  where h.character_id = p_character
    and exists (
      select 1 from public.highlight_items i
      join public.stories s on s.id = i.story_id
      where i.highlight_id = h.id and (p_viewer is null or public.visible_to(s.character_id, s.audience, p_viewer))
    );
$$;

create or replace function public.get_highlight(p_highlight uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public._highlight(h.id, p_viewer) || jsonb_build_object(
    'character', public._char(h.character_id),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'width', s.width, 'height', s.height,
        'created_at', s.created_at, 'music', s.music, 'audience', s.audience,
        'seen', exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
      ) order by s.created_at)
      from public.highlight_items i
      join public.stories s on s.id = i.story_id
      where i.highlight_id = h.id and public.visible_to(s.character_id, s.audience, p_viewer)
    ), '[]'::jsonb)
  )
  from public.highlights h
  where h.id = p_highlight;
$$;

-- Arquivo: agora diz para quem cada story foi
create or replace function public.story_archive(p_character uuid, p_before timestamptz default null, p_limit int default 60)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not public.owns_character(p_character) then
    raise exception 'O arquivo de stories é só do dono';
  end if;
  return coalesce((
    select jsonb_agg(q.x order by q.created_at desc)
    from (
      select jsonb_build_object(
        'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'width', s.width, 'height', s.height,
        'created_at', s.created_at, 'expires_at', s.expires_at, 'music', s.music, 'audience', s.audience,
        'highlights', coalesce((select jsonb_agg(i.highlight_id) from public.highlight_items i where i.story_id = s.id), '[]'::jsonb)
      ) as x, s.created_at
      from public.stories s
      where s.character_id = p_character and (p_before is null or s.created_at < p_before)
      order by s.created_at desc
      limit least(greatest(coalesce(p_limit, 60), 1), 100)
    ) q
  ), '[]'::jsonb);
end $$;

-- Notas no topo do Direct: a sua primeiro, depois as de quem você segue
create or replace function public.notes_tray(p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.is_me desc, q.created_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', n.id, 'body', n.body, 'music', n.music, 'audience', n.audience,
      'created_at', n.created_at, 'expires_at', n.expires_at,
      'character', public._char(n.character_id)
    ) as x,
    (n.character_id = p_viewer) as is_me,
    n.created_at
    from public.notes n
    where n.expires_at > now()
      and (n.character_id = p_viewer
           or n.character_id in (select f.followee_id from public.follows f where f.follower_id = p_viewer))
      and public.visible_to(n.character_id, n.audience, p_viewer)
  ) q;
$$;

-- Deixa uma nota nova (substitui a anterior); p_audience: 'all' ou 'close_friends'
drop function if exists public.set_note(uuid, text, jsonb);
create or replace function public.set_note(p_character uuid, p_body text, p_music jsonb default null, p_audience text default 'all')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_body text := left(regexp_replace(trim(coalesce(p_body, '')), '\s+', ' ', 'g'), 60);
  v_note public.notes;
begin
  if not public.owns_character(p_character) then
    raise exception 'Personagem inválido';
  end if;
  if v_body = '' and p_music is null then
    raise exception 'Escreva alguma coisa ou escolha uma música';
  end if;
  delete from public.notes n where n.character_id = p_character;
  insert into public.notes (character_id, body, music, audience)
  values (p_character, v_body, p_music, case when p_audience = 'close_friends' then 'close_friends' else 'all' end)
  returning * into v_note;
  return jsonb_build_object(
    'id', v_note.id, 'body', v_note.body, 'music', v_note.music, 'audience', v_note.audience,
    'created_at', v_note.created_at, 'expires_at', v_note.expires_at,
    'character', public._char(v_note.character_id)
  );
end $$;

-- Perfil: anel verde, destaques e nota respeitam a lista; e diz se o
-- personagem está na SUA lista (para o menu "Adicionar aos melhores amigos")
create or replace function public.profile(p_handle text, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'handle', c.handle, 'name', c.name, 'bio', c.bio,
    'avatar_path', c.avatar_path, 'is_verified', c.is_verified,
    'owner_id', c.owner_id, 'created_at', c.created_at,
    'post_count', (select count(*) from public.posts p where p.character_id = c.id),
    'follower_count', (select count(*) from public.follows f where f.followee_id = c.id),
    'following_count', (select count(*) from public.follows f where f.follower_id = c.id),
    'is_following', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = c.id),
    'follows_you', exists (select 1 from public.follows f where f.follower_id = c.id and f.followee_id = p_viewer),
    'is_close_friend', exists (select 1 from public.close_friends cf where cf.character_id = p_viewer and cf.friend_id = c.id),
    'has_story', exists (
      select 1 from public.stories s
      where s.character_id = c.id and s.expires_at > now() and public.visible_to(s.character_id, s.audience, p_viewer)
    ),
    'story_seen', not exists (
      select 1 from public.stories s
      where s.character_id = c.id and s.expires_at > now() and public.visible_to(s.character_id, s.audience, p_viewer)
        and not exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
    ),
    'story_close', exists (
      select 1 from public.stories s
      where s.character_id = c.id and s.expires_at > now() and s.audience = 'close_friends'
        and public.visible_to(s.character_id, s.audience, p_viewer)
    ),
    'followed_by', coalesce((
      select jsonb_agg(q.handle) from (
        select fc.handle from public.follows f1
        join public.follows f2 on f2.followee_id = f1.follower_id and f2.follower_id = p_viewer
        join public.characters fc on fc.id = f1.follower_id
        where f1.followee_id = c.id and f1.follower_id <> p_viewer
        order by f1.created_at desc
        limit 2
      ) q
    ), '[]'::jsonb),
    'followed_by_count', (
      select count(*) from public.follows f1
      join public.follows f2 on f2.followee_id = f1.follower_id and f2.follower_id = p_viewer
      where f1.followee_id = c.id and f1.follower_id <> p_viewer
    ),
    'highlights', coalesce((
      select jsonb_agg(public._highlight(h.id, p_viewer) order by h.updated_at desc)
      from public.highlights h
      where h.character_id = c.id
        and exists (
          select 1 from public.highlight_items i
          join public.stories s on s.id = i.story_id
          where i.highlight_id = h.id and public.visible_to(s.character_id, s.audience, p_viewer)
        )
    ), '[]'::jsonb),
    'note', (
      select jsonb_build_object(
        'id', n.id, 'body', n.body, 'music', n.music, 'audience', n.audience,
        'created_at', n.created_at, 'expires_at', n.expires_at,
        'character', public._char(n.character_id)
      )
      from public.notes n
      where n.character_id = c.id and n.expires_at > now()
        and (c.id = p_viewer or exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = c.id))
        and public.visible_to(n.character_id, n.audience, p_viewer)
    )
  )
  from public.characters c
  where c.handle = lower(trim(p_handle));
$$;

-- Tela da lista: todos os personagens do grupo (menos o próprio), com os
-- da lista primeiro, depois quem segue você
create or replace function public.close_friends_list(p_character uuid, p_query text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_q text := nullif(lower(trim(coalesce(p_query, ''))), '');
begin
  if not public.owns_character(p_character) then
    raise exception 'A lista de melhores amigos é só do dono';
  end if;
  return jsonb_build_object(
    'count', (select count(*) from public.close_friends cf where cf.character_id = p_character),
    'characters', coalesce((
      select jsonb_agg(q.x order by q.is_close desc, q.follows_you desc, q.handle)
      from (
        select
          public._char(c.id) || jsonb_build_object('is_close', cf.friend_id is not null, 'follows_you', fy.follower_id is not null) as x,
          cf.friend_id is not null as is_close,
          fy.follower_id is not null as follows_you,
          c.handle
        from public.characters c
        left join public.close_friends cf on cf.character_id = p_character and cf.friend_id = c.id
        left join public.follows fy on fy.follower_id = c.id and fy.followee_id = p_character
        where c.id <> p_character
          and (v_q is null or c.handle like '%' || v_q || '%' or lower(coalesce(c.name, '')) like '%' || v_q || '%')
        order by cf.friend_id is not null desc, fy.follower_id is not null desc, c.handle
        limit 300
      ) q
    ), '[]'::jsonb)
  );
end $$;

-- O app descobre por aqui que o banco já tem os recursos novos
create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

-- Aviso no celular de story novo: o de "Melhores amigos" só vai para a lista
create or replace function public.tg_story_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_from public.characters;
  r      record;
begin
  select * into v_from from public.characters c where c.id = new.character_id;
  if v_from.id is null then
    return new;
  end if;
  for r in
    select distinct on (c.owner_id) c.owner_id, c.id, c.handle
    from public.follows f
    join public.characters c on c.id = f.follower_id
    where f.followee_id = new.character_id and c.owner_id <> v_from.owner_id
      and (new.audience <> 'close_friends'
           or exists (select 1 from public.close_friends cf where cf.character_id = new.character_id and cf.friend_id = c.id))
    order by c.owner_id, f.created_at
  loop
    perform public._push_enqueue(r.owner_id, r.id, 'story', r.handle,
      v_from.handle || case when new.audience = 'close_friends' then ' adicionou um story para os melhores amigos.' else ' adicionou um story.' end,
      '#/stories/' || new.character_id, 'story:' || new.character_id);
  end loop;
  return new;
exception when others then
  return new;
end $$;


-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke all on public.close_friends from anon, authenticated;
grant select, insert, delete on public.close_friends to authenticated;
grant all on public.close_friends to service_role;

revoke execute on function
  public.is_close_friend_of(uuid), public.in_close_friends(uuid, uuid), public.visible_to(uuid, text, uuid),
  public._highlight(uuid, uuid), public.character_highlights(uuid, uuid, uuid),
  public.set_note(uuid, text, jsonb, text), public.close_friends_list(uuid, text), public.tg_story_push()
from public, anon, authenticated;
grant execute on function
  public.is_close_friend_of(uuid), public.in_close_friends(uuid, uuid), public.visible_to(uuid, text, uuid),
  public._highlight(uuid, uuid), public.character_highlights(uuid, uuid, uuid),
  public.set_note(uuid, text, jsonb, text), public.close_friends_list(uuid, text), public.tg_story_push()
to service_role;
grant execute on function
  public.is_close_friend_of(uuid), public.in_close_friends(uuid, uuid), public.visible_to(uuid, text, uuid),
  public._highlight(uuid, uuid), public.character_highlights(uuid, uuid, uuid),
  public.set_note(uuid, text, jsonb, text), public.close_friends_list(uuid, text)
to authenticated;

notify pgrst, 'reload schema';

select 'FargusGram: melhores amigos ativados ✔' as resultado;

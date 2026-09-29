-- =====================================================================
--  FargusGram — atualização: números extras (seguidores e curtidas) que o
--  admin soma a um perfil, para os famosos da campanha
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa das atualizações anteriores (a última é a de repost).
--  Depois é só usar o Painel do admin → Números, ao lado de cada perfil.
-- =====================================================================

alter table public.characters add column if not exists follower_bonus int not null default 0;
alter table public.characters add column if not exists like_bonus int not null default 0;
alter table public.characters drop constraint if exists characters_follower_bonus_ok;
alter table public.characters add constraint characters_follower_bonus_ok
  check (follower_bonus between 0 and 1000000000 and like_bonus between 0 and 100000000);

-- Curtidas extras de um post (Painel do admin): a média do perfil, variando
-- um pouco de post para post (sempre o mesmo número para o mesmo post)
create or replace function public._like_bonus(p_post uuid)
returns bigint language sql stable security invoker set search_path = '' as $$
  select coalesce((
    select case when c.like_bonus = 0 then 0 else round(
      c.like_bonus * (0.6 + 0.8 * ((('x' || substr(md5(p.id::text), 1, 7))::bit(28)::int % 1000) / 1000.0))
    )::bigint end
    from public.posts p join public.characters c on c.id = p.character_id
    where p.id = p_post
  ), 0);
$$;

create or replace function public.profile(p_handle text, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'handle', c.handle, 'name', c.name, 'bio', c.bio,
    'avatar_path', c.avatar_path, 'is_verified', c.is_verified,
    'owner_id', c.owner_id, 'created_at', c.created_at,
    'post_count', (select count(*) from public.posts p where p.character_id = c.id),
    'follower_count', (select count(*) from public.follows f where f.followee_id = c.id) + c.follower_bonus,
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

create or replace function public._post_card(p_post uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'caption', p.caption,
    'location', p.location,
    'created_at', p.created_at,
    'edited_at', p.edited_at,
    'music', p.music,
    'character', public._char(p.character_id),
    'media', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', m.path, 'thumb_path', m.thumb_path, 'width', m.width, 'height', m.height
      ) order by m.position)
      from public.post_media m where m.post_id = p.id
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(jsonb_build_object('id', tc.id, 'handle', tc.handle) order by tc.handle)
      from public.post_tags t join public.characters tc on tc.id = t.character_id
      where t.post_id = p.id
    ), '[]'::jsonb),
    'like_count', (select count(*) from public.likes l where l.post_id = p.id) + public._like_bonus(p.id),
    'comment_count', (select count(*) from public.comments cm where cm.post_id = p.id),
    'liked', exists (select 1 from public.likes l where l.post_id = p.id and l.character_id = p_viewer),
    'saved', exists (select 1 from public.saves s where s.post_id = p.id and s.character_id = p_viewer),
    'likers', coalesce((
      select jsonb_agg(q.x) from (
        select jsonb_build_object('handle', lc.handle, 'avatar_path', lc.avatar_path) as x
        from public.likes l join public.characters lc on lc.id = l.character_id
        where l.post_id = p.id and l.character_id <> coalesce(p_viewer, '00000000-0000-0000-0000-000000000000'::uuid)
        order by exists (
          select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = l.character_id
        ) desc, l.created_at desc
        limit 2
      ) q
    ), '[]'::jsonb),
    'preview_comments', coalesce((
      select jsonb_agg(q.x order by q.created_at) from (
        select jsonb_build_object('id', cm.id, 'body', cm.body, 'handle', cc.handle) as x, cm.created_at
        from public.comments cm join public.characters cc on cc.id = cm.character_id
        where cm.post_id = p.id and cm.parent_id is null
        order by cm.created_at desc
        limit 2
      ) q
    ), '[]'::jsonb)
  )
  from public.posts p
  where p.id = p_post;
$$;

create or replace function public._post_thumb(p_post uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'created_at', p.created_at,
    'thumb', (select coalesce(m.thumb_path, m.path) from public.post_media m where m.post_id = p.id order by m.position limit 1),
    'media_count', (select count(*) from public.post_media m where m.post_id = p.id),
    'like_count', (select count(*) from public.likes l where l.post_id = p.id) + public._like_bonus(p.id),
    'comment_count', (select count(*) from public.comments c where c.post_id = p.id)
  )
  from public.posts p where p.id = p_post;
$$;

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;
  return jsonb_build_object(
    'invite_code', (select s.invite_code from public.app_settings s limit 1),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'email', u.email,
        'is_admin', p.is_admin,
        'created_at', p.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'characters', coalesce((
          select jsonb_agg(public._char(c.id) || jsonb_build_object('follower_bonus', c.follower_bonus, 'like_bonus', c.like_bonus) order by c.created_at)
          from public.characters c where c.owner_id = p.id
        ), '[]'::jsonb)
      ) order by p.created_at)
      from public.players p
      left join auth.users u on u.id = p.id
    ), '[]'::jsonb)
  );
end $$;

-- Números extras de um perfil (seguidores e média de curtidas por post)
create or replace function public.admin_set_boost(p_character uuid, p_followers int, p_likes int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;
  update public.characters
  set follower_bonus = greatest(0, least(coalesce(p_followers, 0), 1000000000)),
      like_bonus = greatest(0, least(coalesce(p_likes, 0), 100000000))
  where id = p_character;
end $$;

create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos', 'interacoes', 'reacoes', 'figurinhas', 'repost', 'extras'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

revoke execute on function public._like_bonus(uuid), public.admin_set_boost(uuid, int, int) from public, anon, authenticated;
grant execute on function public._like_bonus(uuid), public.admin_set_boost(uuid, int, int) to authenticated, service_role;

notify pgrst, 'reload schema';

select 'FargusGram: números extras ativados ✔' as resultado;

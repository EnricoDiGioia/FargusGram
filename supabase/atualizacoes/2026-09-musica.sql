-- =====================================================================
--  FargusGram — atualização: música em posts e stories (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================

-- Música em posts e stories (prévia do Apple Music: título, artista, capa e trecho)
-- (para quem instalou antes de setembro/2026, estas linhas adicionam as colunas)
alter table public.posts   add column if not exists music jsonb;
alter table public.stories add column if not exists music jsonb;
alter table public.posts   drop constraint if exists posts_music_is_object;
alter table public.posts   add  constraint posts_music_is_object
  check (music is null or (jsonb_typeof(music) = 'object' and pg_column_size(music) <= 4096));
alter table public.stories drop constraint if exists stories_music_is_object;
alter table public.stories add  constraint stories_music_is_object
  check (music is null or (jsonb_typeof(music) = 'object' and pg_column_size(music) <= 4096));

grant update (music) on public.posts to authenticated;

drop function if exists public.create_post(uuid, text, text, jsonb, uuid[]);
create or replace function public.create_post(
  p_character uuid,
  p_caption   text,
  p_location  text,
  p_media     jsonb,
  p_tags      uuid[] default '{}',
  p_music     jsonb  default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_post uuid;
  v_item jsonb;
  v_pos  int := 0;
begin
  if p_media is null or jsonb_typeof(p_media) <> 'array'
     or jsonb_array_length(p_media) = 0 or jsonb_array_length(p_media) > 10 then
    raise exception 'Uma publicação precisa ter de 1 a 10 fotos';
  end if;

  insert into public.posts (character_id, caption, location, music)
  values (p_character, coalesce(p_caption, ''), coalesce(p_location, ''), p_music)
  returning id into v_post;

  for v_item in select value from jsonb_array_elements(p_media) loop
    insert into public.post_media (post_id, position, path, thumb_path, width, height)
    values (
      v_post, v_pos, v_item ->> 'path', v_item ->> 'thumb_path',
      (v_item ->> 'width')::int, (v_item ->> 'height')::int
    );
    v_pos := v_pos + 1;
  end loop;

  insert into public.post_tags (post_id, character_id)
  select v_post, t from unnest(coalesce(p_tags, '{}'::uuid[])) as t
  where t <> p_character
  on conflict do nothing;

  return v_post;
end $$;

revoke execute on function public.create_post(uuid, text, text, jsonb, uuid[], jsonb) from public, anon;
grant execute on function public.create_post(uuid, text, text, jsonb, uuid[], jsonb) to authenticated, service_role;

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
    'like_count', (select count(*) from public.likes l where l.post_id = p.id),
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

create or replace function public.stories_tray(p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.is_me desc, q.all_seen, q.latest desc), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'character', public._char(c.id),
        'stories', (
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'path', s.path, 'width', s.width, 'height', s.height, 'created_at', s.created_at,
            'music', s.music,
            'seen', exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
          ) order by s.created_at)
          from public.stories s where s.character_id = c.id and s.expires_at > now()
        ),
        'all_seen', not exists (
          select 1 from public.stories s
          where s.character_id = c.id and s.expires_at > now()
            and not exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
        )
      ) as x,
      (c.id = p_viewer) as is_me,
      not exists (
        select 1 from public.stories s
        where s.character_id = c.id and s.expires_at > now()
          and not exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
      ) as all_seen,
      (select max(s.created_at) from public.stories s where s.character_id = c.id and s.expires_at > now()) as latest
    from public.characters c
    where (c.id = p_viewer or c.id in (select f.followee_id from public.follows f where f.follower_id = p_viewer))
      and exists (select 1 from public.stories s where s.character_id = c.id and s.expires_at > now())
  ) q;
$$;

create or replace function public.character_stories(p_character uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'character', public._char(p_character),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'path', s.path, 'width', s.width, 'height', s.height, 'created_at', s.created_at,
        'music', s.music,
        'seen', exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
      ) order by s.created_at)
      from public.stories s where s.character_id = p_character and s.expires_at > now()
    ), '[]'::jsonb)
  );
$$;

notify pgrst, 'reload schema';

select 'FargusGram: música ativada ✔' as resultado;

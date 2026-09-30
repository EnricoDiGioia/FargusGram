-- =====================================================================
--  FargusGram — atualização: vídeos nos posts, nos stories e nos reels
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Rode depois da de temas. Sem ela o app continua só com fotos.
--
--  Os vídeos são cortados (até 15 s) e comprimidos no próprio celular antes
--  de subir: cerca de 1,4 MB por vídeo de 15 s, junto com uma foto do
--  primeiro quadro para as miniaturas.
-- =====================================================================

-- O Storage passa a aceitar vídeos MP4 (o limite de 10 MB por arquivo continua)
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']
where id = 'media';

-- Miniatura de um post (grades do perfil / explorar)
create or replace function public._post_thumb(p_post uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'created_at', p.created_at,
    'thumb', (select coalesce(m.thumb_path, m.path) from public.post_media m where m.post_id = p.id order by m.position limit 1),
    'media_count', (select count(*) from public.post_media m where m.post_id = p.id),
    'video', coalesce((select m.path like '%.mp4' from public.post_media m where m.post_id = p.id order by m.position limit 1), false),
    'like_count', (select count(*) from public.likes l where l.post_id = p.id) + public._like_bonus(p.id),
    'comment_count', (select count(*) from public.comments c where c.post_id = p.id)
  )
  from public.posts p where p.id = p_post;
$$;

-- Reels: publicações com um vídeo só (de todo mundo, as mais novas primeiro)
create or replace function public.reels(p_viewer uuid, p_before timestamptz default null, p_limit int default 6)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_card(q.id, p_viewer) order by q.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at from public.posts p
    where (p_before is null or p.created_at < p_before)
      and (select count(*) from public.post_media m where m.post_id = p.id) = 1
      and exists (select 1 from public.post_media m where m.post_id = p.id and m.path like '%.mp4')
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 6), 1), 30)
  ) q;
$$;

-- Aba "Reels" do perfil
create or replace function public.character_reels(p_character uuid, p_before timestamptz default null, p_limit int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_thumb(q.id) order by q.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at from public.posts p
    where p.character_id = p_character and (p_before is null or p.created_at < p_before)
      and (select count(*) from public.post_media m where m.post_id = p.id) = 1
      and exists (select 1 from public.post_media m where m.post_id = p.id and m.path like '%.mp4')
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
$$;

create or replace function public.story_for_repost(p_story uuid, p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.stories;
begin
  if not public._story_open(p_story, p_viewer) then
    raise exception 'Story não encontrado';
  end if;
  select * into s from public.stories where id = p_story;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(s.stickers, '[]'::jsonb)) x
    where x ->> 'type' = 'mention' and x ->> 'character_id' = p_viewer::text
  ) then
    raise exception 'Só dá para repostar um story em que você foi marcado';
  end if;
  if s.audience = 'close_friends' then
    raise exception 'Stories de melhores amigos não podem ser repostados';
  end if;
  if s.expires_at <= now() then
    raise exception 'Esse story já saiu do ar';
  end if;
  return jsonb_build_object('id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'width', s.width, 'height', s.height, 'character', public._char(s.character_id));
end $$;

create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'appearance', p.appearance,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos', 'interacoes', 'reacoes', 'figurinhas', 'repost', 'extras', 'temas', 'videos'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

revoke execute on function public.reels(uuid, timestamptz, int), public.character_reels(uuid, timestamptz, int) from public, anon, authenticated;
grant execute on function public.reels(uuid, timestamptz, int), public.character_reels(uuid, timestamptz, int) to authenticated, service_role;

notify pgrst, 'reload schema';

select 'FargusGram: vídeos e reels ativados ✔' as resultado;

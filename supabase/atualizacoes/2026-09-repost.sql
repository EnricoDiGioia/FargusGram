-- =====================================================================
--  FargusGram — atualização: repostar o story em que você foi marcado
--  ("Adicionar ao seu story", como no Instagram)
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa das atualizações anteriores (a última é a de figurinhas:
--  2026-09-figurinhas.sql).
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================

-- Repostar um story em que você foi marcado (como o "Adicionar ao seu story"
-- do Instagram): o app monta o story novo com o original num cartão e guarda
-- nas figurinhas um "repost" (quem fez o original), para quem vê poder tocar.
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
  return jsonb_build_object('id', s.id, 'path', s.path, 'width', s.width, 'height', s.height, 'character', public._char(s.character_id));
end $$;

-- Aviso no celular: quem fez o story original fica sabendo do repost
create or replace function public.tg_story_repost_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_orig uuid;
  v_to   public.characters;
  v_from public.characters;
begin
  if new.stickers is null then
    return new;
  end if;
  select (x ->> 'story_id')::uuid into v_orig
  from jsonb_array_elements(new.stickers) x
  where x ->> 'type' = 'repost'
  limit 1;
  if v_orig is null then
    return new;
  end if;
  select c.* into v_to from public.stories s join public.characters c on c.id = s.character_id where s.id = v_orig;
  select * into v_from from public.characters c where c.id = new.character_id;
  if v_to.id is null or v_from.id is null or v_to.owner_id = v_from.owner_id then
    return new;
  end if;
  perform public._push_enqueue(
    v_to.owner_id, v_to.id, 'mention', v_to.handle,
    v_from.handle || ' compartilhou seu story no story dele.',
    '#/stories/' || v_from.id, null
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists stories_repost_push on public.stories;
create trigger stories_repost_push after insert on public.stories
  for each row execute function public.tg_story_repost_push();

revoke execute on function public.story_for_repost(uuid, uuid), public.tg_story_repost_push() from public, anon, authenticated;
grant execute on function public.story_for_repost(uuid, uuid), public.tg_story_repost_push() to service_role;
grant execute on function public.story_for_repost(uuid, uuid) to authenticated;

-- Mensagens: o story mencionado diz se é de melhores amigos (esses não podem ser repostados)
create or replace function public.get_messages(p_conversation uuid, p_before timestamptz default null, p_after timestamptz default null, p_limit int default 40)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.created_at), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', msg.id,
      'sender_id', msg.sender_id,
      'kind', msg.kind,
      'body', msg.body,
      'media_path', msg.media_path, 'media_width', msg.media_width, 'media_height', msg.media_height,
      'created_at', msg.created_at,
      'note_body', msg.note_body,
      'reactions', coalesce((
        select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'character_id', r.character_id) order by r.created_at)
        from public.message_reactions r where r.message_id = msg.id
      ), '[]'::jsonb),
      'post', case when msg.post_id is null then null else (
        select jsonb_build_object(
          'id', p.id,
          'caption', left(p.caption, 120),
          'character', public._char(p.character_id),
          'thumb', (select coalesce(m.thumb_path, m.path) from public.post_media m where m.post_id = p.id order by m.position limit 1)
        ) from public.posts p where p.id = msg.post_id
      ) end,
      'story', case when msg.story_id is null then null else (
        select jsonb_build_object(
          'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'character_id', s.character_id, 'audience', s.audience,
          'expired', s.expires_at <= now() and not exists (select 1 from public.highlight_items hi where hi.story_id = s.id)
        )
        from public.stories s where s.id = msg.story_id
      ) end,
      'story_reply', msg.kind = 'story_reply',
      'reply', case when msg.reply_to is null then null else coalesce((
        select jsonb_build_object(
          'id', r.id,
          'sender_id', r.sender_id,
          'handle', rc.handle,
          'kind', r.kind,
          'body', left(r.body, 160),
          'media_path', r.media_path,
          'created_at', r.created_at
        )
        from public.messages r
        left join public.characters rc on rc.id = r.sender_id
        where r.id = msg.reply_to and r.conversation_id = msg.conversation_id
      ), jsonb_build_object('id', msg.reply_to, 'deleted', true)) end
    ) as x, msg.created_at
    from public.messages msg
    where msg.conversation_id = p_conversation
      and (p_before is null or msg.created_at < p_before)
      and (p_after is null or msg.created_at > p_after)
    order by msg.created_at desc
    limit least(greatest(coalesce(p_limit, 40), 1), 200)
  ) q;
$$;

-- O app passa a mostrar o botão "Adicionar ao seu story"
create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos', 'interacoes', 'reacoes', 'figurinhas', 'repost'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

notify pgrst, 'reload schema';

select 'FargusGram: repostar stories ativado ✔' as resultado;

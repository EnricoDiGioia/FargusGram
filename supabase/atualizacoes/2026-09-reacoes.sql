-- =====================================================================
--  FargusGram — atualização: reações nos stories, nos destaques e nas
--  mensagens do Direct
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa das atualizações anteriores (a última é a de interações:
--  2026-09-interacoes.sql).
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================

-- Reações nos stories (e destaques) e nas mensagens do Direct: uma por personagem
create table if not exists public.story_reactions (
  story_id     uuid not null references public.stories (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  emoji        text not null check (emoji in ('❤️', '😂', '😮', '😍', '😢', '👏', '🔥', '🎉')),
  created_at   timestamptz not null default now(),
  primary key (story_id, character_id)
);
create table if not exists public.message_reactions (
  message_id      uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  character_id    uuid not null references public.characters (id) on delete cascade,
  emoji           text not null check (emoji in ('❤️', '😂', '😮', '😢', '😡', '👍')),
  created_at      timestamptz not null default now(),
  primary key (message_id, character_id)
);
create index if not exists message_reactions_conversation_idx on public.message_reactions (conversation_id, message_id);

alter table public.story_reactions   enable row level security;
alter table public.message_reactions enable row level security;

-- quem reagiu vê a própria reação; o dono do story vê todas
drop policy if exists story_reactions_select on public.story_reactions;
create policy story_reactions_select on public.story_reactions for select to authenticated
  using (
    public.owns_character(character_id)
    or exists (select 1 from public.stories s where s.id = story_id and public.owns_character(s.character_id))
  );
-- reações do Direct: quem está na conversa vê
drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions for select to authenticated
  using (public.in_conversation(conversation_id));

-- escrever só pelas funções abaixo
revoke all on public.story_reactions, public.message_reactions from anon, authenticated;
grant select on public.story_reactions, public.message_reactions to authenticated;
grant all on public.story_reactions, public.message_reactions to service_role;

-- Reagir a um story ou story de destaque (p_emoji nulo tira; ❤️ é a curtida)
create or replace function public.react_story(p_story uuid, p_character uuid, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public._story_open(p_story, p_character) then
    raise exception 'Story não encontrado';
  end if;
  if exists (select 1 from public.stories s where s.id = p_story and s.character_id = p_character) then
    raise exception 'Não dá para reagir ao próprio story';
  end if;
  if p_emoji is null then
    delete from public.story_reactions r where r.story_id = p_story and r.character_id = p_character;
  else
    insert into public.story_reactions (story_id, character_id, emoji)
    values (p_story, p_character, p_emoji)
    on conflict (story_id, character_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end $$;

-- Reagir a uma mensagem do Direct (p_emoji nulo tira)
create or replace function public.react_message(p_message uuid, p_character uuid, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_conv uuid;
begin
  if not public.owns_character(p_character) then
    raise exception 'Personagem inválido';
  end if;
  select m.conversation_id into v_conv
  from public.messages m
  join public.conversation_members cm on cm.conversation_id = m.conversation_id and cm.character_id = p_character
  where m.id = p_message;
  if v_conv is null then
    raise exception 'Mensagem não encontrada';
  end if;
  if p_emoji is null then
    delete from public.message_reactions r where r.message_id = p_message and r.character_id = p_character;
  else
    insert into public.message_reactions (message_id, conversation_id, character_id, emoji)
    values (p_message, v_conv, p_character, p_emoji)
    on conflict (message_id, character_id) do update set emoji = excluded.emoji, created_at = now();
  end if;
end $$;

-- Reações das mensagens de uma conversa a partir de uma data (para atualizar a tela)
create or replace function public.message_reactions_since(p_conversation uuid, p_from timestamptz)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(q.message_id, q.list), '{}'::jsonb)
  from (
    select r.message_id, jsonb_agg(jsonb_build_object('emoji', r.emoji, 'character_id', r.character_id) order by r.created_at) as list
    from public.message_reactions r
    join public.messages m on m.id = r.message_id
    where r.conversation_id = p_conversation and m.created_at >= coalesce(p_from, '-infinity'::timestamptz)
    group by r.message_id
  ) q;
$$;

-- Avisos no celular: reação ao story e à mensagem
create or replace function public.tg_story_reaction_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_to   public.characters;
  v_from public.characters;
begin
  select c.* into v_to from public.stories s join public.characters c on c.id = s.character_id where s.id = new.story_id;
  select * into v_from from public.characters c where c.id = new.character_id;
  if v_to.id is null or v_from.id is null or v_to.owner_id = v_from.owner_id then
    return new;
  end if;
  perform public._push_enqueue(
    v_to.owner_id, v_to.id, 'like', v_to.handle,
    v_from.handle || case when new.emoji = '❤️' then ' curtiu seu story.' else ' reagiu com ' || new.emoji || ' ao seu story.' end,
    '#/stories/' || v_to.id, 'story-reaction:' || new.story_id
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists story_reactions_push on public.story_reactions;
create trigger story_reactions_push after insert on public.story_reactions
  for each row execute function public.tg_story_reaction_push();

create or replace function public.tg_message_reaction_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_to    public.characters;
  v_from  public.characters;
  v_msg   public.messages;
  v_quote text;
begin
  select * into v_msg from public.messages m where m.id = new.message_id;
  select * into v_to from public.characters c where c.id = v_msg.sender_id;
  select * into v_from from public.characters c where c.id = new.character_id;
  if v_to.id is null or v_from.id is null or v_to.owner_id = v_from.owner_id then
    return new;
  end if;
  v_quote := case v_msg.kind when 'media' then 'foto' when 'post' then 'publicação' else public._push_snippet(v_msg.body, 80) end;
  perform public._push_enqueue(
    v_to.owner_id, v_to.id, 'message', v_to.handle,
    v_from.handle || ' reagiu com ' || new.emoji || ' à sua mensagem: ' || coalesce(v_quote, ''),
    '#/direct/' || v_msg.conversation_id, 'dm:' || v_msg.conversation_id
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists message_reactions_push on public.message_reactions;
create trigger message_reactions_push after insert on public.message_reactions
  for each row execute function public.tg_message_reaction_push();

-- reações do Direct chegam na hora para quem está na conversa
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end $$;

revoke execute on function
  public.react_story(uuid, uuid, text), public.react_message(uuid, uuid, text),
  public.message_reactions_since(uuid, timestamptz), public.tg_story_reaction_push(), public.tg_message_reaction_push()
from public, anon, authenticated;
grant execute on function
  public.react_story(uuid, uuid, text), public.react_message(uuid, uuid, text),
  public.message_reactions_since(uuid, timestamptz), public.tg_story_reaction_push(), public.tg_message_reaction_push()
to service_role;
grant execute on function
  public.react_story(uuid, uuid, text), public.react_message(uuid, uuid, text), public.message_reactions_since(uuid, timestamptz)
to authenticated;


-- Quem viu o story, agora com a reação de cada um
create or replace function public.story_viewers(p_story uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  -- quem viu e quem reagiu (quem reagiu aparece primeiro, com o emoji)
  select coalesce(jsonb_agg(
    public._char(x.cid) || jsonb_build_object('viewed_at', x.at, 'reaction', x.emoji)
    order by (x.emoji is null), x.at desc
  ), '[]'::jsonb)
  from (
    select coalesce(v.character_id, r.character_id) as cid, coalesce(v.viewed_at, r.created_at) as at, r.emoji
    from (select * from public.story_views where story_id = p_story) v
    full join (select * from public.story_reactions where story_id = p_story) r on r.character_id = v.character_id
  ) x
  join public.stories s on s.id = p_story
  where x.cid <> s.character_id;
$$;

-- Mensagens com as reações
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
          'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'character_id', s.character_id,
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

-- Figurinhas do story + a sua reação (e, para o dono, as reações)
create or replace function public.story_interactions(p_story uuid, p_viewer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s       public.stories;
  v_owner boolean;
begin
  if not public._story_open(p_story, p_viewer) then
    return null;
  end if;
  select * into s from public.stories where id = p_story;
  v_owner := public.owns_character(s.character_id);
  return jsonb_build_object(
    'stickers', coalesce(s.stickers, '[]'::jsonb),
    'polls', coalesce((
      select jsonb_object_agg(v.sticker_id, jsonb_build_object(
        'counts', v.counts,
        'mine', (select pv.option from public.story_poll_votes pv
                 where pv.story_id = p_story and pv.sticker_id = v.sticker_id and pv.character_id = p_viewer)
      ))
      from (
        select pv.sticker_id, jsonb_build_array(
          count(*) filter (where pv.option = 0), count(*) filter (where pv.option = 1),
          count(*) filter (where pv.option = 2), count(*) filter (where pv.option = 3)
        ) as counts
        from public.story_poll_votes pv where pv.story_id = p_story
        group by pv.sticker_id
      ) v
    ), '{}'::jsonb),
    'mine', coalesce((
      select jsonb_object_agg(pv.sticker_id, pv.option)
      from public.story_poll_votes pv where pv.story_id = p_story and pv.character_id = p_viewer
    ), '{}'::jsonb),
    'answered', coalesce((
      select jsonb_agg(distinct a.sticker_id)
      from public.story_answers a where a.story_id = p_story and a.character_id = p_viewer
    ), '[]'::jsonb),
    'is_owner', v_owner,
    'my_reaction', (select r.emoji from public.story_reactions r where r.story_id = p_story and r.character_id = p_viewer),
    'reactions', case when v_owner then coalesce((
      select jsonb_agg(r.emoji order by r.created_at desc) from public.story_reactions r where r.story_id = p_story
    ), '[]'::jsonb) end,
    'votes', case when v_owner then coalesce((
      select jsonb_agg(jsonb_build_object('sticker_id', pv.sticker_id, 'option', pv.option, 'character', public._char(pv.character_id))
                       order by pv.created_at desc)
      from public.story_poll_votes pv where pv.story_id = p_story
    ), '[]'::jsonb) end,
    'answers', case when v_owner then coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'sticker_id', a.sticker_id, 'body', a.body, 'created_at', a.created_at,
                                          'character', public._char(a.character_id))
                       order by a.created_at desc)
      from public.story_answers a where a.story_id = p_story
    ), '[]'::jsonb) end
  );
end $$;

-- O app passa a mostrar as reações
create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos', 'interacoes', 'reacoes'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

notify pgrst, 'reload schema';

select 'FargusGram: reações nos stories e no Direct ativadas ✔' as resultado;

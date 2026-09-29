-- =====================================================================
--  FargusGram — atualização: reações e comentários fixados; figurinhas
--  do story (enquete, caixinha de perguntas, menção, local e horário)
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa das atualizações anteriores (a última é a de melhores amigos).
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================

-- Reações nos comentários: a curtida (❤️) ganhou outros emojis, um por pessoa
alter table public.comment_likes add column if not exists emoji text not null default '❤️';
alter table public.comment_likes drop constraint if exists comment_likes_emoji_check;
alter table public.comment_likes add constraint comment_likes_emoji_check
  check (emoji in ('❤️', '😂', '😮', '😢', '🔥', '👏'));

-- Comentários fixados pelo dono da publicação (até 3, aparecem primeiro)
alter table public.comments add column if not exists pinned_at timestamptz;

-- Figurinhas do story (enquete, caixinha de perguntas, menção, local e
-- horário): ficam por cima da foto, guardadas como dados, para dar para
-- tocar nelas
alter table public.stories add column if not exists stickers jsonb;
alter table public.stories drop constraint if exists stories_stickers_ok;
alter table public.stories add constraint stories_stickers_ok
  check (stickers is null or (jsonb_typeof(stickers) = 'array' and jsonb_array_length(stickers) <= 12 and pg_column_size(stickers) <= 16384));

-- Menção no story chega no Direct de quem foi mencionado
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'media', 'post', 'story_reply', 'note_reply', 'story_mention'));

-- Votos das enquetes (um por personagem em cada enquete)
create table if not exists public.story_poll_votes (
  story_id     uuid not null references public.stories (id) on delete cascade,
  sticker_id   text not null check (char_length(sticker_id) between 1 and 40),
  character_id uuid not null references public.characters (id) on delete cascade,
  option       smallint not null check (option between 0 and 3),
  created_at   timestamptz not null default now(),
  primary key (story_id, sticker_id, character_id)
);

-- Respostas das caixinhas de perguntas (só o dono do story vê)
create table if not exists public.story_answers (
  id           uuid primary key default gen_random_uuid(),
  story_id     uuid not null references public.stories (id) on delete cascade,
  sticker_id   text not null check (char_length(sticker_id) between 1 and 40),
  character_id uuid not null references public.characters (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 300),
  created_at   timestamptz not null default now()
);
create index if not exists story_answers_story_idx on public.story_answers (story_id, created_at);

-- as duas tabelas só são lidas e escritas pelas funções abaixo
alter table public.story_poll_votes enable row level security;
alter table public.story_answers    enable row level security;
revoke all on public.story_poll_votes, public.story_answers from anon, authenticated;
grant all on public.story_poll_votes, public.story_answers to service_role;

-- Reagir a um comentário (p_emoji nulo tira a reação)
create or replace function public.react_comment(p_comment uuid, p_character uuid, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.owns_character(p_character) then
    raise exception 'Personagem inválido';
  end if;
  if p_emoji is null then
    delete from public.comment_likes l where l.comment_id = p_comment and l.character_id = p_character;
  else
    insert into public.comment_likes (comment_id, character_id, emoji)
    values (p_comment, p_character, p_emoji)
    on conflict (comment_id, character_id) do update set emoji = excluded.emoji;
  end if;
end $$;

-- Fixar ou soltar um comentário (só quem é dono da publicação)
create or replace function public.pin_comment(p_comment uuid, p_pin boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_post   uuid;
  v_owner  uuid;
  v_parent uuid;
begin
  select c.post_id, p.character_id, c.parent_id into v_post, v_owner, v_parent
  from public.comments c join public.posts p on p.id = c.post_id
  where c.id = p_comment;
  if v_post is null then
    raise exception 'Comentário não encontrado';
  end if;
  if not public.owns_character(v_owner) then
    raise exception 'Só o dono da publicação pode fixar comentários';
  end if;
  if p_pin then
    if v_parent is not null then
      raise exception 'Só dá para fixar comentários, não respostas';
    end if;
    if (select count(*) from public.comments c where c.post_id = v_post and c.pinned_at is not null and c.id <> p_comment) >= 3 then
      raise exception 'Dá para fixar até 3 comentários';
    end if;
    update public.comments set pinned_at = coalesce(pinned_at, now()) where id = p_comment;
  else
    update public.comments set pinned_at = null where id = p_comment;
  end if;
end $$;

-- O personagem pode ver este story? (mesma regra da bandeja, do arquivo e dos destaques)
create or replace function public._story_open(p_story uuid, p_viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.stories s
    where s.id = p_story
      and public.owns_character(p_viewer)
      and public.visible_to(s.character_id, s.audience, p_viewer)
      and (s.expires_at > now() or public.owns_character(s.character_id)
           or exists (select 1 from public.highlight_items hi where hi.story_id = s.id))
  );
$$;

-- Votar numa enquete (não dá para mudar o voto, como no Instagram)
create or replace function public.story_vote(p_story uuid, p_sticker text, p_character uuid, p_option int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_options int;
begin
  if not public._story_open(p_story, p_character) then
    raise exception 'Story não encontrado';
  end if;
  select jsonb_array_length(x -> 'options') into v_options
  from public.stories s, jsonb_array_elements(coalesce(s.stickers, '[]'::jsonb)) x
  where s.id = p_story and x ->> 'id' = p_sticker and x ->> 'type' = 'poll';
  if v_options is null or p_option < 0 or p_option >= v_options then
    raise exception 'Enquete não encontrada';
  end if;
  insert into public.story_poll_votes (story_id, sticker_id, character_id, option)
  values (p_story, p_sticker, p_character, p_option)
  on conflict do nothing;
end $$;

-- Responder uma caixinha de perguntas
create or replace function public.story_answer(p_story uuid, p_sticker text, p_character uuid, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public._story_open(p_story, p_character) then
    raise exception 'Story não encontrado';
  end if;
  if not exists (
    select 1 from public.stories s, jsonb_array_elements(coalesce(s.stickers, '[]'::jsonb)) x
    where s.id = p_story and x ->> 'id' = p_sticker and x ->> 'type' = 'question'
  ) then
    raise exception 'Caixinha não encontrada';
  end if;
  if (select count(*) from public.story_answers a where a.story_id = p_story and a.character_id = p_character) >= 20 then
    raise exception 'Respostas demais neste story';
  end if;
  insert into public.story_answers (story_id, sticker_id, character_id, body)
  values (p_story, p_sticker, p_character, trim(p_body));
end $$;

-- Figurinhas de um story e o estado delas para quem está vendo:
-- contagem das enquetes, em que opção votou e quais caixinhas já respondeu.
-- O dono vê também quem votou em quê e as respostas.
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

-- Aviso no celular: alguém respondeu sua caixinha
create or replace function public.tg_story_answer_push()
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
    v_to.owner_id, v_to.id, 'comment', v_to.handle,
    v_from.handle || ' respondeu sua caixinha de perguntas: ' || public._push_snippet(new.body, 120),
    '#/stories/' || v_to.id, null
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists story_answers_push on public.story_answers;
create trigger story_answers_push after insert on public.story_answers
  for each row execute function public.tg_story_answer_push();

-- Menção no story: manda o story no Direct de quem foi mencionado
-- (só para quem pode ver o story; os de "Melhores amigos" só para a lista)
create or replace function public.tg_story_mentions()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r      record;
  v_conv uuid;
begin
  if new.stickers is null then
    return new;
  end if;
  for r in
    select distinct c.id
    from jsonb_array_elements(new.stickers) x
    join public.characters c on c.id::text = x ->> 'character_id'
    where x ->> 'type' = 'mention' and c.id <> new.character_id
    limit 10
  loop
    continue when not public.visible_to(new.character_id, new.audience, r.id);
    v_conv := public.start_conversation(new.character_id, array[r.id]);
    insert into public.messages (conversation_id, sender_id, kind, story_id)
    values (v_conv, new.character_id, 'story_mention', new.id);
  end loop;
  return new;
exception when others then
  return new; -- a menção nunca pode impedir o story de ser publicado
end $$;
drop trigger if exists stories_mentions on public.stories;
create trigger stories_mentions after insert on public.stories
  for each row execute function public.tg_story_mentions();

revoke execute on function
  public.react_comment(uuid, uuid, text), public.pin_comment(uuid, boolean), public._story_open(uuid, uuid),
  public.story_vote(uuid, text, uuid, int), public.story_answer(uuid, text, uuid, text),
  public.story_interactions(uuid, uuid), public.tg_story_answer_push(), public.tg_story_mentions()
from public, anon, authenticated;
grant execute on function
  public.react_comment(uuid, uuid, text), public.pin_comment(uuid, boolean), public._story_open(uuid, uuid),
  public.story_vote(uuid, text, uuid, int), public.story_answer(uuid, text, uuid, text),
  public.story_interactions(uuid, uuid), public.tg_story_answer_push(), public.tg_story_mentions()
to service_role;
grant execute on function
  public.react_comment(uuid, uuid, text), public.pin_comment(uuid, boolean),
  public.story_vote(uuid, text, uuid, int), public.story_answer(uuid, text, uuid, text),
  public.story_interactions(uuid, uuid)
to authenticated;


-- Comentários com reações e fixados
create or replace function public.post_comments(p_post uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'parent_id', c.parent_id,
    'body', c.body,
    'created_at', c.created_at,
    'character', public._char(c.character_id),
    'like_count', (select count(*) from public.comment_likes l where l.comment_id = c.id),
    'liked', exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.character_id = p_viewer),
    'my_reaction', (select l.emoji from public.comment_likes l where l.comment_id = c.id and l.character_id = p_viewer),
    'reactions', (
      select coalesce(jsonb_agg(e.emoji order by e.n desc, e.emoji), '[]'::jsonb)
      from (select l.emoji, count(*) as n from public.comment_likes l where l.comment_id = c.id group by l.emoji) e
    ),
    'pinned_at', c.pinned_at
  ) order by c.created_at), '[]'::jsonb)
  from public.comments c
  where c.post_id = p_post;
$$;

-- Avisos no celular: reação com emoji e menção no story
create or replace function public.tg_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_to    public.characters;
  v_from  public.characters;
  v_quote text;
  v_kind  text;
  v_text  text;
  v_url   text;
  v_emoji text;
begin
  select * into v_to from public.characters c where c.id = new.recipient_id;
  select * into v_from from public.characters c where c.id = new.actor_id;
  -- o mesmo jogador (ex.: dois NPCs do mestre) não recebe aviso de si mesmo
  if v_to.id is null or v_from.id is null or v_to.owner_id = v_from.owner_id then
    return new;
  end if;
  if new.comment_id is not null then
    select public._push_snippet(cm.body, 90) into v_quote from public.comments cm where cm.id = new.comment_id;
  end if;
  if new.type = 'comment_like' then
    select l.emoji into v_emoji from public.comment_likes l where l.comment_id = new.comment_id and l.character_id = new.actor_id;
  end if;
  v_kind := case new.type
    when 'like' then 'like'
    when 'comment_like' then 'like'
    when 'comment' then 'comment'
    when 'reply' then 'comment'
    when 'follow' then 'follow'
    else 'mention'
  end;
  v_text := v_from.handle || ' ' || case new.type
    when 'like' then 'curtiu sua publicação.'
    when 'comment_like' then case when coalesce(v_emoji, '❤️') = '❤️' then 'curtiu seu comentário: '
                                  else 'reagiu com ' || v_emoji || ' ao seu comentário: ' end || coalesce(v_quote, '')
    when 'comment' then 'comentou: ' || coalesce(v_quote, '')
    when 'reply' then 'respondeu ao seu comentário: ' || coalesce(v_quote, '')
    when 'follow' then 'começou a seguir você.'
    when 'tag' then 'marcou você numa publicação.'
    else case when new.comment_id is null then 'mencionou você numa publicação.'
              else 'mencionou você num comentário: ' || coalesce(v_quote, '') end
  end;
  v_url := case
    when new.type = 'follow' then '#/u/' || v_from.handle
    when new.comment_id is not null then '#/p/' || new.post_id || '/comentarios'
    else '#/p/' || new.post_id
  end;
  -- menção ou marcação num post novo substitui o aviso genérico de "fez uma publicação"
  if new.type in ('mention', 'tag') and new.post_id is not null then
    delete from public.push_queue q
    where q.player_id = v_to.owner_id and q.sent_at is null and q.kind = 'post' and q.url = '#/p/' || new.post_id;
  end if;
  perform public._push_enqueue(
    v_to.owner_id, v_to.id, v_kind, v_to.handle, v_text, v_url,
    case when new.type in ('like', 'follow') then new.type || ':' || coalesce(new.post_id::text, v_to.id::text) end
  );
  return new;
exception when others then
  return new; -- aviso no celular nunca pode atrapalhar a curtida, o comentário etc.
end $$;

create or replace function public.tg_message_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_from        public.characters;
  v_conv        public.conversations;
  v_where       text;
  v_text        text;
  v_reply_text  text;
  v_reply_owner uuid;
  r             record;
begin
  select * into v_from from public.characters c where c.id = new.sender_id;
  select * into v_conv from public.conversations cv where cv.id = new.conversation_id;
  if v_from.id is null or v_conv.id is null then
    return new;
  end if;
  v_where := case when v_conv.is_group then ' em ' || coalesce(nullif(trim(v_conv.title), ''), 'grupo') else '' end;
  v_text := case new.kind
    when 'media' then 'enviou uma foto.'
    when 'post' then 'compartilhou uma publicação.'
    when 'story_reply' then 'respondeu ao seu story: ' || public._push_snippet(new.body, 120)
    when 'note_reply' then 'respondeu à sua nota: ' || public._push_snippet(new.body, 120)
    when 'story_mention' then 'mencionou você no story.'
    else public._push_snippet(new.body, 160)
  end;
  v_text := v_from.handle || v_where || case when new.kind = 'text' then ': ' else ' ' end || v_text;
  if new.reply_to is not null then
    select c.owner_id into v_reply_owner
    from public.messages rm join public.characters c on c.id = rm.sender_id
    where rm.id = new.reply_to;
    v_reply_text := v_from.handle || ' respondeu você' || v_where
      || case when new.kind = 'media' then ' com uma foto.' else ': ' || public._push_snippet(new.body, 160) end;
  end if;
  for r in
    select distinct on (c.owner_id) c.owner_id, c.id, c.handle
    from public.conversation_members m
    join public.characters c on c.id = m.character_id
    where m.conversation_id = new.conversation_id and c.owner_id <> v_from.owner_id
    order by c.owner_id, m.joined_at
  loop
    perform public._push_enqueue(r.owner_id, r.id, 'message', r.handle,
      case when v_reply_owner is not null and v_reply_owner = r.owner_id then v_reply_text else v_text end,
      '#/direct/' || new.conversation_id, 'dm:' || new.conversation_id);
  end loop;
  return new;
exception when others then
  return new;
end $$;

-- O app passa a mostrar as novidades
create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos', 'interacoes'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

notify pgrst, 'reload schema';

select 'FargusGram: reações, comentários fixados e figurinhas ativados ✔' as resultado;

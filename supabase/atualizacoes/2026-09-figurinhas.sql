-- =====================================================================
--  FargusGram — atualização: figurinhas (como as do WhatsApp) no Direct e
--  nos comentários, e fotos nos comentários
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa das atualizações anteriores (a última é a de reações:
--  2026-09-reacoes.sql).
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================

-- Fotos e figurinhas nos comentários (o texto pode ficar vazio quando tem imagem)
alter table public.comments add column if not exists media_path   text;
alter table public.comments add column if not exists media_width  int;
alter table public.comments add column if not exists media_height int;
alter table public.comments add column if not exists media_kind   text;
alter table public.comments drop constraint if exists comments_media_ok;
alter table public.comments add constraint comments_media_ok
  check ((media_path is null) = (media_kind is null) and (media_kind is null or media_kind in ('image', 'sticker'))
         and (media_path is null or char_length(media_path) <= 300));
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or media_path is not null));

-- Figurinhas no Direct
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'media', 'post', 'story_reply', 'note_reply', 'story_mention', 'sticker'));
alter table public.messages drop constraint if exists messages_sticker_ok;
alter table public.messages add constraint messages_sticker_ok
  check (kind <> 'sticker' or media_path is not null);

-- Figurinhas de cada jogador (as que ele criou e as que salvou de outros);
-- o arquivo nunca é apagado, porque pode estar em mensagens e comentários
create table if not exists public.stickers (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null default auth.uid() references public.players (id) on delete cascade,
  path       text not null check (char_length(path) between 5 and 300),
  width      int not null default 512 check (width > 0),
  height     int not null default 512 check (height > 0),
  created_at timestamptz not null default now(),
  unique (player_id, path)
);

alter table public.stickers enable row level security;

drop policy if exists stickers_select on public.stickers;
create policy stickers_select on public.stickers for select to authenticated
  using (player_id = (select auth.uid()));
drop policy if exists stickers_insert on public.stickers;
create policy stickers_insert on public.stickers for insert to authenticated
  with check (player_id = (select auth.uid()) and (select public.is_member()));
drop policy if exists stickers_delete on public.stickers;
create policy stickers_delete on public.stickers for delete to authenticated
  using (player_id = (select auth.uid()));

revoke all on public.stickers from anon, authenticated;
grant select, insert, delete on public.stickers to authenticated;
grant all on public.stickers to service_role;

-- até 200 figurinhas por jogador
create or replace function public.tg_stickers_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.stickers s where s.player_id = new.player_id) >= 200 then
    raise exception 'Dá para guardar até 200 figurinhas. Tire algumas antes.';
  end if;
  return new;
end $$;
drop trigger if exists stickers_limit on public.stickers;
create trigger stickers_limit before insert on public.stickers
  for each row execute function public.tg_stickers_limit();

revoke execute on function public.tg_stickers_limit() from public, anon, authenticated;
grant execute on function public.tg_stickers_limit() to service_role;

-- Comentários com foto ou figurinha
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
    'pinned_at', c.pinned_at,
    'media_path', c.media_path, 'media_width', c.media_width, 'media_height', c.media_height, 'media_kind', c.media_kind
  ) order by c.created_at), '[]'::jsonb)
  from public.comments c
  where c.post_id = p_post;
$$;

-- Avisos no celular: comentário só com imagem e figurinha no Direct
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
    select coalesce(nullif(public._push_snippet(cm.body, 90), ''),
                    case cm.media_kind when 'sticker' then 'uma figurinha' when 'image' then 'uma foto' end)
    into v_quote from public.comments cm where cm.id = new.comment_id;
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
    when 'sticker' then 'enviou uma figurinha.'
    else public._push_snippet(new.body, 160)
  end;
  v_text := v_from.handle || v_where || case when new.kind = 'text' then ': ' else ' ' end || v_text;
  if new.reply_to is not null then
    select c.owner_id into v_reply_owner
    from public.messages rm join public.characters c on c.id = rm.sender_id
    where rm.id = new.reply_to;
    v_reply_text := v_from.handle || ' respondeu você' || v_where
      || case when new.kind = 'media' then ' com uma foto.' when new.kind = 'sticker' then ' com uma figurinha.' else ': ' || public._push_snippet(new.body, 160) end;
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

-- O app passa a mostrar as figurinhas
create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'features', jsonb_build_array('destaques', 'notas', 'melhores_amigos', 'interacoes', 'reacoes', 'figurinhas'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

notify pgrst, 'reload schema';

select 'FargusGram: figurinhas e fotos nos comentários ativadas ✔' as resultado;

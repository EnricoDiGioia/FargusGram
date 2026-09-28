-- =====================================================================
--  FargusGram — atualização: destaques no perfil e notas no Direct
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa das atualizações anteriores (música, notificações e respostas).
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Stories: miniatura e arquivo
--   Os stories somem da bandeja depois de 24 h, mas ficam 30 dias num
--   arquivo que só o dono vê (para poder colocar nos destaques depois).
--   Os que estão em algum destaque ficam para sempre.
-- ---------------------------------------------------------------------
alter table public.stories add column if not exists thumb_path text;
create index if not exists stories_path_idx on public.stories (path);
create index if not exists stories_thumb_path_idx on public.stories (thumb_path) where thumb_path is not null;


-- ---------------------------------------------------------------------
-- Destaques
-- ---------------------------------------------------------------------
create table if not exists public.highlights (
  id             uuid primary key default gen_random_uuid(),
  character_id   uuid not null references public.characters (id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 40),
  cover_story_id uuid references public.stories (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists highlights_character_idx on public.highlights (character_id, updated_at desc);

create table if not exists public.highlight_items (
  highlight_id uuid not null references public.highlights (id) on delete cascade,
  story_id     uuid not null references public.stories (id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (highlight_id, story_id)
);
create index if not exists highlight_items_story_idx on public.highlight_items (story_id);

-- Story novo num destaque leva o destaque para o começo da fileira;
-- destaque que fica vazio some (como no Instagram)
create or replace function public.tg_highlight_items_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.highlights h set updated_at = now() where h.id = new.highlight_id;
    return new;
  end if;
  delete from public.highlights h
  where h.id = old.highlight_id
    and not exists (select 1 from public.highlight_items i where i.highlight_id = h.id);
  return old;
end $$;
drop trigger if exists highlight_items_change on public.highlight_items;
create trigger highlight_items_change after insert or delete on public.highlight_items
  for each row execute function public.tg_highlight_items_change();

alter table public.highlights      enable row level security;
alter table public.highlight_items enable row level security;

drop policy if exists highlights_select on public.highlights;
create policy highlights_select on public.highlights for select to authenticated
  using ((select public.is_member()));
drop policy if exists highlights_insert on public.highlights;
create policy highlights_insert on public.highlights for insert to authenticated
  with check (
    public.owns_character(character_id)
    and (cover_story_id is null or exists (
      select 1 from public.stories s where s.id = cover_story_id and s.character_id = highlights.character_id
    ))
  );
drop policy if exists highlights_update on public.highlights;
create policy highlights_update on public.highlights for update to authenticated
  using (public.owns_character(character_id))
  with check (
    public.owns_character(character_id)
    and (cover_story_id is null or exists (
      select 1 from public.stories s where s.id = cover_story_id and s.character_id = highlights.character_id
    ))
  );
drop policy if exists highlights_delete on public.highlights;
create policy highlights_delete on public.highlights for delete to authenticated
  using (public.owns_character(character_id) or (select public.is_admin()));

drop policy if exists highlight_items_select on public.highlight_items;
create policy highlight_items_select on public.highlight_items for select to authenticated
  using ((select public.is_member()));
drop policy if exists highlight_items_insert on public.highlight_items;
create policy highlight_items_insert on public.highlight_items for insert to authenticated
  with check (exists (
    select 1
    from public.highlights h
    join public.stories s on s.id = highlight_items.story_id
    where h.id = highlight_items.highlight_id
      and s.character_id = h.character_id
      and public.owns_character(h.character_id)
  ));
drop policy if exists highlight_items_delete on public.highlight_items;
create policy highlight_items_delete on public.highlight_items for delete to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.highlights h where h.id = highlight_items.highlight_id and public.owns_character(h.character_id))
  );

-- Story que está num destaque não pode ser apagado sem antes sair do
-- destaque (o app faz isso quando a pessoa exclui o story de propósito)
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated
  using (
    (public.owns_character(character_id) or (select public.is_admin()))
    and not exists (select 1 from public.highlight_items hi where hi.story_id = stories.id)
  );

-- O mesmo vale para a foto do story no Storage
create or replace function public.media_in_highlight(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.stories s
    join public.highlight_items hi on hi.story_id = s.id
    where s.path = p_path or s.thumb_path = p_path
  );
$$;

drop policy if exists fargus_media_delete on storage.objects;
create policy fargus_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_admin()))
    and not public.media_in_highlight(name)
  );


-- ---------------------------------------------------------------------
-- Notas (texto curto no topo do Direct, dura 24 h; uma por personagem)
-- ---------------------------------------------------------------------
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  body         text not null default '' check (char_length(body) <= 60),
  music        jsonb check (music is null or (jsonb_typeof(music) = 'object' and pg_column_size(music) <= 4096)),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours'),
  check (char_length(trim(body)) > 0 or music is not null)
);
create unique index if not exists notes_character_idx on public.notes (character_id);

alter table public.notes enable row level security;

drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
  using ((select public.is_member()));
drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes for delete to authenticated
  using (public.owns_character(character_id) or (select public.is_admin()));

-- Resposta a uma nota vira mensagem no Direct, guardando o texto da nota
-- (a nota some em 24 h, a conversa não)
alter table public.messages add column if not exists note_body text;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'media', 'post', 'story_reply', 'note_reply'));
alter table public.messages drop constraint if exists messages_note_body_ok;
alter table public.messages add constraint messages_note_body_ok
  check (note_body is null or char_length(note_body) <= 200);
alter table public.messages drop constraint if exists messages_note_reply_ok;
alter table public.messages add constraint messages_note_reply_ok
  check (kind <> 'note_reply' or (coalesce(char_length(body), 0) > 0 and note_body is not null));


-- ---------------------------------------------------------------------
-- Funções que o app chama
-- ---------------------------------------------------------------------

-- Resumo de um destaque: título, capa (miniatura) e quantidade de stories
create or replace function public._highlight(p_highlight uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', h.id,
    'title', h.title,
    'character_id', h.character_id,
    'updated_at', h.updated_at,
    'cover_story_id', cv.id,
    'cover', coalesce(cv.thumb_path, cv.path),
    'count', (select count(*) from public.highlight_items i where i.highlight_id = h.id)
  )
  from public.highlights h
  left join lateral (
    -- a capa escolhida, se ainda estiver no destaque; senão, o story mais antigo
    select s.id, s.path, s.thumb_path
    from public.highlight_items i
    join public.stories s on s.id = i.story_id
    where i.highlight_id = h.id
    order by (s.id = h.cover_story_id) desc, s.created_at
    limit 1
  ) cv on true
  where h.id = p_highlight;
$$;

-- Stories da bandeja e de um personagem agora trazem a miniatura
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
        'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'width', s.width, 'height', s.height, 'created_at', s.created_at,
        'music', s.music,
        'seen', exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
      ) order by s.created_at)
      from public.stories s where s.character_id = p_character and s.expires_at > now()
    ), '[]'::jsonb)
  );
$$;

-- Destaques de um personagem (p_story: marca em quais este story já está)
create or replace function public.character_highlights(p_character uuid, p_story uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(
    public._highlight(h.id) || jsonb_build_object(
      'has_story', p_story is not null
        and exists (select 1 from public.highlight_items i where i.highlight_id = h.id and i.story_id = p_story)
    ) order by h.updated_at desc
  ), '[]'::jsonb)
  from public.highlights h
  where h.character_id = p_character
    and exists (select 1 from public.highlight_items i where i.highlight_id = h.id);
$$;

-- Um destaque com os stories (na ordem em que foram publicados)
create or replace function public.get_highlight(p_highlight uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public._highlight(h.id) || jsonb_build_object(
    'character', public._char(h.character_id),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'path', s.path, 'thumb_path', s.thumb_path, 'width', s.width, 'height', s.height,
        'created_at', s.created_at, 'music', s.music,
        'seen', exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
      ) order by s.created_at)
      from public.highlight_items i
      join public.stories s on s.id = i.story_id
      where i.highlight_id = h.id
    ), '[]'::jsonb)
  )
  from public.highlights h
  where h.id = p_highlight;
$$;

-- Arquivo: todos os stories que ainda existem de um personagem seu
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
        'created_at', s.created_at, 'expires_at', s.expires_at, 'music', s.music,
        'highlights', coalesce((select jsonb_agg(i.highlight_id) from public.highlight_items i where i.story_id = s.id), '[]'::jsonb)
      ) as x, s.created_at
      from public.stories s
      where s.character_id = p_character and (p_before is null or s.created_at < p_before)
      order by s.created_at desc
      limit least(greatest(coalesce(p_limit, 60), 1), 100)
    ) q
  ), '[]'::jsonb);
end $$;

-- Cria (p_highlight vazio) ou atualiza um destaque: título, capa e stories
drop function if exists public.save_highlight(uuid, text, uuid[], uuid, uuid);
create or replace function public.save_highlight(
  p_character uuid,
  p_title     text,
  p_stories   uuid[],
  p_cover     uuid default null,
  p_highlight uuid default null
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id    uuid := p_highlight;
  v_title text := left(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), 40);
  v_list  uuid[] := array(select distinct x from unnest(coalesce(p_stories, '{}'::uuid[])) as x where x is not null);
  v_n     int;
  v_cover uuid;
begin
  if not public.owns_character(p_character) then
    raise exception 'Personagem inválido';
  end if;
  v_n := coalesce(array_length(v_list, 1), 0);
  if v_n = 0 then
    raise exception 'Escolha pelo menos um story';
  end if;
  if v_n > 100 then
    raise exception 'Um destaque pode ter no máximo 100 stories';
  end if;
  if (select count(*) from public.stories s where s.id = any (v_list) and s.character_id = p_character) <> v_n then
    raise exception 'Algum story não foi encontrado (pode ter sido apagado)';
  end if;
  if v_title = '' then
    v_title := 'Destaque';
  end if;
  v_cover := case when p_cover = any (v_list) then p_cover end;

  if v_id is null then
    insert into public.highlights (character_id, title, cover_story_id)
    values (p_character, v_title, v_cover)
    returning id into v_id;
  else
    update public.highlights h set title = v_title, cover_story_id = v_cover
    where h.id = v_id and h.character_id = p_character;
    if not found then
      raise exception 'Destaque não encontrado';
    end if;
  end if;

  -- primeiro entra o que é novo, depois sai o que foi desmarcado
  -- (assim o destaque nunca fica vazio no meio do caminho)
  insert into public.highlight_items (highlight_id, story_id)
  select v_id, x from unnest(v_list) as x
  on conflict do nothing;
  delete from public.highlight_items i where i.highlight_id = v_id and not (i.story_id = any (v_list));
  return v_id;
end $$;

-- Stories vencidos há mais de 30 dias e fora dos destaques: o app apaga
-- as fotos e as linhas (libera espaço no Storage)
create or replace function public.stories_to_cleanup(p_characters uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'path', q.path, 'thumb_path', q.thumb_path)), '[]'::jsonb)
  from (
    select s.id, s.path, s.thumb_path
    from public.stories s
    where s.character_id = any (coalesce(p_characters, '{}'::uuid[]))
      and public.owns_character(s.character_id)
      and s.expires_at < now() - interval '30 days'
      and not exists (select 1 from public.highlight_items i where i.story_id = s.id)
    order by s.expires_at
    limit 100
  ) q;
$$;

-- Notas no topo do Direct: a sua primeiro, depois as de quem você segue
create or replace function public.notes_tray(p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.is_me desc, q.created_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', n.id, 'body', n.body, 'music', n.music,
      'created_at', n.created_at, 'expires_at', n.expires_at,
      'character', public._char(n.character_id)
    ) as x,
    (n.character_id = p_viewer) as is_me,
    n.created_at
    from public.notes n
    where n.expires_at > now()
      and (n.character_id = p_viewer
           or n.character_id in (select f.followee_id from public.follows f where f.follower_id = p_viewer))
  ) q;
$$;

-- Deixa uma nota nova (substitui a anterior do personagem)
create or replace function public.set_note(p_character uuid, p_body text, p_music jsonb default null)
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
  insert into public.notes (character_id, body, music)
  values (p_character, v_body, p_music)
  returning * into v_note;
  return jsonb_build_object(
    'id', v_note.id, 'body', v_note.body, 'music', v_note.music,
    'created_at', v_note.created_at, 'expires_at', v_note.expires_at,
    'character', public._char(v_note.character_id)
  );
end $$;

-- Perfil agora traz os destaques e a nota (se você segue a pessoa)
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
    'has_story', exists (select 1 from public.stories s where s.character_id = c.id and s.expires_at > now()),
    'story_seen', not exists (
      select 1 from public.stories s
      where s.character_id = c.id and s.expires_at > now()
        and not exists (select 1 from public.story_views v where v.story_id = s.id and v.character_id = p_viewer)
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
      select jsonb_agg(public._highlight(h.id) order by h.updated_at desc)
      from public.highlights h
      where h.character_id = c.id
        and exists (select 1 from public.highlight_items i where i.highlight_id = h.id)
    ), '[]'::jsonb),
    'note', (
      select jsonb_build_object(
        'id', n.id, 'body', n.body, 'music', n.music, 'created_at', n.created_at, 'expires_at', n.expires_at,
        'character', public._char(n.character_id)
      )
      from public.notes n
      where n.character_id = c.id and n.expires_at > now()
        and (c.id = p_viewer or exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = c.id))
    )
  )
  from public.characters c
  where c.handle = lower(trim(p_handle));
$$;

-- O app descobre por aqui que o banco já tem os recursos novos
create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'features', jsonb_build_array('destaques', 'notas'),
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;

-- Lista de conversas: a prévia reconhece respostas a notas
create or replace function public.inbox(p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.last_message_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', cv.id,
      'is_group', cv.is_group,
      'title', cv.title,
      'last_message_at', cv.last_message_at,
      'members', coalesce((
        select jsonb_agg(public._char(om.character_id) order by om.joined_at)
        from public.conversation_members om
        where om.conversation_id = cv.id and om.character_id <> p_viewer
      ), '[]'::jsonb),
      'last_message', (
        select jsonb_build_object(
          'kind', msg.kind, 'body', msg.body, 'sender_id', msg.sender_id, 'created_at', msg.created_at,
          'is_story_reply', msg.kind = 'story_reply',
          'is_note_reply', msg.kind = 'note_reply'
        )
        from public.messages msg
        where msg.conversation_id = cv.id
        order by msg.created_at desc limit 1
      ),
      'unread', exists (
        select 1 from public.messages msg
        where msg.conversation_id = cv.id and msg.created_at > me.last_read_at and msg.sender_id <> p_viewer
      )
    ) as x, cv.last_message_at
    from public.conversation_members me
    join public.conversations cv on cv.id = me.conversation_id
    where me.character_id = p_viewer
  ) q;
$$;

-- Mensagens: texto da nota respondida; story em destaque continua aparecendo
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

-- Aviso no celular: "respondeu à sua nota"
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


-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke all on public.highlights, public.highlight_items, public.notes from anon, authenticated;
grant select, insert, delete on public.highlights      to authenticated;
grant update (title, cover_story_id) on public.highlights to authenticated;
grant select, insert, delete on public.highlight_items to authenticated;
grant select, insert, delete on public.notes           to authenticated;
grant all on public.highlights, public.highlight_items, public.notes to service_role;

revoke execute on function
  public.tg_highlight_items_change(), public.media_in_highlight(text), public._highlight(uuid),
  public.character_highlights(uuid, uuid), public.get_highlight(uuid, uuid),
  public.story_archive(uuid, timestamptz, int), public.save_highlight(uuid, text, uuid[], uuid, uuid),
  public.stories_to_cleanup(uuid[]), public.notes_tray(uuid), public.set_note(uuid, text, jsonb)
from public, anon, authenticated;
grant execute on function
  public.tg_highlight_items_change(), public.media_in_highlight(text), public._highlight(uuid),
  public.character_highlights(uuid, uuid), public.get_highlight(uuid, uuid),
  public.story_archive(uuid, timestamptz, int), public.save_highlight(uuid, text, uuid[], uuid, uuid),
  public.stories_to_cleanup(uuid[]), public.notes_tray(uuid), public.set_note(uuid, text, jsonb)
to service_role;
grant execute on function
  public.media_in_highlight(text), public._highlight(uuid),
  public.character_highlights(uuid, uuid), public.get_highlight(uuid, uuid),
  public.story_archive(uuid, timestamptz, int), public.save_highlight(uuid, text, uuid[], uuid, uuid),
  public.stories_to_cleanup(uuid[]), public.notes_tray(uuid), public.set_note(uuid, text, jsonb)
to authenticated;

notify pgrst, 'reload schema';

select 'FargusGram: destaques e notas ativados ✔' as resultado;

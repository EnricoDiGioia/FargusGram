-- =====================================================================
--  FargusGram — configuração do banco de dados (Supabase)
--
--  Como usar: no painel do Supabase, abra "SQL Editor" > "New query",
--  cole este arquivo inteiro e clique em "Run".
--  Pode rodar de novo quando quiser: o script não apaga dados.
--
--  Código de convite inicial: fargus
--  (troque depois no app, em Configurações > Painel do admin)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

-- Configurações gerais (uma linha só)
create table if not exists public.app_settings (
  id          boolean primary key default true check (id),
  invite_code text not null,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (id, invite_code) values (true, 'fargus')
on conflict (id) do nothing;

-- Jogadores (as pessoas de verdade; uma linha por login)
create table if not exists public.players (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  push_prefs   jsonb not null default '{}'::jsonb
);

-- Personagens (os perfis que aparecem no app; um jogador pode ter vários)
create table if not exists public.characters (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.players (id) on delete cascade,
  handle      text not null unique check (handle ~ '^[a-z0-9._]{2,30}$'),
  name        text not null default '' check (char_length(name) <= 60),
  bio         text not null default '' check (char_length(bio) <= 300),
  avatar_path text,
  is_verified boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists characters_owner_idx on public.characters (owner_id);

create table if not exists public.follows (
  follower_id uuid not null references public.characters (id) on delete cascade,
  followee_id uuid not null references public.characters (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on public.follows (followee_id);

create table if not exists public.posts (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  caption      text not null default '' check (char_length(caption) <= 2200),
  location     text not null default '' check (char_length(location) <= 100),
  created_at   timestamptz not null default now(),
  edited_at    timestamptz,
  music        jsonb
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_character_idx on public.posts (character_id, created_at desc);

create table if not exists public.post_media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  position   smallint not null default 0,
  path       text not null,
  thumb_path text,
  width      int not null check (width > 0),
  height     int not null check (height > 0),
  unique (post_id, position)
);

create table if not exists public.post_tags (
  post_id      uuid not null references public.posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  primary key (post_id, character_id)
);
create index if not exists post_tags_character_idx on public.post_tags (character_id);

create table if not exists public.likes (
  post_id      uuid not null references public.posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (post_id, character_id)
);
create index if not exists likes_character_idx on public.likes (character_id);

create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  parent_id    uuid references public.comments (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.comment_likes (
  comment_id   uuid not null references public.comments (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (comment_id, character_id)
);

create table if not exists public.saves (
  post_id      uuid not null references public.posts (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (post_id, character_id)
);
create index if not exists saves_character_idx on public.saves (character_id, created_at desc);

create table if not exists public.stories (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  path         text not null,
  width        int not null check (width > 0),
  height       int not null check (height > 0),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours'),
  music        jsonb
);
create index if not exists stories_character_idx on public.stories (character_id, created_at);
create index if not exists stories_expires_idx on public.stories (expires_at);

create table if not exists public.story_views (
  story_id     uuid not null references public.stories (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  viewed_at    timestamptz not null default now(),
  primary key (story_id, character_id)
);
create index if not exists story_views_character_idx on public.story_views (character_id);

create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.characters (id) on delete cascade,
  actor_id     uuid not null references public.characters (id) on delete cascade,
  type         text not null check (type in ('like', 'comment', 'reply', 'comment_like', 'follow', 'mention', 'tag')),
  post_id      uuid references public.posts (id) on delete cascade,
  comment_id   uuid references public.comments (id) on delete cascade,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  is_group        boolean not null default false,
  title           text check (title is null or char_length(title) <= 60),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  character_id    uuid not null references public.characters (id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, character_id)
);
create index if not exists conversation_members_character_idx on public.conversation_members (character_id);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.characters (id) on delete cascade,
  kind            text not null default 'text' check (kind in ('text', 'media', 'post', 'story_reply')),
  body            text check (body is null or char_length(body) <= 2000),
  media_path      text,
  media_width     int,
  media_height    int,
  post_id         uuid references public.posts (id) on delete set null,
  story_id        uuid references public.stories (id) on delete set null,
  created_at      timestamptz not null default now(),
  check (kind not in ('text', 'story_reply') or coalesce(char_length(body), 0) > 0),
  check (kind <> 'media' or media_path is not null)
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);


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

-- Notificações no celular (push)
-- (para quem instalou antes de setembro/2026, esta linha adiciona a coluna)
-- O que cada jogador quer receber (vale para todos os aparelhos dele)
alter table public.players add column if not exists push_prefs jsonb not null default '{}'::jsonb;
alter table public.players drop constraint if exists players_push_prefs_ok;
alter table public.players add constraint players_push_prefs_ok
  check (jsonb_typeof(push_prefs) = 'object' and pg_column_size(push_prefs) <= 4096);

-- Aparelhos que recebem notificações (um por celular ou navegador)
create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players (id) on delete cascade,
  endpoint    text not null unique check (char_length(endpoint) <= 1000 and endpoint ~ '^https?://'),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  origin      text check (origin is null or char_length(origin) <= 200),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 400),
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz,
  fail_count  int not null default 0
);
create index if not exists push_subscriptions_player_idx on public.push_subscriptions (player_id);

-- Fila de avisos esperando envio (só o servidor lê)
create table if not exists public.push_queue (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.players (id) on delete cascade,
  character_id uuid references public.characters (id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null,
  url          text not null,
  tag          text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists push_queue_pending_idx on public.push_queue (id) where sent_at is null;
create index if not exists push_queue_player_idx on public.push_queue (player_id) where sent_at is null;

-- Chaves do servidor de notificações (a função "push" cria sozinha na primeira vez)
create table if not exists public.push_config (
  id          boolean primary key default true check (id),
  public_key  text not null,
  private_jwk jsonb not null,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 2. Funções auxiliares usadas nas regras de segurança
-- ---------------------------------------------------------------------

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players p where p.id = (select auth.uid()));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.players p where p.id = (select auth.uid())), false);
$$;

create or replace function public.owns_character(p_character uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.characters c
    where c.id = p_character and c.owner_id = (select auth.uid())
  );
$$;

create or replace function public.in_conversation(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.conversation_members m
    join public.characters c on c.id = m.character_id
    where m.conversation_id = p_conversation and c.owner_id = (select auth.uid())
  );
$$;

-- Personagens citados com @ num texto
create or replace function public.mentioned_characters(p_text text)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select c.id
  from public.characters c
  where c.handle in (
    select distinct rtrim(lower(m[1]), '.')
    from regexp_matches(coalesce(p_text, ''), '@([A-Za-z0-9._]{2,30})', 'g') as m
  );
$$;


-- ---------------------------------------------------------------------
-- 3. Regras de segurança (Row Level Security)
--    Só quem entrou com código de convite enxerga alguma coisa.
-- ---------------------------------------------------------------------

alter table public.app_settings         enable row level security;
alter table public.players              enable row level security;
alter table public.characters           enable row level security;
alter table public.follows              enable row level security;
alter table public.posts                enable row level security;
alter table public.post_media           enable row level security;
alter table public.post_tags            enable row level security;
alter table public.likes                enable row level security;
alter table public.comments             enable row level security;
alter table public.comment_likes        enable row level security;
alter table public.saves                enable row level security;
alter table public.stories              enable row level security;
alter table public.story_views          enable row level security;
alter table public.notifications        enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.push_queue           enable row level security;
alter table public.push_config          enable row level security;

-- players
drop policy if exists players_select on public.players;
create policy players_select on public.players for select to authenticated
  using ((select public.is_member()));
drop policy if exists players_update on public.players;
create policy players_update on public.players for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- characters
drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters for select to authenticated
  using ((select public.is_member()));
drop policy if exists characters_insert on public.characters;
create policy characters_insert on public.characters for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_member()));
drop policy if exists characters_update on public.characters;
create policy characters_update on public.characters for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists characters_delete on public.characters;
create policy characters_delete on public.characters for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- follows
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated
  using ((select public.is_member()));
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check (public.owns_character(follower_id));
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated
  using (public.owns_character(follower_id));

-- posts
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using ((select public.is_member()));
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (public.owns_character(character_id) or (select public.is_admin()));

-- post_media
drop policy if exists post_media_select on public.post_media;
create policy post_media_select on public.post_media for select to authenticated
  using ((select public.is_member()));
drop policy if exists post_media_insert on public.post_media;
create policy post_media_insert on public.post_media for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and public.owns_character(p.character_id)));
drop policy if exists post_media_delete on public.post_media;
create policy post_media_delete on public.post_media for delete to authenticated
  using ((select public.is_admin()) or exists (select 1 from public.posts p where p.id = post_id and public.owns_character(p.character_id)));

-- post_tags
drop policy if exists post_tags_select on public.post_tags;
create policy post_tags_select on public.post_tags for select to authenticated
  using ((select public.is_member()));
drop policy if exists post_tags_insert on public.post_tags;
create policy post_tags_insert on public.post_tags for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and public.owns_character(p.character_id)));
drop policy if exists post_tags_delete on public.post_tags;
create policy post_tags_delete on public.post_tags for delete to authenticated
  using (
    public.owns_character(character_id)
    or (select public.is_admin())
    or exists (select 1 from public.posts p where p.id = post_id and public.owns_character(p.character_id))
  );

-- likes
drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes for select to authenticated
  using ((select public.is_member()));
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to authenticated
  using (public.owns_character(character_id));

-- comments
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using ((select public.is_member()));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (
    public.owns_character(character_id)
    or (select public.is_admin())
    or exists (select 1 from public.posts p where p.id = post_id and public.owns_character(p.character_id))
  );

-- comment_likes
drop policy if exists comment_likes_select on public.comment_likes;
create policy comment_likes_select on public.comment_likes for select to authenticated
  using ((select public.is_member()));
drop policy if exists comment_likes_insert on public.comment_likes;
create policy comment_likes_insert on public.comment_likes for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists comment_likes_delete on public.comment_likes;
create policy comment_likes_delete on public.comment_likes for delete to authenticated
  using (public.owns_character(character_id));

-- saves (salvos são privados)
drop policy if exists saves_select on public.saves;
create policy saves_select on public.saves for select to authenticated
  using (public.owns_character(character_id));
drop policy if exists saves_insert on public.saves;
create policy saves_insert on public.saves for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists saves_delete on public.saves;
create policy saves_delete on public.saves for delete to authenticated
  using (public.owns_character(character_id));

-- stories
drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select to authenticated
  using ((select public.is_member()));
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated
  using (public.owns_character(character_id) or (select public.is_admin()));

-- story_views (quem viu cada story: só o dono do story enxerga)
drop policy if exists story_views_select on public.story_views;
create policy story_views_select on public.story_views for select to authenticated
  using (
    public.owns_character(character_id)
    or exists (select 1 from public.stories s where s.id = story_id and public.owns_character(s.character_id))
  );
drop policy if exists story_views_insert on public.story_views;
create policy story_views_insert on public.story_views for insert to authenticated
  with check (public.owns_character(character_id));

-- notifications
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (public.owns_character(recipient_id));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (public.owns_character(recipient_id)) with check (public.owns_character(recipient_id));
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (public.owns_character(recipient_id));

-- conversations / DMs
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using (public.in_conversation(id));
drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update to authenticated
  using (public.in_conversation(id)) with check (public.in_conversation(id));

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members for select to authenticated
  using (public.in_conversation(conversation_id));
drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members for update to authenticated
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));
drop policy if exists conversation_members_delete on public.conversation_members;
create policy conversation_members_delete on public.conversation_members for delete to authenticated
  using (public.owns_character(character_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.in_conversation(conversation_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (
    public.owns_character(sender_id)
    and (kind <> 'post' or post_id is not null)
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = messages.conversation_id and m.character_id = messages.sender_id
    )
  );
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (public.owns_character(sender_id));

-- aparelhos com notificação: cada jogador só vê e apaga os seus
drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (player_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (player_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- 4. Cadastro com código de convite
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_name text := left(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Jogador'
  ), 40);
begin
  if not exists (select 1 from public.app_settings s where lower(s.invite_code) = v_code) then
    raise exception 'Código de convite inválido' using errcode = '28000';
  end if;
  -- O primeiro jogador a se cadastrar vira admin
  insert into public.players (id, display_name, is_admin)
  values (new.id, v_name, not exists (select 1 from public.players));
  return new;
end $$;

-- Só cria o gatilho se ainda não existir: a tabela auth.users é do Supabase,
-- e apagar um gatilho nela daria erro de permissão ao rodar o script de novo.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'fargus_on_auth_user_created' and tgrelid = 'auth.users'::regclass
  ) then
    create trigger fargus_on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;

-- Permite à tela de cadastro checar o código antes de criar a conta
create or replace function public.check_invite_code(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_settings s
    where lower(s.invite_code) = lower(trim(coalesce(p_code, '')))
  );
$$;


-- ---------------------------------------------------------------------
-- 5. Notificações automáticas (curtidas, comentários, seguidores...)
-- ---------------------------------------------------------------------

create or replace function public.tg_like_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    select p.character_id, new.character_id, 'like', new.post_id
    from public.posts p
    where p.id = new.post_id and p.character_id <> new.character_id;
    return new;
  else
    delete from public.notifications n
    where n.type = 'like' and n.actor_id = old.character_id and n.post_id = old.post_id;
    return old;
  end if;
end $$;
drop trigger if exists likes_notify on public.likes;
create trigger likes_notify after insert or delete on public.likes
  for each row execute function public.tg_like_notify();

create or replace function public.tg_comment_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_post_owner   uuid;
  v_parent_owner uuid;
begin
  select p.character_id into v_post_owner from public.posts p where p.id = new.post_id;
  if new.parent_id is not null then
    select c.character_id into v_parent_owner from public.comments c where c.id = new.parent_id;
  end if;

  if v_parent_owner is not null and v_parent_owner <> new.character_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (v_parent_owner, new.character_id, 'reply', new.post_id, new.id);
  end if;

  if v_post_owner is not null and v_post_owner <> new.character_id
     and v_post_owner is distinct from v_parent_owner then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (v_post_owner, new.character_id, 'comment', new.post_id, new.id);
  end if;

  insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
  select m, new.character_id, 'mention', new.post_id, new.id
  from public.mentioned_characters(new.body) as m
  where m <> new.character_id
    and m is distinct from v_post_owner
    and m is distinct from v_parent_owner;

  return new;
end $$;
drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.tg_comment_notify();

create or replace function public.tg_comment_like_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    select c.character_id, new.character_id, 'comment_like', c.post_id, c.id
    from public.comments c
    where c.id = new.comment_id and c.character_id <> new.character_id;
    return new;
  else
    delete from public.notifications n
    where n.type = 'comment_like' and n.actor_id = old.character_id and n.comment_id = old.comment_id;
    return old;
  end if;
end $$;
drop trigger if exists comment_likes_notify on public.comment_likes;
create trigger comment_likes_notify after insert or delete on public.comment_likes
  for each row execute function public.tg_comment_like_notify();

create or replace function public.tg_follow_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.followee_id, new.follower_id, 'follow');
    return new;
  else
    delete from public.notifications n
    where n.type = 'follow' and n.actor_id = old.follower_id and n.recipient_id = old.followee_id;
    return old;
  end if;
end $$;
drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert or delete on public.follows
  for each row execute function public.tg_follow_notify();

create or replace function public.tg_post_tag_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    select new.character_id, p.character_id, 'tag', new.post_id
    from public.posts p
    where p.id = new.post_id and p.character_id <> new.character_id;
    return new;
  else
    delete from public.notifications n
    where n.type = 'tag' and n.recipient_id = old.character_id and n.post_id = old.post_id;
    return old;
  end if;
end $$;
drop trigger if exists post_tags_notify on public.post_tags;
create trigger post_tags_notify after insert or delete on public.post_tags
  for each row execute function public.tg_post_tag_notify();

create or replace function public.tg_post_mention_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, post_id)
  select m, new.character_id, 'mention', new.id
  from public.mentioned_characters(new.caption) as m
  where m <> new.character_id;
  return new;
end $$;
drop trigger if exists posts_mention_notify on public.posts;
create trigger posts_mention_notify after insert on public.posts
  for each row execute function public.tg_post_mention_notify();

create or replace function public.tg_message_touch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations c set last_message_at = new.created_at where c.id = new.conversation_id;
  update public.conversation_members m set last_read_at = new.created_at
  where m.conversation_id = new.conversation_id and m.character_id = new.sender_id;
  return new;
end $$;
drop trigger if exists messages_touch on public.messages;
create trigger messages_touch after insert on public.messages
  for each row execute function public.tg_message_touch();


-- ---------------------------------------------------------------------
-- 5b. Notificações no celular (push)
--     Os gatilhos põem os avisos numa fila; a função "push" do Supabase
--     (supabase/functions/push) manda para os aparelhos.
-- ---------------------------------------------------------------------

-- Texto curto, numa linha só
create or replace function public._push_snippet(p_text text, p_max int)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(t) > p_max then rtrim(left(t, p_max - 1)) || '…' else t end
  from (select regexp_replace(trim(coalesce(p_text, '')), '\s+', ' ', 'g') as t) s;
$$;

-- O jogador quer esse tipo de aviso? (e tem algum aparelho cadastrado?)
-- Tipos: like, comment, mention, follow, message, post, story
create or replace function public._push_wants(p_player uuid, p_kind text, p_character uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not exists (select 1 from public.push_subscriptions s where s.player_id = p_player) then
    return false;
  end if;
  select pl.push_prefs into v from public.players pl where pl.id = p_player;
  if v is null then
    return false;
  end if;
  if p_character is not null and jsonb_typeof(v -> 'muted') = 'array' and (v -> 'muted') ? p_character::text then
    return false;
  end if;
  if jsonb_typeof(v -> p_kind) = 'boolean' then
    return (v ->> p_kind)::boolean;
  end if;
  return p_kind <> 'story'; -- stories começam desligados
end $$;

create or replace function public._push_enqueue(
  p_player uuid, p_character uuid, p_kind text, p_title text, p_body text, p_url text, p_tag text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_player is null or not public._push_wants(p_player, p_kind, p_character) then
    return;
  end if;
  insert into public.push_queue (player_id, character_id, kind, title, body, url, tag)
  values (p_player, p_character, p_kind, left(p_title, 120), left(p_body, 300), p_url, p_tag);
end $$;

-- Número do ícone do app: notificações e conversas não lidas de todos os personagens
create or replace function public._push_badge(p_player uuid)
returns int language sql stable security definer set search_path = '' as $$
  select (
    select count(*) from public.notifications n
    join public.characters c on c.id = n.recipient_id
    where c.owner_id = p_player and n.read_at is null
  )::int + (
    select count(*) from public.conversation_members m
    join public.characters c on c.id = m.character_id
    join public.conversations cv on cv.id = m.conversation_id
    where c.owner_id = p_player
      and cv.last_message_at > m.last_read_at
      and exists (
        select 1 from public.messages msg
        where msg.conversation_id = cv.id and msg.created_at > m.last_read_at and msg.sender_id <> c.id
      )
  )::int;
$$;

-- Curtidas, comentários, menções, marcações e seguidores
create or replace function public.tg_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_to    public.characters;
  v_from  public.characters;
  v_quote text;
  v_kind  text;
  v_text  text;
  v_url   text;
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
    when 'comment_like' then 'curtiu seu comentário: ' || coalesce(v_quote, '')
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
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.tg_notification_push();

-- Mensagens do Direct
create or replace function public.tg_message_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_from public.characters;
  v_conv public.conversations;
  v_text text;
  r      record;
begin
  select * into v_from from public.characters c where c.id = new.sender_id;
  select * into v_conv from public.conversations cv where cv.id = new.conversation_id;
  if v_from.id is null or v_conv.id is null then
    return new;
  end if;
  v_text := case new.kind
    when 'media' then 'enviou uma foto.'
    when 'post' then 'compartilhou uma publicação.'
    when 'story_reply' then 'respondeu ao seu story: ' || public._push_snippet(new.body, 120)
    else public._push_snippet(new.body, 160)
  end;
  v_text := v_from.handle
    || case when v_conv.is_group then ' em ' || coalesce(nullif(trim(v_conv.title), ''), 'grupo') else '' end
    || case when new.kind = 'text' then ': ' else ' ' end
    || v_text;
  for r in
    select distinct on (c.owner_id) c.owner_id, c.id, c.handle
    from public.conversation_members m
    join public.characters c on c.id = m.character_id
    where m.conversation_id = new.conversation_id and c.owner_id <> v_from.owner_id
    order by c.owner_id, m.joined_at
  loop
    perform public._push_enqueue(r.owner_id, r.id, 'message', r.handle, v_text,
      '#/direct/' || new.conversation_id, 'dm:' || new.conversation_id);
  end loop;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists messages_push on public.messages;
create trigger messages_push after insert on public.messages
  for each row execute function public.tg_message_push();

-- Publicação nova de quem você segue
create or replace function public.tg_post_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_from public.characters;
  v_text text;
  r      record;
begin
  select * into v_from from public.characters c where c.id = new.character_id;
  if v_from.id is null then
    return new;
  end if;
  v_text := v_from.handle || ' fez uma publicação'
    || case when coalesce(trim(new.caption), '') <> '' then ': ' || public._push_snippet(new.caption, 110) else '.' end;
  for r in
    select distinct on (c.owner_id) c.owner_id, c.id, c.handle
    from public.follows f
    join public.characters c on c.id = f.follower_id
    where f.followee_id = new.character_id and c.owner_id <> v_from.owner_id
    order by c.owner_id, f.created_at
  loop
    -- quem foi mencionado já recebe o aviso da menção
    if not exists (
      select 1 from public.push_queue q
      where q.player_id = r.owner_id and q.sent_at is null and q.url = '#/p/' || new.id
    ) then
      perform public._push_enqueue(r.owner_id, r.id, 'post', r.handle, v_text, '#/p/' || new.id, null);
    end if;
  end loop;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists posts_push on public.posts;
create trigger posts_push after insert on public.posts
  for each row execute function public.tg_post_push();

-- Story novo de quem você segue (começa desligado nas preferências)
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
    order by c.owner_id, f.created_at
  loop
    perform public._push_enqueue(r.owner_id, r.id, 'story', r.handle, v_from.handle || ' adicionou um story.',
      '#/stories/' || new.character_id, 'story:' || new.character_id);
  end loop;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists stories_push on public.stories;
create trigger stories_push after insert on public.stories
  for each row execute function public.tg_story_push();


-- Cadastra (ou assume) este aparelho para o jogador logado
create or replace function public.push_register(
  p_endpoint text, p_p256dh text, p_auth text, p_origin text default null, p_user_agent text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_member() then
    raise exception 'Apenas membros do grupo';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https?://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Assinatura de notificação inválida';
  end if;
  insert into public.push_subscriptions (player_id, endpoint, p256dh, auth, origin, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_origin, 200), left(p_user_agent, 400))
  on conflict (endpoint) do update
    set player_id = excluded.player_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        origin = excluded.origin,
        user_agent = excluded.user_agent,
        fail_count = 0;
  -- no máximo 10 aparelhos por jogador (os mais antigos saem)
  delete from public.push_subscriptions s
  where s.player_id = v_uid
    and s.id not in (
      select s2.id from public.push_subscriptions s2 where s2.player_id = v_uid order by s2.created_at desc limit 10
    );
end $$;

create or replace function public.push_unregister(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions s
  where s.endpoint = p_endpoint and s.player_id = (select auth.uid());
$$;


-- Pega os avisos pendentes (cada um sai uma vez só, mesmo com envios em paralelo)
create or replace function public.push_take(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  -- o que ficou esperando demais não vale mais a pena mandar
  update public.push_queue q set sent_at = now()
  where q.sent_at is null and q.created_at < now() - interval '30 minutes';
  delete from public.push_queue q where q.sent_at < now() - interval '3 days';

  with taken as (
    update public.push_queue q set sent_at = now()
    where q.id in (
      select p.id from public.push_queue p
      where p.sent_at is null
      order by p.id
      limit greatest(1, least(coalesce(p_limit, 200), 500))
      for update skip locked
    )
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'player_id', t.player_id,
    'character_id', t.character_id,
    'kind', t.kind,
    'title', t.title,
    'body', t.body,
    'url', t.url,
    'tag', t.tag,
    'badge', public._push_badge(t.player_id),
    'subs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'origin', s.origin
      ) order by s.id)
      from public.push_subscriptions s where s.player_id = t.player_id
    ), '[]'::jsonb)
  ) order by t.id), '[]'::jsonb)
  into v
  from taken t;
  return v;
end $$;

-- Resultado do envio: aparelhos que funcionaram, que sumiram e que falharam
create or replace function public.push_done(p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.push_subscriptions s set last_ok_at = now(), fail_count = 0
  where s.id in (select x::bigint from jsonb_array_elements_text(coalesce(p_result -> 'ok', '[]'::jsonb)) as x);
  delete from public.push_subscriptions s
  where s.id in (select x::bigint from jsonb_array_elements_text(coalesce(p_result -> 'gone', '[]'::jsonb)) as x);
  update public.push_subscriptions s set fail_count = s.fail_count + 1
  where s.id in (select x::bigint from jsonb_array_elements_text(coalesce(p_result -> 'failed', '[]'::jsonb)) as x);
  delete from public.push_subscriptions s where s.fail_count >= 20;
end $$;


-- ---------------------------------------------------------------------
-- 6. Funções que o app chama (RPC)
-- ---------------------------------------------------------------------

-- Resumo curto de um personagem (usado em várias respostas)
create or replace function public._char(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'handle', c.handle, 'name', c.name,
    'avatar_path', c.avatar_path, 'is_verified', c.is_verified
  )
  from public.characters c where c.id = p_id;
$$;

-- Card completo de um post
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

-- Miniatura de um post (grades do perfil / explorar)
create or replace function public._post_thumb(p_post uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'created_at', p.created_at,
    'thumb', (select coalesce(m.thumb_path, m.path) from public.post_media m where m.post_id = p.id order by m.position limit 1),
    'media_count', (select count(*) from public.post_media m where m.post_id = p.id),
    'like_count', (select count(*) from public.likes l where l.post_id = p.id),
    'comment_count', (select count(*) from public.comments c where c.post_id = p.id)
  )
  from public.posts p where p.id = p_post;
$$;

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

create or replace function public.feed(p_viewer uuid, p_before timestamptz default null, p_limit int default 10)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_card(q.id, p_viewer) order by q.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at
    from public.posts p
    where (p.character_id = p_viewer
           or p.character_id in (select f.followee_id from public.follows f where f.follower_id = p_viewer))
      and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
  ) q;
$$;

create or replace function public.get_post(p_post uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select public._post_card(p_post, p_viewer);
$$;

create or replace function public.explore(p_before timestamptz default null, p_limit int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_thumb(q.id) order by q.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at from public.posts p
    where p_before is null or p.created_at < p_before
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
$$;

create or replace function public.character_posts(p_character uuid, p_before timestamptz default null, p_limit int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_thumb(q.id) order by q.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at from public.posts p
    where p.character_id = p_character and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
$$;

create or replace function public.tagged_posts(p_character uuid, p_before timestamptz default null, p_limit int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_thumb(q.id) order by q.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at from public.posts p
    join public.post_tags t on t.post_id = p.id
    where t.character_id = p_character and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
$$;

create or replace function public.saved_posts(p_character uuid, p_before timestamptz default null, p_limit int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_thumb(q.post_id) || jsonb_build_object('saved_at', q.created_at) order by q.created_at desc), '[]'::jsonb)
  from (
    select s.post_id, s.created_at from public.saves s
    where s.character_id = p_character and (p_before is null or s.created_at < p_before)
    order by s.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
$$;

create or replace function public.hashtag_posts(p_tag text, p_before timestamptz default null, p_limit int default 30)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._post_thumb(q.id) order by q.created_at desc), '[]'::jsonb)
  from (
    select p.id, p.created_at from public.posts p
    where p.caption ~* ('#' || regexp_replace(coalesce(p_tag, ''), '[^[:alnum:]_]', '', 'g') || '([^[:alnum:]_]|$)')
      and (p_before is null or p.created_at < p_before)
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) q;
$$;

create or replace function public.search_characters(p_query text, p_viewer uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.rank, q.handle), '[]'::jsonb)
  from (
    select
      public._char(c.id) || jsonb_build_object(
        'is_following', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = c.id)
      ) as x,
      c.handle,
      case when c.handle like lower(trim(p_query)) || '%' then 0 else 1 end as rank
    from public.characters c
    where trim(coalesce(p_query, '')) <> ''
      and (c.handle ilike '%' || trim(p_query) || '%' or c.name ilike '%' || trim(p_query) || '%')
    order by rank, c.handle
    limit 30
  ) q;
$$;

create or replace function public.search_hashtags(p_query text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tag', q.tag, 'count', q.n) order by q.n desc, q.tag), '[]'::jsonb)
  from (
    select lower(m[1]) as tag, count(distinct p.id) as n
    from public.posts p, regexp_matches(p.caption, '#([[:alnum:]_]+)', 'g') as m
    group by lower(m[1])
    having lower(m[1]) like lower(regexp_replace(coalesce(p_query, ''), '^#', '')) || '%'
    order by n desc
    limit 15
  ) q;
$$;

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
    )
  )
  from public.characters c
  where c.handle = lower(trim(p_handle));
$$;

create or replace function public.follow_list(p_character uuid, p_viewer uuid, p_kind text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.created_at desc), '[]'::jsonb)
  from (
    select
      public._char(case when p_kind = 'followers' then f.follower_id else f.followee_id end)
      || jsonb_build_object(
        'is_following', exists (
          select 1 from public.follows v
          where v.follower_id = p_viewer
            and v.followee_id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
        ),
        'follows_you', exists (
          select 1 from public.follows v
          where v.followee_id = p_viewer
            and v.follower_id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
        )
      ) as x,
      f.created_at
    from public.follows f
    where (p_kind = 'followers' and f.followee_id = p_character)
       or (p_kind = 'following' and f.follower_id = p_character)
  ) q;
$$;

create or replace function public.post_likers(p_post uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.created_at desc), '[]'::jsonb)
  from (
    select public._char(l.character_id) || jsonb_build_object('is_following', exists (
      select 1 from public.follows v where v.follower_id = p_viewer and v.followee_id = l.character_id
    )) as x, l.created_at
    from public.likes l where l.post_id = p_post
  ) q;
$$;

create or replace function public.suggested_characters(p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.followers desc, q.handle), '[]'::jsonb)
  from (
    select public._char(c.id) || jsonb_build_object('follows_you', exists (
      select 1 from public.follows f where f.follower_id = c.id and f.followee_id = p_viewer
    )) as x,
    c.handle,
    (select count(*) from public.follows f where f.followee_id = c.id) as followers
    from public.characters c
    where c.id <> p_viewer
      and not exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = c.id)
    limit 30
  ) q;
$$;

create or replace function public.post_comments(p_post uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'parent_id', c.parent_id,
    'body', c.body,
    'created_at', c.created_at,
    'character', public._char(c.character_id),
    'like_count', (select count(*) from public.comment_likes l where l.comment_id = c.id),
    'liked', exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.character_id = p_viewer)
  ) order by c.created_at), '[]'::jsonb)
  from public.comments c
  where c.post_id = p_post;
$$;

-- Bandeja de stories: você + quem você segue, com stories ativos
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

create or replace function public.story_viewers(p_story uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(public._char(v.character_id) || jsonb_build_object('viewed_at', v.viewed_at) order by v.viewed_at desc), '[]'::jsonb)
  from public.story_views v
  join public.stories s on s.id = v.story_id
  where v.story_id = p_story and v.character_id <> s.character_id;
$$;

create or replace function public.get_notifications(p_viewer uuid, p_before timestamptz default null, p_limit int default 40)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(q.x order by q.created_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', n.id,
      'type', n.type,
      'created_at', n.created_at,
      'read', n.read_at is not null,
      'actor', public._char(n.actor_id),
      'post_id', n.post_id,
      'post_thumb', (select coalesce(m.thumb_path, m.path) from public.post_media m where m.post_id = n.post_id order by m.position limit 1),
      'comment_id', n.comment_id,
      'comment', (select left(c.body, 140) from public.comments c where c.id = n.comment_id),
      'is_following_actor', exists (select 1 from public.follows f where f.follower_id = p_viewer and f.followee_id = n.actor_id)
    ) as x, n.created_at
    from public.notifications n
    where n.recipient_id = p_viewer and (p_before is null or n.created_at < p_before)
    order by n.created_at desc
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) q;
$$;

-- Contadores de não lidos para todos os personagens do jogador logado
create or replace function public.unread_counts()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.id, jsonb_build_object(
    'notifications', (
      select count(*) from public.notifications n
      where n.recipient_id = c.id and n.read_at is null
    ),
    'messages', (
      select count(*) from public.conversation_members m
      join public.conversations cv on cv.id = m.conversation_id
      where m.character_id = c.id
        and cv.last_message_at > m.last_read_at
        and exists (
          select 1 from public.messages msg
          where msg.conversation_id = cv.id and msg.created_at > m.last_read_at and msg.sender_id <> c.id
        )
    )
  )), '{}'::jsonb)
  from public.characters c
  where c.owner_id = (select auth.uid());
$$;

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
          'is_story_reply', msg.kind = 'story_reply'
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

create or replace function public.conversation_info(p_conversation uuid, p_viewer uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', cv.id, 'is_group', cv.is_group, 'title', cv.title,
    'members', coalesce((
      select jsonb_agg(public._char(om.character_id) || jsonb_build_object('last_read_at', om.last_read_at) order by om.joined_at)
      from public.conversation_members om
      where om.conversation_id = cv.id and om.character_id <> p_viewer
    ), '[]'::jsonb)
  )
  from public.conversations cv
  where cv.id = p_conversation
    and exists (select 1 from public.conversation_members me where me.conversation_id = cv.id and me.character_id = p_viewer);
$$;

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
      'post', case when msg.post_id is null then null else (
        select jsonb_build_object(
          'id', p.id,
          'caption', left(p.caption, 120),
          'character', public._char(p.character_id),
          'thumb', (select coalesce(m.thumb_path, m.path) from public.post_media m where m.post_id = p.id order by m.position limit 1)
        ) from public.posts p where p.id = msg.post_id
      ) end,
      'story', case when msg.story_id is null then null else (
        select jsonb_build_object('id', s.id, 'path', s.path, 'character_id', s.character_id, 'expired', s.expires_at <= now())
        from public.stories s where s.id = msg.story_id
      ) end,
      'story_reply', msg.kind = 'story_reply'
    ) as x, msg.created_at
    from public.messages msg
    where msg.conversation_id = p_conversation
      and (p_before is null or msg.created_at < p_before)
      and (p_after is null or msg.created_at > p_after)
    order by msg.created_at desc
    limit least(greatest(coalesce(p_limit, 40), 1), 200)
  ) q;
$$;

create or replace function public.start_conversation(p_from uuid, p_to uuid[], p_title text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_conv    uuid;
  v_members uuid[];
  v_count   int;
begin
  if not public.owns_character(p_from) then
    raise exception 'Personagem inválido';
  end if;
  v_members := array(select distinct x from unnest(coalesce(p_to, '{}'::uuid[]) || p_from) as x where x is not null);
  v_count := coalesce(array_length(v_members, 1), 0);
  if v_count < 2 then
    raise exception 'Escolha pelo menos um personagem';
  end if;
  if v_count > 32 then
    raise exception 'Grupo grande demais';
  end if;
  if (select count(*) from public.characters where id = any (v_members)) <> v_count then
    raise exception 'Personagem não encontrado';
  end if;

  if v_count = 2 then
    select cv.id into v_conv
    from public.conversations cv
    where not cv.is_group
      and exists (select 1 from public.conversation_members m where m.conversation_id = cv.id and m.character_id = v_members[1])
      and exists (select 1 from public.conversation_members m where m.conversation_id = cv.id and m.character_id = v_members[2])
    limit 1;
    if v_conv is not null then
      return v_conv;
    end if;
  end if;

  insert into public.conversations (is_group, title)
  values (v_count > 2, nullif(trim(coalesce(p_title, '')), ''))
  returning id into v_conv;

  insert into public.conversation_members (conversation_id, character_id, last_read_at)
  select v_conv, x, case when x = p_from then now() else 'epoch'::timestamptz end
  from unnest(v_members) as x;

  return v_conv;
end $$;

-- Dados do jogador logado (perfil + personagens)
create or replace function public.me()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'is_admin', p.is_admin,
    'push_prefs', p.push_prefs,
    'characters', coalesce((
      select jsonb_agg(public._char(c.id) || jsonb_build_object('bio', c.bio, 'created_at', c.created_at) order by c.created_at)
      from public.characters c where c.owner_id = p.id
    ), '[]'::jsonb)
  )
  from public.players p
  where p.id = (select auth.uid());
$$;


-- ---------------------------------------------------------------------
-- 7. Funções de administrador (mestre)
-- ---------------------------------------------------------------------

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
          select jsonb_agg(public._char(c.id) order by c.created_at)
          from public.characters c where c.owner_id = p.id
        ), '[]'::jsonb)
      ) order by p.created_at)
      from public.players p
      left join auth.users u on u.id = p.id
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_set_invite_code(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;
  if char_length(trim(coalesce(p_code, ''))) < 4 then
    raise exception 'O código precisa ter pelo menos 4 caracteres';
  end if;
  update public.app_settings set invite_code = trim(p_code), updated_at = now() where id;
end $$;

create or replace function public.admin_set_admin(p_player uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;
  if not p_value and (select count(*) from public.players where is_admin and id <> p_player) = 0 then
    raise exception 'Precisa sobrar pelo menos um administrador';
  end if;
  update public.players set is_admin = p_value where id = p_player;
end $$;

create or replace function public.admin_set_verified(p_character uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;
  update public.characters set is_verified = p_value where id = p_character;
end $$;

create or replace function public.admin_reset_password(p_player uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores';
  end if;
  if char_length(coalesce(p_password, '')) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_player;
  if not found then
    raise exception 'Jogador não encontrado';
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 8. Permissões da API
--    (desde 2026 o Supabase não libera tabelas novas automaticamente)
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

revoke all on
  public.app_settings, public.players, public.characters, public.follows, public.posts,
  public.post_media, public.post_tags, public.likes, public.comments, public.comment_likes,
  public.saves, public.stories, public.story_views, public.notifications,
  public.conversations, public.conversation_members, public.messages,
  public.push_subscriptions, public.push_queue, public.push_config
from anon, authenticated;

grant select                on public.players              to authenticated;
grant update (display_name, push_prefs) on public.players to authenticated;
grant select, insert, delete on public.characters          to authenticated;
grant update (handle, name, bio, avatar_path) on public.characters to authenticated;
grant select, insert, delete on public.follows             to authenticated;
grant select, insert, delete on public.posts               to authenticated;
grant update (caption, location, edited_at, music) on public.posts to authenticated;
grant select, insert, delete on public.post_media          to authenticated;
grant select, insert, delete on public.post_tags           to authenticated;
grant select, insert, delete on public.likes               to authenticated;
grant select, insert, delete on public.comments            to authenticated;
grant select, insert, delete on public.comment_likes       to authenticated;
grant select, insert, delete on public.saves               to authenticated;
grant select, insert, delete on public.stories             to authenticated;
grant select, insert        on public.story_views          to authenticated;
grant select, delete        on public.notifications        to authenticated;
grant update (read_at)      on public.notifications        to authenticated;
grant select                on public.conversations        to authenticated;
grant update (title)        on public.conversations        to authenticated;
grant select, delete        on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant select, insert, delete on public.messages            to authenticated;
grant select, delete        on public.push_subscriptions   to authenticated;

grant all on
  public.app_settings, public.players, public.characters, public.follows, public.posts,
  public.post_media, public.post_tags, public.likes, public.comments, public.comment_likes,
  public.saves, public.stories, public.story_views, public.notifications,
  public.conversations, public.conversation_members, public.messages,
  public.push_subscriptions, public.push_queue, public.push_config
to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Funções: ninguém executa por padrão; liberamos só o necessário
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

grant execute on function public.check_invite_code(text) to anon, authenticated;

grant execute on function
  public.is_member(), public.is_admin(), public.owns_character(uuid), public.in_conversation(uuid),
  public._char(uuid), public._post_card(uuid, uuid), public._post_thumb(uuid),
  public.create_post(uuid, text, text, jsonb, uuid[], jsonb),
  public.feed(uuid, timestamptz, int), public.get_post(uuid, uuid), public.explore(timestamptz, int),
  public.character_posts(uuid, timestamptz, int), public.tagged_posts(uuid, timestamptz, int),
  public.saved_posts(uuid, timestamptz, int), public.hashtag_posts(text, timestamptz, int),
  public.search_characters(text, uuid), public.search_hashtags(text),
  public.profile(text, uuid), public.follow_list(uuid, uuid, text), public.post_likers(uuid, uuid),
  public.suggested_characters(uuid), public.post_comments(uuid, uuid),
  public.stories_tray(uuid), public.character_stories(uuid, uuid), public.story_viewers(uuid),
  public.get_notifications(uuid, timestamptz, int), public.unread_counts(),
  public.inbox(uuid), public.conversation_info(uuid, uuid),
  public.get_messages(uuid, timestamptz, timestamptz, int),
  public.start_conversation(uuid, uuid[], text), public.me(),
  public.admin_overview(), public.admin_set_invite_code(text), public.admin_set_admin(uuid, boolean),
  public.admin_set_verified(uuid, boolean), public.admin_reset_password(uuid, text),
  public.push_register(text, text, text, text, text), public.push_unregister(text)
to authenticated;


-- ---------------------------------------------------------------------
-- 9. Fotos (Storage): bucket público "media"
--    Cada jogador só envia arquivos para a própria pasta.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fargus_media_select on storage.objects;
create policy fargus_media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.is_member()));

drop policy if exists fargus_media_insert on storage.objects;
create policy fargus_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and (select public.is_member())
  );

drop policy if exists fargus_media_delete on storage.objects;
create policy fargus_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_admin()))
  );


-- ---------------------------------------------------------------------
-- 10. Tempo real (DMs e notificações chegam na hora)
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

-- Recarrega a API para enxergar as funções novas
notify pgrst, 'reload schema';

select 'FargusGram: banco configurado com sucesso ✔' as resultado;

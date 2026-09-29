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
  music        jsonb,
  thumb_path   text
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
  kind            text not null default 'text' check (kind in ('text', 'media', 'post', 'story_reply', 'note_reply', 'story_mention', 'sticker')),
  body            text check (body is null or char_length(body) <= 2000),
  media_path      text,
  media_width     int,
  media_height    int,
  post_id         uuid references public.posts (id) on delete set null,
  story_id        uuid references public.stories (id) on delete set null,
  reply_to        uuid, -- mensagem respondida (sem chave estrangeira: se sumir, mostra "apagada")
  note_body       text, -- texto da nota respondida (a nota some em 24 h, a conversa não)
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

-- Responder uma mensagem específica no Direct
alter table public.messages add column if not exists reply_to uuid;
create index if not exists messages_reply_idx on public.messages (reply_to) where reply_to is not null;

-- Stories: miniatura (capas dos destaques e arquivo). Os stories somem da
-- bandeja depois de 24 h, mas ficam 30 dias num arquivo que só o dono vê;
-- os que estão em algum destaque ficam para sempre.
alter table public.stories add column if not exists thumb_path text;
create index if not exists stories_path_idx on public.stories (path);
create index if not exists stories_thumb_path_idx on public.stories (thumb_path) where thumb_path is not null;

-- Destaques no perfil
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

-- Notas no topo do Direct (texto curto que dura 24 h; uma por personagem)
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

-- Melhores amigos: cada personagem tem a sua lista, e só o dono vê quem está nela
create table if not exists public.close_friends (
  character_id uuid not null references public.characters (id) on delete cascade,
  friend_id    uuid not null references public.characters (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (character_id, friend_id),
  check (character_id <> friend_id)
);
create index if not exists close_friends_friend_idx on public.close_friends (friend_id);

-- Para quem é cada story e cada nota: todo mundo ou só os melhores amigos
alter table public.stories add column if not exists audience text not null default 'all';
alter table public.stories drop constraint if exists stories_audience_check;
alter table public.stories add constraint stories_audience_check check (audience in ('all', 'close_friends'));
alter table public.notes add column if not exists audience text not null default 'all';
alter table public.notes drop constraint if exists notes_audience_check;
alter table public.notes add constraint notes_audience_check check (audience in ('all', 'close_friends'));

-- Resposta a uma nota vira mensagem no Direct, guardando o texto da nota
-- (para quem instalou antes de setembro/2026, estas linhas ajustam a tabela)
alter table public.messages add column if not exists note_body text;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'media', 'post', 'story_reply', 'note_reply', 'story_mention', 'sticker'));
alter table public.messages drop constraint if exists messages_note_body_ok;
alter table public.messages add constraint messages_note_body_ok
  check (note_body is null or char_length(note_body) <= 200);
alter table public.messages drop constraint if exists messages_note_reply_ok;
alter table public.messages add constraint messages_note_reply_ok
  check (kind <> 'note_reply' or (coalesce(char_length(body), 0) > 0 and note_body is not null));

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

-- Melhores amigos: algum personagem do jogador logado está na lista de p_character?
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

-- Arquivo (foto ou miniatura) de um story que está em algum destaque?
create or replace function public.media_in_highlight(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.stories s
    join public.highlight_items hi on hi.story_id = s.id
    where s.path = p_path or s.thumb_path = p_path
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
alter table public.highlights           enable row level security;
alter table public.highlight_items      enable row level security;
alter table public.notes                enable row level security;
alter table public.close_friends        enable row level security;

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
-- (os de "Melhores amigos" só o dono e a lista veem)
create policy stories_select on public.stories for select to authenticated
  using (
    (select public.is_member())
    and (audience = 'all' or public.owns_character(character_id) or public.is_close_friend_of(character_id))
  );
drop policy if exists stories_insert on public.stories;
create policy stories_insert on public.stories for insert to authenticated
  with check (public.owns_character(character_id));
-- story que está num destaque só pode ser apagado depois de sair do
-- destaque (o app faz isso quando a pessoa exclui o story de propósito)
drop policy if exists stories_delete on public.stories;
create policy stories_delete on public.stories for delete to authenticated
  using (
    (public.owns_character(character_id) or (select public.is_admin()))
    and not exists (select 1 from public.highlight_items hi where hi.story_id = stories.id)
  );

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

-- destaques: todos veem; só o dono mexe (a capa tem que ser um story dele)
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

-- stories de um destaque: só stories do próprio dono do destaque
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

-- notas
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes for select to authenticated
  using (
    (select public.is_member())
    and (audience = 'all' or public.owns_character(character_id) or public.is_close_friend_of(character_id))
  );
drop policy if exists notes_insert on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (public.owns_character(character_id));
drop policy if exists notes_delete on public.notes;
create policy notes_delete on public.notes for delete to authenticated
  using (public.owns_character(character_id) or (select public.is_admin()));

-- melhores amigos (a lista): só o dono lê e mexe
drop policy if exists close_friends_select on public.close_friends;
create policy close_friends_select on public.close_friends for select to authenticated
  using (public.owns_character(character_id));
drop policy if exists close_friends_insert on public.close_friends;
create policy close_friends_insert on public.close_friends for insert to authenticated
  with check (public.owns_character(character_id) and (select public.is_member()));
drop policy if exists close_friends_delete on public.close_friends;
create policy close_friends_delete on public.close_friends for delete to authenticated
  using (public.owns_character(character_id));

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
    and (
      reply_to is null
      or exists (select 1 from public.messages r where r.id = messages.reply_to and r.conversation_id = messages.conversation_id)
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
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  for each row execute function public.tg_notification_push();

-- Mensagens do Direct
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

-- Resumo de um destaque: título, capa (miniatura) e quantidade de stories
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

-- Destaques de um personagem (p_story: marca em quais este story já está)
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

-- Um destaque com os stories (na ordem em que foram publicados)
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

-- Deixa uma nota nova (substitui a anterior do personagem)
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

-- Tela da lista de melhores amigos: todos os personagens do grupo (menos o
-- próprio), com os da lista primeiro, depois quem segue você
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

-- Dados do jogador logado (perfil + personagens; "features" diz ao app o que o banco já tem)
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
  public.push_subscriptions, public.push_queue, public.push_config,
  public.highlights, public.highlight_items, public.notes, public.close_friends
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
grant select, insert, delete on public.highlights          to authenticated;
grant update (title, cover_story_id) on public.highlights  to authenticated;
grant select, insert, delete on public.highlight_items     to authenticated;
grant select, insert, delete on public.notes               to authenticated;
grant select, insert, delete on public.close_friends       to authenticated;

grant all on
  public.app_settings, public.players, public.characters, public.follows, public.posts,
  public.post_media, public.post_tags, public.likes, public.comments, public.comment_likes,
  public.saves, public.stories, public.story_views, public.notifications,
  public.conversations, public.conversation_members, public.messages,
  public.push_subscriptions, public.push_queue, public.push_config,
  public.highlights, public.highlight_items, public.notes, public.close_friends
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
  public.push_register(text, text, text, text, text), public.push_unregister(text),
  public.media_in_highlight(text), public._highlight(uuid, uuid),
  public.character_highlights(uuid, uuid, uuid), public.get_highlight(uuid, uuid),
  public.story_archive(uuid, timestamptz, int), public.save_highlight(uuid, text, uuid[], uuid, uuid),
  public.stories_to_cleanup(uuid[]), public.notes_tray(uuid), public.set_note(uuid, text, jsonb, text),
  public.is_close_friend_of(uuid), public.in_close_friends(uuid, uuid), public.visible_to(uuid, text, uuid),
  public.close_friends_list(uuid, text)
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

-- (a foto de um story que está num destaque fica protegida)
drop policy if exists fargus_media_delete on storage.objects;
create policy fargus_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and ((storage.foldername(name))[1] = (select auth.uid()::text) or (select public.is_admin()))
    and not public.media_in_highlight(name)
  );


-- ---------------------------------------------------------------------
-- 9b. Interações: reações e comentários fixados; figurinhas do story
--     (enquete, caixinha de perguntas, menção, local e horário)
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 9c. Reações nos stories, nos destaques e nas mensagens do Direct
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- 9d. Figurinhas (como as do WhatsApp) e imagens nos comentários
-- ---------------------------------------------------------------------

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

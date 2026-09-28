-- =====================================================================
--  FargusGram — atualização: notificações no celular (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Depois crie a função "push" no Supabase (passo a passo no README).
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

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

alter table public.push_subscriptions enable row level security;
alter table public.push_queue         enable row level security;
alter table public.push_config        enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (player_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (player_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- Montagem dos avisos
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


-- ---------------------------------------------------------------------
-- Funções chamadas pelo app
-- ---------------------------------------------------------------------

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


-- ---------------------------------------------------------------------
-- Funções usadas só pela função "push" do servidor
-- ---------------------------------------------------------------------

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
-- "me" passa a trazer as preferências de notificação
-- ---------------------------------------------------------------------

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
-- Permissões
-- ---------------------------------------------------------------------

revoke all on public.push_subscriptions, public.push_queue, public.push_config from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions, public.push_queue, public.push_config to service_role;
grant usage, select on all sequences in schema public to service_role;
grant update (display_name, push_prefs) on public.players to authenticated;

revoke execute on function
  public._push_snippet(text, int), public._push_wants(uuid, text, uuid),
  public._push_enqueue(uuid, uuid, text, text, text, text, text), public._push_badge(uuid),
  public.tg_notification_push(), public.tg_message_push(), public.tg_post_push(), public.tg_story_push(),
  public.push_register(text, text, text, text, text), public.push_unregister(text),
  public.push_take(int), public.push_done(jsonb), public.me()
from public, anon, authenticated;
grant execute on function
  public._push_snippet(text, int), public._push_wants(uuid, text, uuid),
  public._push_enqueue(uuid, uuid, text, text, text, text, text), public._push_badge(uuid),
  public.tg_notification_push(), public.tg_message_push(), public.tg_post_push(), public.tg_story_push(),
  public.push_register(text, text, text, text, text), public.push_unregister(text),
  public.push_take(int), public.push_done(jsonb), public.me()
to service_role;
grant execute on function
  public.push_register(text, text, text, text, text), public.push_unregister(text), public.me()
to authenticated;

notify pgrst, 'reload schema';

select 'FargusGram: notificações ativadas no banco ✔ (agora crie a função push)' as resultado;

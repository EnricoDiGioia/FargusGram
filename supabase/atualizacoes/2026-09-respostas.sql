-- =====================================================================
--  FargusGram — atualização: responder uma mensagem específica no Direct
--  (setembro/2026)
--
--  Para quem já tinha o FargusGram funcionando: abra o SQL Editor do
--  Supabase, clique em "New query", cole este arquivo inteiro e clique
--  em "Run". Não apaga nada e pode ser rodado mais de uma vez.
--  Precisa da atualização de notificações (2026-09-notificacoes.sql) antes.
--  Quem for instalar do zero não precisa dele: o setup.sql já inclui tudo.
-- =====================================================================

-- Mensagem que está sendo respondida (sem chave estrangeira de propósito:
-- se a original for apagada, a resposta mostra "Mensagem apagada")
alter table public.messages add column if not exists reply_to uuid;
create index if not exists messages_reply_idx on public.messages (reply_to) where reply_to is not null;

-- Só dá para responder mensagens da mesma conversa
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

-- As mensagens passam a trazer a mensagem respondida (resumida)
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

-- Notificação: quem teve a mensagem respondida recebe "respondeu você"
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

notify pgrst, 'reload schema';

select 'FargusGram: respostas no Direct ativadas ✔' as resultado;

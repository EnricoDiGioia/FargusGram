// Todas as conversas com o Supabase passam por aqui.
import { supabase } from './supabase';
import { pokePush } from './push';

// ---------------------------------------------------------------------
// Erros em português
// ---------------------------------------------------------------------
export function errorMessage(err) {
  if (!err) return 'Algo deu errado.';
  const msg = String(err.message || err.error_description || err || '');
  const code = err.code || '';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(msg)) return 'Sem conexão com o servidor. Verifique a internet.';
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/already registered|already been registered|already exists/i.test(msg)) return 'Esse e-mail já tem uma conta. Tente entrar.';
  if (/Password should be at least|password.*characters/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/Database error saving new user|Código de convite inválido/i.test(msg)) return 'Código de convite inválido.';
  if (/Email address .* is invalid|invalid.*email|unable to validate email/i.test(msg)) return 'Esse e-mail não parece válido.';
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas seguidas. Espere um pouco e tente de novo.';
  if (/Email not confirmed/i.test(msg)) return 'E-mail não confirmado. Peça para o admin desativar a confirmação de e-mail no Supabase (veja o README).';
  if (code === '23505' && /handle/.test(msg)) return 'Esse @ já está em uso. Escolha outro.';
  if (code === '23505') return 'Isso já existe.';
  if (code === '23514' && /handle/.test(msg)) return 'O @ só pode ter letras minúsculas, números, ponto e _ (de 2 a 30).';
  if (code === '23514') return 'Algum campo está grande demais ou inválido.';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Você não tem permissão para fazer isso.';
  if (/Payload too large|exceeded the maximum allowed size/i.test(msg)) return 'Arquivo grande demais.';
  if (/mime type|invalid_mime_type/i.test(msg)) return 'Tipo de arquivo não suportado. Use uma foto JPG ou PNG.';
  if (/JWT|token is expired|invalid claim/i.test(msg)) return 'Sua sessão expirou. Entre de novo.';
  if ((code === 'PGRST204' || code === '42703') && /reply_to/.test(msg))
    return 'O banco ainda não tem a atualização de respostas. O admin precisa rodar o arquivo supabase/atualizacoes/2026-09-respostas.sql no SQL Editor do Supabase (veja o README).';
  if (
    ((code === 'PGRST202' || code === 'PGRST205' || code === '42P01') && /close_friends/.test(msg)) ||
    ((code === 'PGRST204' || code === '42703') && /audience/.test(msg))
  )
    return 'O banco ainda não tem a atualização de melhores amigos. O admin precisa rodar o arquivo supabase/atualizacoes/2026-09-melhores-amigos.sql no SQL Editor do Supabase (veja o README).';
  if (
    (code === 'PGRST202' && /highlight|story_archive|notes_tray|set_note/.test(msg)) ||
    ((code === 'PGRST205' || code === '42P01') && /highlight|notes/.test(msg)) ||
    ((code === 'PGRST204' || code === '42703') && /thumb_path|note_body/.test(msg))
  )
    return 'O banco ainda não tem a atualização de destaques e notas. O admin precisa rodar o arquivo supabase/atualizacoes/2026-09-destaques-notas.sql no SQL Editor do Supabase (veja o README).';
  if ((code === 'PGRST202' && /create_post/.test(msg)) || ((code === 'PGRST204' || code === '42703') && /music/.test(msg)))
    return 'O banco ainda não tem a atualização de música. O admin precisa rodar o arquivo supabase/atualizacoes/2026-09-musica.sql no SQL Editor do Supabase (veja o README).';
  return msg || 'Algo deu errado.';
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const rpc = async (fn, params) => unwrap(await supabase.rpc(fn, params));

// ---------------------------------------------------------------------
// Login e cadastro
// ---------------------------------------------------------------------
export const auth = {
  async signIn(email, password) {
    return unwrap(await supabase.auth.signInWithPassword({ email: email.trim(), password }));
  },
  async signUp(email, password, displayName, inviteCode) {
    const ok = await rpc('check_invite_code', { p_code: inviteCode });
    if (!ok) throw new Error('Código de convite inválido');
    const data = unwrap(
      await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim(), invite_code: inviteCode.trim() } },
      })
    );
    if (!data.session) {
      // Supabase com confirmação de e-mail ligada: a conta foi criada, mas não entra sozinha
      const again = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (again.error) throw again.error;
      return again.data;
    }
    return data;
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async changePassword(password) {
    return unwrap(await supabase.auth.updateUser({ password }));
  },
};

// ---------------------------------------------------------------------
// Jogador e personagens
// ---------------------------------------------------------------------
export const me = () => rpc('me');

export async function updateDisplayName(playerId, name) {
  unwrap(await supabase.from('players').update({ display_name: name.trim() }).eq('id', playerId));
}

export async function createCharacter(ownerId, { handle, name, bio }) {
  return unwrap(
    await supabase
      .from('characters')
      .insert({ owner_id: ownerId, handle: handle.trim().toLowerCase(), name: (name || '').trim(), bio: (bio || '').trim() })
      .select('id, handle, name, bio, avatar_path, is_verified, created_at')
      .single()
  );
}

export async function updateCharacter(id, fields) {
  return unwrap(
    await supabase
      .from('characters')
      .update(fields)
      .eq('id', id)
      .select('id, handle, name, bio, avatar_path, is_verified, created_at')
      .single()
  );
}

export async function deleteCharacter(uid, id) {
  // fotos de stories em destaque ficam protegidas: tira os destaques antes
  await supabase.from('highlights').delete().eq('character_id', id);
  await removeFolder(`${uid}/${id}`);
  unwrap(await supabase.from('characters').delete().eq('id', id));
}

export const profile = (handle, viewer) => rpc('profile', { p_handle: handle, p_viewer: viewer });
export const searchCharacters = (q, viewer) => rpc('search_characters', { p_query: q, p_viewer: viewer });
export const searchHashtags = (q) => rpc('search_hashtags', { p_query: q });
export const suggested = (viewer) => rpc('suggested_characters', { p_viewer: viewer });
export const followList = (character, viewer, kind) =>
  rpc('follow_list', { p_character: character, p_viewer: viewer, p_kind: kind });

export async function follow(follower, followee) {
  const { error } = await supabase.from('follows').insert({ follower_id: follower, followee_id: followee });
  if (error && error.code !== '23505') throw error;
  if (!error) pokePush();
}
export async function unfollow(follower, followee) {
  unwrap(await supabase.from('follows').delete().eq('follower_id', follower).eq('followee_id', followee));
}

// ---------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------
export const feed = (viewer, before) => rpc('feed', { p_viewer: viewer, p_before: before ?? null, p_limit: 8 });
export const explore = (before) => rpc('explore', { p_before: before ?? null, p_limit: 30 });
export const characterPosts = (character, before) =>
  rpc('character_posts', { p_character: character, p_before: before ?? null, p_limit: 30 });
export const taggedPosts = (character, before) =>
  rpc('tagged_posts', { p_character: character, p_before: before ?? null, p_limit: 30 });
export const savedPosts = (character, before) =>
  rpc('saved_posts', { p_character: character, p_before: before ?? null, p_limit: 30 });
export const hashtagPosts = (tag, before) => rpc('hashtag_posts', { p_tag: tag, p_before: before ?? null, p_limit: 30 });
export const getPost = (id, viewer) => rpc('get_post', { p_post: id, p_viewer: viewer });
export const likers = (post, viewer) => rpc('post_likers', { p_post: post, p_viewer: viewer });

export async function createPost({ character, caption, location, media, tags, music }) {
  const id = await rpc('create_post', {
    p_character: character,
    p_caption: caption || '',
    p_location: location || '',
    p_media: media,
    p_tags: tags || [],
    // só manda a música quando tem, assim o app funciona mesmo antes da atualização do banco
    ...(music ? { p_music: music } : {}),
  });
  pokePush();
  return id;
}

// music: undefined = não mexe; null = remove; objeto = troca
export async function updatePost(id, { caption, location, music }) {
  const fields = { caption, location, edited_at: new Date().toISOString() };
  if (music !== undefined) fields.music = music;
  unwrap(await supabase.from('posts').update(fields).eq('id', id));
}

export async function deletePost(post) {
  const paths = [];
  for (const m of post.media || []) {
    if (m.path) paths.push(m.path);
    if (m.thumb_path && m.thumb_path !== m.path) paths.push(m.thumb_path);
  }
  if (paths.length) await supabase.storage.from('media').remove(paths);
  unwrap(await supabase.from('posts').delete().eq('id', post.id));
}

export async function like(post, character) {
  const { error } = await supabase.from('likes').insert({ post_id: post, character_id: character });
  if (error && error.code !== '23505') throw error;
  if (!error) pokePush();
}
export async function unlike(post, character) {
  unwrap(await supabase.from('likes').delete().eq('post_id', post).eq('character_id', character));
}
export async function save(post, character) {
  const { error } = await supabase.from('saves').insert({ post_id: post, character_id: character });
  if (error && error.code !== '23505') throw error;
}
export async function unsave(post, character) {
  unwrap(await supabase.from('saves').delete().eq('post_id', post).eq('character_id', character));
}

// ---------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------
export const comments = (post, viewer) => rpc('post_comments', { p_post: post, p_viewer: viewer });

export async function addComment({ post, character, body, parent }) {
  const row = unwrap(
    await supabase
      .from('comments')
      .insert({ post_id: post, character_id: character, body: body.trim(), parent_id: parent || null })
      .select('id, created_at')
      .single()
  );
  pokePush();
  return row;
}
export async function deleteComment(id) {
  unwrap(await supabase.from('comments').delete().eq('id', id));
}
export async function likeComment(comment, character) {
  const { error } = await supabase.from('comment_likes').insert({ comment_id: comment, character_id: character });
  if (error && error.code !== '23505') throw error;
  if (!error) pokePush();
}
export async function unlikeComment(comment, character) {
  unwrap(await supabase.from('comment_likes').delete().eq('comment_id', comment).eq('character_id', character));
}

// ---------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------
export const storiesTray = (viewer) => rpc('stories_tray', { p_viewer: viewer });
export const characterStories = (character, viewer) =>
  rpc('character_stories', { p_character: character, p_viewer: viewer });
export const storyViewers = (story) => rpc('story_viewers', { p_story: story });

export async function createStory({ character, path, thumbPath, width, height, music, audience }) {
  const row = { character_id: character, path, width, height };
  if (thumbPath) row.thumb_path = thumbPath; // só com o banco atualizado (destaques)
  if (audience === 'close_friends') row.audience = 'close_friends'; // só com melhores amigos
  if (music) row.music = music;
  const created = unwrap(await supabase.from('stories').insert(row).select('id').single());
  pokePush();
  return created;
}
export async function markStorySeen(story, character) {
  await supabase
    .from('story_views')
    .upsert({ story_id: story, character_id: character }, { onConflict: 'story_id,character_id', ignoreDuplicates: true });
}
// Excluir de vez: sai dos destaques, apaga a foto e a miniatura, depois o story
export async function deleteStory(story, { highlights = false } = {}) {
  if (highlights) unwrap(await supabase.from('highlight_items').delete().eq('story_id', story.id));
  const files = [story.path, story.thumb_path].filter(Boolean);
  if (files.length) await supabase.storage.from('media').remove(files);
  unwrap(await supabase.from('stories').delete().eq('id', story.id));
}

// Libera espaço: com o banco atualizado, apaga stories vencidos há mais de
// 30 dias que não estão em nenhum destaque (o arquivo de 30 dias fica);
// sem a atualização, apaga os vencidos há mais de 24 h, como antes.
export async function cleanupExpiredStories(characterIds, { archive = false } = {}) {
  if (!characterIds?.length) return;
  let list;
  if (archive) {
    list = (await rpc('stories_to_cleanup', { p_characters: characterIds })) || [];
  } else {
    const { data } = await supabase
      .from('stories')
      .select('id, path')
      .in('character_id', characterIds)
      .lt('expires_at', new Date().toISOString())
      .limit(100);
    list = data || [];
  }
  if (!list.length) return;
  await supabase.storage.from('media').remove(list.flatMap((s) => [s.path, s.thumb_path]).filter(Boolean));
  await supabase.from('stories').delete().in('id', list.map((s) => s.id));
}

// ---------------------------------------------------------------------
// Destaques
// ---------------------------------------------------------------------
export const characterHighlights = (character, story) =>
  rpc('character_highlights', { p_character: character, p_story: story ?? null });
export const getHighlight = (id, viewer) => rpc('get_highlight', { p_highlight: id, p_viewer: viewer });
export const storyArchive = (character, before) =>
  rpc('story_archive', { p_character: character, p_before: before ?? null, p_limit: 60 });
export const saveHighlight = ({ id, character, title, stories, cover }) =>
  rpc('save_highlight', { p_character: character, p_title: title, p_stories: stories, p_cover: cover ?? null, p_highlight: id ?? null });

export async function addToHighlight(highlight, story) {
  const { error } = await supabase.from('highlight_items').insert({ highlight_id: highlight, story_id: story });
  if (error && error.code !== '23505') throw error;
}
export async function removeFromHighlight(highlight, story) {
  unwrap(await supabase.from('highlight_items').delete().eq('highlight_id', highlight).eq('story_id', story));
}
export async function deleteHighlight(id) {
  unwrap(await supabase.from('highlights').delete().eq('id', id));
}

// ---------------------------------------------------------------------
// Notas (topo do Direct)
// ---------------------------------------------------------------------
export const notesTray = (viewer) => rpc('notes_tray', { p_viewer: viewer });
// audience ('all' | 'close_friends') só vai quando o banco tem melhores amigos
export const setNote = (character, body, music, audience) =>
  rpc('set_note', { p_character: character, p_body: body || '', p_music: music ?? null, ...(audience ? { p_audience: audience } : {}) });
export async function deleteNote(character) {
  unwrap(await supabase.from('notes').delete().eq('character_id', character));
}

// ---------------------------------------------------------------------
// Melhores amigos (cada personagem tem a sua lista; só o dono vê)
// ---------------------------------------------------------------------
export const closeFriendsList = (character, query) =>
  rpc('close_friends_list', { p_character: character, p_query: query?.trim() || null });
export async function setCloseFriend(character, friend, on) {
  if (on) {
    const { error } = await supabase.from('close_friends').insert({ character_id: character, friend_id: friend });
    if (error && error.code !== '23505') throw error; // já estava na lista
  } else {
    unwrap(await supabase.from('close_friends').delete().eq('character_id', character).eq('friend_id', friend));
  }
}

// ---------------------------------------------------------------------
// Notificações
// ---------------------------------------------------------------------
export const notifications = (viewer, before) =>
  rpc('get_notifications', { p_viewer: viewer, p_before: before ?? null, p_limit: 40 });
export const unreadCounts = () => rpc('unread_counts');

export async function markNotificationsRead(viewer) {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', viewer)
    .is('read_at', null);
}

// ---------------------------------------------------------------------
// Direct (mensagens)
// ---------------------------------------------------------------------
export const inbox = (viewer) => rpc('inbox', { p_viewer: viewer });
export const conversationInfo = (conv, viewer) => rpc('conversation_info', { p_conversation: conv, p_viewer: viewer });
export const getMessages = (conv, { before, after, limit = 40 } = {}) =>
  rpc('get_messages', { p_conversation: conv, p_before: before ?? null, p_after: after ?? null, p_limit: limit });
export const startConversation = (from, to, title) =>
  rpc('start_conversation', { p_from: from, p_to: to, p_title: title ?? null });

export async function sendMessage({ conversation, sender, kind = 'text', body, media, post, story, replyTo, noteBody }) {
  const row = { conversation_id: conversation, sender_id: sender, kind, body: body?.trim() || null };
  if (replyTo) row.reply_to = replyTo; // só manda quando é resposta (funciona antes da atualização do banco)
  if (noteBody) row.note_body = noteBody.slice(0, 200); // texto da nota respondida
  if (media) Object.assign(row, { media_path: media.path, media_width: media.width, media_height: media.height });
  if (post) row.post_id = post;
  if (story) row.story_id = story;
  const created = unwrap(await supabase.from('messages').insert(row).select('id, created_at').single());
  pokePush();
  return created;
}
export async function markConversationRead(conv, character) {
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conv)
    .eq('character_id', character);
}
export async function renameConversation(conv, title) {
  unwrap(await supabase.from('conversations').update({ title: title.trim() || null }).eq('id', conv));
}
export async function leaveConversation(conv, character) {
  unwrap(await supabase.from('conversation_members').delete().eq('conversation_id', conv).eq('character_id', character));
}
export async function deleteMessage(msg) {
  if (msg.media_path) await supabase.storage.from('media').remove([msg.media_path]);
  unwrap(await supabase.from('messages').delete().eq('id', msg.id));
}

// ---------------------------------------------------------------------
// Admin (mestre)
// ---------------------------------------------------------------------
export const admin = {
  overview: () => rpc('admin_overview'),
  setInviteCode: (code) => rpc('admin_set_invite_code', { p_code: code }),
  setAdmin: (player, value) => rpc('admin_set_admin', { p_player: player, p_value: value }),
  setVerified: (character, value) => rpc('admin_set_verified', { p_character: character, p_value: value }),
  resetPassword: (player, password) => rpc('admin_reset_password', { p_player: player, p_password: password }),
};

// ---------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------
function randomName(ext = 'jpg') {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rnd}.${ext}`;
}

// kind: posts | stories | avatars | dm
export async function uploadImage(uid, characterId, kind, blob) {
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/${characterId}/${kind}/${randomName(ext)}`;
  unwrap(
    await supabase.storage.from('media').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
  );
  return path;
}

export async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (list.length) await supabase.storage.from('media').remove(list);
}

// Apaga todos os arquivos de uma pasta (usado ao excluir personagem)
async function removeFolder(prefix) {
  for (const sub of ['posts', 'stories', 'avatars', 'dm']) {
    for (let round = 0; round < 20; round++) {
      const { data } = await supabase.storage.from('media').list(`${prefix}/${sub}`, { limit: 100 });
      if (!data?.length) break;
      await supabase.storage.from('media').remove(data.map((f) => `${prefix}/${sub}/${f.name}`));
      if (data.length < 100) break;
    }
  }
}

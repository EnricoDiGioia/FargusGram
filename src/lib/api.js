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

export async function createStory({ character, path, width, height, music }) {
  const row = { character_id: character, path, width, height };
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
export async function deleteStory(story) {
  if (story.path) await supabase.storage.from('media').remove([story.path]);
  unwrap(await supabase.from('stories').delete().eq('id', story.id));
}

// Apaga stories vencidos (mais de 24h) dos meus personagens, liberando espaço
export async function cleanupExpiredStories(characterIds) {
  if (!characterIds?.length) return;
  const { data } = await supabase
    .from('stories')
    .select('id, path')
    .in('character_id', characterIds)
    .lt('expires_at', new Date().toISOString())
    .limit(100);
  if (!data?.length) return;
  await supabase.storage.from('media').remove(data.map((s) => s.path));
  await supabase.from('stories').delete().in('id', data.map((s) => s.id));
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
export const getMessages = (conv, { before, after } = {}) =>
  rpc('get_messages', { p_conversation: conv, p_before: before ?? null, p_after: after ?? null, p_limit: 40 });
export const startConversation = (from, to, title) =>
  rpc('start_conversation', { p_from: from, p_to: to, p_title: title ?? null });

export async function sendMessage({ conversation, sender, kind = 'text', body, media, post, story }) {
  const row = { conversation_id: conversation, sender_id: sender, kind, body: body?.trim() || null };
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

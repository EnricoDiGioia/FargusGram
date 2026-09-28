// Notificações no celular (Web Push).
//
// Como funciona: quando alguém curte, comenta, manda mensagem etc., o banco
// põe um aviso numa fila. O app chama a função "push" do Supabase logo depois
// de cada ação, e ela entrega os avisos da fila para os aparelhos cadastrados.
// Cada aparelho se cadastra aqui (enablePush), com a permissão do navegador.
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase';
import { isStandalone, platform } from './pwa';
import { local } from './storage';

const FN_URL = `${SUPABASE_URL}/functions/v1/push`;
const OWNER_KEY = 'fg-push-owner'; // jogador que ativou as notificações neste aparelho

// Tipos de aviso (a ordem é a das Configurações)
export const PUSH_KINDS = [
  { id: 'message', label: 'Mensagens do Direct', def: true },
  { id: 'comment', label: 'Comentários e respostas', def: true },
  { id: 'mention', label: 'Menções e marcações', def: true },
  { id: 'like', label: 'Curtidas', def: true },
  { id: 'follow', label: 'Novos seguidores', def: true },
  { id: 'post', label: 'Publicações de quem você segue', def: true },
  { id: 'story', label: 'Stories de quem você segue', def: false },
];

export function prefOn(prefs, kind) {
  const v = prefs?.[kind];
  if (typeof v === 'boolean') return v;
  return PUSH_KINDS.find((k) => k.id === kind)?.def ?? true;
}

export function mutedList(prefs) {
  return Array.isArray(prefs?.muted) ? prefs.muted.filter((x) => typeof x === 'string') : [];
}

export class PushError extends Error {}

const MSG = {
  noFunction:
    'Não encontrei a função "push" no Supabase. O admin precisa criá-la uma vez (veja no README a parte "Notificações no celular").',
  verifyJwt: 'O Supabase recusou a chamada. Na função "push" do Supabase, desligue a opção "Verify JWT" (veja o README).',
  noDb: 'O banco ainda não tem a atualização de notificações. O admin precisa rodar o arquivo supabase/atualizacoes/2026-09-notificacoes.sql no SQL Editor do Supabase.',
  denied: 'As notificações estão bloqueadas para o FargusGram neste aparelho. Libere nas configurações do celular (ou do navegador) e tente de novo.',
};

// ---------------------------------------------------------------------
// O aparelho aceita notificações?
// ---------------------------------------------------------------------
// reason: null (dá) | 'ios-install' (instalar na tela de início) | 'ios-old' | 'unsupported' | 'dev'
export function pushSupport() {
  if (typeof window === 'undefined') return { ok: false, reason: 'unsupported' };
  const p = platform();
  if (p.ios && !isStandalone()) return { ok: false, reason: 'ios-install' };
  const has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!has) return { ok: false, reason: p.ios ? 'ios-old' : 'unsupported' };
  if (import.meta.env?.DEV && !navigator.serviceWorker.controller) return { ok: false, reason: 'dev' };
  return { ok: true, reason: null, permission: Notification.permission };
}

function registration() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new PushError('O app ainda está carregando. Tente de novo em alguns segundos.')), 8000)),
  ]);
}

// ---------------------------------------------------------------------
// Conversa com a função "push"
// ---------------------------------------------------------------------
async function callFunction(action, { keepalive = false } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new PushError('Entre no app primeiro.');
  let res;
  try {
    res = await fetch(FN_URL, {
      method: 'POST',
      keepalive,
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
  } catch {
    // sem a função, o Supabase responde sem liberar o acesso do navegador (CORS)
    throw new PushError(navigator.onLine === false ? 'Sem internet.' : MSG.noFunction);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* resposta sem JSON */
  }
  if (res.status === 404) throw new PushError(MSG.noFunction);
  if (res.status === 401) {
    throw new PushError(body?.error === 'Entre no app para usar as notificações.' ? 'Sua sessão expirou. Entre de novo.' : MSG.verifyJwt);
  }
  if (!res.ok) {
    const detail = body?.error || body?.message || `erro ${res.status}`;
    throw new PushError(/push_take|push_queue|push_config|does not exist/i.test(detail) ? MSG.noDb : `A função de notificações deu erro: ${detail}`);
  }
  return body || {};
}

let keyPromise = null;
let keyFailedAt = 0;
// Chave pública do servidor (busca antes do toque, porque o iPhone exige
// que o pedido de permissão aconteça logo em seguida ao toque).
// quiet: não tenta de novo por 10 min se a função ainda não existe (convites automáticos).
export function prefetchPushKey({ quiet = false } = {}) {
  if (!keyPromise && quiet && Date.now() - keyFailedAt < 10 * 60 * 1000) return Promise.reject(new PushError(MSG.noFunction));
  keyPromise ??= callFunction('key').then(
    (r) => {
      if (!r.publicKey) throw new PushError(MSG.noFunction);
      return r.publicKey;
    },
    (err) => {
      keyPromise = null;
      keyFailedAt = Date.now();
      throw err;
    }
  );
  return keyPromise;
}

function keyBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sameKey(sub, key) {
  const k = sub?.options?.applicationServerKey;
  if (!k) return true; // alguns navegadores não informam: confiamos
  const a = new Uint8Array(k);
  const b = keyBytes(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function saveSubscription(sub) {
  const json = sub.toJSON();
  const { error } = await supabase.rpc('push_register', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_origin: window.location.origin,
    p_user_agent: navigator.userAgent.slice(0, 400),
  });
  if (error) {
    if (error.code === 'PGRST202' || /push_register/.test(error.message || '')) throw new PushError(MSG.noDb);
    throw new PushError(error.message || 'Não deu para cadastrar este aparelho.');
  }
}

// ---------------------------------------------------------------------
// Ligar e desligar neste aparelho
// ---------------------------------------------------------------------
// Chamar direto no toque do botão.
export async function enablePush(uid) {
  if (!pushSupport().ok) throw new PushError('Este aparelho não recebe notificações.');
  // 1) permissão primeiro, ainda "dentro" do toque
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new PushError(perm === 'denied' ? MSG.denied : 'Você não permitiu as notificações.');
  }
  if (Notification.permission === 'denied') throw new PushError(MSG.denied);
  // 2) assinatura do navegador com a chave do servidor
  const [reg, key] = await Promise.all([registration(), prefetchPushKey()]);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    } catch (err) {
      if (err?.name === 'NotAllowedError') throw new PushError(MSG.denied);
      throw new PushError(`O navegador não conseguiu ativar as notificações (${err?.message || err}).`);
    }
  }
  // 3) cadastro no banco
  await saveSubscription(sub);
  local.set(OWNER_KEY, uid);
  return true;
}

async function currentSubscription() {
  if (!pushSupport().ok) return null;
  try {
    const reg = await registration();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) {
    await supabase.rpc('push_unregister', { p_endpoint: sub.endpoint }); // devolve { error } em vez de falhar
    await sub.unsubscribe().catch(() => {});
  }
  local.set(OWNER_KEY, null);
}

// Está ligado neste aparelho para este jogador?
export async function pushEnabled(uid) {
  const s = pushSupport();
  if (!s.ok || s.permission !== 'granted' || local.get(OWNER_KEY) !== uid) return false;
  return !!(await currentSubscription());
}

// Ao abrir o app: confere a assinatura e avisa o servidor (ela pode mudar)
export async function syncPush(uid) {
  try {
    const s = pushSupport();
    if (!s.ok || s.permission !== 'granted' || local.get(OWNER_KEY) !== uid) return;
    const [reg, key] = await Promise.all([registration(), prefetchPushKey()]);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await saveSubscription(sub);
  } catch {
    /* tenta de novo na próxima vez */
  }
}

// Ao sair da conta: este aparelho para de receber avisos desse jogador
export async function pushLogout() {
  try {
    if (local.get(OWNER_KEY)) await disablePush();
  } catch {
    /* sair nunca pode falhar por causa disso */
  }
}

export async function sendTestPush() {
  return callFunction('test');
}

// ---------------------------------------------------------------------
// Avisa a função depois de cada ação (curtir, comentar, mandar mensagem...)
// ---------------------------------------------------------------------
let pokeTimer = null;
let pokeOff = false;
export function pokePush() {
  if (pokeOff || typeof window === 'undefined') return;
  clearTimeout(pokeTimer);
  pokeTimer = setTimeout(() => {
    callFunction('send', { keepalive: true }).catch((err) => {
      // função ainda não criada: não fica tentando a cada curtida
      if (err instanceof PushError && (err.message === MSG.noFunction || err.message === MSG.verifyJwt || err.message === MSG.noDb)) pokeOff = true;
    });
  }, 150);
}

// Número no ícone do app (iPhone com o app instalado, Android e computador)
export function setAppBadge(n) {
  try {
    if (!('setAppBadge' in navigator)) return;
    const p = n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge();
    p?.catch?.(() => {});
  } catch {
    /* sem suporte */
  }
}

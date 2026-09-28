// =====================================================================
//  FargusGram — função "push": manda as notificações para os celulares
//
//  Como criar no Supabase (uma vez só): Edge Functions → Deploy a new
//  function → Via Editor, nome "push", cole este arquivo inteiro e clique
//  em Deploy. Depois, em Details, desligue "Verify JWT" (a própria função
//  confere o login). O passo a passo completo está no README.
//
//  Não precisa configurar nada: as chaves de envio (VAPID) são criadas na
//  primeira vez e ficam guardadas no banco, na tabela push_config.
//
//  O app chama esta função depois de curtir, comentar, mandar mensagem
//  etc. Ela pega os avisos que os gatilhos do banco deixaram na fila
//  (push_queue) e entrega para os aparelhos de cada jogador (Web Push).
// =====================================================================
import postgres from 'npm:postgres@3.4.7';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? '';
// Só para testes locais: aceita servidores de push fora da lista abaixo
const ALLOW_ANY_ENDPOINT = Deno.env.get('PUSH_ALLOW_ANY_ENDPOINT') === '1';

const sql = postgres(DB_URL, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10, ssl: 'prefer' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const enc = new TextEncoder();

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(str: string) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

async function pool(tasks: (() => Promise<void>)[], size: number) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
}

function withParam(url: string, key: string, value: string | null) {
  if (!value) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
}

// ---------------------------------------------------------------------
// Chaves VAPID (identificam este servidor para Google, Apple e Mozilla)
// ---------------------------------------------------------------------
type Keys = { publicKey: string; privateKey: CryptoKey };
let keysPromise: Promise<Keys> | null = null;

function vapidKeys(): Promise<Keys> {
  keysPromise ??= loadKeys().catch((err) => {
    keysPromise = null;
    throw err;
  });
  return keysPromise;
}

async function loadKeys(): Promise<Keys> {
  let rows = await sql`select public_key, private_jwk from public.push_config where id`;
  if (!rows.length) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const stored = { kty: jwk.kty ?? 'EC', crv: jwk.crv ?? 'P-256', x: jwk.x ?? '', y: jwk.y ?? '', d: jwk.d ?? '' };
    await sql`
      insert into public.push_config (id, public_key, private_jwk)
      values (true, ${publicKey}, ${sql.json(stored)}::jsonb)
      on conflict (id) do nothing`;
    rows = await sql`select public_key, private_jwk from public.push_config where id`;
  }
  const stored = typeof rows[0].private_jwk === 'string' ? JSON.parse(rows[0].private_jwk) : rows[0].private_jwk;
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty: stored.kty, crv: stored.crv, x: stored.x, y: stored.y, d: stored.d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  return { publicKey: rows[0].public_key, privateKey };
}

// JWT assinado que acompanha cada envio (RFC 8292)
const jwtCache = new Map<string, { token: string; exp: number }>();

async function vapidHeader(endpoint: string, keys: Keys, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const cacheKey = `${aud} ${subject}`;
  const hit = jwtCache.get(cacheKey);
  if (hit && hit.exp - now > 3600) return `vapid t=${hit.token}, k=${keys.publicKey}`;
  const exp = now + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp, sub: subject })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, enc.encode(`${head}.${claims}`));
  const token = `${head}.${claims}.${b64u(new Uint8Array(signature))}`;
  jwtCache.set(cacheKey, { token, exp });
  return `vapid t=${token}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------------
// Criptografia do conteúdo (RFC 8291, aes128gcm): só o aparelho lê
// ---------------------------------------------------------------------
async function encryptPayload(payload: Uint8Array, p256dh: string, authSecret: string) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(payload, new Uint8Array([2])); // 2 = último (e único) bloco
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// ---------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------
type Sub = { id: number; endpoint: string; p256dh: string; auth: string; origin: string | null };
type Item = {
  id: number;
  player_id: string;
  character_id: string | null;
  kind: string;
  title: string;
  body: string;
  url: string;
  tag: string | null;
  badge: number;
  subs: Sub[];
};
type ItemResult = { devices: number; ok: number; errors: string[] };

// Servidores de push dos navegadores (Chrome/Android, Safari/iPhone, Firefox, Edge)
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    if (ALLOW_ANY_ENDPOINT) return true;
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

function subjectFor(sub: Sub) {
  return sub.origin && /^https:\/\//.test(sub.origin) ? sub.origin : 'mailto:fargusgram@users.noreply.github.com';
}

async function sendOne(sub: Sub, payload: string, keys: Keys, kind: string) {
  const body = await encryptPayload(enc.encode(payload), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, keys, subjectFor(sub)),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: kind === 'message' ? '86400' : kind === 'test' ? '600' : '21600',
      Urgency: kind === 'message' || kind === 'test' ? 'high' : 'normal',
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const text = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 200);
  if (res.ok) await res.body?.cancel().catch(() => {});
  return { status: res.status, text };
}

async function sendPending(keys: Keys) {
  const byItem = new Map<number, ItemResult>();
  const ok: number[] = [];
  const gone: number[] = [];
  const failed: number[] = [];
  let sent = 0;

  for (let round = 0; round < 5; round++) {
    const [{ v }] = await sql`select public.push_take(200) as v`;
    const items: Item[] = typeof v === 'string' ? JSON.parse(v) : v;
    if (!items.length) break;
    const tasks: (() => Promise<void>)[] = [];
    for (const it of items) {
      const result: ItemResult = { devices: it.subs.length, ok: 0, errors: [] };
      byItem.set(Number(it.id), result);
      const payload = JSON.stringify({
        title: it.title,
        body: it.body,
        url: withParam(it.url, 'como', it.character_id),
        tag: it.tag || undefined,
        badge: it.badge,
        kind: it.kind,
      });
      for (const sub of it.subs) {
        tasks.push(async () => {
          const host = (() => {
            try {
              return new URL(sub.endpoint).hostname;
            } catch {
              return 'endereço inválido';
            }
          })();
          if (!allowedEndpoint(sub.endpoint)) {
            failed.push(sub.id);
            result.errors.push(`${host}: servidor de push desconhecido`);
            return;
          }
          try {
            const r = await sendOne(sub, payload, keys, it.kind);
            if (r.status >= 200 && r.status < 300) {
              ok.push(sub.id);
              result.ok++;
              sent++;
            } else if (r.status === 404 || r.status === 410) {
              gone.push(sub.id); // o aparelho desativou ou desinstalou
              result.errors.push(`${host}: este aparelho não recebe mais (${r.status})`);
            } else {
              failed.push(sub.id);
              result.errors.push(`${host}: ${r.status} ${r.text}`.trim());
              console.error('push falhou', host, r.status, r.text);
            }
          } catch (err) {
            failed.push(sub.id);
            result.errors.push(`${host}: ${(err as Error)?.message ?? err}`);
            console.error('push falhou', host, err);
          }
        });
      }
    }
    await pool(tasks, 8);
    if (items.length < 200) break;
  }

  if (ok.length || gone.length || failed.length) {
    await sql`select public.push_done(${sql.json({ ok, gone, failed })}::jsonb)`;
  }
  return { sent, byItem };
}

// ---------------------------------------------------------------------
// Quem está chamando? (tem que ser alguém logado no app)
// ---------------------------------------------------------------------
const userCache = new Map<string, { id: string; until: number }>();

async function currentUser(req: Request): Promise<{ id: string } | null> {
  const authorization = req.headers.get('Authorization') ?? '';
  const apikey = req.headers.get('apikey') ?? '';
  if (!/^Bearer\s+\S+/.test(authorization) || !apikey) return null;
  const hit = userCache.get(authorization);
  if (hit && hit.until > Date.now()) return { id: hit.id };
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authorization, apikey } });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const user = await res.json().catch(() => null);
  if (!user?.id) return null;
  if (userCache.size > 500) userCache.clear();
  userCache.set(authorization, { id: user.id, until: Date.now() + 5 * 60 * 1000 });
  return { id: user.id };
}

// ---------------------------------------------------------------------
// Entrada
//   { "action": "send" }  manda os avisos pendentes (o app chama depois de cada ação)
//   { "action": "key" }   devolve a chave pública para o aparelho se cadastrar
//   { "action": "test" }  manda um aviso de teste para os aparelhos de quem chamou
// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    if (!DB_URL || !SUPABASE_URL) return json({ error: 'A função precisa rodar dentro do Supabase (faltam SUPABASE_URL e SUPABASE_DB_URL).' }, 500);
    const user = await currentUser(req);
    if (!user) return json({ error: 'Entre no app para usar as notificações.' }, 401);

    let action = 'send';
    try {
      const body = await req.json();
      if (typeof body?.action === 'string') action = body.action;
    } catch {
      /* sem corpo: envia os pendentes */
    }

    const keys = await vapidKeys();
    if (action === 'key') return json({ publicKey: keys.publicKey });

    if (action === 'test') {
      const [row] = await sql`
        insert into public.push_queue (player_id, kind, title, body, url, tag)
        values (${user.id}, 'test', 'FargusGram', 'Pronto! As notificações estão funcionando neste aparelho.', '#/configuracoes', 'teste')
        returning id`;
      const { byItem } = await sendPending(keys);
      return json(byItem.get(Number(row.id)) ?? { devices: 0, ok: 0, errors: [] });
    }

    const { sent } = await sendPending(keys);
    return json({ sent });
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error)?.message ?? String(err) }, 500);
  }
});

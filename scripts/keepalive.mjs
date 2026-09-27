// Faz uma consulta leve ao Supabase (usada pelo robô do GitHub a cada 3 dias).
// Também dá para rodar na mão: node scripts/keepalive.mjs
import { SUPABASE_URL, SUPABASE_KEY } from '../src/config.js';

if (SUPABASE_URL.includes('SEU-PROJETO') || SUPABASE_KEY.startsWith('COLE-AQUI')) {
  console.log('src/config.js ainda não foi configurado. Nada a fazer.');
  process.exit(0);
}

const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/check_invite_code`, {
  method: 'POST',
  headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ p_code: 'keepalive' }),
});

console.log(`Supabase respondeu ${res.status} em ${new Date().toISOString()}`);
if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}

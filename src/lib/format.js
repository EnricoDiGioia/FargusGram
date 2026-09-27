const nf = new Intl.NumberFormat('pt-BR');
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const hourMin = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

export function count(n) {
  n = Number(n) || 0;
  return n < 10000 ? nf.format(n) : compact.format(n);
}

export function plural(n, one, many) {
  return `${count(n)} ${Number(n) === 1 ? one : many}`;
}

function diffSeconds(date) {
  return Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
}

// "agora", "5 min", "3 h", "2 d", "4 sem", "12 de março"
export function timeShort(date) {
  const s = diffSeconds(date);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d`;
  if (s < 5 * 7 * 86400) return `${Math.floor(s / (7 * 86400))} sem`;
  return fullDate(date);
}

// "agora mesmo", "há 5 minutos", "há 3 horas", "há 2 dias", "12 de março"
export function timeLong(date) {
  const s = diffSeconds(date);
  if (s < 60) return 'agora mesmo';
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return `há ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  if (s < 7 * 86400) {
    const d = Math.floor(s / 86400);
    return `há ${d} ${d === 1 ? 'dia' : 'dias'}`;
  }
  return fullDate(date);
}

export function fullDate(date) {
  const d = new Date(date);
  return d.getFullYear() === new Date().getFullYear() ? dayMonth.format(d) : dayMonthYear.format(d);
}

// Separadores de conversa: "Hoje 14:32", "Ontem 09:10", "segunda-feira 20:00", "12 de março 18:00"
export function chatStamp(date) {
  const d = new Date(date);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const time = hourMin.format(d);
  if (days === 0) return `Hoje ${time}`;
  if (days === 1) return `Ontem ${time}`;
  if (days < 7) return `${weekday.format(d)} ${time}`;
  return `${fullDate(d)} ${time}`;
}

// Agrupamento das notificações
export function activityBucket(date) {
  const s = diffSeconds(date);
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Hoje';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  if (s < 7 * 86400) return 'Últimos 7 dias';
  if (s < 30 * 86400) return 'Últimos 30 dias';
  return 'Anteriores';
}

export function cleanHandle(v) {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 30);
}

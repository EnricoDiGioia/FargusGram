// De qual lista um post foi aberto (grade do perfil, marcados, salvos, reels,
// explorar, hashtag). A página do post usa isso para mostrar, logo abaixo, as
// próximas publicações da mesma lista, como no Instagram.
const lists = new Map(); // chave -> { items, done, fetch, getCursor, pageSize }

export function rememberList(key, snapshot) {
  if (key) lists.set(key, { ...snapshot, items: [...(snapshot.items || [])] });
}

export const getList = (key) => (key ? lists.get(key) || null : null);

// busca mais itens da lista (a próxima página da grade)
export async function growList(key) {
  const l = lists.get(key);
  if (!l || l.done || !l.fetch) return false;
  const last = l.items[l.items.length - 1];
  const page = (await l.fetch(last ? l.getCursor(last) : null)) || [];
  const seen = new Set(l.items.map((x) => x.id));
  l.items = [...l.items, ...page.filter((x) => !seen.has(x.id))];
  l.done = page.length < (l.pageSize || 30);
  return page.length > 0;
}

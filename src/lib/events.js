// Pequeno "rádio" interno: quando algo muda numa tela, as outras ficam sabendo.
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try {
      fn(payload);
    } catch (e) {
      console.error(e);
    }
  });
}

// Eventos usados:
//  post:update  { id, patch }   — curtida, salvar, legenda...
//  post:delete  id
//  post:create  post
//  story:change
//  profile:change { id }
//  unread:refresh

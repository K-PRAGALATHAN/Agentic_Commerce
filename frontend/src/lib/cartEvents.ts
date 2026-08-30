// The assistant can create a cart, move items or check one out — all without the
// page that is currently on screen knowing anything happened. This is the nudge
// that tells those pages to re-read.
//
// A window event rather than a context because the listeners are route children
// rendered by <Routes>, so there are no props to thread through them.
const EVENT = 'carts-changed';

export function cartsChanged(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onCartsChanged(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

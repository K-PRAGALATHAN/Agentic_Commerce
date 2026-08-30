// Chat history shared between the sidebar (dropdown) and the chat panel.
// Stored per device in localStorage — this is the transcript you see, not the
// agent's own memory, which lives server-side in agent_memory.
export interface Convo { id: string; title: string; msgs: any[]; updatedAt: number; }

// The two assistants do different jobs, so they open differently. The merchant
// one never offers to buy anything — it has no cart and no checkout tool.
const GREETING_CUSTOMER = { role: 'assistant', text: 'Hi! What are you looking for? Try "show me shirts" or "buy a blue shirt under ₹600".' };
const GREETING_MERCHANT = { role: 'assistant', text: 'Ask me about your store — "how are sales this week?", "what is low on stock?", or "which customers came back?".' };

const key = (userId: string) => `csconvos:${userId}`;

// The sidebar and the panel both render this list from localStorage, and neither
// re-renders when the other writes. This is how they stay in step.
const EVENT = 'conversations-changed';

export function onConversationsChanged(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

// Deliberately NOT fired by upsertConvo: that runs on every keystroke-worth of
// message, and re-rendering the whole shell each time would be wasteful. Only
// structural changes — a conversation appearing or disappearing — need it.
function announce() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function listConvos(userId: string): Convo[] {
  try {
    return (JSON.parse(localStorage.getItem(key(userId)) || '[]') as Convo[])
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export function saveConvos(userId: string, convos: Convo[]) {
  try { localStorage.setItem(key(userId), JSON.stringify(convos)); } catch { /* quota or private mode */ }
}

export function exists(userId: string, id: string): boolean {
  return listConvos(userId).some((c) => c.id === id);
}

export function upsertConvo(userId: string, convo: Convo) {
  const before = listConvos(userId);
  saveConvos(userId, [convo, ...before.filter((c) => c.id !== convo.id)]);
  // A brand-new conversation IS structural, so the sidebar should learn about it.
  if (!before.some((c) => c.id === convo.id)) announce();
}

export function removeConvo(userId: string, id: string) {
  saveConvos(userId, listConvos(userId).filter((c) => c.id !== id));
  announce();
}

export function newConvo(userId?: string, isMerchant = false): Convo {
  if (userId) {
    const latest = listConvos(userId)[0];
    // Untouched = still just the greeting, so nothing is lost by reusing it.
    if (latest && latest.msgs.length <= 1 && latest.title === 'New chat') return latest;
  }
  const greeting = isMerchant ? GREETING_MERCHANT : GREETING_CUSTOMER;
  return { id: crypto.randomUUID(), title: 'New chat', msgs: [greeting], updatedAt: Date.now() };
}

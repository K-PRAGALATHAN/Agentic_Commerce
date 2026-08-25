// Chat history shared between the sidebar (dropdown) and the chat page.
export interface Convo { id: string; title: string; msgs: any[]; updatedAt: number; }

const GREETING = { role: 'assistant', text: 'Hi! What are you looking for? Try "show me shirts" or "buy a blue shirt under ₹600".' };
const key = (userId: string) => `csconvos:${userId}`;

export function listConvos(userId: string): Convo[] {
  try { return (JSON.parse(localStorage.getItem(key(userId)) || '[]') as Convo[]).sort((a, b) => b.updatedAt - a.updatedAt); }
  catch { return []; }
}
export function saveConvos(userId: string, convos: Convo[]) {
  try { localStorage.setItem(key(userId), JSON.stringify(convos)); } catch { /* ignore */ }
}
export function upsertConvo(userId: string, convo: Convo) {
  saveConvos(userId, [convo, ...listConvos(userId).filter((c) => c.id !== convo.id)]);
}
export function removeConvo(userId: string, id: string) {
  saveConvos(userId, listConvos(userId).filter((c) => c.id !== id));
}
export function newConvo(): Convo {
  return { id: crypto.randomUUID(), title: 'New chat', msgs: [GREETING], updatedAt: Date.now() };
}

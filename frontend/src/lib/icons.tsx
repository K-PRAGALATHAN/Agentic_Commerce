// Shared line icons (Shopify-admin style: 18px, 1.7 stroke, rounded joins).
const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const I = {
  home: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5"/><path d="M9.5 21v-6h5v6"/></svg>,
  orders: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M8 14h5"/></svg>,
  cart: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3h2.6l2.3 11.1a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6"/></svg>,
  products: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M20.6 12.4 12.4 20.6a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1-.6-1.6l.5-6.1A1.6 1.6 0 0 1 4.9 5.2l6.1-.5a2 2 0 0 1 1.6.6l8 8a1.4 1.4 0 0 1 0 2z"/><circle cx="8.4" cy="8.4" r="1.4"/></svg>,
  audit: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M4 20V10M9.3 20V4M14.7 20v-7M20 20V7"/></svg>,
  gear: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.61.79 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  logout: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>,
  chats: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M21 14a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>,

  customers: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a6.4 6.4 0 0 0-2-4.6"/></svg>,
  discount: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M8.5 15.5l7-7"/><circle cx="9" cy="9" r="1.4"/><circle cx="15" cy="15" r="1.4"/><path d="M20.6 12.4 12.4 20.6a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1-.6-1.6l.5-6.1A1.6 1.6 0 0 1 4.9 5.2l6.1-.5a2 2 0 0 1 1.6.6l8 8a1.4 1.4 0 0 1 0 2z"/></svg>,
  ledger: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,

  // top bar
  search: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  bell: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg>,
  bag: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><path d="M5.5 8h13l1 12H4.5z"/><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2"/></svg>,
  sparkle: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9z"/><path d="M18.5 15.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z"/></svg>,

  // rail controls
  chevronDown: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><path d="m6 9 6 6 6-6"/></svg>,
  chevronRight: () => <svg width="14" height="14" viewBox="0 0 24 24" {...s}><path d="m9 6 6 6-6 6"/></svg>,
  compose: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12.5 14 9 15l1-3.5z"/></svg>,
  expand: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><path d="M15 3h6v6M21 3l-7.5 7.5M9 21H3v-6M3 21l7.5-7.5"/></svg>,
  collapse: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><path d="M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7"/></svg>,
  close: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><path d="M18 6 6 18M6 6l12 12"/></svg>,
  back: () => <svg width="16" height="16" viewBox="0 0 24 24" {...s}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  send: () => <svg width="15" height="15" viewBox="0 0 24 24" {...s}><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
  check: () => <svg width="15" height="15" viewBox="0 0 24 24" {...s}><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>,

  // sizes used by the shell
  cartBig: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3h2.6l2.3 11.1a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6"/></svg>,
  cartSm: () => <svg width="13" height="13" viewBox="0 0 24 24" {...s}><circle cx="9" cy="20" r="1.3"/><circle cx="18" cy="20" r="1.3"/><path d="M2.5 3h2.6l2.3 11.1a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6"/></svg>,
  merchant: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M3 9l1.4-5h15.2L21 9M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M3 9h18"/></svg>,
  shop: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M3 9l1.4-5h15.2L21 9M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M3 9h18M9.5 13h5"/></svg>,
  left: () => <svg width="14" height="14" viewBox="0 0 24 24" {...s}><path d="m15 18-6-6 6-6"/></svg>,
  right: () => <svg width="14" height="14" viewBox="0 0 24 24" {...s}><path d="m9 18 6-6-6-6"/></svg>,
};

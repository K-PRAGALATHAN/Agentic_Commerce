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
  // The assistant mark: a cluster of petals, not a star. Filled shapes with
  // no stroke, so it keeps its weight at 15px in the composer and at 18px in
  // the top bar. Colour comes from currentColor — the button it sits in turns
  // orange when active, and an orange glyph on an orange ground is invisible.
  sparkle: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <circle cx="12" cy="12" r="2.55"/><circle cx="12.00" cy="5.50" r="3.0"/><circle cx="17.63" cy="8.75" r="2.65"/><circle cx="17.63" cy="15.25" r="3.0"/><circle cx="12.00" cy="18.50" r="2.65"/><circle cx="6.37" cy="15.25" r="3.0"/><circle cx="6.37" cy="8.75" r="2.65"/>
    </svg>
  ),

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

  // storefront: product cards and the product page
  heart: () => <svg width="15" height="15" viewBox="0 0 24 24" {...s}><path d="M12 20.3 4.3 12.9a4.6 4.6 0 0 1 0-6.6 4.8 4.8 0 0 1 6.7 0l1 1 1-1a4.8 4.8 0 0 1 6.7 0 4.6 4.6 0 0 1 0 6.6z"/></svg>,
  heartOn: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 20.3 4.3 12.9a4.6 4.6 0 0 1 0-6.6 4.8 4.8 0 0 1 6.7 0l1 1 1-1a4.8 4.8 0 0 1 6.7 0 4.6 4.6 0 0 1 0 6.6z"/></svg>,
  eye: () => <svg width="15" height="15" viewBox="0 0 24 24" {...s}><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12"/><circle cx="12" cy="12" r="2.7"/></svg>,
  star: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m12 3 2.7 5.9 6.3.7-4.7 4.3 1.3 6.3L12 17.1 6.4 20.2l1.3-6.3L3 9.6l6.3-.7z"/></svg>,
  minus: () => <svg width="14" height="14" viewBox="0 0 24 24" {...s}><path d="M5 12h14"/></svg>,
  plus: () => <svg width="14" height="14" viewBox="0 0 24 24" {...s}><path d="M12 5v14M5 12h14"/></svg>,
  link: () => <svg width="15" height="15" viewBox="0 0 24 24" {...s}><path d="M10 13a5 5 0 0 0 7.1 0l2.9-2.9a5 5 0 0 0-7.1-7.1L11.3 4.6"/><path d="M14 11a5 5 0 0 0-7.1 0L4 13.9a5 5 0 0 0 7.1 7.1l1.5-1.5"/></svg>,
  truck: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M3 16V6a1 1 0 0 1 1-1h9v11M13 8h4l4 4v4h-2"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>,
  shield: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M12 3l7.5 3v6c0 4.4-3.1 7.9-7.5 9-4.4-1.1-7.5-4.6-7.5-9V6z"/><path d="m9 12 2 2 4-4"/></svg>,

  // The brand mark: a cart drawn as a flat-topped zigzag basket over two
  // wheels. Redrawn as vector rather than dropped in as the source PNG, because
  // it has to render white on the dark top bar and stay crisp at 26px — a black
  // raster would be invisible there and soft everywhere else.
  logo: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={2.6} strokeLinecap="butt" strokeLinejoin="miter">
      <path d="M2.6 4.6h4.3l3.3 9.8 3.4-9.8h4.3l-3.4 9.8"/>
      <circle cx="9.6" cy="19.6" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="16.4" cy="19.6" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),

  // voice
  mic: () => <svg width="17" height="17" viewBox="0 0 24 24" {...s}><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/></svg>,
  speaker: () => <svg width="17" height="17" viewBox="0 0 24 24" {...s}><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.8 9.4a3.6 3.6 0 0 1 0 5.2"/></svg>,
  speakerOn: () => <svg width="17" height="17" viewBox="0 0 24 24" {...s}><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="M15.8 9.4a3.6 3.6 0 0 1 0 5.2M18.4 7a7.2 7.2 0 0 1 0 10"/></svg>,
  speakerOff: () => <svg width="17" height="17" viewBox="0 0 24 24" {...s}><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z"/><path d="m16 9.5 4 5M20 9.5l-4 5"/></svg>,
  eyeOff: () => <svg width="15" height="15" viewBox="0 0 24 24" {...s}><path d="M3 3l18 18"/><path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.2 8.3A16.6 16.6 0 0 0 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.8"/></svg>,
  refresh: () => <svg width="18" height="18" viewBox="0 0 24 24" {...s}><path d="M20.5 11a8.5 8.5 0 1 0-.8 5"/><path d="M20.5 5v6h-6"/></svg>,
};

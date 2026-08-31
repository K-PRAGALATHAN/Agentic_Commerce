// Voice: the transport in front of the existing agent.
//
// This is the cascade from plan/phase-6-voice-agent.md — speech in, text to the
// same `runner.handle()` every typed turn already goes through, speech out. What
// is NOT here is a second agent: no separate prompt loop, no separate memory, no
// separate guardrail. Voice is a way of talking to the assistant, not another
// assistant.
//
// STT and TTS come from the browser (Web Speech API) rather than a server. That
// is a deliberate trade:
//   + no API key, no audio ever leaves the machine for a third party we chose,
//     and no per-minute cost during a demo
//   - Chrome and Edge only, and the recogniser is the browser's, so we cannot
//     swap it for a better one
// The seam is `listen()` / `speak()`. Replacing them with a server pipeline
// later changes this file and nothing else.

export interface Heard {
  text: string;
  // 0..1 from the recogniser. Everything downstream that touches money reads
  // this rather than assuming the transcript is right.
  confidence: number;
}

type Rec = any; // SpeechRecognition is not in the DOM lib TypeScript ships

function Recogniser(): Rec | null {
  const w = window as any;
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return C ? new C() : null;
}

export const voiceSupported = () =>
  typeof window !== 'undefined' &&
  !!((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

// ---------------------------------------------------------------- money words
//
// The turns worth being careful about are the ones that move money. A quantity,
// a price, or a bare "yes" following a question are all cases where getting the
// transcript wrong costs the customer something real, so they trigger a
// read-back before anything is acted on.
// Spelled-out numbers are listed here as well as digits, so the check is correct
// on its own rather than correct because `normaliseNumbers` happened to run
// first — a missed read-back on a quantity is exactly what this prevents.
//
// "one" is deliberately absent. In speech it is a pronoun far more often than a
// number: "that one", "the cheaper one", "the blue one please". Including it put
// every second utterance through a read-back, which does not make the assistant
// careful, it makes it unusable.
const RISKY = new RegExp(
  // `\d+`, not `\d`. Wrapped in word boundaries a bare `\d` only matches a
  // ONE-DIGIT number: in "under 12500" the leading 1 has no boundary after it,
  // so the whole figure slipped past and a plain price statement — the exact
  // thing this guards — got no read-back.
  String.raw`\b(\d+|buy|order|purchase|checkout|check ?out|pay|confirm`
  + String.raw`|rupees?|rs\.?|₹`
  + String.raw`|two|three|four|five|six|seven|eight|nine|ten`
  + String.raw`|hundred|thousand|lakh)\b`,
  'i',
);

export const isRisky = (text: string) => RISKY.test(text);

// A spoken "yes" is the cheapest thing in the world to mishear — a cough, a
// television, someone else in the room. Consent to spend over a limit never
// comes from audio alone; see `confirm_over_limit` in the agent tools.
const CONSENT = /^\s*(yes|yeah|yep|yup|sure|ok|okay|confirm|go ahead|do it)\b/i;

export const isConsent = (text: string) => CONSENT.test(text);

// ---------------------------------------------------------------- normalising
//
// "seven hundred" and "₹700" are the same instruction in two shapes, and the
// store's parser reads digits. So spoken figures are converted before the turn
// is sent, and the converted figure is what gets read back — the customer hears
// our interpretation rather than their own words.
//
// The hard part is knowing when a number word is a NUMBER. An earlier version
// converted every one of them, which turned "the blue one please" into "the blue
// 1 please" — a corrupted search, sent to the agent, after a pointless
// confirmation. In speech "one" is usually a pronoun.
//
// So a run of number words is only converted when something around it says it is
// counting: it contains a scale word ("seven HUNDRED"), or it follows a price cue
// ("UNDER seven"), or it is followed by a currency ("seven RUPEES"). Otherwise
// the words are left exactly as spoken — the model reads "add two of those"
// perfectly well, and `isRisky` still catches it for the read-back.
const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, lakh: 100000 };

// Words that mean a figure is coming.
const CUE_BEFORE = new Set([
  'under', 'over', 'below', 'above', 'about', 'around', 'upto', 'within',
  'max', 'maximum', 'minimum', 'least', 'most', 'than', 'budget', 'costs',
  'price', 'priced', 'worth', 'rupees', 'rs',
]);
// Words that mean a figure just went past.
const CUE_AFTER = new Set(['rupees', 'rupee', 'rs', 'bucks']);

const clean = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '');

export function normaliseNumbers(text: string): string {
  const words = text.split(/\s+/);
  const out: string[] = [];

  let i = 0;
  while (i < words.length) {
    const w = clean(words[i]);
    if (!(w in UNITS) || w === '') { out.push(words[i]); i += 1; continue; }

    // Collect the whole run of number words starting here.
    const run: string[] = [];
    let acc = 0;
    let scaled = 0;
    let hasScale = false;
    let j = i;
    while (j < words.length) {
      const c = clean(words[j]);
      if (c in UNITS) { acc += UNITS[c]; run.push(words[j]); j += 1; continue; }
      if (c in SCALES) {
        hasScale = true;
        const mult = SCALES[c];
        if (mult >= 1000) { scaled = (scaled + (acc || 1)) * mult; acc = 0; }
        else { acc = (acc || 1) * mult; }
        run.push(words[j]); j += 1; continue;
      }
      // "seven hundred and five" — only if a number follows the "and".
      if (c === 'and' && j + 1 < words.length && clean(words[j + 1]) in UNITS) {
        run.push(words[j]); j += 1; continue;
      }
      break;
    }

    const before = i > 0 ? clean(words[i - 1]) : '';
    const after = j < words.length ? clean(words[j]) : '';
    const counting = hasScale || CUE_BEFORE.has(before) || CUE_AFTER.has(after);

    if (counting) out.push(String(scaled + acc));
    else out.push(...run);   // a pronoun, or a bare count the model reads fine
    i = j;
  }
  return out.join(' ');
}

// ---------------------------------------------------------------- diagnostics
//
// "The mic is not working" has at least five distinct causes and they need
// different fixes: no API in this browser, an insecure page, a blocked
// permission, no hardware, or no network for the recogniser. Guessing wastes
// the customer's time, so ask the browser and say which one it is.
export async function micTrouble(): Promise<string | null> {
  if (!voiceSupported()) {
    return 'This browser has no speech recognition. Chrome or Edge will work.';
  }
  // Chrome exposes the API on http://localhost as well as https, so a plain LAN
  // address is the usual reason this fires.
  if (!window.isSecureContext) {
    return 'Speech needs a secure page. Use localhost or https.';
  }
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    if (devices && !devices.some((d) => d.kind === 'audioinput')) {
      return 'No microphone is connected to this machine.';
    }
  } catch { /* enumerateDevices can be blocked; fall through to the live check */ }
  try {
    // The definitive test. Opening and immediately closing a stream is the only
    // way to tell a blocked permission from a missing device.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e: any) {
    if (e?.name === 'NotAllowedError') {
      return 'Microphone access is blocked. Click the icon in the address bar and allow it.';
    }
    if (e?.name === 'NotFoundError') return 'No microphone was found.';
    if (e?.name === 'NotReadableError') {
      return 'Another application is using the microphone.';
    }
    return `The microphone could not be opened (${e?.name ?? 'unknown'}).`;
  }
}

// ---------------------------------------------------------------- listening
export interface ListenHandle { stop: () => void; abort: () => void; }

export function listen(opts: {
  onPartial?: (text: string) => void;
  onFinal: (heard: Heard) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}): ListenHandle | null {
  const rec = Recogniser();
  if (!rec) return null;

  rec.lang = 'en-IN';
  rec.interimResults = true;
  // One utterance per turn. Continuous mode keeps the microphone open between
  // turns, which on a shared machine is a surprise nobody asked for.
  rec.continuous = false;
  rec.maxAlternatives = 1;

  let settled = false;

  rec.onresult = (e: any) => {
    let partial = '';
    for (let i = e.resultIndex; i < e.results.length; i += 1) {
      const r = e.results[i];
      if (r.isFinal) {
        settled = true;
        opts.onFinal({
          text: String(r[0].transcript).trim(),
          // Firefox and some Chromium builds report 0 for a perfectly good
          // result. Treating that as "no confidence" would fire a read-back on
          // every single turn, so an absent score is treated as unknown-but-fine
          // and the risky-phrase check carries the weight instead.
          confidence: typeof r[0].confidence === 'number' && r[0].confidence > 0
            ? r[0].confidence
            : 1,
        });
      } else {
        partial += r[0].transcript;
      }
    }
    if (partial) opts.onPartial?.(partial.trim());
  };

  rec.onerror = (e: any) => {
    const map: Record<string, string> = {
      'not-allowed': 'Microphone access was blocked. Allow it in the address bar and try again.',
      'no-speech': 'I did not hear anything.',
      'audio-capture': 'No microphone found.',
      network: 'Speech recognition needs a network connection.',
    };
    opts.onError?.(map[e.error] ?? `Speech recognition failed (${e.error}).`);
  };

  // Fires whether or not a final result arrived — a silent hold ends here too,
  // and the caller needs to drop out of its listening state either way.
  void settled;
  rec.onend = () => opts.onEnd?.();

  try { rec.start(); } catch { /* already running */ }
  return {
    stop: () => { try { rec.stop(); } catch { /* not running */ } },
    abort: () => { try { rec.abort(); } catch { /* not running */ } },
  };
}

// ---------------------------------------------------------------- speaking
let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice) return voice;
  const all = window.speechSynthesis.getVoices();
  if (!all.length) return null;
  voice =
    all.find((v) => /en-IN/i.test(v.lang)) ??
    all.find((v) => /en-GB/i.test(v.lang)) ??
    all.find((v) => /^en/i.test(v.lang)) ??
    all[0];
  return voice;
}

// Markdown reads terribly aloud: a customer should not hear "asterisk asterisk".
//
// Prices and ratings need care too. The first version matched only the digits
// before the decimal point, so "₹89.99" was spoken as "89 rupees.99" — the
// currency landed in the middle of the number. And "4.7★" left the star glyph
// in, which a synthesiser either names or swallows, neither of which is a
// rating.
//
// Prices are read exactly, not rounded. Rounding long figures reads more
// naturally, but a price is the one number a customer may act on, and saying a
// different one than the screen shows is not a rounding error, it is a wrong
// price.
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    // ₹1,899 -> "1899 rupees"; ₹89.99 -> "89.99 rupees"; ₹700.00 -> "700 rupees"
    // `[\d,]*\d` must END on a digit, so "₹1,899, sold by" does not swallow the
    // sentence comma along with the thousands separators and run two clauses
    // together.
    .replace(/₹\s?([\d,]*\d(?:\.\d+)?)/g, (_m, n) => {
      const clean = String(n).replace(/,/g, '').replace(/\.0+$/, '');
      return `${clean} rupees`;
    })
    .replace(/(\d(?:\.\d+)?)\s*★/g, '$1 stars')   // 4.7★ -> "4.7 stars"
    .replace(/★/g, '')                             // any stray ones
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speak(text: string, onDone?: () => void): void {
  if (!speechSupported()) { onDone?.(); return; }
  const synth = window.speechSynthesis;
  synth.cancel(); // barge-in: whatever was being said stops immediately
  const clean = speakable(text);
  if (!clean) { onDone?.(); return; }

  const u = new SpeechSynthesisUtterance(clean.slice(0, 700));
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 1.03;
  u.pitch = 1;
  u.onend = () => onDone?.();
  u.onerror = () => onDone?.();
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

// Voices load asynchronously in Chrome; without this the first utterance of a
// session falls back to the default voice.
if (typeof window !== 'undefined' && speechSupported()) {
  window.speechSynthesis.onvoiceschanged = () => { voice = null; pickVoice(); };
}

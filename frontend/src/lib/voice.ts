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
const RISKY = /\b(\d|buy|order|checkout|check out|pay|confirm|rupees?|rs\.?|₹|thousand|hundred)\b/i;

export const isRisky = (text: string) => RISKY.test(text);

// A spoken "yes" is the cheapest thing in the world to mishear — a cough, a
// television, someone else in the room. Consent to spend over a limit never
// comes from audio alone; see `confirm_over_limit` in the agent tools.
const CONSENT = /^\s*(yes|yeah|yep|yup|sure|ok|okay|confirm|go ahead|do it)\b/i;

export const isConsent = (text: string) => CONSENT.test(text);

// ---------------------------------------------------------------- normalising
//
// "seven hundred" and "₹700" and "7 hundred rupees" are the same instruction in
// three shapes. The agent's parser reads digits, so spoken numbers are converted
// before the turn is sent — and the converted figure is what gets read back, so
// the customer hears our interpretation rather than their own words.
const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1000, lakh: 100000 };

export function normaliseNumbers(text: string): string {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let acc = 0;      // the number being assembled
  let run = 0;      // how many words fed it, so we know whether one exists
  let scaled = 0;   // completed scale groups, e.g. the 700 of "seven hundred and five"

  const flush = () => {
    if (run) out.push(String(scaled + acc));
    acc = 0; run = 0; scaled = 0;
  };

  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (w in UNITS) { acc += UNITS[w]; run += 1; continue; }
    if (w in SCALES) {
      // "hundred" with nothing before it means one hundred.
      const mult = SCALES[w];
      if (mult >= 1000) { scaled = (scaled + (acc || 1)) * mult; acc = 0; }
      else { acc = (acc || 1) * mult; }
      run += 1;
      continue;
    }
    if (w === 'and' && run) { run += 1; continue; } // "seven hundred and five"
    flush();
    out.push(raw);
  }
  flush();
  return out.join(' ');
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

  rec.onend = () => { if (!settled) opts.onEnd?.(); else opts.onEnd?.(); };

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
// Prices are spoken as words so "₹1,299" does not come out as a digit stream.
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/₹\s?([\d,]+)/g, (_m, n) => `${String(n).replace(/,/g, '')} rupees`)
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

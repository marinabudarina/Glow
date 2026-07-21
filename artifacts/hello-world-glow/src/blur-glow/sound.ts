/**
 * Procedural sound effects — Web Audio API only, no audio files.
 *
 * AudioContext is created lazily and silently skipped if the browser
 * hasn't granted audio permission yet (e.g. before first user gesture).
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ?? (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Chrome suspends until first user gesture — try to resume, but don't block.
  if (ctx.state === "suspended") ctx.resume();
  return ctx.state === "running" ? ctx : null;
}

/** Try to unlock audio on first user interaction. */
export function unlockAudio() {
  const ac = getCtx();
  if (ac && ac.state === "suspended") ac.resume();
}

// ─── Typing click ──────────────────────────────────────────────────────────
// Short mechanical noise burst — like a vintage teletype or heavy keyboard.
export function playTypingClick() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;

  const DUR = 0.024;
  const bufSize = Math.ceil(ac.sampleRate * DUR);
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    // Sharp attack, very fast exponential decay
    const env = Math.exp(-i / (bufSize * 0.12));
    d[i] = (Math.random() * 2 - 1) * env;
  }

  const src = ac.createBufferSource();
  src.buffer = buf;

  // Bandpass: centre around 2.8 kHz for that clicky "thwack"
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2800;
  bp.Q.value = 0.7;

  // Second resonance peak — adds the low "thud" of the platen
  const lp = ac.createBiquadFilter();
  lp.type = "peaking";
  lp.frequency.value = 420;
  lp.gain.value = 8;
  lp.Q.value = 1.2;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.28, now);

  src.connect(bp);
  bp.connect(lp);
  lp.connect(gain);
  gain.connect(ac.destination);
  src.start(now);
}

// ─── Carriage return ───────────────────────────────────────────────────────
// Heavier clunk — played when the last character is typed.
export function playCarriageReturn() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;

  // Low thunk — noise shaped to emphasise 200–600 Hz
  const DUR = 0.12;
  const bufSize = Math.ceil(ac.sampleRate * DUR);
  const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) {
    const env = Math.exp(-i / (bufSize * 0.25));
    d[i] = (Math.random() * 2 - 1) * env;
  }

  const src = ac.createBufferSource();
  src.buffer = buf;

  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 700;

  // Metallic ping on top
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(340, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + DUR);

  const oscGain = ac.createGain();
  oscGain.gain.setValueAtTime(0.18, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + DUR);

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.35, now);

  src.connect(lp);
  lp.connect(noiseGain);
  noiseGain.connect(ac.destination);
  osc.connect(oscGain);
  oscGain.connect(ac.destination);

  src.start(now);
  osc.start(now);
  osc.stop(now + DUR);
}

// ─── Machine boot / power-up ───────────────────────────────────────────────
// CRT warm-up sweep + digital noise — fired when the glow phase begins.
export function playPowerUp() {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const DUR = 1.4;

  // ① Ascending sawtooth sweep — "robot waking up"
  const sweep = ac.createOscillator();
  sweep.type = "sawtooth";
  sweep.frequency.setValueAtTime(55, now);
  sweep.frequency.exponentialRampToValueAtTime(900, now + DUR * 0.6);
  sweep.frequency.exponentialRampToValueAtTime(440, now + DUR);

  const sweepGain = ac.createGain();
  sweepGain.gain.setValueAtTime(0.001, now);
  sweepGain.gain.linearRampToValueAtTime(0.12, now + 0.08);
  sweepGain.gain.exponentialRampToValueAtTime(0.001, now + DUR);

  // ② High-frequency digital noise burst — "data initialising"
  const nBufSize = Math.ceil(ac.sampleRate * 0.6);
  const nBuf = ac.createBuffer(1, nBufSize, ac.sampleRate);
  const nd = nBuf.getChannelData(0);
  for (let i = 0; i < nBufSize; i++) {
    const env = i < nBufSize * 0.1
      ? i / (nBufSize * 0.1)
      : Math.exp(-(i - nBufSize * 0.1) / (nBufSize * 0.5));
    nd[i] = (Math.random() * 2 - 1) * env;
  }
  const nSrc = ac.createBufferSource();
  nSrc.buffer = nBuf;

  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3000;

  const noiseGain = ac.createGain();
  noiseGain.gain.setValueAtTime(0.09, now + 0.05);

  // ③ Three quick blips — "online!"
  const BLIPS = [
    { t: DUR - 0.18, freq: 660, dur: 0.06 },
    { t: DUR - 0.10, freq: 880, dur: 0.06 },
    { t: DUR - 0.02, freq: 1320, dur: 0.1 },
  ];
  for (const b of BLIPS) {
    const o = ac.createOscillator();
    o.type = "square";
    o.frequency.value = b.freq;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.07, now + b.t);
    g.gain.exponentialRampToValueAtTime(0.001, now + b.t + b.dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(now + b.t);
    o.stop(now + b.t + b.dur + 0.01);
  }

  sweep.connect(sweepGain);
  sweepGain.connect(ac.destination);
  nSrc.connect(hp);
  hp.connect(noiseGain);
  noiseGain.connect(ac.destination);

  sweep.start(now);
  sweep.stop(now + DUR + 0.05);
  nSrc.start(now + 0.05);
}

// ─── Phrase transition ─────────────────────────────────────────────────────
// Robot "processing" sound — short square-wave blip pattern.
// wordIdx selects a slightly different pitch so each phrase feels distinct.
export function playPhraseBeep(wordIdx: number) {
  const ac = getCtx();
  if (!ac) return;
  const now = ac.currentTime;

  // Base pitch varies per phrase — stays in robot territory (200–700 Hz)
  const ROOT_FREQS = [220, 261, 294, 330, 370, 415];
  const root = ROOT_FREQS[wordIdx % ROOT_FREQS.length];

  // Pattern: two fast blips + one held tone — like old modem handshake
  const PATTERN = [
    { dt: 0.00, freq: root * 2, dur: 0.045 },
    { dt: 0.06, freq: root * 3, dur: 0.035 },
    { dt: 0.11, freq: root,     dur: 0.09  },
  ];

  for (const p of PATTERN) {
    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.value = p.freq;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.065, now + p.dt);
    g.gain.exponentialRampToValueAtTime(0.001, now + p.dt + p.dur);

    osc.connect(g);
    g.connect(ac.destination);
    osc.start(now + p.dt);
    osc.stop(now + p.dt + p.dur + 0.01);
  }
}

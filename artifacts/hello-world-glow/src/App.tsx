import { useEffect, useRef, useState, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import Spline from "@splinetool/react-spline";
import { BlurGlow } from "./blur-glow/engine";
import type { GlowConfig } from "./blur-glow/config";
import { DEFAULT_CONFIG, DEFAULT_INK_COLORS } from "./blur-glow/config";

// ─── URL helpers ─────────────────────────────────────────────────────────────
function parseURLPhrases(): string[] {
  try {
    const params = new URLSearchParams(window.location.search);
    const w = params.get("w");
    if (!w) return [];
    return w.split(",").map((s) => decodeURIComponent(s.trim())).filter(Boolean);
  } catch {
    return [];
  }
}

function buildGlowWords(phrases: string[]): string[] {
  if (phrases.length === 0) return [];
  return phrases.length === 1 ? Array(6).fill(phrases[0]) : phrases;
}

// ─── Spline error boundary ───────────────────────────────────────────────────
class SplineErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { error: boolean }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { error: false };
  }
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(_err: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error) {
      return this.props.fallback ?? <div className="spline-fallback">⌨️</div>;
    }
    return this.props.children;
  }
}

type Phase = "input" | "fadeOut" | "glow";

// ─── WebGL glow canvas ───────────────────────────────────────────────────────
function GlowCanvas({
  visible,
  config,
  engineRef,
}: {
  visible: boolean;
  config: GlowConfig;
  engineRef: React.MutableRefObject<BlurGlow | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const engine = new BlurGlow(hostRef.current, config);
    engineRef.current = engine;

    // Shutter sound on each phrase change
    const shutter = new Audio(`${import.meta.env.BASE_URL}shutter.mp3`);
    shutter.volume = 0.55;
    engine.onWordChange = () => {
      const s = shutter.cloneNode() as HTMLAudioElement;
      s.volume = 0.55;
      s.play().catch(() => {});
    };

    if (visible) engine.start();
    const onResize = () => engine.onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (visible) engineRef.current?.start();
  }, [visible]);

  return (
    <div
      ref={hostRef}
      className="glow-host"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.9s ease" }}
    />
  );
}

// ─── Main app ────────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState<Phase>("input");
  const [segments, setSegments] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  // The original (unexpanded) user phrases — used to build the shareable URL
  const [userPhrases, setUserPhrases] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const engineRef = useRef<BlurGlow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // On mount: auto-start glow if URL has ?w= phrases
  // Child (GlowCanvas) effects run before parent, so engineRef is set by the time this runs
  useEffect(() => {
    const phrases = parseURLPhrases();
    if (phrases.length > 0) {
      const words = buildGlowWords(phrases);
      engineRef.current?.configure({ words, phraseInkColors: DEFAULT_INK_COLORS });
      setUserPhrases(phrases);
      setPhase("glow");
    }
  }, []);

  // Focus hidden input in input phase
  useEffect(() => {
    if (phase === "input") inputRef.current?.focus();
  }, [phase]);

  // onChange — intercept "." to commit the current segment
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.endsWith(".")) {
      const trimmed = val.slice(0, -1).trim();
      if (trimmed) setSegments((prev) => [...prev, trimmed]);
      setCurrent("");
    } else {
      setCurrent(val);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        const allWords = [...segments, current.trim()].filter(Boolean);
        if (allWords.length === 0) return;
        const words = buildGlowWords(allWords);
        engineRef.current?.configure({ words, phraseInkColors: DEFAULT_INK_COLORS });
        setUserPhrases(allWords);
        setPhase("fadeOut");
        setTimeout(() => setPhase("glow"), 650);
      }
    },
    [segments, current]
  );

  // Copy iframe embed code to clipboard
  const handleCopy = useCallback(async () => {
    const base = window.location.origin + window.location.pathname;
    const param = userPhrases.map(encodeURIComponent).join(",");
    const url = `${base}?w=${param}`;
    const code = `<iframe src="${url}" frameborder="0" scrolling="no" style="border:none;display:block;width:100%;height:600px;overflow:hidden"></iframe>`;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // clipboard blocked — silently ignore
    }
  }, [userPhrases]);

  const handleOverlayClick = () => inputRef.current?.focus();

  const isInputPhase = phase === "input" || phase === "fadeOut";
  const inputOpacity = phase === "fadeOut" ? 0 : 1;
  const hasContent = segments.length > 0 || current.length > 0;

  return (
    <div className="root" onClick={handleOverlayClick}>

      {/* ── Top nav ── */}
      <nav className="top-nav" onClick={(e) => e.stopPropagation()}>
        <span className="nav-brand">Budarina</span>
        <button className="nav-about" onClick={() => setAboutOpen(true)}>about</button>
      </nav>

      {/* ── About popup ── */}
      {aboutOpen && (
        <div className="about-backdrop" onClick={() => setAboutOpen(false)}>
          <div className="about-card" onClick={(e) => e.stopPropagation()}>
            <button className="about-close" onClick={() => setAboutOpen(false)}>✕</button>
            <p className="about-created">Created by Marina Budarina</p>
            <p className="about-tagline">Trying to make internet fun again</p>
            <div className="about-links">
              <a href="https://budarina.design" target="_blank" rel="noreferrer">budarina.design</a>
              <a href="https://www.instagram.com/marina_uiux/" target="_blank" rel="noreferrer">Instagram</a>
              <a href="https://x.com/marina_uiux" target="_blank" rel="noreferrer">X</a>
              <a href="https://www.linkedin.com/in/marina-budarina/?skipRedirect=true" target="_blank" rel="noreferrer">LinkedIn</a>
            </div>
          </div>
        </div>
      )}
      {/* Glow layer — always mounted so it's ready */}
      <GlowCanvas visible={phase === "glow"} config={DEFAULT_CONFIG} engineRef={engineRef} />

      {/* Glow-phase bottom hint */}
      {phase === "glow" && (
        <p className="glow-hint">
          <span className="glow-copy-btn" onClick={handleCopy}>
            <kbd>{copied ? "copied!" : "copy"}</kbd>
          </span>{" "}
          to your website
        </p>
      )}

      {/* Input phase overlay */}
      {isInputPhase && (
        <div
          className="input-overlay"
          style={{ opacity: inputOpacity, transition: "opacity 0.6s ease" }}
        >
          {/* Typed text display */}
          <div className="typed-display">
            <span className="typed-prefix">print(</span>
            <span className="typed-quote">"</span>
            {hasContent && (
              <>
                {segments.map((seg, i) => (
                  <span key={i} className="typed-segment">
                    {seg}
                    <span className="typed-dot">.</span>
                  </span>
                ))}
                <span className="typed-chars">{current}</span>
              </>
            )}
            <span className="typed-cursor">▍</span>
            <span className="typed-quote">"</span>
            <span className="typed-prefix">)</span>
          </div>

          {/* Spline 3D keyboard */}
          <div className="spline-wrap" onClick={(e) => e.stopPropagation()}>
            <SplineErrorBoundary fallback={<div className="spline-fallback">⌨️</div>}>
              <Spline scene="https://prod.spline.design/H1LvhYkNlE0G22dJ/scene.splinecode" />
            </SplineErrorBoundary>
          </div>

          {/* Hint */}
          <p className="enter-hint">
            Press <kbd>.</kbd> to add a phrase · <kbd>Enter</kbd> to glow
          </p>

          {/* Hidden real input to capture keystrokes */}
          <input
            ref={inputRef}
            className="hidden-input"
            value={current}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}

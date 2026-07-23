import { useEffect, useRef, useState, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import Spline from "@splinetool/react-spline";
import { BlurGlow } from "./blur-glow/engine";
import type { GlowConfig } from "./blur-glow/config";
import { DEFAULT_CONFIG, DEFAULT_INK_COLORS } from "./blur-glow/config";

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
  componentDidCatch(_err: Error, _info: ErrorInfo) {
    // silently swallow — WebGL unavailable in some environments
  }
  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="spline-fallback">⌨️</div>
      );
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
  // segments = committed phrases (typed before a "."); current = what's being typed now
  const [segments, setSegments] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const engineRef = useRef<BlurGlow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus hidden input whenever we're in the input phase
  useEffect(() => {
    if (phase === "input") {
      inputRef.current?.focus();
    }
  }, [phase]);

  // onChange — intercept "." to commit the current segment
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.endsWith(".")) {
      const trimmed = val.slice(0, -1).trim();
      if (trimmed) {
        setSegments((prev) => [...prev, trimmed]);
      }
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

        let words: string[];

        if (allWords.length === 1) {
          // Single phrase: repeat 6 times so all palettes cycle on every pass
          words = Array(6).fill(allWords[0]);
        } else {
          words = allWords;
        }

        // Always use all 6 ink colours so every palette slot gets its matching ink
        engineRef.current?.configure({
          words,
          phraseInkColors: DEFAULT_INK_COLORS,
        });
        setPhase("fadeOut");
        setTimeout(() => setPhase("glow"), 650);
      }
    },
    [segments, current]
  );

  const handleOverlayClick = () => {
    inputRef.current?.focus();
  };

  const isInputPhase = phase === "input" || phase === "fadeOut";
  const inputOpacity = phase === "fadeOut" ? 0 : 1;
  const hasContent = segments.length > 0 || current.length > 0;

  return (
    <div className="root" onClick={handleOverlayClick}>
      {/* Glow layer — always mounted so it's ready */}
      <GlowCanvas
        visible={phase === "glow"}
        config={DEFAULT_CONFIG}
        engineRef={engineRef}
      />

      {/* Input phase overlay */}
      {isInputPhase && (
        <div
          className="input-overlay"
          style={{
            opacity: inputOpacity,
            transition: "opacity 0.6s ease",
          }}
        >
          {/* Typed text display */}
          <div className="typed-display">
            {!hasContent ? (
              <span className="typed-placeholder">type something</span>
            ) : (
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
          </div>

          {/* Spline 3D keyboard */}
          <div className="spline-wrap" onClick={(e) => e.stopPropagation()}>
            <SplineErrorBoundary
              fallback={<div className="spline-fallback">⌨️</div>}
            >
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

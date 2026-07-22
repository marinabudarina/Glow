import { useEffect, useRef, useState, useCallback, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import Spline from "@splinetool/react-spline";
import { BlurGlow } from "./blur-glow/engine";
import type { GlowConfig } from "./blur-glow/config";
import { DEFAULT_CONFIG } from "./blur-glow/config";

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
const CANVAS_W = 1300;
const CANVAS_H = 650;

function useSplineScale() {
  const [scale, setScale] = useState(() => {
    const visual = Math.min(900, window.innerWidth * 0.88);
    return visual / CANVAS_W;
  });
  useEffect(() => {
    const update = () => {
      const visual = Math.min(900, window.innerWidth * 0.88);
      setScale(visual / CANVAS_W);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return scale;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("input");
  const [typed, setTyped] = useState("");
  const [glowConfig, setGlowConfig] = useState<GlowConfig>(DEFAULT_CONFIG);
  const engineRef = useRef<BlurGlow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const splineScale = useSplineScale();

  // Focus the hidden input on mount
  useEffect(() => {
    if (phase === "input") {
      inputRef.current?.focus();
    }
  }, [phase]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && typed.trim().length > 0) {
        const phrase = `print("${typed.trim()}")`;
        const words = [phrase];
        setGlowConfig({
          ...DEFAULT_CONFIG,
          words,
          phraseInkColors: ["#2a0f66"],
        });
        setPhase("fadeOut");
        setTimeout(() => setPhase("glow"), 650);
      }
    },
    [typed]
  );

  const handleOverlayClick = () => {
    inputRef.current?.focus();
  };

  const isInputPhase = phase === "input" || phase === "fadeOut";
  const inputOpacity = phase === "fadeOut" ? 0 : 1;

  return (
    <div className="root" onClick={handleOverlayClick}>
      {/* Glow layer — always mounted so it's ready */}
      <GlowCanvas
        visible={phase === "glow"}
        config={glowConfig}
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
            <span className="typed-prefix">print(</span>
            <span className="typed-quote">"</span>
            {typed.length === 0 ? (
              <span className="typed-placeholder">type something</span>
            ) : (
              <span className="typed-chars">{typed}</span>
            )}
            <span className="typed-cursor">▍</span>
            <span className="typed-quote">"</span>
            <span className="typed-prefix">)</span>
          </div>

          {/* Spline 3D keyboard — canvas at 1300×650 so camera sees full keyboard,
               scaled down via JS so it always fits the actual viewport width */}
          <div
            className="spline-wrap"
            style={{ width: CANVAS_W * splineScale, height: CANVAS_H * splineScale }}
          >
            <div
              className="spline-scaler"
              style={{
                transform: `translate(-50%, -50%) scale(${splineScale})`,
              }}
            >
              <SplineErrorBoundary
                fallback={<div className="spline-fallback">⌨️</div>}
              >
                <Spline scene="https://prod.spline.design/H1LvhYkNlE0G22dJ/scene.splinecode" />
              </SplineErrorBoundary>
            </div>
          </div>

          {/* Hint */}
          <p className="enter-hint">
            Press <kbd>Enter</kbd> to continue
          </p>

          {/* Hidden real input to capture keystrokes */}
          <input
            ref={inputRef}
            className="hidden-input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
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

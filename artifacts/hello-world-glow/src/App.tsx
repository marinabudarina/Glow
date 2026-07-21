import { useCallback, useEffect, useRef, useState } from "react";
import { BlurGlow } from "./blur-glow/engine";
import type { GlowConfig } from "./blur-glow/config";
import { DEFAULT_CONFIG } from "./blur-glow/config";
import ConfigPanel from "./components/ConfigPanel";

// ─── Typing animation ────────────────────────────────────────────────────────
const TYPED_TEXT = `print("Hello, World")`;
const CHAR_MS = 62;
const HOLD_AFTER_MS = 900;

type Phase = "typing" | "hold" | "fadeOut" | "glow";

function TypingLine({ text, done }: { text: string; done: boolean }) {
  return (
    <div className="typing-line">
      <span className="typing-text">{text}</span>
      <span className={`cursor${done ? " cursor-blink" : ""}`}>▍</span>
    </div>
  );
}

// ─── Gear icon ───────────────────────────────────────────────────────────────
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

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
  const [phase, setPhase] = useState<Phase>("typing");
  const [typedCount, setTypedCount] = useState(0);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [config, setConfig] = useState<GlowConfig>(DEFAULT_CONFIG);
  const engineRef = useRef<BlurGlow | null>(null);

  // Propagate config changes to the live engine
  useEffect(() => {
    engineRef.current?.updateConfig(config);
  }, [config]);

  const patchConfig = useCallback((patch: Partial<GlowConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  // Typing ticker
  useEffect(() => {
    if (phase !== "typing") return;
    if (typedCount >= TYPED_TEXT.length) { setPhase("hold"); return; }
    const id = setTimeout(() => setTypedCount((c) => c + 1), CHAR_MS);
    return () => clearTimeout(id);
  }, [phase, typedCount]);

  // Hold → fadeOut
  useEffect(() => {
    if (phase !== "hold") return;
    const id = setTimeout(() => setPhase("fadeOut"), HOLD_AFTER_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // FadeOut → glow
  useEffect(() => {
    if (phase !== "fadeOut") return;
    const id = setTimeout(() => setPhase("glow"), 700);
    return () => clearTimeout(id);
  }, [phase]);

  const displayedText = TYPED_TEXT.slice(0, typedCount);
  const fullyTyped = typedCount >= TYPED_TEXT.length;
  const showTyping = phase === "typing" || phase === "hold" || phase === "fadeOut";
  const typingOpacity = phase === "fadeOut" ? 0 : 1;

  return (
    <div className="root">
      {/* WebGL glow — mounted immediately but invisible until phase=glow */}
      <GlowCanvas visible={phase === "glow"} config={config} engineRef={engineRef} />

      {/* Typing overlay */}
      {showTyping && (
        <div
          className="typing-overlay"
          style={{ opacity: typingOpacity, transition: "opacity 0.7s ease" }}
        >
          <TypingLine text={displayedText} done={fullyTyped} />
        </div>
      )}

      {/* Config button — always on top */}
      <button
        className={`cfg-btn${cfgOpen ? " cfg-btn--active" : ""}`}
        onClick={() => setCfgOpen((o) => !o)}
        aria-label="Configure"
        title="Configure"
      >
        <GearIcon />
      </button>

      {/* Config panel */}
      <ConfigPanel
        open={cfgOpen}
        config={config}
        onChange={patchConfig}
        onClose={() => setCfgOpen(false)}
      />
    </div>
  );
}

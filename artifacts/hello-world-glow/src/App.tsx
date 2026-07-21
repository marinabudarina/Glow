import { useEffect, useRef, useState } from "react";
import { BlurGlow } from "./blur-glow/engine";
import type { GlowConfig } from "./blur-glow/config";
import { DEFAULT_CONFIG } from "./blur-glow/config";
import {
  unlockAudio,
  playTypingClick,
  playCarriageReturn,
  playPowerUp,
  playPhraseBeep,
} from "./blur-glow/sound";

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

// ─── WebGL glow canvas ───────────────────────────────────────────────────────
function GlowCanvas({
  visible,
  config,
  engineRef,
  onWordChange,
}: {
  visible: boolean;
  config: GlowConfig;
  engineRef: React.MutableRefObject<BlurGlow | null>;
  onWordChange: (idx: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const engine = new BlurGlow(hostRef.current, config);
    engine.onWordChange = onWordChange;
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
  const config: GlowConfig = DEFAULT_CONFIG;
  const engineRef = useRef<BlurGlow | null>(null);

  // Unlock audio on first pointer interaction (browser policy)
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
  }, []);

  // Typing ticker — play a click on each new character
  useEffect(() => {
    if (phase !== "typing") return;
    if (typedCount >= TYPED_TEXT.length) {
      playCarriageReturn();
      setPhase("hold");
      return;
    }
    const id = setTimeout(() => {
      setTypedCount((c) => c + 1);
      playTypingClick();
    }, CHAR_MS);
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
    const id = setTimeout(() => {
      setPhase("glow");
      playPowerUp();
    }, 700);
    return () => clearTimeout(id);
  }, [phase]);

  const displayedText = TYPED_TEXT.slice(0, typedCount);
  const fullyTyped = typedCount >= TYPED_TEXT.length;
  const showTyping = phase === "typing" || phase === "hold" || phase === "fadeOut";
  const typingOpacity = phase === "fadeOut" ? 0 : 1;

  return (
    <div className="root">
      {/* WebGL glow — mounted immediately but invisible until phase=glow */}
      <GlowCanvas
        visible={phase === "glow"}
        config={config}
        engineRef={engineRef}
        onWordChange={playPhraseBeep}
      />

      {/* Typing overlay */}
      {showTyping && (
        <div
          className="typing-overlay"
          style={{ opacity: typingOpacity, transition: "opacity 0.7s ease" }}
        >
          <TypingLine text={displayedText} done={fullyTyped} />
        </div>
      )}
    </div>
  );
}

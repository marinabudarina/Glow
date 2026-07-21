import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Phrase & palette data (mirrored from web app) ───────────────────────────
const WORDS = ['Hello,', 'World!', 'My name', 'is Marina', "and I'm not", 'an AI ;P'];

const HOLD_SCALE = [0.9, 1.1, 0.85, 1.8, 1.2, 2.2];

const PALETTES = [
  { dark: '#0c0622', glow: '#ff3bd4' }, // Ultraviolet
  { dark: '#28060a', glow: '#ff6a1f' }, // Molten
  { dark: '#2a0718', glow: '#ff7ab0' }, // Bubblegum
  { dark: '#04102e', glow: '#25c8ff' }, // Electric
  { dark: '#03170f', glow: '#1fd88a' }, // Jade
  { dark: '#04161c', glow: '#f2a20c' }, // Sunburst
];

const DARK_COLORS = PALETTES.map((p) => p.dark);

const BASE_HOLD_MS = 2200;
const FADE_MS = 350;
const BG_MS = 850;
const SPEED = 0.75;
const TYPED_TEXT = 'print("Hello, World")';
const CHAR_MS = 62;
const HOLD_AFTER_MS = 900;

type Phase = 'typing' | 'hold' | 'fadeOut' | 'phrases';

// ─── Animated glow phrase ────────────────────────────────────────────────────
// Extracted into its own component so useAnimatedStyle is never called inside
// a conditional or loop.
function GlowPhrase({
  word,
  glowColor,
  animStyle,
}: {
  word: string;
  glowColor: string;
  animStyle: AnimatedStyle<ViewStyle>;
}) {
  return (
    <Animated.View style={[styles.phraseWrap, animStyle]}>
      {/* Outer bloom layer — absolute, same text, soft shadow */}
      <Text
        style={[
          styles.phraseText,
          {
            color: glowColor,
            textShadowColor: glowColor,
            textShadowRadius: 52,
            textShadowOffset: { width: 0, height: 0 },
            position: 'absolute',
            opacity: 0.55,
            left: 0,
            right: 0,
            textAlign: 'center',
          },
        ]}
      >
        {word}
      </Text>
      {/* Crisp white text with tight inner glow */}
      <Text
        style={[
          styles.phraseText,
          {
            color: '#ffffff',
            textShadowColor: glowColor,
            textShadowRadius: 16,
            textShadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        {word}
      </Text>
    </Animated.View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function IntroScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const [phase, setPhase] = useState<Phase>('typing');
  const [typedCount, setTypedCount] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [cursorOn, setCursorOn] = useState(true);
  const playedOnceRef = useRef(false);

  // Reanimated shared values
  const bgProgress = useSharedValue(0); // 0–5 → palette index
  const textOpacity = useSharedValue(0);
  const paperOpacity = useSharedValue(1);

  // Animated styles — declared unconditionally (hooks rule)
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(bgProgress.value, [0, 1, 2, 3, 4, 5], DARK_COLORS),
  }));

  const textAnimStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ scale: 0.93 + textOpacity.value * 0.07 }],
  }));

  const paperStyle = useAnimatedStyle(() => ({
    opacity: paperOpacity.value,
    pointerEvents: paperOpacity.value > 0 ? 'auto' : 'none',
  } as any));

  // ── Cursor blink (only while holding) ──────────────────────────────────────
  useEffect(() => {
    if (phase !== 'hold') return;
    const id = setInterval(() => setCursorOn((v) => !v), 450);
    return () => clearInterval(id);
  }, [phase]);

  // ── Typing ticker ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'typing') return;
    if (typedCount >= TYPED_TEXT.length) {
      setPhase('hold');
      return;
    }
    const id = setTimeout(() => setTypedCount((c) => c + 1), CHAR_MS);
    return () => clearTimeout(id);
  }, [phase, typedCount]);

  // ── Hold → fadeOut ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'hold') return;
    const id = setTimeout(() => setPhase('fadeOut'), HOLD_AFTER_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // ── FadeOut → phrases ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'fadeOut') return;
    bgProgress.value = withTiming(0, { duration: 900, easing: Easing.inOut(Easing.cubic) });
    paperOpacity.value = withTiming(
      0,
      { duration: 900, easing: Easing.inOut(Easing.cubic) },
      (done) => {
        if (done) runOnJS(setPhase)('phrases');
      },
    );
  }, [phase]);

  // ── Phrase runner ───────────────────────────────────────────────────────────
  const runPhrase = useCallback((idx: number) => {
    textOpacity.value = 0;
    textOpacity.value = withTiming(1, { duration: FADE_MS, easing: Easing.out(Easing.cubic) });

    const holdMs = (BASE_HOLD_MS * HOLD_SCALE[idx]) / SPEED;
    const totalMs = FADE_MS + holdMs;

    const id = setTimeout(() => {
      textOpacity.value = withTiming(
        0,
        { duration: FADE_MS, easing: Easing.in(Easing.cubic) },
        (done) => {
          if (!done) return;
          let next: number;
          if (idx === WORDS.length - 1) {
            playedOnceRef.current = true;
            next = WORDS.length - 2;
          } else if (playedOnceRef.current && idx === WORDS.length - 2) {
            next = WORDS.length - 1;
          } else {
            next = idx + 1;
          }
          bgProgress.value = withTiming(next, {
            duration: BG_MS,
            easing: Easing.inOut(Easing.cubic),
          });
          runOnJS(setPhraseIdx)(next);
        },
      );
    }, totalMs);

    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (phase !== 'phrases') return;
    return runPhrase(phraseIdx);
  }, [phase, phraseIdx, runPhrase]);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const showTyping = phase === 'typing' || phase === 'hold' || phase === 'fadeOut';
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom;
  const pal = PALETTES[phraseIdx];

  return (
    <View style={styles.root}>
      {/* Animated dark background */}
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} />

      {/* Paper-white overlay (typing phase) */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.paper, paperStyle]} />

      <View style={[styles.center, { paddingTop: topPad, paddingBottom: bottomPad }]}>
        {/* Typing phase */}
        {showTyping && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{TYPED_TEXT.slice(0, typedCount)}</Text>
            <Text
              style={[
                styles.cursor,
                {
                  opacity:
                    phase === 'typing' ? 1 : cursorOn ? 1 : 0,
                },
              ]}
            >
              ▍
            </Text>
          </View>
        )}

        {/* Glow phrase sequence */}
        {phase === 'phrases' && (
          <GlowPhrase
            word={WORDS[phraseIdx]}
            glowColor={pal.glow}
            animStyle={textAnimStyle}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0c0622',
  },
  paper: {
    backgroundColor: '#faf7ff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 17,
    color: '#3a3050',
    letterSpacing: 17 * -0.06, // −6%
  },
  cursor: {
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 17,
    color: '#5b1fd6',
    marginLeft: 1,
  },
  phraseWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  phraseText: {
    fontFamily: 'JetBrainsMono_700Bold',
    fontSize: 54,
    textAlign: 'center',
    letterSpacing: 54 * -0.06, // −6%
    lineHeight: 64,
  },
});

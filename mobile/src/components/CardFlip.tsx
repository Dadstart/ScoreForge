import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

const FLIP_MS = 460;
const STAGGER_MS = 42;

let nativeReduced = false;
if (Platform.OS !== 'web') {
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    nativeReduced = value;
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    nativeReduced = value;
  });
}

function reducedMotion(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return nativeReduced;
}

type Props = {
  /** True while the face is showing. A change turns the card over. */
  up: boolean;
  /**
   * Play the turn on mount. Used when a card appears already face up,
   * such as a draw from the stock, so the back is still seen first.
   */
  play?: boolean;
  delay?: number;
  width: number;
  height: number;
  front: ReactNode;
  back: ReactNode;
};

/** Turns a card about its vertical axis. The back leads until the card is edge-on. */
export function CardFlip({ up, play = false, delay = 0, width, height, front, back }: Props) {
  const turn = useRef(new Animated.Value(up && !play ? 1 : 0)).current;
  const started = useRef(false);
  const intro = useRef(play && up);
  const delayRef = useRef(delay);
  delayRef.current = delay;

  useEffect(() => {
    const target = up ? 1 : 0;
    const first = !started.current;
    const spinIn = first && intro.current;
    started.current = true;
    if (reducedMotion() || (first && !spinIn)) {
      turn.setValue(target);
      return;
    }
    const animation = Animated.timing(turn, {
      toValue: target,
      duration: FLIP_MS,
      delay: spinIn ? delayRef.current : 0,
      easing: Easing.inOut(Easing.cubic),
      isInteraction: false,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [up, turn]);

  const frontSpin = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '0deg'],
    extrapolate: 'clamp',
  });
  const backSpin = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-180deg'],
    extrapolate: 'clamp',
  });
  const frontOpacity = turn.interpolate({
    inputRange: [0, 0.5, 0.5001, 1],
    outputRange: [0, 0, 1, 1],
    extrapolate: 'clamp',
  });
  const backOpacity = turn.interpolate({
    inputRange: [0, 0.5, 0.5001, 1],
    outputRange: [1, 1, 0, 0],
    extrapolate: 'clamp',
  });
  const perspective = Math.max(700, width * 12);

  return (
    <View pointerEvents="none" style={[styles.stage, depth, { width, height }]}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.face, { width, height, opacity: backOpacity, transform: [{ perspective }, { rotateY: backSpin }] }]}
      >
        {back}
      </Animated.View>
      <Animated.View
        accessibilityElementsHidden={!up}
        importantForAccessibility={up ? 'auto' : 'no-hide-descendants'}
        pointerEvents="none"
        style={[styles.face, { width, height, opacity: frontOpacity, transform: [{ perspective }, { rotateY: frontSpin }] }]}
      >
        {front}
      </Animated.View>
    </View>
  );
}

const depth: ViewStyle | null =
  Platform.OS === 'web' ? ({ transformStyle: 'preserve-3d' } as ViewStyle) : null;

const styles = StyleSheet.create({
  stage: { overflow: 'visible' },
  face: {
    position: 'absolute',
    left: 0,
    top: 0,
    backfaceVisibility: 'hidden',
  },
});

/** Suit letter case is the face: `AS` is up, `As` is down. */
export function isFaceUpCode(code: string): boolean {
  const suit = code[1];
  return suit != null && suit !== suit.toLowerCase();
}

/**
 * Face-up card ids that were not face up on the previous commit.
 * The first paint records the deal and does not count as a flip.
 */
export function useFreshFaces(ids: readonly string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const key = ids.join('\0');
  const fresh = useRef<{ key: string; faces: ReadonlySet<string> } | null>(null);
  if (!fresh.current || fresh.current.key !== key) {
    const faces = new Set<string>();
    if (seen.current) {
      for (const id of ids) if (!seen.current.has(id)) faces.add(id);
    }
    fresh.current = { key, faces };
  }
  useEffect(() => {
    seen.current = new Set(key.length === 0 ? [] : key.split('\0'));
  }, [key]);
  return fresh.current.faces;
}

/** Stagger only the cards that are turning, in the order they are listed. */
export function flipDelay(id: string, order: readonly string[], fresh: ReadonlySet<string>): number {
  if (!fresh.has(id)) return 0;
  let index = 0;
  for (const item of order) {
    if (item === id) return index * STAGGER_MS;
    if (fresh.has(item)) index += 1;
  }
  return 0;
}

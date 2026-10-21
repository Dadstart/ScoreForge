import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';

let nativeReduced = false;
if (Platform.OS !== 'web') {
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    nativeReduced = value;
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    nativeReduced = value;
  });
}

export function reducedMotion(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return nativeReduced;
}

export function motionDriver(): boolean {
  return Platform.OS !== 'web';
}

/** Cards that arrived in a hand that was already on screen. Revealing a hidden hand does not count. */
export function useArrivals(ids: readonly string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const key = ids.join('\0');
  const cached = useRef<{ key: string; faces: ReadonlySet<string> } | null>(null);
  if (!cached.current || cached.current.key !== key) {
    const faces = new Set<string>();
    const prior = seen.current;
    if (prior && prior.size > 0) {
      for (const id of ids) if (!prior.has(id)) faces.add(id);
    }
    cached.current = { key, faces };
  }
  useEffect(() => {
    seen.current = new Set(key.length === 0 ? [] : key.split('\0'));
  }, [key]);
  return cached.current.faces;
}

/** A new card settles onto a pile. Clearing the pile pops the empty slot. */
export function Land({ id, children }: { id: string | null; children: ReactNode }) {
  const land = useRef(new Animated.Value(1)).current;
  const clear = useRef(new Animated.Value(1)).current;
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const known = previous.current !== undefined;
    const arrive = known && id != null && previous.current !== id;
    const cleared = known && previous.current != null && id == null;
    previous.current = id;
    if (reducedMotion() || (!arrive && !cleared)) {
      land.setValue(1);
      clear.setValue(1);
      return;
    }
    const motion = arrive ? land : clear;
    const other = arrive ? clear : land;
    other.setValue(1);
    motion.setValue(0);
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: arrive ? 340 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [id, land, clear]);

  const translateY = land.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const landScale = land.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] });
  const rotate = land.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });
  const clearScale = clear.interpolate({ inputRange: [0, 1], outputRange: [1.18, 1] });
  return (
    <Animated.View style={{ transform: [{ translateY }, { scale: landScale }, { rotate }, { scale: clearScale }] }}>
      {children}
    </Animated.View>
  );
}

/** The pile dips when a card leaves and lifts when cards are added back. */
export function Dip({ count, children }: { count: number; children?: ReactNode }) {
  const dip = useRef(new Animated.Value(0)).current;
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const known = previous.current !== null;
    const dealt = known && count < (previous.current ?? 0);
    const refilled = known && count > (previous.current ?? 0);
    previous.current = count;
    if (reducedMotion() || (!dealt && !refilled)) {
      dip.setValue(0);
      return;
    }
    dip.setValue(dealt ? 1 : -1);
    const animation = Animated.timing(dip, {
      toValue: 0,
      duration: dealt ? 280 : 360,
      easing: Easing.out(Easing.quad),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [count, dip]);

  const scale = dip.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.08, 1, 0.9] });
  const translateY = dip.interpolate({ inputRange: [-1, 0, 1], outputRange: [-4, 0, 6] });
  return <Animated.View style={{ transform: [{ translateY }, { scale }] }}>{children}</Animated.View>;
}

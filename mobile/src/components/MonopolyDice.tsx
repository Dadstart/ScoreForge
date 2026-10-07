import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';

const ROLL_MS = 1700;

const PIPS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

type Point = { x: number; y: number };

let nativeReduced = false;
if (Platform.OS !== 'web') {
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    nativeReduced = value;
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    nativeReduced = value;
  });
}

export function diceMotionMs(): number {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  } else if (nativeReduced) {
    return 0;
  }
  return ROLL_MS;
}

type Roll = { id: number; faces: [number, number] };

export function MonopolyDice({ roll }: { roll: Roll }) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  return (
    <View
      pointerEvents="none"
      style={styles.layer}
      accessibilityLabel={`Dice showing ${roll.faces[0]} and ${roll.faces[1]}`}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}
    >
      {box.width > 0 ? (
        <>
          <TravelDie face={roll.faces[0]} rollId={roll.id} box={box} lane={0} delay={0} />
          <TravelDie face={roll.faces[1]} rollId={roll.id} box={box} lane={1} delay={160} />
        </>
      ) : null}
    </View>
  );
}

function TravelDie({
  face,
  rollId,
  box,
  lane,
  delay,
}: {
  face: number;
  rollId: number;
  box: { width: number; height: number };
  lane: number;
  delay: number;
}) {
  const progress = useRef(new Animated.Value(diceMotionMs() === 0 ? 1 : 0)).current;
  const [shown, setShown] = useState(face);
  const size = Math.max(42, Math.min(68, Math.round(Math.min(box.width, box.height) * 0.12)));
  const points = hopPath(track(lane), box.width, box.height);
  const input = points.map((_, index) => index / (points.length - 1));
  const travelX = progress.interpolate({
    inputRange: input,
    outputRange: points.map((point) => point.x - size / 2),
  });
  const travelY = progress.interpolate({
    inputRange: input,
    outputRange: points.map((point) => point.y - size / 2),
  });
  const spin = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', lane === 0 ? '1080deg' : '-1080deg'],
  });

  useEffect(() => {
    if (diceMotionMs() === 0) {
      setShown(face);
      progress.setValue(1);
      return;
    }
    setShown(face);
    progress.setValue(0);
    let ticks = 0;
    const flicker = setInterval(() => {
      ticks += 1;
      if (ticks > 9) {
        clearInterval(flicker);
        setShown(face);
        return;
      }
      setShown(((face + ticks * (lane === 0 ? 2 : 5) - 1) % 6) + 1);
    }, 90);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: ROLL_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => {
      clearInterval(flicker);
      animation.stop();
    };
  }, [rollId, face, delay, lane, progress]);

  const pips = PIPS[shown] ?? PIPS[1];
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        transform: [{ translateX: travelX }, { translateY: travelY }, { rotate: spin }],
      }}
    >
      <View style={[styles.shadow, { borderRadius: size / 2 }]} />
      <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.22 }]}>
        <View style={styles.pips}>
          {pips.map((on, index) => (
            <View key={index} style={styles.slot}>
              {on ? <View style={styles.pip} /> : null}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

function track(lane: number): [Point, Point, Point, Point] {
  if (lane === 0) {
    return [
      { x: -0.06, y: 0.78 },
      { x: 0.22, y: 0.18 },
      { x: 0.88, y: 0.28 },
      { x: 0.38, y: 0.6 },
    ];
  }
  return [
    { x: -0.02, y: 0.92 },
    { x: 0.4, y: 0.84 },
    { x: 0.96, y: 0.42 },
    { x: 0.52, y: 0.66 },
  ];
}

function hopPath(curve: [Point, Point, Point, Point], width: number, height: number): Point[] {
  const [a, b, c, d] = curve;
  const steps = 20;
  const points: Point[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const u = 1 - t;
    const x = u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x;
    const y = u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y;
    const bounce = Math.sin(t * Math.PI * 4) * (1 - t) * 0.07;
    points.push({ x: x * width, y: (y - bounce) * height });
  }
  return points;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  die: {
    backgroundColor: '#f7f1e6',
    borderWidth: 2,
    borderColor: '#1a1408',
  },
  pips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  slot: {
    width: '33.33%',
    height: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pip: {
    width: '58%',
    height: '58%',
    borderRadius: 99,
    backgroundColor: '#1a1408',
  },
  shadow: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: -6,
    height: 10,
    backgroundColor: 'rgba(8, 14, 12, 0.45)',
  },
});

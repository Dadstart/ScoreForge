import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { projectDie, type DiePose } from '../domain/dieProjection';
import { diceHopPoints, diceRollCurves, monopolyDieSize, type BoardView, type Point } from '../domain/opolyBoard';
import Svg, { Ellipse, G, Polygon } from 'react-native-svg';

const ROLL_MS = 1700;
const STAGGER_MS = 160;

const PIPS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

let nativeReduced = false;
if (Platform.OS !== 'web') {
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    nativeReduced = value;
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    nativeReduced = value;
  });
}

/** iPhone flattens CSS cubes, so the die is drawn as projected faces instead. */
export function diceUseFlatCamera(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function diceMotionMs(): number {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
  } else if (nativeReduced) {
    return 0;
  }
  return ROLL_MS;
}

/** How long both dice take to finish, including the second die's delay. */
export function diceSettleMs(): number {
  const roll = diceMotionMs();
  return roll === 0 ? 0 : roll + STAGGER_MS;
}

type Roll = { id: number; faces: [number, number] };

export function OpolyDice({
  roll,
  view,
  boardSize = 0,
}: {
  roll: Roll;
  /** Null until the on-screen board rect for this roll is known. */
  view?: BoardView | null;
  /** Board canvas size. The visible rect uses this same coordinate space. */
  boardSize?: number;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const flight = useRef<{
    id: number;
    board: number;
    curves: [Point, Point, Point, Point][];
    view?: BoardView;
  } | null>(null);
  const measured = Math.min(box.width, box.height);
  const board = boardSize > 0 ? boardSize : measured;
  if (board > 0 && view && flight.current?.id !== roll.id) {
    flight.current = {
      id: roll.id,
      board,
      curves: diceRollCurves(board, monopolyDieSize(board), Math.random, view),
      view,
    };
  }
  const ready = flight.current?.id === roll.id ? flight.current : null;
  const curves = ready?.curves ?? null;
  const landedView = ready?.view;
  const flightBoard = ready?.board ?? board;
  return (
    <View
      style={[styles.layer, preserve3d, { pointerEvents: 'none' }]}
      accessibilityLabel={`Dice showing ${roll.faces[0]} and ${roll.faces[1]}`}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}
    >
      {curves ? (
        <>
          <TravelDie face={roll.faces[0]} rollId={roll.id} board={flightBoard} curve={curves[0]} lane={0} delay={0} view={landedView} />
          <TravelDie face={roll.faces[1]} rollId={roll.id} board={flightBoard} curve={curves[1]} lane={1} delay={STAGGER_MS} view={landedView} />
        </>
      ) : null}
    </View>
  );
}

function TravelDie({
  face,
  rollId,
  board,
  curve,
  lane,
  delay,
  view,
}: {
  face: number;
  rollId: number;
  board: number;
  curve: [Point, Point, Point, Point];
  lane: number;
  delay: number;
  view?: BoardView;
}) {
  const progress = useRef(new Animated.Value(diceMotionMs() === 0 ? 1 : 0)).current;
  const size = monopolyDieSize(board);
  const points = diceHopPoints(curve, board, view);
  const input = points.map((_, index) => index / (points.length - 1));
  const travelX = progress.interpolate({
    inputRange: input,
    outputRange: points.map((point) => point.x - size / 2),
  });
  const travelY = progress.interpolate({
    inputRange: input,
    outputRange: points.map((point) => point.y - size / 2),
  });
  const spin = (turns: string) => progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', turns],
  });
  // Whole turns, so the rolled face is up again when the spin ends.
  const spinX = spin(lane === 0 ? '360deg' : '-360deg');
  const spinY = spin(lane === 0 ? '-360deg' : '720deg');
  const spinZ = spin(lane === 0 ? '720deg' : '-360deg');
  const hopMarks = Array.from({ length: 25 }, (_, index) => index / 24);
  const hop = progress.interpolate({
    inputRange: hopMarks,
    outputRange: hopMarks.map((mark) => Math.sin(Math.PI * mark) * size * 1.15),
  });

  useEffect(() => {
    if (diceMotionMs() === 0) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: ROLL_MS,
      delay,
      easing: Easing.bezier(0.22, 0.8, 0.3, 1),
      isInteraction: false,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [rollId, face, delay, lane, progress]);

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          transform: [
            { translateX: travelX },
            { translateY: travelY },
          ],
        },
        preserve3d,
      ]}
    >
      <View style={[styles.shadow, { borderRadius: size / 2 }]} />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            transform: cubeTransform([
              { translateZ: hop },
              { rotateX: spinX },
              { rotateY: spinY },
              { rotateZ: spinZ },
            ]),
          },
          preserve3d,
        ]}
      >
        <DieCube face={face} settled={face} size={size} />
      </Animated.View>
    </Animated.View>
  );
}

const preserve3d = {
  transformStyle: 'preserve-3d',
  ...(Platform.OS === 'web' ? { WebkitTransformStyle: 'preserve-3d' } : null),
} as ViewStyle;
/** iOS drops children of a 3D face unless those children have their own transform. */
const pipPaint =
  Platform.OS === 'web' ? ({ transform: [{ translateZ: 1 }] } as unknown as ViewStyle) : null;

/** The four side faces. The opposite face is drawn separately; opposites sum to 7. */
function neighborFaces(top: number): number[] {
  const opposite = 7 - top;
  return [1, 2, 3, 4, 5, 6].filter((value) => value !== top && value !== opposite);
}

function cubeTransform(transform: object[]): NonNullable<ViewStyle['transform']> {
  return transform as unknown as NonNullable<ViewStyle['transform']>;
}

function DieCube({ face, settled, size }: { face: number; settled: number; size: number }) {
  const half = size / 2;
  const sides = neighborFaces(settled);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          transform: cubeTransform([{ translateZ: half }]),
        },
        preserve3d,
      ]}
    >
      <DieFace value={face} size={size} color="#f7f1e6" transform={cubeTransform([{ translateZ: half }])} />
      <DieFace value={7 - settled} size={size} color="#d9cbb3" transform={cubeTransform([{ rotateX: '180deg' }, { translateZ: half }])} />
      <DieFace value={sides[0]} size={size} color="#e6d7be" transform={cubeTransform([{ rotateX: '90deg' }, { translateZ: half }])} />
      <DieFace value={sides[1]} size={size} color="#efe6d4" transform={cubeTransform([{ rotateX: '-90deg' }, { translateZ: half }])} />
      <DieFace value={sides[2]} size={size} color="#ddd0b6" transform={cubeTransform([{ rotateY: '90deg' }, { translateZ: half }])} />
      <DieFace value={sides[3]} size={size} color="#e9dcc4" transform={cubeTransform([{ rotateY: '-90deg' }, { translateZ: half }])} />
    </View>
  );
}

function DieFace({
  value,
  size,
  color,
  transform,
}: {
  value: number;
  size: number;
  color: string;
  transform: NonNullable<ViewStyle['transform']>;
}) {
  const pips = PIPS[value] ?? PIPS[1];
  const cell = size / 3;
  const pip = Math.max(3, Math.round(cell * 0.58));
  return (
    <View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size * 0.16,
          backgroundColor: color,
          borderWidth: 1,
          borderColor: 'rgba(90, 64, 36, 0.4)',
          backfaceVisibility: 'hidden',
          transform,
        },
        Platform.OS === 'web' ? ({ WebkitBackfaceVisibility: 'hidden' } as ViewStyle) : null,
        preserve3d,
      ]}
    >
      <View style={[styles.pipLayer, pipPaint]} pointerEvents="none">
        {pips.map((on, index) =>
          on ? (
            <View
              key={index}
              style={{
                position: 'absolute',
                width: pip,
                height: pip,
                borderRadius: pip / 2,
                backgroundColor: '#1a1408',
                left: (index % 3) * cell + (cell - pip) / 2,
                top: Math.floor(index / 3) * cell + (cell - pip) / 2,
              }}
            />
          ) : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  pipLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  shadow: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    bottom: -6,
    height: 10,
    backgroundColor: 'rgba(8, 14, 12, 0.45)',
  },
  flatLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 26,
  },
});

const LANE_SPIN = [
  { x: 360, y: -360, z: 720 },
  { x: -360, y: 720, z: -360 },
] as const;

function pointOnPath(points: Point[], t: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const scaled = Math.min(1, Math.max(0, t)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const frac = scaled - index;
  const a = points[index];
  const b = points[index + 1];
  return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
}

function readAnimated(value: Animated.Value) {
  return (value as unknown as { __getValue(): number }).__getValue();
}

function useDieProgress(rollId: number, delay: number) {
  const [progress, setProgress] = useState(diceMotionMs() === 0 ? 1 : 0);
  const motion = useRef(new Animated.Value(diceMotionMs() === 0 ? 1 : 0)).current;
  useEffect(() => {
    const id = motion.addListener(({ value }) => setProgress(value));
    if (diceMotionMs() === 0) {
      motion.setValue(1);
      setProgress(1);
      return () => motion.removeListener(id);
    }
    motion.setValue(0);
    setProgress(0);
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: ROLL_MS,
      delay,
      easing: Easing.bezier(0.22, 0.8, 0.3, 1),
      isInteraction: false,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
      motion.removeListener(id);
    };
  }, [rollId, delay, motion]);
  return progress;
}

/** Dice drawn in the board's perspective. Used where a CSS cube is flattened. */
export function FlatDice({
  roll,
  view,
  boardSize,
  panX,
  panY,
  turn,
  width,
  height,
}: {
  roll: Roll;
  view?: BoardView | null;
  boardSize: number;
  panX: Animated.Value;
  panY: Animated.Value;
  turn: Animated.Value;
  width: number;
  height: number;
}) {
  const [boardTurn, setBoardTurn] = useState(0);
  const [pan, setPan] = useState(() => ({ x: readAnimated(panX), y: readAnimated(panY) }));
  const flight = useRef<{
    id: number;
    board: number;
    curves: [Point, Point, Point, Point][];
    view?: BoardView;
  } | null>(null);
  const lead = useDieProgress(roll.id, 0);
  const follow = useDieProgress(roll.id, STAGGER_MS);
  if (boardSize > 0 && view && flight.current?.id !== roll.id) {
    flight.current = {
      id: roll.id,
      board: boardSize,
      curves: diceRollCurves(boardSize, monopolyDieSize(boardSize), Math.random, view),
      view,
    };
  }
  const ready = flight.current?.id === roll.id ? flight.current : null;

  useEffect(() => {
    setBoardTurn(readAnimated(turn));
    const id = turn.addListener(({ value }) => setBoardTurn(value));
    return () => turn.removeListener(id);
  }, [turn]);

  useEffect(() => {
    const pull = () => {
      const next = { x: readAnimated(panX), y: readAnimated(panY) };
      setPan((current) => (current.x === next.x && current.y === next.y ? current : next));
    };
    pull();
    const xId = panX.addListener(pull);
    const yId = panY.addListener(pull);
    return () => {
      panX.removeListener(xId);
      panY.removeListener(yId);
    };
  }, [panX, panY]);

  if (!ready || width <= 0 || height <= 0) return null;
  const place = (x: number, y: number) => ({
    x: pan.x + ready.board / 2 + x,
    y: pan.y + ready.board / 2 + y,
  });
  const dice = [0, 1].map((lane) => {
    const center = pointOnPath(ready.curves[lane] ? diceHopPoints(ready.curves[lane], ready.board, ready.view) : [], lane === 0 ? lead : follow);
    const spin = LANE_SPIN[lane];
    const progress = lane === 0 ? lead : follow;
    const size = monopolyDieSize(ready.board);
    const pose: DiePose = {
      x: center.x - ready.board / 2,
      y: center.y - ready.board / 2,
      hop: Math.sin(Math.PI * progress) * size * 1.15,
      spinX: progress * spin.x,
      spinY: progress * spin.y,
      spinZ: progress * spin.z,
      turn: boardTurn,
      size,
      face: roll.faces[lane],
    };
    const mesh = projectDie(pose, ready.board);
    const depth = mesh.faces.reduce((highest, face) => Math.max(highest, face.depth), -Infinity);
    return { lane, mesh, depth };
  });
  dice.sort((a, b) => a.depth - b.depth);

  return (
    <View style={[styles.flatLayer, { width, height }]} pointerEvents="none">
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ overflow: 'visible' }}
      >
        {dice.map(({ lane, mesh }) => {
          const shadow = place(mesh.shadow.x, mesh.shadow.y);
          return (
            <G key={lane}>
              <Ellipse
                cx={shadow.x}
                cy={shadow.y}
                rx={mesh.shadow.rx}
                ry={mesh.shadow.ry}
                fill="rgba(8, 14, 12, 0.45)"
              />
              {mesh.faces.map((drawn) => {
                const points = drawn.points
                  .map((point) => {
                    const at = place(point.x, point.y);
                    return `${at.x},${at.y}`;
                  })
                  .join(' ');
                return (
                  <G key={`${lane}-${drawn.value}`}>
                    <Polygon
                      points={points}
                      fill={drawn.color}
                      stroke="rgba(90, 64, 36, 0.4)"
                      strokeWidth={1}
                      strokeLinejoin="round"
                    />
                    {drawn.pips.map((pip, index) => {
                      const at = place(pip.x, pip.y);
                      return <Ellipse key={index} cx={at.x} cy={at.y} rx={pip.rx} ry={pip.ry} fill="#1a1408" />;
                    })}
                  </G>
                );
              })}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

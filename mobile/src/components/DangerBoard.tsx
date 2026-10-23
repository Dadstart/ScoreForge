import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Rect } from 'react-native-svg';
import { motionDriver, reducedMotion } from './cardMotion';
import {
  DANGER_COLORS,
  LANE_SPACES,
  SIDE_SPACES,
  TRACK_SPACES,
  colorIndexFor,
  moveDestination,
  startIndex,
  type DangerMove,
  type DangerSpot,
  type DangerState,
} from '../domain/danger';
import { colors } from '../theme';

const BOARD = 360;
const TRACK_INSET = 78;
const SPAN = BOARD - TRACK_INSET * 2;
const STEP = SPAN / SIDE_SPACES;
const HOME_PROGRESS = TRACK_SPACES + LANE_SPACES;
const FELT = '#143028';
const GROOVE = '#0b1c16';
const HOLE = '#07110e';

const NESTS = [
  { x: 42, y: 318 },
  { x: 318, y: 318 },
  { x: 318, y: 42 },
  { x: 42, y: 42 },
];

const CLUSTER = [
  { x: -9, y: -9 },
  { x: 9, y: -9 },
  { x: -9, y: 9 },
  { x: 9, y: 9 },
];

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

type Point = { x: number; y: number };
type Piece = {
  key: string;
  playerId: string;
  peg: number;
  color: number;
  spot: DangerSpot;
  point: Point;
};

type Props = {
  state: DangerState;
  moves: DangerMove[];
  selected: number | null;
  canAct: boolean;
  canRoll: boolean;
  heldFace: number | null;
  onRoll: () => void;
  onSelect: (peg: number | null) => void;
  onMove: (move: DangerMove) => void;
};

export function DangerBoard({ state, moves, selected, canAct, canRoll, heldFace, onRoll, onSelect, onMove }: Props) {
  const { width } = useWindowDimensions();
  const frame = Math.min(Math.max(width - 28, 280), 440);
  const scale = frame / BOARD;
  const color = colorIndexFor(state, state.currentPlayerId);
  const owned = new Set(Object.values(state.colors));
  const selectable = new Set(moves.map((move) => move.peg));
  const pieces = placedPegs(state);
  const previous = useRef<Map<string, DangerSpot>>(new Map());
  const trips = pieces.map((piece) => {
    const before = previous.current.get(piece.key);
    const path = before && !sameSpot(before, piece.spot) ? route(piece.color, piece.peg, before, piece.spot) : [piece.point];
    return { ...piece, path, spotKey: spotKey(piece.spot) };
  });

  useEffect(() => {
    const next = new Map<string, DangerSpot>();
    for (const piece of placedPegs(state)) next.set(piece.key, piece.spot);
    previous.current = next;
  }, [state]);

  const destinations = (selected == null ? [] : moves.filter((move) => move.peg === selected))
    .map((move) => ({ move, dest: moveDestination(state, move) }))
    .filter((row): row is { move: DangerMove; dest: DangerSpot } => row.dest != null);

  return (
    <View style={[styles.frame, { width: frame, height: frame }]}>
      <BoardArt frame={frame} owned={owned} />
      {trips.map((piece) => {
        const mine = piece.playerId === state.currentPlayerId;
        const swatch = DANGER_COLORS[piece.color];
        const active = canAct && mine && selectable.has(piece.peg);
        return (
          <MovingPeg
            key={piece.key}
            path={piece.path}
            spotKey={piece.spotKey}
            scale={scale}
            size={Math.max(16, 22 * scale)}
            fill={swatch.fill}
            label={`${swatch.name} peg`}
            active={active}
            selected={selected === piece.peg && mine}
            onPress={() => onSelect(selected === piece.peg ? null : piece.peg)}
          />
        );
      })}
      <Popper
        die={state.die}
        heldFace={heldFace}
        again={state.again}
        canRoll={canRoll}
        scale={scale}
        onRoll={onRoll}
      />
      {canAct
        ? destinations.map((row) => {
            const point = spotPoint(row.dest, color);
            if (!point) return null;
            return (
              <Landing
                key={`${row.move.type}-${row.move.peg}`}
                x={point.x * scale}
                y={point.y * scale}
                size={Math.max(22, 28 * scale)}
                onPress={() => onMove(row.move)}
              />
            );
          })
        : null}
    </View>
  );
}

function BoardArt({ frame, owned }: { frame: number; owned: Set<number> }) {
  return (
    <Svg width={frame} height={frame} viewBox={`0 0 ${BOARD} ${BOARD}`} style={styles.art}>
      <Rect x={6} y={6} width={348} height={348} rx={28} fill={colors.woodDark} />
      <Rect x={16} y={16} width={328} height={328} rx={22} fill={colors.wood} />
      <Rect x={28} y={28} width={304} height={304} rx={18} fill={FELT} />
      <Rect
        x={TRACK_INSET - 16}
        y={TRACK_INSET - 16}
        width={SPAN + 32}
        height={SPAN + 32}
        rx={46}
        fill="none"
        stroke={GROOVE}
        strokeWidth={28}
      />
      {DANGER_COLORS.map((swatch, index) => {
        const start = trackPoint(startIndex(index));
        const end = inward(index, LANE_SPACES);
        return (
          <G key={`lane-${swatch.id}`} opacity={owned.has(index) ? 1 : 0.28}>
            <Line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke={swatch.fill}
              strokeWidth={12}
              strokeLinecap="round"
              opacity={0.45}
            />
            {Array.from({ length: LANE_SPACES + 1 }, (_, lane) => {
              const point = inward(index, lane);
              const finish = lane === LANE_SPACES;
              return (
                <Circle
                  key={lane}
                  cx={point.x}
                  cy={point.y}
                  r={finish ? 11 : 8}
                  fill={finish ? swatch.fill : swatch.soft}
                  stroke={swatch.fill}
                  strokeWidth={finish ? 2 : 1.5}
                />
              );
            })}
          </G>
        );
      })}
      {Array.from({ length: TRACK_SPACES }, (_, index) => {
        const point = trackPoint(index);
        const start = startColor(index);
        const swatch = start == null ? null : DANGER_COLORS[start];
        const dim = start != null && !owned.has(start);
        return (
          <G key={`hole-${index}`} opacity={dim ? 0.35 : 1}>
            <Circle cx={point.x} cy={point.y + 1.5} r={9} fill="rgba(0,0,0,0.35)" />
            <Circle
              cx={point.x}
              cy={point.y}
              r={8.5}
              fill={swatch ? swatch.soft : HOLE}
              stroke={swatch ? swatch.fill : '#6b5340'}
              strokeWidth={swatch ? 2.5 : 1.5}
            />
          </G>
        );
      })}
      {NESTS.map((nest, index) => {
        const swatch = DANGER_COLORS[index];
        if (!owned.has(index)) return null;
        return (
          <G key={`nest-${swatch.id}`}>
            <Rect
              x={nest.x - 24}
              y={nest.y - 24}
              width={48}
              height={48}
              rx={14}
              fill="rgba(8, 16, 12, 0.45)"
              stroke={swatch.fill}
              strokeWidth={3}
            />
            {CLUSTER.map((slot, peg) => (
              <Circle
                key={peg}
                cx={nest.x + slot.x}
                cy={nest.y + slot.y}
                r={7}
                fill={HOLE}
                stroke={swatch.fill}
                strokeWidth={1}
              />
            ))}
          </G>
        );
      })}
      <Circle cx={180} cy={182} r={48} fill="rgba(0,0,0,0.28)" />
      <Circle cx={180} cy={180} r={46} fill="#f4efe2" stroke={colors.accent} strokeWidth={5} />
      <Ellipse cx={166} cy={166} rx={16} ry={9} fill="rgba(255,255,255,0.55)" />
    </Svg>
  );
}

function MovingPeg({
  path,
  spotKey,
  scale,
  size,
  fill,
  label,
  active,
  selected,
  onPress,
}: {
  path: Point[];
  spotKey: string;
  scale: number;
  size: number;
  fill: string;
  label: string;
  active: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const frozen = useRef({ spotKey, path });
  if (frozen.current.spotKey !== spotKey) frozen.current = { spotKey, path };
  const routePoints = frozen.current.path;
  const progress = useRef(new Animated.Value(1)).current;
  const samples = samplePath(routePoints, scale, size);

  useEffect(() => {
    if (routePoints.length < 2 || reducedMotion()) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Math.min(980, 150 * (routePoints.length - 1)),
      easing: Easing.inOut(Easing.quad),
      isInteraction: false,
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [spotKey, progress, routePoints.length]);

  const translateX = progress.interpolate({ inputRange: samples.input, outputRange: samples.xs });
  const translateY = progress.interpolate({ inputRange: samples.input, outputRange: samples.ys });
  return (
    <Animated.View
      style={[
        styles.pegWrap,
        { width: size, height: size, zIndex: selected ? 6 : routePoints.length > 1 ? 4 : 2, transform: [{ translateX }, { translateY }] },
      ]}
    >
      <Pressable
        disabled={!active}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.pegHit}
      >
        <PegBody size={size} fill={fill} selected={selected} />
      </Pressable>
    </Animated.View>
  );
}

function PegBody({ size, fill, selected }: { size: number; fill: string; selected: boolean }) {
  const head = size * 0.78;
  return (
    <View style={styles.pegBody}>
      <View
        style={{
          position: 'absolute',
          width: head * 0.72,
          height: size * 0.42,
          borderRadius: size,
          backgroundColor: fill,
          bottom: size * 0.12,
          opacity: 0.95,
        }}
      />
      <View
        style={{
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: fill,
          borderWidth: selected ? 3 : 2,
          borderColor: selected ? colors.accent : '#fffaf0',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: head * 0.34,
            height: head * 0.22,
            borderRadius: head,
            marginTop: head * 0.16,
            backgroundColor: 'rgba(255,255,255,0.62)',
          }}
        />
      </View>
    </View>
  );
}

function Popper({
  die,
  heldFace,
  again,
  canRoll,
  scale,
  onRoll,
}: {
  die: number | null;
  heldFace: number | null;
  again: boolean;
  canRoll: boolean;
  scale: number;
  onRoll: () => void;
}) {
  const press = useRef(new Animated.Value(1)).current;
  const spin = useRef(new Animated.Value(1)).current;
  const face = die ?? heldFace;
  const [visible, setVisible] = useState<number | null>(face);

  useEffect(() => {
    if (die == null) {
      setVisible(heldFace);
      spin.setValue(1);
      return;
    }
    if (reducedMotion()) {
      setVisible(die);
      spin.setValue(1);
      return;
    }
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      setVisible(ticks > 7 ? die : 1 + Math.floor(Math.random() * 6));
      if (ticks > 7) clearInterval(timer);
    }, 55);
    spin.setValue(0);
    const animation = Animated.timing(spin, {
      toValue: 1,
      duration: 480,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => {
      clearInterval(timer);
      animation.stop();
    };
  }, [die, heldFace, spin]);

  const idle = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!canRoll || reducedMotion()) {
      idle.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, { toValue: 1.06, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: motionDriver() }),
        Animated.timing(idle, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: motionDriver() }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [canRoll, idle]);

  const size = 92 * scale;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-160deg', '0deg'] });
  const tumble = spin.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.72, 1.12, 1] });
  const squash = Animated.multiply(press, idle);
  return (
    <Animated.View
      style={[
        styles.popper,
        {
          width: size,
          height: size,
          left: (BOARD / 2) * scale - size / 2,
          top: (BOARD / 2) * scale - size / 2,
          borderRadius: size / 2,
          transform: [{ scale: squash }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={face != null && !canRoll ? `Die showing ${face}` : 'Roll'}
        disabled={!canRoll}
        onPress={() => {
          press.setValue(0.9);
          Animated.spring(press, { toValue: 1, useNativeDriver: motionDriver(), speed: 18, bounciness: 8 }).start();
          onRoll();
        }}
        style={styles.pegHit}
      >
        {face != null && !canRoll ? (
          <Animated.View style={{ transform: [{ rotate }, { scale: tumble }] }}>
            <DieFace face={visible ?? face} size={Math.max(28, 36 * scale)} />
          </Animated.View>
        ) : (
          <Text style={[styles.rollLabel, { fontSize: Math.max(16, 20 * scale) }]}>{again ? 'Again' : 'Roll'}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function DieFace({ face, size }: { face: number; size: number }) {
  const pip = Math.max(3, size * 0.16);
  const on = new Set(PIPS[face] ?? []);
  return (
    <View style={[styles.die, { width: size, height: size, borderRadius: size * 0.18, padding: size * 0.1 }]}>
      {Array.from({ length: 9 }, (_, index) => (
        <View key={index} style={styles.pipSlot}>
          {on.has(index) ? <View style={{ width: pip, height: pip, borderRadius: pip, backgroundColor: '#1a1408' }} /> : null}
        </View>
      ))}
    </View>
  );
}

function Landing({ x, y, size, onPress }: { x: number; y: number; size: number; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(reducedMotion() ? 1 : 0.55)).current;
  useEffect(() => {
    if (reducedMotion()) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.ease), useNativeDriver: motionDriver() }),
        Animated.timing(pulse, { toValue: 0.45, duration: 520, easing: Easing.inOut(Easing.ease), useNativeDriver: motionDriver() }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={[
        styles.landing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: x - size / 2,
          top: y - size / 2,
          opacity: pulse,
          transform: [{ scale: pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.86, 1.08] }) }],
        },
      ]}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Land here" onPress={onPress} style={styles.pegHit} />
    </Animated.View>
  );
}

function placedPegs(state: DangerState): Piece[] {
  const placed: Piece[] = [];
  for (const [playerId, row] of Object.entries(state.pegs)) {
    const color = colorIndexFor(state, playerId);
    row.forEach((spot, peg) => {
      const point = anchor(spot, color, peg);
      if (!point) return;
      placed.push({ key: `${playerId}-${peg}`, playerId, peg, color, spot, point });
    });
  }
  return placed;
}

function route(color: number, peg: number, from: DangerSpot, to: DangerSpot): Point[] {
  const start = anchor(from, color, peg);
  const end = anchor(to, color, peg);
  if (!start || !end) return end ? [end] : [];
  const fromProgress = progressOf(color, from);
  const toProgress = progressOf(color, to);
  if (fromProgress == null || toProgress == null || toProgress < fromProgress) return [start, end];
  const points = [start];
  for (let step = fromProgress + 1; step <= toProgress; step += 1) {
    points.push(step === toProgress ? end : pointAt(color, step));
  }
  return points;
}

function samplePath(path: Point[], scale: number, size: number): { input: number[]; xs: number[]; ys: number[] } {
  const steps = Math.max(1, (path.length - 1) * 4);
  const input: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const pos = t * (path.length - 1);
    const left = Math.floor(pos);
    const right = Math.min(path.length - 1, left + 1);
    const fraction = pos - left;
    const origin = path[left] ?? path[0];
    const dest = path[right] ?? origin;
    const hop = path.length > 1 ? Math.sin(Math.PI * fraction) * 12 : 0;
    input.push(t);
    xs.push((origin.x + (dest.x - origin.x) * fraction) * scale - size / 2);
    ys.push((origin.y + (dest.y - origin.y) * fraction) * scale - size / 2 - hop * scale);
  }
  if (input.length < 2) {
    const only = path[0] ?? { x: 0, y: 0 };
    return { input: [0, 1], xs: [only.x * scale - size / 2, only.x * scale - size / 2], ys: [only.y * scale - size / 2, only.y * scale - size / 2] };
  }
  return { input, xs, ys };
}

function progressOf(color: number, spot: DangerSpot): number | null {
  if (spot.zone === 'nest') return null;
  if (spot.zone === 'home') return HOME_PROGRESS;
  if (spot.zone === 'lane') return TRACK_SPACES + spot.index;
  return (spot.index - startIndex(color) + TRACK_SPACES) % TRACK_SPACES;
}

function pointAt(color: number, progress: number): Point {
  if (progress >= HOME_PROGRESS) return inward(color, LANE_SPACES);
  if (progress >= TRACK_SPACES) return inward(color, progress - TRACK_SPACES);
  return trackPoint((startIndex(color) + progress) % TRACK_SPACES);
}

function anchor(spot: DangerSpot, color: number, peg: number): Point | null {
  if (spot.zone === 'nest') {
    const nest = NESTS[color];
    const cluster = CLUSTER[peg] ?? { x: 0, y: 0 };
    return nest ? { x: nest.x + cluster.x, y: nest.y + cluster.y } : null;
  }
  if (spot.zone === 'home') {
    const base = inward(color, LANE_SPACES);
    const shift = CLUSTER[peg] ?? { x: 0, y: 0 };
    return { x: base.x + shift.x * 0.55, y: base.y + shift.y * 0.55 };
  }
  return spot.zone === 'track' ? trackPoint(spot.index) : inward(color, spot.index);
}

function spotPoint(spot: DangerSpot, color: number): Point | null {
  if (spot.zone === 'track') return trackPoint(spot.index);
  if (spot.zone === 'lane') return inward(color, spot.index);
  if (spot.zone === 'home') return inward(color, LANE_SPACES);
  return null;
}

function trackPoint(index: number): Point {
  const side = Math.floor(index / SIDE_SPACES) % 4;
  const step = index % SIDE_SPACES;
  if (side === 0) return { x: TRACK_INSET + STEP * step, y: TRACK_INSET + SPAN };
  if (side === 1) return { x: TRACK_INSET + SPAN, y: TRACK_INSET + SPAN - STEP * step };
  if (side === 2) return { x: TRACK_INSET + SPAN - STEP * step, y: TRACK_INSET };
  return { x: TRACK_INSET, y: TRACK_INSET + STEP * step };
}

function inward(color: number, lane: number): Point {
  const start = trackPoint(startIndex(color));
  const t = 0.24 + (lane / LANE_SPACES) * 0.34;
  return {
    x: start.x + (BOARD / 2 - start.x) * t,
    y: start.y + (BOARD / 2 - start.y) * t,
  };
}

function startColor(index: number): number | null {
  for (let color = 0; color < DANGER_COLORS.length; color += 1) {
    if (startIndex(color) === index) return color;
  }
  return null;
}

function sameSpot(a: DangerSpot, b: DangerSpot): boolean {
  if (a.zone !== b.zone) return false;
  if (a.zone === 'track' && b.zone === 'track') return a.index === b.index;
  if (a.zone === 'lane' && b.zone === 'lane') return a.index === b.index;
  return true;
}

function spotKey(spot: DangerSpot): string {
  if (spot.zone === 'track' || spot.zone === 'lane') return `${spot.zone}:${spot.index}`;
  return spot.zone;
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    backgroundColor: colors.woodDark,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.wood,
    overflow: 'hidden',
  },
  art: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' },
  pegWrap: { position: 'absolute', left: 0, top: 0 },
  pegHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pegBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  popper: { position: 'absolute', zIndex: 5, alignItems: 'center', justifyContent: 'center' },
  rollLabel: { color: '#1a1408', fontWeight: '800', textAlign: 'center' },
  die: {
    backgroundColor: '#f7f1e4',
    borderWidth: 1,
    borderColor: '#d9cbb0',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pipSlot: { width: '33.33%', height: '33.33%', alignItems: 'center', justifyContent: 'center' },
  landing: {
    position: 'absolute',
    zIndex: 7,
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
});

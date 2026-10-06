import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
  BACKGAMMON_SIDES,
  pointCount,
  type BackgammonMove,
  type BackgammonState,
  type Side,
} from '../domain/backgammon';
import { colors } from '../theme';

type Props = {
  state: BackgammonState;
  moves: readonly BackgammonMove[];
  selected: number | 'bar' | null;
  flip: boolean;
  disabled?: boolean;
  onPoint: (point: number) => void;
  onBar: () => void;
  onBearOff: () => void;
};

const PW = 1;
const PH = 4;
const MID = 1.05;
const BAR = 0.92;
const OFF = 0.82;
const PAD = 0.16;
const BOARD_W = PAD * 2 + PW * 12 + BAR + OFF;
const BOARD_H = PAD * 2 + PH * 2 + MID;
const CHECKER_R = 0.32;
const STACK = 0.66;

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

export function BackgammonBoard({ state, moves, selected, flip, disabled, onPoint, onBar, onBearOff }: Props) {
  const { top, bottom } = pointRows(flip);
  const active = selected == null ? [] : moves.filter((move) => move.from === selected);
  const origins = new Set(moves.map((move) => move.from));
  const [box, setBox] = useState({ w: 0, h: 0 });
  const { flying, motion } = useFlight(state);
  const pulse = usePulse();

  return (
    <View style={styles.frame} onLayout={(event) => setBox({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} pointerEvents="none">
        <Rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={0.22} fill="#4a2e1c" />
        <Rect x={0.1} y={0.1} width={BOARD_W - 0.2} height={BOARD_H - 0.2} rx={0.14} fill="#2a180e" />
        <Rect x={PAD} y={PAD} width={BOARD_W - PAD * 2} height={BOARD_H - PAD * 2} rx={0.08} fill="#1b4a38" />
        <Rect x={barLeft(flip)} y={PAD} width={BAR} height={BOARD_H - PAD * 2} fill="#3a2416" />
        <Rect x={offLeft(flip)} y={PAD} width={OFF - 0.08} height={BOARD_H - PAD * 2} rx={0.06} fill="#f4e6c4" />

        {top.map((point, index) => (
          <PointShape
            key={`top-${point}`}
            point={point}
            index={index}
            edge="top"
            flip={flip}
            selected={selected === point}
            movable={origins.has(point)}
          />
        ))}
        {bottom.map((point, index) => (
          <PointShape
            key={`bottom-${point}`}
            point={point}
            index={index}
            edge="bottom"
            flip={flip}
            selected={selected === point}
            movable={origins.has(point)}
          />
        ))}

        {top.map((point, index) => (
          <CheckerStack
            key={`stack-top-${point}`}
            point={point}
            index={index}
            edge="top"
            flip={flip}
            state={state}
            omit={flying && state.lastMove?.to === point ? 1 : 0}
          />
        ))}
        {bottom.map((point, index) => (
          <CheckerStack
            key={`stack-bottom-${point}`}
            point={point}
            index={index}
            edge="bottom"
            flip={flip}
            state={state}
            omit={flying && state.lastMove?.to === point ? 1 : 0}
          />
        ))}

        <BarStack state={state} flip={flip} selected={selected === 'bar'} flying={flying} />
        <OffStack state={state} flip={flip} flying={flying} />

        {top.map((point, index) => (
          <PointNumber key={`num-top-${point}`} point={point} index={index} edge="top" flip={flip} />
        ))}
        {bottom.map((point, index) => (
          <PointNumber key={`num-bottom-${point}`} point={point} index={index} edge="bottom" flip={flip} />
        ))}

        <Cube state={state} flip={flip} />
      </Svg>

      <View style={styles.hits} pointerEvents="box-none">
        {top.map((point, index) => (
          <PointHit
            key={`hit-top-${point}`}
            point={point}
            index={index}
            edge="top"
            flip={flip}
            disabled={disabled}
            label={pointLabel(state, point, origins.has(point), selected === point, active)}
            onPress={() => onPoint(point)}
          />
        ))}
        {bottom.map((point, index) => (
          <PointHit
            key={`hit-bottom-${point}`}
            point={point}
            index={index}
            edge="bottom"
            flip={flip}
            disabled={disabled}
            label={pointLabel(state, point, origins.has(point), selected === point, active)}
            onPress={() => onPoint(point)}
          />
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={barLabel(state, origins.has('bar'), selected === 'bar')}
          disabled={disabled}
          onPress={onBar}
          style={abs(barLeft(flip), PAD, BAR, BOARD_H - PAD * 2)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bear off"
          disabled={disabled}
          onPress={onBearOff}
          style={abs(offLeft(flip), PAD, OFF - 0.08, BOARD_H - PAD * 2)}
        />
      </View>

      <View pointerEvents="none" style={styles.hits}>
        {flying ? null : (
          <>
            {[...origins].map((origin) => (
              <CheckerRing
                key={`origin-${String(origin)}`}
                center={originCenter(origin, state, flip)}
                pulse={selected === origin ? undefined : pulse}
                strong={selected === origin}
              />
            ))}
            {active.map((move) => (
              <LandingMark key={`${move.from}-${move.to}-${move.die}`} move={move} state={state} flip={flip} width={box.w} />
            ))}
          </>
        )}
        {flying && state.lastMove && box.w > 0 ? (
          <MoveGhost state={state} flip={flip} motion={motion} box={box} />
        ) : null}
      </View>
    </View>
  );
}

function usePulse(): Animated.Value {
  const pulse = useRef(new Animated.Value(reducedMotion() ? 1 : 0.45)).current;
  useEffect(() => {
    if (reducedMotion()) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          isInteraction: false,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0.72,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          isInteraction: false,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

function useFlight(state: BackgammonState): { flying: boolean; motion: Animated.Value } {
  const motion = useRef(new Animated.Value(1)).current;
  const [flying, setFlying] = useState(false);
  const token = flightToken(state);
  const initial = useRef(true);
  const settled = useRef(token);

  useEffect(() => {
    let cancelled = false;
    if (initial.current) {
      initial.current = false;
      settled.current = token;
      motion.setValue(1);
      return;
    }
    if (settled.current === token || !token || reducedMotion()) {
      settled.current = token;
      motion.setValue(1);
      setFlying(false);
      return;
    }
    setFlying(true);
    motion.setValue(0);
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: 460,
      easing: Easing.out(Easing.cubic),
      isInteraction: false,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start(({ finished }) => {
      if (!finished || cancelled) return;
      settled.current = token;
      setFlying(false);
    });
    return () => {
      cancelled = true;
      animation.stop();
    };
  }, [token, motion]);

  return { flying, motion };
}

function flightToken(state: BackgammonState): string {
  const move = state.lastMove;
  if (!move) return '';
  return `${state.lastAction ?? ''}|${move.from}|${move.to}|${move.die}|${move.hit ? 1 : 0}`;
}

function PointShape({
  point,
  index,
  edge,
  flip,
  selected,
  movable,
}: {
  point: number;
  index: number;
  edge: 'top' | 'bottom';
  flip: boolean;
  selected: boolean;
  movable: boolean;
}) {
  const geo = pointGeometry(index, edge, flip);
  const fill = point % 2 === 1 ? '#8c2f2a' : '#f4e2bc';
  return (
    <>
      <Polygon points={geo.points} fill={fill} stroke="rgba(0,0,0,0.18)" strokeWidth={0.02} />
      {selected || movable ? (
        <Polygon points={geo.points} fill="none" stroke="#e6c56a" strokeWidth={selected ? 0.07 : 0.04} />
      ) : null}
    </>
  );
}

function CheckerStack({
  point,
  index,
  edge,
  flip,
  state,
  omit,
}: {
  point: number;
  index: number;
  edge: 'top' | 'bottom';
  flip: boolean;
  state: BackgammonState;
  omit: number;
}) {
  const stack = pointCount(state, point);
  if (!stack.side || stack.count === 0) return null;
  const x = columnLeft(index, flip) + PW / 2;
  return <Pile x={x} edge={edge} side={stack.side} count={stack.count} omit={omit} />;
}

function BarStack({
  state,
  flip,
  selected,
  flying,
}: {
  state: BackgammonState;
  flip: boolean;
  selected: boolean;
  flying: boolean;
}) {
  const x = barLeft(flip) + BAR / 2;
  const hitSide: Side = state.turn === 'light' ? 'dark' : 'light';
  return (
    <>
      {selected ? (
        <Rect
          x={barLeft(flip) + 0.06}
          y={PAD + 0.06}
          width={BAR - 0.12}
          height={BOARD_H - PAD * 2 - 0.12}
          fill="none"
          stroke="#e6c56a"
          strokeWidth={0.06}
        />
      ) : null}
      <Pile
        x={x}
        edge={halfEdge('light', flip)}
        side="light"
        count={state.bar.light}
        omit={flying && state.lastMove?.hit && hitSide === 'light' ? 1 : 0}
        inset
      />
      <Pile
        x={x}
        edge={halfEdge('dark', flip)}
        side="dark"
        count={state.bar.dark}
        omit={flying && state.lastMove?.hit && hitSide === 'dark' ? 1 : 0}
        inset
      />
    </>
  );
}

function OffStack({ state, flip, flying }: { state: BackgammonState; flip: boolean; flying: boolean }) {
  const x = offLeft(flip) + (OFF - 0.08) / 2;
  return (
    <>
      <Pile
        x={x}
        edge={halfEdge('light', flip)}
        side="light"
        count={state.off.light}
        omit={flying && state.lastMove?.to === 'off' && state.turn === 'light' ? 1 : 0}
        inset
      />
      <Pile
        x={x}
        edge={halfEdge('dark', flip)}
        side="dark"
        count={state.off.dark}
        omit={flying && state.lastMove?.to === 'off' && state.turn === 'dark' ? 1 : 0}
        inset
      />
    </>
  );
}

function PointNumber({
  point,
  index,
  edge,
  flip,
}: {
  point: number;
  index: number;
  edge: 'top' | 'bottom';
  flip: boolean;
}) {
  const x = columnLeft(index, flip) + PW / 2;
  const y = edge === 'top' ? PAD + PH + 0.42 : BOARD_H - PAD - PH - 0.14;
  return (
    <SvgText x={x} y={y} fontSize={0.24} fontWeight="700" textAnchor="middle" fill="#e6c56a">
      {point}
    </SvgText>
  );
}

function Cube({ state, flip }: { state: BackgammonState; flip: boolean }) {
  const owner = state.cubeOwner;
  const x = barLeft(flip) + BAR / 2;
  const y = BOARD_H / 2;
  const fill = owner ? BACKGAMMON_SIDES[owner].fill : '#f7f1e6';
  const ink = owner ? BACKGAMMON_SIDES[owner].ink : '#2a2118';
  return (
    <>
      <Rect x={x - 0.28} y={y - 0.28} width={0.56} height={0.56} rx={0.08} fill={fill} stroke="#e6c56a" strokeWidth={0.04} />
      <SvgText x={x} y={y + 0.1} fontSize={0.28} fontWeight="700" textAnchor="middle" fill={ink}>
        {state.offer ? state.cube * 2 : state.cube}
      </SvgText>
    </>
  );
}

function Pile({
  x,
  edge,
  side,
  count,
  omit = 0,
  inset,
}: {
  x: number;
  edge: 'top' | 'bottom';
  side: Side;
  count: number;
  omit?: number;
  inset?: boolean;
}) {
  const visible = Math.max(0, count - omit);
  if (visible <= 0) return null;
  const shown = Math.min(visible, 5);
  const color = BACKGAMMON_SIDES[side];
  return (
    <>
      {Array.from({ length: shown }, (_, index) => {
        const y = pileY(edge, index, inset);
        return (
          <Checker key={index} cx={x} cy={y} fill={color.fill} rim={color.rim} />
        );
      })}
      {visible > 5 ? (
        <SvgText
          x={x}
          y={pileY(edge, shown - 1, inset) + 0.1}
          fontSize={0.28}
          fontWeight="700"
          textAnchor="middle"
          fill={color.ink}
        >
          {visible}
        </SvgText>
      ) : null}
    </>
  );
}

function Checker({ cx, cy, fill, rim }: { cx: number; cy: number; fill: string; rim: string }) {
  return (
    <>
      <Circle cx={cx + 0.03} cy={cy + 0.045} r={CHECKER_R} fill="rgba(0,0,0,0.28)" />
      <Circle cx={cx} cy={cy} r={CHECKER_R} fill={fill} stroke={rim} strokeWidth={0.045} />
      <Circle cx={cx} cy={cy} r={CHECKER_R * 0.68} fill="none" stroke={rim} strokeWidth={0.02} opacity={0.85} />
      <Circle cx={cx - 0.08} cy={cy - 0.09} r={CHECKER_R * 0.16} fill="rgba(255,255,255,0.35)" />
    </>
  );
}

function CheckerRing({
  center,
  pulse,
  strong,
}: {
  center: { cx: number; cy: number } | null;
  pulse?: Animated.Value;
  strong?: boolean;
}) {
  if (!center) return null;
  const pad = 0.07;
  const size = (CHECKER_R + pad) * 2;
  const style = {
    ...abs(center.cx - CHECKER_R - pad, center.cy - CHECKER_R - pad, size, size),
    borderRadius: 999,
    borderWidth: strong ? 3 : 2,
    borderColor: colors.accent,
  };
  if (!pulse) return <View style={style} />;
  return <Animated.View style={[style, { opacity: pulse }]} />;
}

function LandingMark({
  move,
  state,
  flip,
  width,
}: {
  move: BackgammonMove;
  state: BackgammonState;
  flip: boolean;
  width: number;
}) {
  const center = landingCenter(move, state, flip);
  if (!center) return null;
  const pad = 0.02;
  const size = CHECKER_R * 2;
  const fontSize = width > 0 ? Math.max(11, (width / BOARD_W) * 0.3) : 12;
  return (
    <View
      style={[
        abs(center.cx - CHECKER_R, center.cy - CHECKER_R, size, size),
        styles.landing,
        { borderRadius: 999, margin: 0 },
        move.hit ? styles.landingHit : null,
        { padding: pad },
      ]}
    >
      <Text style={[styles.landingDie, { fontSize }, move.hit ? styles.landingDieHit : null]}>{move.die}</Text>
    </View>
  );
}

function MoveGhost({
  state,
  flip,
  motion,
  box,
}: {
  state: BackgammonState;
  flip: boolean;
  motion: Animated.Value;
  box: { w: number; h: number };
}) {
  const move = state.lastMove;
  if (!move) return null;
  const size = (CHECKER_R * 2 * box.w) / BOARD_W;
  return (
    <>
      <FlyingDisc side={state.turn} from={startOf(move, state, flip)} to={endOf(move, state, flip)} motion={motion} size={size} />
      {move.hit && typeof move.to === 'number' ? (
        <FlyingDisc
          side={state.turn === 'light' ? 'dark' : 'light'}
          from={pointSlot(move.to, 0, flip)}
          to={barSlot(state.turn === 'light' ? 'dark' : 'light', Math.max(0, state.bar[state.turn === 'light' ? 'dark' : 'light'] - 1), flip)}
          motion={motion}
          size={size}
        />
      ) : null}
    </>
  );
}

function FlyingDisc({
  side,
  from,
  to,
  motion,
  size,
}: {
  side: Side;
  from: { cx: number; cy: number } | null;
  to: { cx: number; cy: number } | null;
  motion: Animated.Value;
  size: number;
}) {
  if (!from || !to) return null;
  const color = BACKGAMMON_SIDES[side];
  const boardW = (size / (CHECKER_R * 2)) * BOARD_W;
  const boardH = boardW * (BOARD_H / BOARD_W);
  const translateX = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ((to.cx - from.cx) / BOARD_W) * boardW],
  });
  const translateY = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, ((to.cy - from.cy) / BOARD_H) * boardH],
  });
  const scale = motion.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 1.12, 1],
  });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: percent(from.cx - CHECKER_R, BOARD_W),
        top: percent(from.cy - CHECKER_R, BOARD_H),
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color.fill,
        borderWidth: Math.max(2, size * 0.08),
        borderColor: color.rim,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    />
  );
}

function PointHit({
  point,
  index,
  edge,
  flip,
  disabled,
  label,
  onPress,
}: {
  point: number;
  index: number;
  edge: 'top' | 'bottom';
  flip: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const y = edge === 'top' ? PAD : BOARD_H - PAD - PH;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={abs(columnLeft(index, flip), y, PW, PH)}
    />
  );
}

function pointRows(flip: boolean): { top: number[]; bottom: number[] } {
  return flip
    ? { top: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], bottom: [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13] }
    : { top: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], bottom: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] };
}

function pointGeometry(index: number, edge: 'top' | 'bottom', flip: boolean): { points: string } {
  const x = columnLeft(index, flip);
  const base = edge === 'top' ? PAD : BOARD_H - PAD;
  const tip = edge === 'top' ? PAD + PH : BOARD_H - PAD - PH;
  return { points: `${x},${base} ${x + PW},${base} ${x + PW / 2},${tip}` };
}

function locate(point: number, flip: boolean): { x: number; edge: 'top' | 'bottom' } | null {
  const rows = pointRows(flip);
  const top = rows.top.indexOf(point);
  if (top >= 0) return { x: columnLeft(top, flip) + PW / 2, edge: 'top' };
  const bottom = rows.bottom.indexOf(point);
  if (bottom >= 0) return { x: columnLeft(bottom, flip) + PW / 2, edge: 'bottom' };
  return null;
}

function pileY(edge: 'top' | 'bottom', index: number, inset?: boolean): number {
  const limit = inset ? PH / 2 - CHECKER_R : PH - CHECKER_R;
  const travel = Math.min(index * STACK, Math.max(0, limit - CHECKER_R));
  if (edge === 'top') return PAD + CHECKER_R + travel;
  return BOARD_H - PAD - CHECKER_R - travel;
}

function halfEdge(side: Side, flip: boolean): 'top' | 'bottom' {
  const atBottom = flip ? side === 'dark' : side === 'light';
  return atBottom ? 'bottom' : 'top';
}

function origin(flip: boolean): number {
  return flip ? PAD + OFF : PAD;
}

function columnLeft(index: number, flip: boolean): number {
  return origin(flip) + index * PW + (index >= 6 ? BAR : 0);
}

function barLeft(flip: boolean): number {
  return origin(flip) + 6 * PW;
}

function offLeft(flip: boolean): number {
  return flip ? PAD : PAD + PW * 12 + BAR;
}

function pointSlot(point: number, index: number, flip: boolean): { cx: number; cy: number } | null {
  const spot = locate(point, flip);
  if (!spot) return null;
  return { cx: spot.x, cy: pileY(spot.edge, index, false) };
}

function barSlot(side: Side, index: number, flip: boolean): { cx: number; cy: number } {
  return { cx: barLeft(flip) + BAR / 2, cy: pileY(halfEdge(side, flip), index, true) };
}

function offSlot(side: Side, index: number, flip: boolean): { cx: number; cy: number } {
  return { cx: offLeft(flip) + (OFF - 0.08) / 2, cy: pileY(halfEdge(side, flip), index, true) };
}

function originCenter(from: number | 'bar', state: BackgammonState, flip: boolean): { cx: number; cy: number } | null {
  if (from === 'bar') {
    const count = state.bar[state.turn];
    if (count <= 0) return null;
    return barSlot(state.turn, Math.min(count, 5) - 1, flip);
  }
  const stack = pointCount(state, from);
  if (!stack.side || stack.count <= 0) return null;
  return pointSlot(from, Math.min(stack.count, 5) - 1, flip);
}

function landingCenter(move: BackgammonMove, state: BackgammonState, flip: boolean): { cx: number; cy: number } | null {
  if (move.to === 'off') return offSlot(state.turn, Math.min(state.off[state.turn], 4), flip);
  const stack = pointCount(state, move.to);
  const index = move.hit ? 0 : Math.min(stack.count, 4);
  return pointSlot(move.to, index, flip);
}

function startOf(move: BackgammonMove, state: BackgammonState, flip: boolean): { cx: number; cy: number } | null {
  if (move.from === 'bar') return barSlot(state.turn, Math.min(state.bar[state.turn], 4), flip);
  const stack = pointCount(state, move.from);
  return pointSlot(move.from, Math.min(stack.count, 4), flip);
}

function endOf(move: BackgammonMove, state: BackgammonState, flip: boolean): { cx: number; cy: number } | null {
  if (move.to === 'off') {
    const count = state.off[state.turn];
    return offSlot(state.turn, Math.max(0, Math.min(count, 5) - 1), flip);
  }
  const stack = pointCount(state, move.to);
  const index = move.hit ? 0 : Math.max(0, Math.min(stack.count, 5) - 1);
  return pointSlot(move.to, index, flip);
}

function pointLabel(
  state: BackgammonState,
  point: number,
  movable: boolean,
  selected: boolean,
  active: readonly BackgammonMove[],
): string {
  const stack = pointCount(state, point);
  const who = stack.side ? `${stack.count} ${BACKGAMMON_SIDES[stack.side].name}` : 'Empty';
  const landings = active.filter((move) => move.to === point);
  const landing =
    landings.length > 0
      ? `, ${landings.map((move) => `play ${move.die}${move.hit ? ', hit' : ''}`).join(' or ')}`
      : '';
  const extra = selected ? ', selected' : movable ? ', can move' : '';
  return `Point ${point}, ${who}${extra}${landing}`;
}

function barLabel(state: BackgammonState, movable: boolean, selected: boolean): string {
  const extra = selected ? ', selected' : movable ? ', can move' : '';
  return `Bar, ${state.bar.light} white, ${state.bar.dark} black${extra}`;
}

function percent(part: number, whole: number): `${number}%` {
  return `${(part / whole) * 100}%` as `${number}%`;
}

function abs(x: number, y: number, width: number, height: number) {
  return {
    position: 'absolute' as const,
    left: percent(x, BOARD_W),
    top: percent(y, BOARD_H),
    width: percent(width, BOARD_W),
    height: percent(height, BOARD_H),
  };
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: BOARD_W / BOARD_H, borderRadius: 16, overflow: 'hidden' },
  hits: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  landing: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6c56a',
    borderWidth: 2,
    borderColor: '#6b4a10',
  },
  landingHit: {
    backgroundColor: '#e86a5c',
    borderColor: '#6b2218',
  },
  landingDie: { color: '#1a1408', fontWeight: '800' },
  landingDieHit: { color: '#fff6f4' },
});

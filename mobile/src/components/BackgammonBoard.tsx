import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import {
  BACKGAMMON_SIDES,
  pointCount,
  type BackgammonMove,
  type BackgammonState,
  type Side,
} from '../domain/backgammon';

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
const PH = 4.7;
const BAR = 0.9;
const OFF = 0.78;
const PAD = 0.14;
const BOARD_W = PAD * 2 + PW * 12 + BAR + OFF;
const BOARD_H = PAD * 2 + PH * 2;
const CHECKER_R = 0.32;
const STACK = 0.68;

export function BackgammonBoard({ state, moves, selected, flip, disabled, onPoint, onBar, onBearOff }: Props) {
  const { top, bottom } = pointRows(flip);
  const active = selected == null ? [] : moves.filter((move) => move.from === selected);
  const origins = new Set(moves.map((move) => move.from));

  return (
    <View style={styles.frame}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} pointerEvents="none">
        <Rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={0.16} fill="#3e2716" />
        <Rect x={0.08} y={0.08} width={BOARD_W - 0.16} height={BOARD_H - 0.16} rx={0.1} fill="#e7d0a0" />
        <Rect x={barLeft(flip)} y={PAD} width={BAR} height={BOARD_H - PAD * 2} fill="#5a381f" />
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
            landed={state.lastMove?.from === point || state.lastMove?.to === point}
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
            landed={state.lastMove?.from === point || state.lastMove?.to === point}
          />
        ))}

        {top.map((point, index) => (
          <CheckerStack key={`stack-top-${point}`} point={point} index={index} edge="top" flip={flip} state={state} />
        ))}
        {bottom.map((point, index) => (
          <CheckerStack key={`stack-bottom-${point}`} point={point} index={index} edge="bottom" flip={flip} state={state} />
        ))}

        <BarStack state={state} flip={flip} selected={selected === 'bar'} />
        <OffStack state={state} flip={flip} />
        {active.map((move) => (
          <Landing key={`${move.from}-${move.to}-${move.die}`} move={move} flip={flip} state={state} />
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
            label={pointLabel(state, point, origins.has(point), selected === point)}
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
            label={pointLabel(state, point, origins.has(point), selected === point)}
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
    </View>
  );
}

function PointShape({
  point,
  index,
  edge,
  flip,
  selected,
  movable,
  landed,
}: {
  point: number;
  index: number;
  edge: 'top' | 'bottom';
  flip: boolean;
  selected: boolean;
  movable: boolean;
  landed: boolean;
}) {
  const x = columnLeft(index, flip);
  const tip = edge === 'top' ? PAD + PH : BOARD_H - PAD - PH;
  const base = edge === 'top' ? PAD : BOARD_H - PAD;
  const points = `${x},${base} ${x + PW},${base} ${x + PW / 2},${tip}`;
  return (
    <>
      {landed ? <Rect x={x + 0.04} y={Math.min(base, tip)} width={PW - 0.08} height={PH} fill="rgba(212,168,75,0.28)" /> : null}
      <Polygon points={points} fill={point % 2 === 1 ? '#9a3b32' : '#f6e4b8'} />
      {selected || movable ? (
        <Polygon points={points} fill="none" stroke="#d4a84b" strokeWidth={selected ? 0.07 : 0.035} />
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
}: {
  point: number;
  index: number;
  edge: 'top' | 'bottom';
  flip: boolean;
  state: BackgammonState;
}) {
  const stack = pointCount(state, point);
  if (!stack.side || stack.count === 0) return null;
  const x = columnLeft(index, flip) + PW / 2;
  return <Pile x={x} edge={edge} side={stack.side} count={stack.count} />;
}

function BarStack({ state, flip, selected }: { state: BackgammonState; flip: boolean; selected: boolean }) {
  const x = barLeft(flip) + BAR / 2;
  return (
    <>
      {selected ? (
        <Rect
          x={barLeft(flip) + 0.06}
          y={PAD + 0.06}
          width={BAR - 0.12}
          height={BOARD_H - PAD * 2 - 0.12}
          fill="none"
          stroke="#d4a84b"
          strokeWidth={0.06}
        />
      ) : null}
      <Pile x={x} edge={halfEdge('light', flip)} side="light" count={state.bar.light} inset />
      <Pile x={x} edge={halfEdge('dark', flip)} side="dark" count={state.bar.dark} inset />
    </>
  );
}

function OffStack({ state, flip }: { state: BackgammonState; flip: boolean }) {
  const x = offLeft(flip) + (OFF - 0.08) / 2;
  return (
    <>
      <Pile x={x} edge={halfEdge('light', flip)} side="light" count={state.off.light} inset />
      <Pile x={x} edge={halfEdge('dark', flip)} side="dark" count={state.off.dark} inset />
    </>
  );
}

function Landing({ move, flip, state }: { move: BackgammonMove; flip: boolean; state: BackgammonState }) {
  if (move.to === 'off') {
    const edge = halfEdge(state.turn, flip);
    const count = state.off[state.turn];
    const y = pileY(edge, Math.min(count, 4), true);
    return <Circle cx={offLeft(flip) + (OFF - 0.08) / 2} cy={y} r={CHECKER_R} fill="none" stroke="#d4a84b" strokeWidth={0.06} />;
  }
  const spot = locate(move.to, flip);
  if (!spot) return null;
  const stack = pointCount(state, move.to);
  const y = pileY(spot.edge, move.hit ? 0 : Math.min(stack.count, 4), false);
  return (
    <Circle
      cx={spot.x}
      cy={y}
      r={CHECKER_R}
      fill={move.hit ? 'rgba(232,106,92,0.35)' : 'none'}
      stroke="#d4a84b"
      strokeWidth={0.06}
    />
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
      <Rect x={x - 0.28} y={y - 0.28} width={0.56} height={0.56} rx={0.08} fill={fill} stroke="#d4a84b" strokeWidth={0.04} />
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
  inset,
}: {
  x: number;
  edge: 'top' | 'bottom';
  side: Side;
  count: number;
  inset?: boolean;
}) {
  if (count <= 0) return null;
  const shown = Math.min(count, 5);
  const color = BACKGAMMON_SIDES[side];
  return (
    <>
      {Array.from({ length: shown }, (_, index) => {
        const y = pileY(edge, index, inset);
        return <Circle key={index} cx={x} cy={y} r={CHECKER_R} fill={color.fill} stroke={color.rim} strokeWidth={0.045} />;
      })}
      {count > 5 ? (
        <SvgText
          x={x}
          y={pileY(edge, shown - 1, inset) + 0.1}
          fontSize={0.28}
          fontWeight="700"
          textAnchor="middle"
          fill={color.ink}
        >
          {count}
        </SvgText>
      ) : null}
    </>
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

function pointLabel(state: BackgammonState, point: number, movable: boolean, selected: boolean): string {
  const stack = pointCount(state, point);
  const who = stack.side ? `${stack.count} ${BACKGAMMON_SIDES[stack.side].name}` : 'Empty';
  const extra = selected ? ', selected' : movable ? ', can move' : '';
  return `Point ${point}, ${who}${extra}`;
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
  frame: { width: '100%', aspectRatio: BOARD_W / BOARD_H },
  hits: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
});

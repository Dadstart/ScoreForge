import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, View, type PointerEvent, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Polygon } from 'react-native-svg';
import {
  BOARD,
  CORNERS,
  STAR_OUTLINE,
  campAt,
  cellPixel,
  opposite,
  rotateCell,
  type ChineseHop,
  type ChinesePiece,
  type Corner,
} from '../domain/chineseCheckers';
import { colors } from '../theme';

type Cell = { q: number; r: number };
type Box = { x: number; y: number; width: number; height: number };
type Lift = { q: number; r: number; x: number; y: number };

type Props = {
  pieces: readonly ChinesePiece[];
  hops: readonly ChineseHop[];
  selected: Cell | null;
  lastMove: ChineseHop | null;
  /** Starts and goals that should pick up their color. */
  camps: readonly Corner[];
  /** Camps the player to move is trying to fill. */
  goals: readonly Corner[];
  fifteen: boolean;
  rotation: number;
  disabled?: boolean;
  onCell: (q: number, r: number) => void;
  onDrop: (fromQ: number, fromR: number, toQ: number, toR: number) => void;
};

const VIEW = { x: -7.3, y: -8.3, width: 14.6, height: 16.6 };
const TAP_SLOP = 12;
const HIT_RADIUS = 0.55;

export function ChineseCheckersBoard({
  pieces,
  hops,
  selected,
  lastMove,
  camps,
  goals,
  fifteen,
  rotation,
  disabled,
  onCell,
  onDrop,
}: Props) {
  const layout = useRef({ width: 0, height: 0 });
  const boxRef = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const [lift, setLift] = useState<Lift | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const stopListening = useRef<(() => void) | null>(null);
  const api = useRef({ pieces, hops, rotation, disabled, onCell, onDrop });
  api.current = { pieces, hops, rotation, disabled, onCell, onDrop };
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: Cell | null;
  } | null>(null);

  useEffect(() => () => stopListening.current?.(), []);

  const cellAt = (clientX: number, clientY: number): Cell | null => {
    const box = boxRef.current;
    if (box.width <= 0 || box.height <= 0) return null;
    const vx = VIEW.x + ((clientX - box.x) / box.width) * VIEW.width;
    const vy = VIEW.y + ((clientY - box.y) / box.height) * VIEW.height;
    let best: Cell | null = null;
    let bestDist = HIT_RADIUS;
    for (const cell of BOARD) {
      const point = pixel(cell.q, cell.r, api.current.rotation);
      const dist = Math.hypot(point.x - vx, point.y - vy);
      if (dist <= bestDist) {
        bestDist = dist;
        best = cell;
      }
    }
    return best;
  };

  const movable = (cell: Cell | null) =>
    cell != null &&
    !api.current.disabled &&
    api.current.hops.some((hop) => hop.fromQ === cell.q && hop.fromR === cell.r);

  const remember = (clientX: number, clientY: number, locationX: number, locationY: number) => {
    const { width, height } = layout.current;
    if (width <= 0 || height <= 0) return;
    boxRef.current = { x: clientX - locationX, y: clientY - locationY, width, height };
  };

  const track = (clientX: number, clientY: number) => {
    const active = gesture.current;
    if (!active?.origin || !movable(active.origin)) return;
    setLift({ q: active.origin.q, r: active.origin.r, x: clientX, y: clientY });
    const under = cellAt(clientX, clientY);
    const legal =
      under != null &&
      api.current.hops.some(
        (hop) =>
          hop.fromQ === active.origin!.q &&
          hop.fromR === active.origin!.r &&
          hop.toQ === under.q &&
          hop.toR === under.r,
      );
    setHover(legal ? under : null);
  };

  const finish = (clientX: number, clientY: number) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    stopListening.current?.();
    stopListening.current = null;
    const moved = Math.hypot(clientX - active.startX, clientY - active.startY) >= TAP_SLOP;
    const origin = active.origin;
    const target = origin && moved ? cellAt(clientX, clientY) : null;
    setLift(null);
    setHover(null);
    if (!origin || api.current.disabled) return;
    if (!moved) {
      api.current.onCell(origin.q, origin.r);
      return;
    }
    if (!target || !movable(origin)) return;
    const legal = api.current.hops.some(
      (hop) => hop.fromQ === origin.q && hop.fromR === origin.r && hop.toQ === target.q && hop.toR === target.r,
    );
    if (legal) api.current.onDrop(origin.q, origin.r, target.q, target.r);
  };

  const begin = (clientX: number, clientY: number, locationX: number, locationY: number, pointerId: number) => {
    if (api.current.disabled) return;
    remember(clientX, clientY, locationX, locationY);
    const origin = cellAt(clientX, clientY);
    gesture.current = { pointerId, startX: clientX, startY: clientY, origin };
    if (movable(origin)) setLift({ q: origin!.q, r: origin!.r, x: clientX, y: clientY });
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web',
      onStartShouldSetPanResponderCapture: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponderCapture: () => Platform.OS !== 'web',
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        const native = event.nativeEvent;
        begin(native.pageX, native.pageY, native.locationX, native.locationY, -1);
      },
      onPanResponderMove: (event) => {
        track(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onPanResponderRelease: (event) => {
        finish(event.nativeEvent.pageX, event.nativeEvent.pageY);
      },
      onPanResponderTerminate: () => {
        gesture.current = null;
        setLift(null);
        setHover(null);
      },
    }),
  ).current;

  const onPointerDown = (event: PointerEvent) => {
    if (event.nativeEvent.pointerType !== 'touch' && event.nativeEvent.button !== 0 && event.nativeEvent.button != null) return;
    const native = event.nativeEvent;
    const target = event.currentTarget as {
      setPointerCapture?: (id: number) => void;
      getBoundingClientRect?: () => { x: number; y: number; width: number; height: number };
    };
    const rect = target.getBoundingClientRect?.();
    if (rect) layout.current = { width: rect.width, height: rect.height };
    begin(
      native.clientX,
      native.clientY,
      rect ? native.clientX - rect.x : 0,
      rect ? native.clientY - rect.y : 0,
      native.pointerId,
    );
    event.preventDefault?.();
    try {
      target.setPointerCapture?.(native.pointerId);
    } catch {
      // A pointer that is already gone should not cancel the drag.
    }
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const pointerId = native.pointerId;
    const move = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      track(pointer.clientX, pointer.clientY);
    };
    const up = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      finish(pointer.clientX, pointer.clientY);
    };
    stopListening.current?.();
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    stopListening.current = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
  };

  const campSet = new Set(camps);
  const goalSet = new Set(goals);
  const focus = lift ?? selected;
  const shownHops = focus ? hops.filter((hop) => hop.fromQ === focus.q && hop.fromR === focus.r) : [];
  const dragPoint = lift ? clientToView(lift.x, lift.y, boxRef.current) : null;
  const dragged = lift ? pieces.find((piece) => piece.q === lift.q && piece.r === lift.r) : null;
  const draggedSide = dragged ? CORNERS[dragged.corner] : null;
  const outline = STAR_OUTLINE.map((cell) => {
    const point = pixel(cell.q, cell.r, rotation);
    return `${point.x * 1.16},${point.y * 1.16}`;
  }).join(' ');

  return (
    <View
      accessibilityLabel="Chinese checkers board"
      accessibilityHint="Drag a piece to a highlighted hole, or tap the piece and then the hole"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        layout.current = { width, height };
      }}
      {...(Platform.OS === 'web' ? { onPointerDown } : responder.panHandlers)}
      style={[styles.board, webTouch]}
    >
      <Svg width="100%" height="100%" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`} pointerEvents="none">
        <Polygon points={outline} fill={colors.woodDark} stroke={colors.wood} strokeWidth={0.12} />
        {BOARD.map((cell) => {
          const point = pixel(cell.q, cell.r, rotation);
          const camp = campAt(cell.q, cell.r, fifteen);
          const colored = camp != null && campSet.has(camp);
          const goal = colored && goalSet.has(camp);
          const hop = shownHops.find((item) => item.toQ === cell.q && item.toR === cell.r) ?? null;
          const landed =
            (lastMove?.toQ === cell.q && lastMove.toR === cell.r) ||
            (lastMove?.fromQ === cell.q && lastMove.fromR === cell.r);
          const selectedHere = focus?.q === cell.q && focus?.r === cell.r;
          const canMove = hops.some((item) => item.fromQ === cell.q && item.fromR === cell.r);
          const piece = pieces.find((item) => item.q === cell.q && item.r === cell.r) ?? null;
          const side = piece ? CORNERS[piece.corner] : null;
          const campColor = camp == null ? null : CORNERS[camp].fill;
          const hovering = hover?.q === cell.q && hover?.r === cell.r;
          const liftedHere = lift?.q === cell.q && lift?.r === cell.r;

          return (
            <G key={`${cell.q},${cell.r}`}>
              <Circle
                cx={point.x}
                cy={point.y}
                r={0.4}
                fill={colored && campColor ? mix(campColor, goal ? 0.55 : 0.28) : colors.hole}
                stroke={hovering ? '#f6e7a8' : landed ? colors.accent : colors.wood}
                strokeWidth={hovering ? 0.09 : landed ? 0.06 : 0.03}
              />
              {hop ? (
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={hop.jump ? 0.16 : 0.11}
                  fill={hop.jump ? '#f3d78a' : colors.accent}
                />
              ) : null}
              {piece && side ? (
                <G opacity={liftedHere ? 0.35 : 1}>
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={0.3}
                    fill={side.fill}
                    stroke={selectedHere ? '#f6e7a8' : canMove ? colors.accent : side.rim}
                    strokeWidth={selectedHere ? 0.07 : 0.035}
                  />
                  <Circle cx={point.x - 0.08} cy={point.y - 0.1} r={0.08} fill="rgba(255,255,255,0.45)" />
                </G>
              ) : null}
            </G>
          );
        })}
        {dragPoint && draggedSide ? (
          <G>
            <Circle
              cx={dragPoint.x}
              cy={dragPoint.y}
              r={0.36}
              fill={draggedSide.fill}
              stroke="#f6e7a8"
              strokeWidth={0.07}
            />
            <Circle cx={dragPoint.x - 0.09} cy={dragPoint.y - 0.11} r={0.09} fill="rgba(255,255,255,0.5)" />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

export function goalCorners(corners: readonly Corner[]): Corner[] {
  return corners.map((corner) => opposite(corner));
}

function pixel(q: number, r: number, rotation: number): { x: number; y: number } {
  const cell = rotateCell(q, r, rotation);
  return cellPixel(cell.q, cell.r);
}

function clientToView(clientX: number, clientY: number, box: Box): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return {
    x: VIEW.x + ((clientX - box.x) / box.width) * VIEW.width,
    y: VIEW.y + ((clientY - box.y) / box.height) * VIEW.height,
  };
}

function mix(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const channel = (index: number) => parseInt(value.slice(index, index + 2), 16);
  const blend = (part: number) => Math.round(28 + (part - 28) * amount);
  return `rgb(${blend(channel(0))}, ${blend(channel(2))}, ${blend(channel(4))})`;
}

const webTouch: ViewStyle | null =
  Platform.OS === 'web'
    ? ({ touchAction: 'none', userSelect: 'none', cursor: 'grab' } as unknown as ViewStyle)
    : null;

const styles = {
  board: { width: '100%' as const, aspectRatio: VIEW.width / VIEW.height },
};

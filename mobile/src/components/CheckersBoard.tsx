import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View, type PointerEvent } from 'react-native';
import { BOARD_SIZE, CHECKERS_SIDES, type CheckersHop, type CheckersPiece, type CheckersSquare } from '../domain/checkers';

type Box = { x: number; y: number; width: number; height: number };

type Props = {
  pieces: readonly CheckersPiece[];
  hops: readonly CheckersHop[];
  selected: CheckersSquare | null;
  lastMove: CheckersHop | null;
  flip: boolean;
  disabled?: boolean;
  onSquare: (row: number, col: number) => void;
  onDrop: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
};

const TAP_SLOP = 12;

export function CheckersBoard({
  pieces,
  hops,
  selected,
  lastMove,
  flip,
  disabled,
  onSquare,
  onDrop,
}: Props) {
  const gridRef = useRef<View>(null);
  const gridBox = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const suppressTap = useRef(false);
  const [dragFrom, setDragFrom] = useState<CheckersSquare | null>(null);
  const [hover, setHover] = useState<CheckersSquare | null>(null);

  const rememberGrid = () => {
    gridRef.current?.measureInWindow((x, y, width, height) => {
      gridBox.current = { x, y, width, height };
    });
  };

  const activeFrom = dragFrom ?? selected;
  const shown = activeFrom
    ? hops.filter((hop) => hop.fromRow === activeFrom.row && hop.fromCol === activeFrom.col)
    : [];
  const dragVisualRow =
    dragFrom == null ? null : flip ? BOARD_SIZE - 1 - dragFrom.row : dragFrom.row;

  const handleSquare = (row: number, col: number) => {
    if (suppressTap.current) return;
    onSquare(row, col);
  };

  return (
    <View style={styles.frame} onLayout={rememberGrid}>
      <View ref={gridRef} collapsable={false} style={styles.grid} onLayout={rememberGrid}>
        {Array.from({ length: BOARD_SIZE }, (_, visualRow) => (
          <View key={visualRow} style={[styles.row, dragVisualRow === visualRow && styles.rowDragging]}>
            {Array.from({ length: BOARD_SIZE }, (_, visualCol) => {
              const row = flip ? BOARD_SIZE - 1 - visualRow : visualRow;
              const col = flip ? BOARD_SIZE - 1 - visualCol : visualCol;
              const dark = (row + col) % 2 === 1;
              const piece = pieces.find((item) => item.row === row && item.col === col) ?? null;
              const hop = shown.find((item) => item.toRow === row && item.toCol === col) ?? null;
              const selectedHere = activeFrom?.row === row && activeFrom.col === col;
              const movable = hops.some((item) => item.fromRow === row && item.fromCol === col);
              const landed =
                (lastMove?.toRow === row && lastMove.toCol === col) ||
                (lastMove?.fromRow === row && lastMove.fromCol === col);
              const hoverHere = hover?.row === row && hover?.col === col && hop != null;
              const side = piece ? CHECKERS_SIDES[piece.side] : null;
              const label = piece
                ? `${side?.name} ${piece.kind}${selectedHere ? ', selected' : ''}`
                : hop
                  ? hop.captureRow != null
                    ? 'Jump here'
                    : 'Move here'
                  : dark
                    ? 'Empty square'
                    : 'Light square';

              const body = (offset: { dx: number; dy: number } | null) => (
                <>
                  {landed && dark ? <View pointerEvents="none" style={styles.lastMove} /> : null}
                  {hoverHere ? <View pointerEvents="none" style={styles.hover} /> : null}
                  {hop ? (
                    <View
                      pointerEvents="none"
                      style={[styles.mark, hop.captureRow != null ? styles.markJump : styles.markStep]}
                    />
                  ) : null}
                  {piece && side ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.piece,
                        { backgroundColor: side.fill, borderColor: selectedHere ? '#f6e7a8' : side.rim },
                        selectedHere && !offset && styles.pieceSelected,
                        offset
                          ? {
                              transform: [{ translateX: offset.dx }, { translateY: offset.dy }, { scale: 1.12 }],
                              zIndex: 30,
                            }
                          : null,
                      ]}
                    >
                      <View pointerEvents="none" style={styles.shine} />
                      {piece.kind === 'king' ? <View pointerEvents="none" style={styles.kingRing} /> : null}
                    </View>
                  ) : null}
                </>
              );

              const cellStyle = [
                styles.cell,
                dark ? styles.dark : styles.light,
                visualCol < BOARD_SIZE - 1 && styles.cellRight,
                visualRow < BOARD_SIZE - 1 && styles.cellBottom,
                dragFrom?.row === row && dragFrom.col === col && styles.cellDragging,
              ];

              if (movable && !disabled) {
                return (
                  <MovableCell
                    key={`${row}-${col}`}
                    row={row}
                    col={col}
                    label={label}
                    style={cellStyle}
                    gridRef={gridRef}
                    gridBox={gridBox}
                    flip={flip}
                    hops={hops}
                    onTap={handleSquare}
                    onDrop={onDrop}
                    onMeasure={rememberGrid}
                    onDrag={(from, over) => {
                      setDragFrom(from);
                      setHover(over);
                    }}
                    onDragEnd={() => {
                      suppressTap.current = true;
                      setTimeout(() => {
                        suppressTap.current = false;
                      }, 120);
                    }}
                  >
                    {body}
                  </MovableCell>
                );
              }

              return (
                <Pressable
                  key={`${row}-${col}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  disabled={disabled || !dark}
                  pointerEvents={dragFrom ? 'none' : 'auto'}
                  onPress={() => handleSquare(row, col)}
                  style={cellStyle}
                >
                  {body(null)}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function MovableCell({
  row,
  col,
  label,
  style,
  gridRef,
  gridBox,
  flip,
  hops,
  onTap,
  onDrop,
  onMeasure,
  onDrag,
  onDragEnd,
  children,
}: {
  row: number;
  col: number;
  label: string;
  style: object;
  gridRef: RefObject<View | null>;
  gridBox: RefObject<Box>;
  flip: boolean;
  hops: readonly CheckersHop[];
  onTap: (row: number, col: number) => void;
  onDrop: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onMeasure: () => void;
  onDrag: (from: CheckersSquare | null, hover: CheckersSquare | null) => void;
  onDragEnd: () => void;
  children: (offset: { dx: number; dy: number } | null) => ReactNode;
}) {
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
  const api = useRef({ row, col, flip, hops, onTap, onDrop, onMeasure, onDrag, onDragEnd, gridRef, gridBox });
  api.current = { row, col, flip, hops, onTap, onDrop, onMeasure, onDrag, onDragEnd, gridRef, gridBox };
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const hoverFor = (clientX: number, clientY: number) => {
    const current = api.current;
    const target = squareUnder(current.gridBox.current, current.flip, clientX, clientY);
    const legal =
      target != null &&
      current.hops.some(
        (hop) =>
          hop.fromRow === current.row &&
          hop.fromCol === current.col &&
          hop.toRow === target.row &&
          hop.toCol === target.col,
      );
    current.onDrag({ row: current.row, col: current.col }, legal ? target : null);
  };

  const moveTo = (clientX: number, clientY: number) => {
    const active = drag.current;
    if (!active) return;
    setOffset({ dx: clientX - active.x, dy: clientY - active.y });
    hoverFor(clientX, clientY);
  };

  const finish = (clientX: number, clientY: number) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    const current = api.current;
    const moved = Math.hypot(clientX - active.x, clientY - active.y) >= TAP_SLOP;
    setOffset(null);
    current.onDrag(null, null);
    if (!moved) {
      current.onTap(current.row, current.col);
      return;
    }
    current.onDragEnd();
    const dropOn = (box: Box) => {
      const target = squareUnder(box, current.flip, clientX, clientY);
      if (!target) return;
      const legal = current.hops.some(
        (hop) =>
          hop.fromRow === current.row &&
          hop.fromCol === current.col &&
          hop.toRow === target.row &&
          hop.toCol === target.col,
      );
      if (legal) current.onDrop(current.row, current.col, target.row, target.col);
    };
    const node = current.gridRef.current;
    if (!node) {
      dropOn(current.gridBox.current);
      return;
    }
    node.measureInWindow((x, y, width, height) => dropOn({ x, y, width, height }));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web',
      onStartShouldSetPanResponderCapture: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponderCapture: () => Platform.OS !== 'web',
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (_, gesture) => {
        drag.current = { pointerId: -1, x: gesture.x0, y: gesture.y0 };
        api.current.onMeasure();
        setOffset({ dx: 0, dy: 0 });
        api.current.onDrag({ row: api.current.row, col: api.current.col }, null);
      },
      onPanResponderMove: (_, gesture) => {
        moveTo(gesture.moveX, gesture.moveY);
      },
      onPanResponderRelease: (_, gesture) => {
        finish(gesture.moveX, gesture.moveY);
      },
      onPanResponderTerminate: () => {
        drag.current = null;
        setOffset(null);
        api.current.onDrag(null, null);
      },
    }),
  ).current;

  const onPointerDown = (event: PointerEvent) => {
    if (event.nativeEvent.button !== 0) return;
    const pointerId = event.nativeEvent.pointerId;
    const startX = event.nativeEvent.clientX;
    const startY = event.nativeEvent.clientY;
    drag.current = { pointerId, x: startX, y: startY };
    api.current.onMeasure();
    setOffset({ dx: 0, dy: 0 });
    api.current.onDrag({ row: api.current.row, col: api.current.col }, null);
    const target = event.currentTarget as { setPointerCapture?: (id: number) => void };
    target.setPointerCapture?.(pointerId);
    event.preventDefault?.();

    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const move = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      moveTo(native.clientX, native.clientY);
    };
    const up = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      finish(native.clientX, native.clientY);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Drag to a highlighted square, or tap to select"
      {...(Platform.OS === 'web'
        ? { onPointerDown }
        : responder.panHandlers)}
      style={[style, webGrab]}
    >
      {children(offset)}
    </View>
  );
}

function squareUnder(box: Box, flip: boolean, pageX: number, pageY: number): CheckersSquare | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const visualCol = Math.floor((pageX - box.x) / (box.width / BOARD_SIZE));
  const visualRow = Math.floor((pageY - box.y) / (box.height / BOARD_SIZE));
  if (visualRow < 0 || visualCol < 0 || visualRow >= BOARD_SIZE || visualCol >= BOARD_SIZE) return null;
  return {
    row: flip ? BOARD_SIZE - 1 - visualRow : visualRow,
    col: flip ? BOARD_SIZE - 1 - visualCol : visualCol,
  };
}

const webGrab = Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as const) : null;

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    aspectRatio: 1,
    backgroundColor: '#3a2416',
    borderRadius: 18,
    padding: 10,
    borderWidth: 2,
    borderColor: '#d4a84b',
  },
  grid: { flex: 1, borderRadius: 8, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  rowDragging: { zIndex: 8 },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cellDragging: { zIndex: 8 },
  cellRight: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: 'rgba(42, 24, 12, 0.35)' },
  cellBottom: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(42, 24, 12, 0.35)' },
  light: { backgroundColor: '#f0ddbe' },
  dark: { backgroundColor: '#8d4e2c' },
  lastMove: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(246, 231, 168, 0.28)',
  },
  hover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(246, 231, 168, 0.45)',
  },
  mark: { borderRadius: 999 },
  markStep: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: 'rgba(246, 231, 168, 0.92)',
  },
  markJump: {
    width: '36%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: '#f6e7a8',
    backgroundColor: 'rgba(246, 231, 168, 0.2)',
  },
  piece: {
    width: '74%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  pieceSelected: { borderWidth: 4, transform: [{ scale: 1.06 }] },
  shine: {
    position: 'absolute',
    top: '12%',
    left: '18%',
    width: '28%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 250, 240, 0.35)',
  },
  kingRing: {
    width: '52%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#f0d78c',
  },
});

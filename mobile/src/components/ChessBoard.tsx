import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type PointerEvent, type StyleProp, type ViewStyle } from 'react-native';
import {
  BOARD_SIZE,
  CHESS_SIDES,
  PIECE_GLYPH,
  squareName,
  type ChessMove,
  type ChessPiece,
  type ChessSquare,
  type PieceKind,
  type Side,
} from '../domain/chess';

type Box = { x: number; y: number; width: number; height: number };

type Props = {
  pieces: readonly ChessPiece[];
  moves: readonly ChessMove[];
  selected: ChessSquare | null;
  lastMove: ChessMove | null;
  check: ChessSquare | null;
  flip: boolean;
  disabled?: boolean;
  onSquare: (row: number, col: number) => void;
  onDrop: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
};

const TAP_SLOP = 12;

export function ChessBoard({ pieces, moves, selected, lastMove, check, flip, disabled, onSquare, onDrop }: Props) {
  const gridRef = useRef<View>(null);
  const gridBox = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const suppressTap = useRef(false);
  const [dragFrom, setDragFrom] = useState<ChessSquare | null>(null);
  const [hover, setHover] = useState<ChessSquare | null>(null);
  const [square, setSquare] = useState(36);

  const rememberGrid = () => {
    gridRef.current?.measureInWindow((x, y, width, height) => {
      gridBox.current = { x, y, width, height };
      if (width > 0) setSquare(width / BOARD_SIZE);
    });
  };

  const activeFrom = dragFrom ?? selected;
  const shown = activeFrom
    ? moves.filter((move) => move.fromRow === activeFrom.row && move.fromCol === activeFrom.col)
    : [];
  const dragVisualRow = dragFrom == null ? null : flip ? BOARD_SIZE - 1 - dragFrom.row : dragFrom.row;

  const handleSquare = (row: number, col: number) => {
    if (suppressTap.current) return;
    onSquare(row, col);
  };

  return (
    <View style={styles.frame} onLayout={rememberGrid}>
      <View
        ref={gridRef}
        collapsable={false}
        style={styles.grid}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0) setSquare(width / BOARD_SIZE);
          rememberGrid();
        }}
      >
        {Array.from({ length: BOARD_SIZE }, (_, visualRow) => (
          <View key={visualRow} style={[styles.row, dragVisualRow === visualRow && styles.rowDragging]}>
            {Array.from({ length: BOARD_SIZE }, (_, visualCol) => {
              const row = flip ? BOARD_SIZE - 1 - visualRow : visualRow;
              const col = flip ? BOARD_SIZE - 1 - visualCol : visualCol;
              const dark = (row + col) % 2 === 1;
              const piece = pieces.find((item) => item.row === row && item.col === col) ?? null;
              const move = shown.find((item) => item.toRow === row && item.toCol === col) ?? null;
              const selectedHere = activeFrom?.row === row && activeFrom.col === col;
              const movable = moves.some((item) => item.fromRow === row && item.fromCol === col);
              const landed = isHighlighted(lastMove, row, col);
              const inCheck = check?.row === row && check.col === col;
              const hoverHere = hover?.row === row && hover?.col === col && move != null;
              const side = piece ? CHESS_SIDES[piece.side] : null;
              const name = squareName(row, col);
              const label = piece
                ? `${side?.name} ${piece.kind} on ${name}${selectedHere ? ', selected' : ''}`
                : move
                  ? move.capture
                    ? `Capture on ${name}`
                    : `Move to ${name}`
                  : name;

              const body = (offset: { dx: number; dy: number } | null) => (
                <>
                  {landed ? <View style={[styles.lastMove, { pointerEvents: 'none' }]} /> : null}
                  {inCheck ? <View style={[styles.check, { pointerEvents: 'none' }]} /> : null}
                  {hoverHere ? <View style={[styles.hover, { pointerEvents: 'none' }]} /> : null}
                  {move ? (
                    <View
                      style={[
                        styles.mark,
                        move.capture ? styles.markCapture : styles.markStep,
                        { pointerEvents: 'none' },
                      ]}
                    />
                  ) : null}
                  {visualCol === 0 ? (
                    <Text style={[styles.coord, styles.coordRank, dark ? styles.coordOnDark : styles.coordOnLight, { pointerEvents: 'none' }]}>
                      {8 - row}
                    </Text>
                  ) : null}
                  {visualRow === BOARD_SIZE - 1 ? (
                    <Text style={[styles.coord, styles.coordFile, dark ? styles.coordOnDark : styles.coordOnLight, { pointerEvents: 'none' }]}>
                      {'abcdefgh'[col]}
                    </Text>
                  ) : null}
                  {piece && side ? (
                    <View
                      style={[
                        styles.piece,
                        selectedHere && !offset && styles.pieceSelected,
                        offset
                          ? {
                              transform: [{ translateX: offset.dx }, { translateY: offset.dy }, { scale: 1.12 }],
                              zIndex: 30,
                            }
                          : null,
                        { pointerEvents: 'none' },
                      ]}
                    >
                      <PieceGlyph kind={piece.kind} side={piece.side} size={Math.max(22, square * 0.72)} />
                    </View>
                  ) : null}
                </>
              );

              const cellStyle = [
                styles.cell,
                dark ? styles.dark : styles.light,
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
                    moves={moves}
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
                  disabled={disabled}
                  onPress={() => handleSquare(row, col)}
                  style={[cellStyle, { pointerEvents: dragFrom ? 'none' : 'auto' }]}
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

const OUTLINE: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function PieceGlyph({ kind, side, size }: { kind: PieceKind; side: Side; size: number }) {
  const fill = side === 'white' ? '#f8f4ea' : '#1a120c';
  const outline = side === 'white' ? '#3a2416' : '#f3e6c8';
  const text = {
    fontSize: size,
    lineHeight: size + 2,
  };
  return (
    <View style={styles.glyphWrap}>
      {OUTLINE.map(([x, y]) => (
        <Text
          key={`${x},${y}`}
          style={[styles.glyph, styles.glyphOutline, text, { color: outline, transform: [{ translateX: x }, { translateY: y }] }]}
        >
          {PIECE_GLYPH[kind]}
        </Text>
      ))}
      <Text style={[styles.glyph, text, { color: fill }]}>{PIECE_GLYPH[kind]}</Text>
    </View>
  );
}

function isHighlighted(move: ChessMove | null, row: number, col: number): boolean {
  if (!move) return false;
  if ((move.fromRow === row && move.fromCol === col) || (move.toRow === row && move.toCol === col)) return true;
  if (move.castle === 'kingside') return row === move.fromRow && (col === 7 || col === 5);
  if (move.castle === 'queenside') return row === move.fromRow && (col === 0 || col === 3);
  return false;
}

function MovableCell({
  row,
  col,
  label,
  style,
  gridRef,
  gridBox,
  flip,
  moves,
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
  style: StyleProp<ViewStyle>;
  gridRef: RefObject<View | null>;
  gridBox: RefObject<Box>;
  flip: boolean;
  moves: readonly ChessMove[];
  onTap: (row: number, col: number) => void;
  onDrop: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onMeasure: () => void;
  onDrag: (from: ChessSquare | null, hover: ChessSquare | null) => void;
  onDragEnd: () => void;
  children: (offset: { dx: number; dy: number } | null) => ReactNode;
}) {
  const [offset, setOffset] = useState<{ dx: number; dy: number } | null>(null);
  const api = useRef({ row, col, flip, moves, onTap, onDrop, onMeasure, onDrag, onDragEnd, gridRef, gridBox });
  api.current = { row, col, flip, moves, onTap, onDrop, onMeasure, onDrag, onDragEnd, gridRef, gridBox };
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const hoverFor = (clientX: number, clientY: number) => {
    const current = api.current;
    const target = squareUnder(current.gridBox.current, current.flip, clientX, clientY);
    const legal =
      target != null &&
      current.moves.some(
        (move) =>
          move.fromRow === current.row &&
          move.fromCol === current.col &&
          move.toRow === target.row &&
          move.toCol === target.col,
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
      const legal = current.moves.some(
        (move) =>
          move.fromRow === current.row &&
          move.fromCol === current.col &&
          move.toRow === target.row &&
          move.toCol === target.col,
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
      {...(Platform.OS === 'web' ? { onPointerDown } : responder.panHandlers)}
      style={[style, webGrab as object]}
    >
      {children(offset)}
    </View>
  );
}

function squareUnder(box: Box, flip: boolean, pageX: number, pageY: number): ChessSquare | null {
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
  light: { backgroundColor: '#f0ddbe' },
  dark: { backgroundColor: '#8d4e2c' },
  lastMove: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(246, 231, 168, 0.34)',
  },
  check: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(196, 48, 36, 0.55)',
  },
  hover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(246, 231, 168, 0.45)',
  },
  mark: { position: 'absolute' },
  markStep: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(246, 231, 168, 0.92)',
  },
  markCapture: {
    width: '86%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#f6e7a8',
    backgroundColor: 'rgba(246, 231, 168, 0.18)',
  },
  piece: { alignItems: 'center', justifyContent: 'center' },
  pieceSelected: { transform: [{ scale: 1.08 }] },
  glyphWrap: { alignItems: 'center', justifyContent: 'center' },
  glyph: {
    fontWeight: '700',
    textAlign: 'center',
  },
  glyphOutline: { position: 'absolute' },
  coord: { position: 'absolute', fontSize: 10, fontWeight: '700' },
  coordRank: { top: 1, left: 3 },
  coordFile: { right: 3, bottom: 1 },
  coordOnDark: { color: 'rgba(240, 221, 190, 0.92)' },
  coordOnLight: { color: 'rgba(90, 42, 18, 0.78)' },
});

import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Player } from '../domain/models';
import {
  boardSpaces,
  cellToSpace,
  spaceToCell,
  tokenSpace,
  type BoardSpace,
} from '../domain/monopolyBoard';
import { getProperty } from '../domain/monopoly';
import { colors, fonts, radii } from '../theme';

const TOKEN_COLORS = ['#e86a5c', '#6fbf8a', '#7eb6ff', '#d4a84b', '#d93a96', '#f7941d', '#c5d0c9', '#f2e3a0'];
const TOKEN = 22;

type Props = {
  players: Player[];
  tokenSpaces?: Record<string, number>;
  enabled: boolean;
  onLand: (playerId: string, space: BoardSpace) => void;
  onDragging: (dragging: boolean) => void;
};

type Origin = { x: number; y: number; size: number };

export function MonopolyBoard({ players, tokenSpaces, enabled, onLand, onDragging }: Props) {
  const boardRef = useRef<View>(null);
  const origin = useRef<Origin>({ x: 0, y: 0, size: 0 });
  const [size, setSize] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const rememberOrigin = () => {
    boardRef.current?.measureInWindow((x, y, width) => {
      origin.current = { x, y, size: width };
      setSize(width);
    });
  };

  const spaceAt = (pageX: number, pageY: number): number | null => {
    const { x, y, size: boardSize } = origin.current;
    if (boardSize <= 0) return null;
    const cell = boardSize / 11;
    const col = Math.floor((pageX - x) / cell);
    const row = Math.floor((pageY - y) / cell);
    return cellToSpace(row, col);
  };

  return (
    <View
      ref={boardRef}
      onLayout={rememberOrigin}
      style={styles.board}
      accessibilityLabel="Monopoly board"
    >
      {boardSpaces.map((space) => {
        const { row, col } = spaceToCell(space.index);
        const property = space.propertyId ? getProperty(space.propertyId) : undefined;
        const isRailroad = property?.kind === 'railroad';
        const swatch = property && !isRailroad ? property.swatch : undefined;
        const cell = size > 0 ? size / 11 : 48;
        const bar = Math.max(10, Math.round(cell * 0.22));
        const label = Math.max(11, Math.round(cell * 0.13));
        return (
          <View
            key={space.index}
            accessibilityLabel={space.name}
            style={[
              styles.cell,
              labelInset(row, col, isRailroad ? 0 : bar),
              {
                left: `${(col * 100) / 11}%`,
                top: `${(row * 100) / 11}%`,
              },
              hover === space.index && styles.cellHover,
            ]}
          >
            {swatch ? (
              <View style={[styles.swatch, barEdge(row, col, bar), { backgroundColor: swatch }]} />
            ) : null}
            {isRailroad ? <TrainMark row={row} col={col} cell={cell} /> : null}
            <Text
              style={[
                styles.cellText,
                { fontSize: label, lineHeight: Math.round(label * 1.15), width: '100%' },
              ]}
              numberOfLines={2}
            >
              {space.short}
            </Text>
          </View>
        );
      })}
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.centerTitle}>Board</Text>
        <Text style={styles.centerHint}>Drag a piece onto a space</Text>
      </View>
      {size > 0
        ? players.map((player, index) => {
            const spaceIndex = tokenSpace(tokenSpaces, player.id);
            const { row, col } = spaceToCell(spaceIndex);
            const sharing = players.filter(
              (other) => tokenSpace(tokenSpaces, other.id) === spaceIndex,
            );
            const slot = sharing.findIndex((other) => other.id === player.id);
            return (
              <Piece
                key={player.id}
                name={player.name}
                color={TOKEN_COLORS[index % TOKEN_COLORS.length]}
                row={row}
                col={col}
                slot={slot}
                size={size}
                enabled={enabled}
                onDragStart={() => {
                  rememberOrigin();
                  onDragging(true);
                }}
                onDragMove={(dx, dy) => {
                  const center = tokenCenter(origin.current, row, col, slot, dx, dy);
                  setHover(spaceAt(center.x, center.y));
                }}
                onDragEnd={(dx, dy) => {
                  onDragging(false);
                  setHover(null);
                  boardRef.current?.measureInWindow((x, y, width) => {
                    origin.current = { x, y, size: width };
                    const center = tokenCenter(origin.current, row, col, slot, dx, dy);
                    const landed = spaceAt(center.x, center.y);
                    const space = landed == null ? undefined : boardSpaces[landed];
                    if (space) onLand(player.id, space);
                  });
                }}
                onDragCancel={() => {
                  onDragging(false);
                  setHover(null);
                }}
              />
            );
          })
        : null}
    </View>
  );
}

function TrainMark({ row, col, cell }: { row: number; col: number; cell: number }) {
  const long = Math.max(28, Math.round(cell * 0.5));
  const short = Math.round(long * 0.56);
  const sideways = col === 0 || col === 10;
  const transform =
    row === 10
      ? [{ scaleX: -1 as const }]
      : [{ rotate: col === 0 ? '-90deg' : row === 0 ? '0deg' : '90deg' }];
  return (
    <View
      pointerEvents="none"
      style={{
        width: sideways ? short : long,
        height: sideways ? long : short,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={{ width: long, height: short, transform }}>
        <TrainSvg width={long} height={short} />
      </View>
    </View>
  );
}

function TrainSvg({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 64 36">
      <Rect x="14" y="27" width="22" height="2.5" rx="1" fill="#3a3228" />
      <Circle cx="16" cy="29.5" r="5.2" fill="#1a1408" />
      <Circle cx="32" cy="29.5" r="5.2" fill="#1a1408" />
      <Circle cx="46" cy="30.2" r="3.4" fill="#1a1408" />
      <Circle cx="16" cy="29.5" r="1.8" fill="#f4efe4" />
      <Circle cx="32" cy="29.5" r="1.8" fill="#f4efe4" />
      <Circle cx="46" cy="30.2" r="1.1" fill="#f4efe4" />
      <Path d="M4 28V14h10V8h12v6h20c2 0 4 2 6 6v8H4z" fill="#241c12" />
      <Path d="M48 20h8l6 8H48z" fill="#241c12" />
      <Rect x="40" y="5" width="5" height="11" rx="1" fill="#241c12" />
      <Circle cx="42.5" cy="3.2" r="2.2" fill="#9a9186" />
      <Circle cx="47" cy="1.6" r="1.5" fill="#b7b0a4" />
      <Rect x="7" y="12" width="8" height="6" rx="1" fill="#b9d7ea" />
      <Circle cx="50" cy="22" r="1.4" fill="#f2d36b" />
    </Svg>
  );
}

function barEdge(row: number, col: number, bar: number) {
  if (row === 10) return { bottom: 0, left: 0, right: 0, height: bar };
  if (row === 0) return { top: 0, left: 0, right: 0, height: bar };
  if (col === 0) return { left: 0, top: 0, bottom: 0, width: bar };
  return { right: 0, top: 0, bottom: 0, width: bar };
}

function labelInset(row: number, col: number, bar: number) {
  if (row === 10) return { paddingBottom: bar };
  if (row === 0) return { paddingTop: bar };
  if (col === 0) return { paddingLeft: bar };
  return { paddingRight: bar };
}

function tokenCenter(
  board: Origin,
  row: number,
  col: number,
  slot: number,
  dx = 0,
  dy = 0,
) {
  const cell = board.size / 11;
  const nudgeX = slot % 2 === 0 ? -4 : 4;
  const nudgeY = slot > 1 ? 6 : -2;
  return {
    x: board.x + col * cell + cell / 2 + nudgeX + dx,
    y: board.y + row * cell + cell / 2 + nudgeY + dy,
  };
}

function Piece({
  name,
  color,
  row,
  col,
  slot,
  size,
  enabled,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: {
  name: string;
  color: string;
  row: number;
  col: number;
  slot: number;
  size: number;
  enabled: boolean;
  onDragStart: () => void;
  onDragMove: (dx: number, dy: number) => void;
  onDragEnd: (dx: number, dy: number) => void;
  onDragCancel: () => void;
}) {
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const startRef = useRef(onDragStart);
  const moveRef = useRef(onDragMove);
  const endRef = useRef(onDragEnd);
  const cancelRef = useRef(onDragCancel);
  startRef.current = onDragStart;
  moveRef.current = onDragMove;
  endRef.current = onDragEnd;
  cancelRef.current = onDragCancel;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => enabledRef.current,
      onStartShouldSetPanResponderCapture: () => enabledRef.current,
      onMoveShouldSetPanResponder: () => enabledRef.current,
      onMoveShouldSetPanResponderCapture: () => enabledRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        startRef.current();
        setDrag({ dx: 0, dy: 0 });
      },
      onPanResponderMove: (_, gesture) => {
        setDrag({ dx: gesture.dx, dy: gesture.dy });
        moveRef.current(gesture.dx, gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        setDrag(null);
        endRef.current(gesture.dx, gesture.dy);
      },
      onPanResponderTerminate: () => {
        setDrag(null);
        cancelRef.current();
      },
    }),
  ).current;

  const cell = size / 11;
  const nudgeX = slot % 2 === 0 ? -4 : 4;
  const nudgeY = slot > 1 ? 6 : -2;
  const left = col * cell + cell / 2 - TOKEN / 2 + nudgeX;
  const top = row * cell + cell / 2 - TOKEN / 2 + nudgeY;

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={`${name} piece`}
      style={[
        styles.token,
        {
          left,
          top,
          backgroundColor: color,
          zIndex: drag ? 30 : 10 + slot,
          transform: drag ? [{ translateX: drag.dx }, { translateY: drag.dy }] : undefined,
        },
      ]}
    >
      <Text style={styles.tokenText}>{name.trim().charAt(0).toUpperCase() || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.woodDark,
    borderRadius: radii.md,
    borderWidth: 3,
    borderColor: colors.wood,
    position: 'relative',
    overflow: 'hidden',
  },
  cell: {
    position: 'absolute',
    width: `${100 / 11}%`,
    height: `${100 / 11}%`,
    backgroundColor: '#f4efe4',
    borderWidth: 1,
    borderColor: '#c4b49a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1,
  },
  cellHover: {
    borderColor: colors.accent,
    borderWidth: 2,
    zIndex: 2,
  },
  cellText: {
    fontFamily: fonts.body,
    fontWeight: '800',
    color: '#1a1408',
    textAlign: 'center',
  },
  swatch: {
    position: 'absolute',
  },
  center: {
    position: 'absolute',
    left: `${100 / 11}%`,
    top: `${100 / 11}%`,
    width: `${(100 * 9) / 11}%`,
    height: `${(100 * 9) / 11}%`,
    backgroundColor: '#14352c',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 4,
  },
  centerTitle: {
    fontFamily: fonts.display,
    color: colors.accent,
    fontSize: 22,
    fontWeight: '700',
  },
  centerHint: {
    fontFamily: fonts.body,
    color: '#d5e4dc',
    fontSize: 12,
    textAlign: 'center',
  },
  token: {
    position: 'absolute',
    width: TOKEN,
    height: TOKEN,
    borderRadius: TOKEN / 2,
    borderWidth: 2,
    borderColor: '#1a1408',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenText: {
    color: '#1a1408',
    fontSize: 11,
    fontWeight: '800',
  },
});

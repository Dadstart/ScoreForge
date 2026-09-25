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
import { getProperty, playerToken } from '../domain/monopoly';
import { colors, fonts, radii } from '../theme';

const TOKEN_COLORS = ['#e86a5c', '#6fbf8a', '#7eb6ff', '#d4a84b', '#d93a96', '#f7941d', '#c5d0c9', '#f2e3a0'];

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
        const isCorner = space.index % 10 === 0;
        const swatch = property && !isRailroad ? property.swatch : undefined;
        const cell = size > 0 ? size / 11 : 48;
        const bar = Math.max(10, Math.round(cell * 0.22));
        const label = Math.max(11, Math.round(cell * 0.13));
        const lane = !isCorner && (col === 0 || col === 10) ? sideLane(cell) : tokenLane(cell);
        const fitted = space.propertyId
          ? fitPropertyLabel(space.name, labelBounds(row, col, cell, bar, isRailroad), label)
          : null;
        return (
          <View
            key={space.index}
            accessibilityLabel={space.name}
            style={[
              styles.cell,
              isCorner ? null : spacePadding(row, col, lane, isRailroad ? 0 : bar),
              {
                left: `${(col * 100) / 11}%`,
                top: `${(row * 100) / 11}%`,
              },
              hover === space.index && styles.cellHover,
            ]}
          >
            {isCorner ? (
              <View pointerEvents="none" style={cornerFrame(row, col, cell, lane)}>
                <CornerArt index={space.index} cell={Math.max(36, cell - lane)} />
              </View>
            ) : (
              <>
                {swatch ? (
                  <View style={[styles.swatch, barEdge(row, col, bar), { backgroundColor: swatch }]} />
                ) : null}
                {isRailroad ? <TrainMark row={row} col={col} cell={cell} /> : null}
                <Text
                  style={[
                    styles.cellText,
                    {
                      fontSize: fitted?.fontSize ?? label,
                      lineHeight: fitted?.lineHeight ?? Math.round(label * 1.15),
                      width: '100%',
                    },
                  ]}
                  numberOfLines={fitted?.lines ?? 2}
                >
                  {fitted?.text ?? space.short}
                </Text>
              </>
            )}
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
                token={player.token}
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

function CornerArt({ index, cell }: { index: number; cell: number }) {
  if (index === 0) return <GoCorner cell={cell} />;
  if (index === 10) return <JailCorner cell={cell} />;
  if (index === 20) return <FreeParkingCorner cell={cell} />;
  return <GoToJailCorner cell={cell} />;
}

function GoCorner({ cell }: { cell: number }) {
  const go = Math.round(cell * 0.36);
  const fine = Math.max(7, Math.round(cell * 0.095));
  const arrowW = Math.round(cell * 0.62);
  const arrowH = Math.round(cell * 0.14);
  return (
    <View style={styles.corner}>
      <Text style={[styles.cornerGo, { fontSize: go, lineHeight: go }]}>GO</Text>
      <Svg width={arrowW} height={arrowH} viewBox="0 0 72 16">
        <Path d="M72 5H24V1L4 8l20 7V11h48V5z" fill="#ed1b24" />
      </Svg>
      <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 2 }]}>COLLECT $200</Text>
      <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 2 }]}>AS YOU PASS</Text>
    </View>
  );
}

function JailCorner({ cell }: { cell: number }) {
  const title = Math.max(8, Math.round(cell * 0.13));
  const sub = Math.max(7, Math.round(cell * 0.1));
  const box = Math.round(cell * 0.62);
  return (
    <View style={styles.corner}>
      <View style={[styles.jail, { width: box, height: Math.round(box * 0.78) }]}>
        <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title + 1 }]}>IN JAIL</Text>
        <View style={styles.jailBars}>
          <View style={styles.jailBar} />
          <View style={styles.jailBar} />
          <View style={styles.jailBar} />
          <View style={styles.jailBar} />
        </View>
      </View>
      <Text style={[styles.cornerFine, { fontSize: sub, lineHeight: sub + 2 }]}>JUST VISITING</Text>
    </View>
  );
}

function FreeParkingCorner({ cell }: { cell: number }) {
  const title = Math.max(10, Math.round(cell * 0.16));
  return (
    <View style={styles.corner}>
      <Svg width={Math.round(cell * 0.58)} height={Math.round(cell * 0.26)} viewBox="0 0 64 30">
        <Path
          d="M6 18c0-4 3-6 8-7l6-7h18l8 7h8c4 0 8 2 8 6v3H6v-2z"
          fill="#ed1b24"
        />
        <Path d="M22 8h16l6 6H18z" fill="#b9d7ea" />
        <Circle cx="18" cy="23" r="5" fill="#1a1408" />
        <Circle cx="46" cy="23" r="5" fill="#1a1408" />
        <Circle cx="18" cy="23" r="2" fill="#f4efe4" />
        <Circle cx="46" cy="23" r="2" fill="#f4efe4" />
      </Svg>
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title + 1 }]}>FREE</Text>
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title + 1 }]}>PARKING</Text>
    </View>
  );
}

function GoToJailCorner({ cell }: { cell: number }) {
  const kicker = Math.max(8, Math.round(cell * 0.12));
  const title = Math.max(12, Math.round(cell * 0.2));
  const fine = Math.max(6, Math.round(cell * 0.08));
  return (
    <View style={styles.corner}>
      <Text style={[styles.cornerFine, { fontSize: kicker, lineHeight: kicker + 1 }]}>GO TO</Text>
      <Text style={[styles.cornerGo, { fontSize: title, lineHeight: title }]}>JAIL</Text>
      <Svg width={Math.round(cell * 0.34)} height={Math.round(cell * 0.28)} viewBox="0 0 40 36">
        <Path d="M10 12h20l-2 4H12z" fill="#1d4e89" />
        <Rect x="6" y="15" width="28" height="3" rx="1" fill="#1d4e89" />
        <Circle cx="20" cy="22" r="4.5" fill="#f0c9a0" />
        <Path d="M11 30c1-5 4-7 9-7s8 2 9 7v4H11z" fill="#1d4e89" />
        <Path d="M13 31 L2 27h11z" fill="#1d4e89" />
        <Circle cx="24" cy="31" r="1.5" fill="#f2d36b" />
      </Svg>
      <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]}>Do not pass GO</Text>
      <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]}>Do not collect $200</Text>
    </View>
  );
}

/** Advances for DM Sans at weight 800 and 17px. */
const GLYPH_WIDTH: Record<string, number> = {
  A: 12.04, B: 10.83, C: 12.56, D: 12.05, E: 9.89, F: 9.43, G: 13.21, H: 12.12, I: 4.61,
  J: 9.18, K: 11.08, L: 9.49, M: 15.08, N: 12.38, O: 13.36, P: 10.42, Q: 13.36, R: 10.71,
  S: 10.25, T: 10.15, U: 11.64, V: 11.98, W: 17.29, X: 11.37, Y: 10.78, Z: 9.77,
  a: 9.94, b: 11.13, c: 10.3, d: 11.13, e: 10.23, f: 6.27, g: 10.13, h: 10.47, i: 4.64,
  j: 4.66, k: 9.83, l: 4.52, m: 16, n: 10.47, o: 10.37, p: 11.13, q: 11.13, r: 6.92,
  s: 9.03, t: 7.33, u: 10.47, v: 9.57, w: 13.89, x: 9.71, y: 10.27, z: 8.3,
  '.': 4.27, '&': 13.26, ' ': 3.99,
};

function textWidth(text: string, fontSize: number) {
  const scale = fontSize / 17;
  let width = 0;
  for (const ch of text) width += (GLYPH_WIDTH[ch] ?? 10.2) * scale;
  return width;
}

function wrapWords(name: string, maxWidth: number, fontSize: number) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [name];
  if (textWidth(name, fontSize) <= maxWidth - 16) return [name];
  const lines = packWords(words, maxWidth, fontSize);
  if (lines.length === 1) return [words.slice(0, -1).join(' '), words[words.length - 1]];
  return lines;
}

function packWords(words: string[], maxWidth: number, fontSize: number) {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && textWidth(next, fontSize) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function trainExtent(cell: number, col: number) {
  const long = Math.max(28, Math.round(cell * 0.5));
  const short = Math.round(long * 0.56);
  const sideways = col === 0 || col === 10;
  return { long, short, sideways, height: sideways ? long : short };
}

function labelBounds(row: number, col: number, cell: number, bar: number, railroad: boolean) {
  const border = 2;
  const lane = row === 0 || row === 10 ? tokenLane(cell) : sideLane(cell);
  let width = cell - border;
  let height = cell - border;
  const horizontal = row === 0 || row === 10;
  if (horizontal) height -= lane;
  else width -= lane;
  if (railroad) height -= trainExtent(cell, col).height;
  else if (horizontal) height -= bar;
  else width -= bar;
  return { width: Math.max(8, width), height: Math.max(8, height) };
}

function fitPropertyLabel(
  name: string,
  bounds: { width: number; height: number },
  startSize: number,
) {
  const minSize = 8;
  let fontSize = startSize;
  while (fontSize >= minSize) {
    const lines = wrapWords(name, bounds.width, fontSize);
    const lineHeight = Math.max(fontSize + 1, Math.round(fontSize * 1.1));
    const fitsWidth = lines.every((line) => textWidth(line, fontSize) <= bounds.width);
    const fitsHeight = lines.length * lineHeight <= bounds.height;
    if (fitsWidth && fitsHeight) {
      return { text: lines.join('\n'), fontSize, lineHeight, lines: lines.length };
    }
    fontSize -= 1;
  }
  const lines = wrapWords(name, bounds.width, minSize);
  const lineHeight = Math.round(minSize * 1.1);
  return { text: lines.join('\n'), fontSize: minSize, lineHeight, lines: lines.length };
}

function TrainMark({ row, col, cell }: { row: number; col: number; cell: number }) {
  const { long, short, sideways } = trainExtent(cell, col);
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

function tokenLane(cell: number) {
  return pieceSize(cell) + Math.max(6, Math.round(cell * 0.05));
}

function sideLane(cell: number) {
  return Math.round(pieceSize(cell) * 0.55);
}

function spacePadding(row: number, col: number, lane: number, bar: number) {
  if (row === 10) {
    return { paddingTop: lane, paddingBottom: bar, paddingLeft: 2, paddingRight: 2, justifyContent: 'flex-end' as const };
  }
  if (row === 0) {
    return { paddingBottom: lane, paddingTop: bar, paddingLeft: 2, paddingRight: 2, justifyContent: 'flex-start' as const };
  }
  if (col === 0) {
    return {
      paddingRight: lane,
      paddingLeft: bar,
      paddingTop: 2,
      paddingBottom: 2,
      alignItems: 'flex-start' as const,
      justifyContent: 'center' as const,
    };
  }
  return {
    paddingLeft: lane,
    paddingRight: bar,
    paddingTop: 2,
    paddingBottom: 2,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
  };
}

function cornerFrame(row: number, col: number, cell: number, lane: number) {
  const box = Math.max(36, cell - lane);
  const base = { position: 'absolute' as const, width: box, height: box };
  if (row === 10 && col === 10) return { ...base, right: 1, bottom: 1 };
  if (row === 10 && col === 0) return { ...base, left: 1, bottom: 1 };
  if (row === 0 && col === 0) return { ...base, left: 1, top: 1 };
  return { ...base, right: 1, top: 1 };
}

function pieceSize(cell: number) {
  return Math.max(28, Math.round(cell * 0.34));
}

function pieceOffset(row: number, col: number, cell: number, piece: number, slot: number) {
  const gap = Math.max(3, Math.round(cell * 0.03));
  const hang = Math.round(piece * 0.28);
  const shift = slot === 0 ? 0 : (slot % 2 === 0 ? -1 : 1) * Math.round(piece * 0.62 * Math.ceil(slot / 2));
  const corner = (row === 0 || row === 10) && (col === 0 || col === 10);
  let x = (cell - piece) / 2;
  let y = (cell - piece) / 2;
  if (corner) {
    x = col === 0 ? cell - piece - gap : gap;
    y = row === 0 ? cell - piece - gap : gap;
  } else if (row === 10) {
    y = gap - hang;
    x += shift;
  } else if (row === 0) {
    y = cell - piece - gap + hang;
    x += shift;
  } else if (col === 0) {
    x = cell - sideLane(cell);
    y = (cell - piece) / 2 + shift;
  } else {
    x = sideLane(cell) - piece;
    y = (cell - piece) / 2 + shift;
  }
  const minX = !corner && col === 10 ? sideLane(cell) - piece : 1;
  const maxX = !corner && col === 0 ? cell - sideLane(cell) : cell - piece - 1;
  const minY = !corner && row === 10 ? gap - hang : 1;
  const maxY = !corner && row === 0 ? cell - piece - gap + hang : cell - piece - 1;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
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
  const piece = pieceSize(cell);
  const offset = pieceOffset(row, col, cell, piece, slot);
  return {
    x: board.x + col * cell + offset.x + piece / 2 + dx,
    y: board.y + row * cell + offset.y + piece / 2 + dy,
  };
}

function Piece({
  name,
  token,
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
  token?: string | null;
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
  const piece = pieceSize(cell);
  const offset = pieceOffset(row, col, cell, piece, slot);
  const left = col * cell + offset.x;
  const top = row * cell + offset.y;
  const emoji = playerToken(token);

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={emoji ? `${name} ${emoji.label} piece` : `${name} piece`}
      style={[
        styles.token,
        emoji
          ? styles.tokenEmoji
          : {
              borderRadius: piece / 2,
              backgroundColor: color,
            },
        {
          left,
          top,
          width: piece,
          height: piece,
          zIndex: drag ? 30 : 10 + slot,
          transform: drag ? [{ translateX: drag.dx }, { translateY: drag.dy }] : undefined,
        },
      ]}
    >
      <Text
        style={
          emoji
            ? [styles.tokenEmojiText, { fontSize: Math.round(piece * 0.78), lineHeight: Math.round(piece * 0.9) }]
            : [styles.tokenText, { fontSize: Math.round(piece * 0.5) }]
        }
      >
        {emoji?.emoji ?? (name.trim().charAt(0).toUpperCase() || '?')}
      </Text>
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
  corner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  cornerGo: {
    fontFamily: fonts.display,
    fontWeight: '700',
    color: '#ed1b24',
    textAlign: 'center',
  },
  cornerTitle: {
    fontFamily: fonts.display,
    fontWeight: '700',
    color: '#1a1408',
    textAlign: 'center',
  },
  cornerFine: {
    fontFamily: fonts.body,
    fontWeight: '700',
    color: '#1a1408',
    textAlign: 'center',
    width: '100%',
  },
  jail: {
    borderWidth: 2,
    borderColor: '#1a1408',
    backgroundColor: '#f7f1e4',
    alignItems: 'center',
    overflow: 'hidden',
  },
  jailBars: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    borderTopWidth: 2,
    borderColor: '#1a1408',
    marginTop: 2,
  },
  jailBar: {
    width: 3,
    backgroundColor: '#1a1408',
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
    borderWidth: 2,
    borderColor: '#1a1408',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenEmoji: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  tokenText: {
    color: '#1a1408',
    fontWeight: '800',
  },
  tokenEmojiText: {
    textAlign: 'center',
  },
});

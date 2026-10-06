import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
import { clampPan, clampZoom, panForWheel, panForZoom } from '../domain/monopolyZoom';
import { colors, fonts, radii } from '../theme';

const TOKEN_COLORS = ['#e86a5c', '#6fbf8a', '#7eb6ff', '#d4a84b', '#d93a96', '#f7941d', '#c5d0c9', '#f2e3a0'];
/** Cells at least this wide show names and prices. Smaller cells are a color map. */
const CLOSE_CELL = 96;

type Props = {
  players: Player[];
  tokenSpaces?: Record<string, number>;
  enabled: boolean;
  onLand: (playerId: string, space: BoardSpace) => void;
  onDragging: (dragging: boolean) => void;
};

type Origin = { x: number; y: number; size: number };

const PHONE_LAYOUT = 760;
const START_ZOOM = 2;
const VIEW_FRAME = 2;

function touchDistance(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export function MonopolyBoard(props: Props) {
  const window = useWindowDimensions();
  if (Math.min(window.width, window.height) < PHONE_LAYOUT) return <PhoneBoard {...props} />;
  return <BoardCanvas {...props} />;
}

function PhoneBoard({ onDragging, ...props }: Props) {
  const viewportRef = useRef<View>(null);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState(START_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const viewportRefSize = useRef(0);
  const movingPiece = useRef(false);
  const onDraggingRef = useRef(onDragging);
  zoomRef.current = zoom;
  panRef.current = pan;
  viewportRefSize.current = viewport;
  onDraggingRef.current = onDragging;

  const gesture = useRef({
    pan: { x: 0, y: 0 },
    dx: 0,
    dy: 0,
    pinch: null as null | { dist: number; zoom: number; pan: { x: number; y: number }; x: number; y: number },
    origin: { x: 0, y: 0 },
  });

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !movingPiece.current,
      onMoveShouldSetPanResponder: (evt, g) => {
        if (movingPiece.current) return false;
        return (evt.nativeEvent.touches?.length ?? 0) >= 2 || Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        onDraggingRef.current(true);
        gesture.current.pan = panRef.current;
        gesture.current.dx = 0;
        gesture.current.dy = 0;
        gesture.current.pinch = null;
        viewportRef.current?.measureInWindow((x, y) => {
          gesture.current.origin = { x, y };
        });
        beginPinch(evt);
      },
      onPanResponderMove: (evt, g) => {
        const touches = evt.nativeEvent.touches ?? [];
        if (touches.length >= 2) {
          if (!gesture.current.pinch) beginPinch(evt);
          applyPinch(touches);
          return;
        }
        if (gesture.current.pinch) {
          gesture.current.pinch = null;
          gesture.current.pan = panRef.current;
          gesture.current.dx = g.dx;
          gesture.current.dy = g.dy;
          return;
        }
        const next = clampPan(
          {
            x: gesture.current.pan.x + g.dx - gesture.current.dx,
            y: gesture.current.pan.y + g.dy - gesture.current.dy,
          },
          zoomRef.current,
          viewportRefSize.current,
        );
        panRef.current = next;
        setPan(next);
      },
      onPanResponderRelease: () => {
        gesture.current.pinch = null;
        if (!movingPiece.current) onDraggingRef.current(false);
      },
      onPanResponderTerminate: () => {
        gesture.current.pinch = null;
        if (!movingPiece.current) onDraggingRef.current(false);
      },
    }),
  ).current;

  const beginPinch = (evt: GestureResponderEvent) => {
    const touches = evt.nativeEvent.touches ?? [];
    if (touches.length < 2) return;
    const [a, b] = touches;
    const midX = (a.pageX + b.pageX) / 2 - gesture.current.origin.x;
    const midY = (a.pageY + b.pageY) / 2 - gesture.current.origin.y;
    gesture.current.pinch = {
      dist: Math.max(1, touchDistance(a, b)),
      zoom: zoomRef.current,
      pan: panRef.current,
      x: midX,
      y: midY,
    };
  };

  const applyPinch = (touches: ReadonlyArray<{ pageX: number; pageY: number }>) => {
    const pinch = gesture.current.pinch;
    const [a, b] = touches;
    if (!pinch || !a || !b) return;
    const nextZoom = clampZoom((touchDistance(a, b) / pinch.dist) * pinch.zoom);
    const midX = (a.pageX + b.pageX) / 2 - gesture.current.origin.x;
    const midY = (a.pageY + b.pageY) / 2 - gesture.current.origin.y;
    const ratio = nextZoom / pinch.zoom;
    const nextPan = clampPan(
      {
        x: midX - (pinch.x - pinch.pan.x) * ratio,
        y: midY - (pinch.y - pinch.pan.y) * ratio,
      },
      nextZoom,
      viewportRefSize.current,
    );
    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setPan(nextPan);
  };

  const changeZoom = (delta: number) => {
    const prev = zoomRef.current;
    const next = clampZoom(prev + delta);
    const nextPan = panForZoom(panRef.current, prev, next, viewportRefSize.current);
    zoomRef.current = next;
    panRef.current = nextPan;
    setZoom(next);
    setPan(nextPan);
  };

  useEffect(() => {
    const node = viewportRef.current as unknown as {
      addEventListener?: (type: string, listener: (event: WheelEvent) => void, options?: { passive: boolean }) => void;
      removeEventListener?: (type: string, listener: (event: WheelEvent) => void) => void;
    } | null;
    if (!node?.addEventListener || !node.removeEventListener) return;
    const onWheel = (event: WheelEvent) => {
      const next = panForWheel(
        panRef.current,
        {
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        },
        zoomRef.current,
        viewportRefSize.current,
      );
      if (!next) return;
      event.preventDefault();
      panRef.current = next;
      setPan(next);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener?.('wheel', onWheel);
  }, []);

  const boardSize = viewport * zoom;

  return (
    <View style={{ gap: 8 }}>
      <View
        ref={viewportRef}
        style={styles.viewport}
        onLayout={(event) => {
          const width = Math.max(0, event.nativeEvent.layout.width - VIEW_FRAME * 2);
          if (width <= 0 || width === viewportRefSize.current) return;
          const first = viewportRefSize.current === 0;
          viewportRefSize.current = width;
          setViewport(width);
          if (first) {
            const origin = width - width * START_ZOOM;
            const next = { x: origin, y: origin };
            panRef.current = next;
            setPan(next);
          }
        }}
        onTouchStart={() => onDraggingRef.current(true)}
        onTouchEnd={() => {
          if (!movingPiece.current) onDraggingRef.current(false);
        }}
        onTouchCancel={() => {
          if (!movingPiece.current) onDraggingRef.current(false);
        }}
      >
        {viewport > 0 ? (
          <BoardCanvas
            {...props}
            onDragging={(dragging) => {
              movingPiece.current = dragging;
              onDraggingRef.current(dragging);
            }}
            panHandlers={responder.panHandlers}
            showCenter={false}
            style={{ position: 'absolute', width: boardSize, height: boardSize, left: pan.x, top: pan.y }}
          />
        ) : null}
        <View
          pointerEvents="box-none"
          style={[
            styles.zoomDock,
            {
              top: pan.y + boardSize / 11 + 12,
              right: viewport - (pan.x + (boardSize * 10) / 11) + 12,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
            onPress={() => changeZoom(0.5)}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomBtnPressed]}
          >
            <Text style={styles.zoomLabel}>+</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
            onPress={() => changeZoom(-0.5)}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomBtnPressed]}
          >
            <Text style={styles.zoomLabel}>−</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.phoneHint}>Drag the board to look around, or roll the wheel over it. Pinch, or use + and −, to zoom.</Text>
    </View>
  );
}

function BoardCanvas({
  players,
  tokenSpaces,
  enabled,
  onLand,
  onDragging,
  style,
  panHandlers,
  showCenter = true,
}: Props & {
  style?: StyleProp<ViewStyle>;
  panHandlers?: ReturnType<typeof PanResponder.create>['panHandlers'];
  showCenter?: boolean;
}) {
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

  const cell = size > 0 ? size / 11 : 48;
  const detail = cell >= CLOSE_CELL;

  return (
    <View
      ref={boardRef}
      onLayout={rememberOrigin}
      style={[styles.board, style]}
      accessibilityLabel="Monopoly board"
      {...panHandlers}
    >
      {boardSpaces.map((space) => {
        const { row, col } = spaceToCell(space.index);
        const property = space.propertyId ? getProperty(space.propertyId) : undefined;
        const isRailroad = property?.kind === 'railroad';
        const isUtility = property?.kind === 'utility';
        const isCorner = space.index % 10 === 0;
        const swatch = property && !isRailroad && !isUtility ? property.swatch : undefined;
        const bar = swatch
          ? detail
            ? Math.max(12, Math.round(cell * 0.18))
            : Math.max(8, Math.round(cell * 0.36))
          : 0;
        const label = detail ? Math.max(12, Math.round(cell * 0.13)) : Math.max(10, Math.round(cell * 0.2));
        const lane = !isCorner && (col === 0 || col === 10) ? sideLane(cell) : tokenLane(cell);
        const mark = space.name === 'Chance' ? 'chance' : space.name === 'Community Chest' ? 'chest' : null;
        const priceLine = detail && (property || space.tax) ? Math.max(12, Math.round(cell * 0.11)) : 0;
        const utility = isUtility ? utilityExtent(cell, detail) : 0;
        const bounds = labelBounds(row, col, cell, bar, isRailroad, detail, priceLine, utility);
        const nameText = mark
          ? null
          : !detail && space.tax
            ? `$${space.tax}`
            : detail
              ? (property?.name ?? space.name)
              : space.short;
        const fitted =
          nameText && bounds.width >= 22 && bounds.height >= 16
            ? fitPropertyLabel(nameText, bounds, label)
            : null;
        const barLabel = !detail && swatch && !fitted ? space.short : null;
        const barTurn = col === 0 ? '-90deg' : col === 10 ? '90deg' : null;
        const amount = detail && fitted ? (property?.price ?? space.tax) : undefined;
        return (
          <View
            key={space.index}
            accessibilityLabel={space.name}
            style={[
              styles.cell,
              { backgroundColor: spaceTint(space.name, property?.kind) },
              isCorner ? null : spacePadding(row, col, lane, swatch ? bar : 0, cell),
              {
                left: `${(col * 100) / 11}%`,
                top: `${(row * 100) / 11}%`,
              },
              hover === space.index && styles.cellHover,
            ]}
          >
            {isCorner ? (
              <View pointerEvents="none" style={cornerFrame(row, col, cell, lane)}>
                <CornerArt index={space.index} cell={Math.max(36, cell - lane)} detail={detail} />
              </View>
            ) : (
              <>
                {swatch ? (
                  <View
                    style={[
                      styles.swatch,
                      barEdge(row, col, bar),
                      {
                        backgroundColor: swatch,
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      },
                    ]}
                  >
                    {barLabel && barTurn ? (
                      <View
                        style={{
                          position: 'absolute',
                          width: cell - 4,
                          height: bar,
                          left: (bar - (cell - 4)) / 2,
                          top: (cell - bar) / 2,
                          alignItems: 'center',
                          justifyContent: 'center',
                          transform: [{ rotate: barTurn }],
                        }}
                      >
                        <Text
                          style={{
                            color: inkOn(swatch),
                            fontFamily: fonts.body,
                            fontWeight: '800',
                            fontSize: fitSize(barLabel, cell - 8, Math.max(8, bar - 4)),
                            lineHeight: Math.max(10, bar - 2),
                            width: cell - 8,
                            textAlign: 'center',
                          }}
                          numberOfLines={1}
                        >
                          {barLabel}
                        </Text>
                      </View>
                    ) : barLabel ? (
                      <Text
                        style={{
                          color: inkOn(swatch),
                          fontFamily: fonts.body,
                          fontWeight: '800',
                          fontSize: fitSize(barLabel, cell - 6, Math.max(8, bar - 4)),
                          lineHeight: Math.max(10, bar - 2),
                          textAlign: 'center',
                        }}
                        numberOfLines={1}
                      >
                        {barLabel}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {isRailroad ? <TrainMark row={row} col={col} cell={cell} detail={detail} /> : null}
                {isUtility ? (
                  <UtilityMark kind={property?.id === 'water' ? 'water' : 'electric'} size={utility} />
                ) : null}
                {mark === 'chance' ? <ChanceMark row={row} col={col} cell={cell} detail={detail} /> : null}
                {mark === 'chest' ? <ChestMark row={row} col={col} cell={cell} detail={detail} /> : null}
                {fitted ? (
                  <Text
                    style={[
                      styles.cellText,
                      {
                        fontSize: fitted.fontSize,
                        lineHeight: fitted.lineHeight,
                        width: '100%',
                      },
                    ]}
                    numberOfLines={fitted.lines}
                  >
                    {fitted.text}
                  </Text>
                ) : null}
                {detail && mark ? (
                  <Text
                    style={[
                      styles.cellText,
                      {
                        fontSize: Math.max(10, Math.round(cell * 0.11)),
                        lineHeight: Math.max(12, Math.round(cell * 0.13)),
                        width: '100%',
                      },
                    ]}
                  >
                    {mark === 'chance' ? 'Chance' : 'Chest'}
                  </Text>
                ) : null}
                {amount != null ? (
                  <Text
                    style={[
                      styles.cellPrice,
                      {
                        fontSize: Math.max(10, priceLine - 2),
                        lineHeight: priceLine,
                      },
                    ]}
                  >
                    ${amount}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        );
      })}
      <View style={styles.center} pointerEvents="none">
        <Text
          style={[
            styles.centerTitle,
            { fontSize: Math.min(96, Math.max(18, Math.round(cell * 0.62))), letterSpacing: 1 },
          ]}
        >
          MONOPOLY
        </Text>
        <View style={styles.centerRule} />
        {showCenter && detail ? <Text style={styles.centerHint}>Drag a piece onto a space</Text> : null}
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

function spaceTint(name: string, kind?: string) {
  if (name === 'Chance') return '#f6e2cf';
  if (name === 'Community Chest') return '#f3ead0';
  if (name === 'Income Tax' || name === 'Luxury Tax') return '#f6e0dc';
  if (kind === 'railroad') return '#e3ebf1';
  if (kind === 'utility') return '#f6f0d2';
  if (name === 'Go' || name === 'Jail' || name === 'Free Parking' || name === 'Go to Jail') return '#f3ead8';
  return '#f7f1e6';
}

function CornerArt({ index, cell, detail }: { index: number; cell: number; detail: boolean }) {
  if (index === 0) return <GoCorner cell={cell} detail={detail} />;
  if (index === 10) return <JailCorner cell={cell} detail={detail} />;
  if (index === 20) return <FreeParkingCorner cell={cell} detail={detail} />;
  return <GoToJailCorner cell={cell} detail={detail} />;
}

function GoCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const go = Math.round(cell * (detail ? 0.34 : 0.48));
  const fine = Math.max(7, Math.round(cell * 0.09));
  const arrowW = Math.round(cell * (detail ? 0.58 : 0.7));
  const arrowH = Math.round(cell * 0.14);
  return (
    <View style={styles.corner}>
      <Text style={[styles.cornerGo, { fontSize: go, lineHeight: go }]}>GO</Text>
      <Svg width={arrowW} height={arrowH} viewBox="0 0 72 16">
        <Path d="M72 5H24V1L4 8l20 7V11h48V5z" fill="#ed1b24" />
      </Svg>
      {detail ? (
        <>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 2 }]}>COLLECT $200</Text>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 2 }]}>AS YOU PASS</Text>
        </>
      ) : null}
    </View>
  );
}

function JailCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const title = Math.max(8, Math.round(cell * (detail ? 0.12 : 0.16)));
  const sub = Math.max(7, Math.round(cell * 0.1));
  const box = Math.round(cell * (detail ? 0.58 : 0.72));
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
      {detail ? (
        <Text style={[styles.cornerFine, { fontSize: sub, lineHeight: sub + 2 }]}>JUST VISITING</Text>
      ) : null}
    </View>
  );
}

function FreeParkingCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const title = fitSize('PARKING', cell - 8, Math.max(10, Math.round(cell * (detail ? 0.15 : 0.2))));
  return (
    <View style={styles.corner}>
      {detail ? (
        <Svg width={Math.round(cell * 0.52)} height={Math.round(cell * 0.24)} viewBox="0 0 64 30">
          <Path d="M6 18c0-4 3-6 8-7l6-7h18l8 7h8c4 0 8 2 8 6v3H6v-2z" fill="#ed1b24" />
          <Path d="M22 8h16l6 6H18z" fill="#b9d7ea" />
          <Circle cx="18" cy="23" r="5" fill="#1a1408" />
          <Circle cx="46" cy="23" r="5" fill="#1a1408" />
          <Circle cx="18" cy="23" r="2" fill="#f4efe4" />
          <Circle cx="46" cy="23" r="2" fill="#f4efe4" />
        </Svg>
      ) : null}
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title + 1 }]}>FREE</Text>
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title + 1 }]}>PARKING</Text>
    </View>
  );
}

function GoToJailCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const kicker = Math.max(8, Math.round(cell * 0.12));
  const title = Math.max(12, Math.round(cell * (detail ? 0.18 : 0.26)));
  const fine = Math.max(6, Math.round(cell * 0.08));
  return (
    <View style={styles.corner}>
      {detail ? (
        <Text style={[styles.cornerFine, { fontSize: kicker, lineHeight: kicker + 1 }]}>GO TO</Text>
      ) : null}
      <Text style={[styles.cornerGo, { fontSize: title, lineHeight: title }]}>JAIL</Text>
      <Svg width={Math.round(cell * 0.32)} height={Math.round(cell * 0.26)} viewBox="0 0 40 36">
        <Path d="M10 12h20l-2 4H12z" fill="#1d4e89" />
        <Rect x="6" y="15" width="28" height="3" rx="1" fill="#1d4e89" />
        <Circle cx="20" cy="22" r="4.5" fill="#f0c9a0" />
        <Path d="M11 30c1-5 4-7 9-7s8 2 9 7v4H11z" fill="#1d4e89" />
        <Path d="M13 31 L2 27h11z" fill="#1d4e89" />
        <Circle cx="24" cy="31" r="1.5" fill="#f2d36b" />
      </Svg>
      {detail ? (
        <>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]}>Do not pass GO</Text>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]}>Do not collect $200</Text>
        </>
      ) : null}
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

function fitSize(text: string, maxWidth: number, start: number) {
  let size = start;
  while (size > 7 && textWidth(text, size) > maxWidth) size -= 1;
  return size;
}

function inkOn(swatch: string) {
  const hex = swatch.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1a1408' : '#f7f1e6';
}

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

function trainExtent(cell: number, col: number, detail: boolean) {
  const long = detail ? Math.max(26, Math.round(cell * 0.46)) : Math.max(16, Math.round(cell * 0.36));
  const short = Math.round(long * 0.56);
  const sideways = col === 0 || col === 10;
  return { long, short, sideways, height: sideways ? long : short };
}

function utilityExtent(cell: number, detail: boolean) {
  return detail ? Math.max(22, Math.round(cell * 0.28)) : Math.max(16, Math.round(cell * 0.38));
}

function labelBounds(
  row: number,
  col: number,
  cell: number,
  bar: number,
  railroad: boolean,
  detail: boolean,
  priceLine: number,
  utility = 0,
) {
  const border = 2;
  const lane = row === 0 || row === 10 ? tokenLane(cell) : sideLane(cell);
  let width = cell - border;
  let height = cell - border;
  const horizontal = row === 0 || row === 10;
  if (horizontal) height -= lane;
  else width -= lane;
  if (railroad) height -= trainExtent(cell, col, detail).height;
  else if (utility) height -= utility;
  else if (horizontal) height -= bar;
  else width -= bar;
  height -= priceLine;
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

function TrainMark({
  row,
  col,
  cell,
  detail,
}: {
  row: number;
  col: number;
  cell: number;
  detail: boolean;
}) {
  const { long, short, sideways } = trainExtent(cell, col, detail);
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

function cardMarkSize(row: number, col: number, cell: number, detail: boolean) {
  const lane = row === 0 || row === 10 ? tokenLane(cell) : sideLane(cell);
  const along = col === 0 || col === 10 ? cell - 6 : cell - lane - 6;
  const across = row === 0 || row === 10 ? cell - 6 : cell - lane - 6;
  const fraction = detail ? 0.3 : 0.48;
  return Math.max(detail ? 18 : 14, Math.round(Math.min(cell * fraction, along, across)));
}

function UtilityMark({ kind, size }: { kind: 'electric' | 'water'; size: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      {kind === 'water' ? <WaterSvg size={size} /> : <BulbSvg size={size} />}
    </View>
  );
}

function BulbSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        d="M16 1.5c-5.4 0-9.2 4.1-9.2 9.4 0 3.3 1.7 5.8 3.6 7.6.9.9 1.4 1.9 1.4 3v1.3h8.4v-1.3c0-1.1.5-2.1 1.4-3 1.9-1.8 3.6-4.3 3.6-7.6 0-5.3-3.8-9.4-9.2-9.4z"
        fill="#f2c14b"
      />
      <Path d="M11.2 9.2c1-2.4 2.8-3.8 4.8-3.8" fill="none" stroke="#fff6d4" strokeWidth="1.6" strokeLinecap="round" />
      <Rect x="11.6" y="23.2" width="8.8" height="2.1" rx="0.4" fill="#7a5a22" />
      <Rect x="12.2" y="26" width="7.6" height="1.8" rx="0.4" fill="#7a5a22" />
      <Rect x="13" y="28.4" width="6" height="2.2" rx="0.7" fill="#4e3912" />
    </Svg>
  );
}

function WaterSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path d="M16 2c5.2 7.2 11 12.2 11 18.2a11 11 0 1 1-22 0C5 14.2 10.8 9.2 16 2z" fill="#2b86c4" />
      <Path d="M11.5 18.5c1.2 4 3.4 6 6.8 6.8" fill="none" stroke="#d7f1fb" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

function ChanceMark({
  row,
  col,
  cell,
  detail,
}: {
  row: number;
  col: number;
  cell: number;
  detail: boolean;
}) {
  const size = cardMarkSize(row, col, cell, detail);
  return (
    <Text
      pointerEvents="none"
      style={{
        fontFamily: fonts.display,
        fontSize: size,
        lineHeight: size,
        fontWeight: '700',
        color: '#c2410c',
        textAlign: 'center',
        width: '100%',
      }}
    >
      ?
    </Text>
  );
}

function ChestMark({
  row,
  col,
  cell,
  detail,
}: {
  row: number;
  col: number;
  cell: number;
  detail: boolean;
}) {
  const size = cardMarkSize(row, col, cell, detail);
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <ChestSvg size={size} />
    </View>
  );
}

function ChestSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M10 30c0-12 9-20 22-20s22 8 22 20v2H10v-2z" fill="#8d4e28" />
      <Path d="M14 22c2-7 8-12 18-12s16 5 18 12" fill="none" stroke="#e2b34a" strokeWidth="3" />
      <Rect x="8" y="30" width="48" height="8" rx="2" fill="#e2b34a" />
      <Path d="M8 36h48v16c0 3-2 5-5 5H13c-3 0-5-2-5-5V36z" fill="#6b3a1c" />
      <Rect x="28" y="30" width="8" height="27" fill="#e2b34a" />
      <Circle cx="32" cy="44" r="5.5" fill="#f3d78a" />
      <Circle cx="32" cy="44" r="2.2" fill="#6b4a16" />
      <Rect x="12" y="55" width="8" height="4" rx="1" fill="#3a2212" />
      <Rect x="44" y="55" width="8" height="4" rx="1" fill="#3a2212" />
    </Svg>
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

function spacePadding(row: number, col: number, lane: number, bar: number, cell: number) {
  const inner = Math.max(0, cell - 4);
  const edge = Math.min(bar, inner);
  const room = Math.min(lane, Math.max(0, inner - edge));
  if (row === 10) {
    return { paddingTop: room, paddingBottom: edge, paddingLeft: 2, paddingRight: 2, justifyContent: 'flex-end' as const };
  }
  if (row === 0) {
    return { paddingBottom: room, paddingTop: edge, paddingLeft: 2, paddingRight: 2, justifyContent: 'flex-start' as const };
  }
  if (col === 0) {
    return {
      paddingRight: room,
      paddingLeft: edge,
      paddingTop: 2,
      paddingBottom: 2,
      alignItems: 'flex-start' as const,
      justifyContent: 'center' as const,
    };
  }
  return {
    paddingLeft: room,
    paddingRight: edge,
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
      accessibilityLabel={emoji ? `${name} ${emoji.emoji} piece` : `${name} piece`}
      style={[
        styles.token,
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
            : [styles.tokenText, { fontSize: Math.round(piece * 0.72), color }]
        }
      >
        {emoji?.emoji ?? (name.trim().charAt(0).toUpperCase() || '?')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    width: '100%',
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.woodDark,
    borderWidth: VIEW_FRAME,
    borderColor: colors.wood,
    position: 'relative',
  },
  zoomDock: {
    position: 'absolute',
    gap: 8,
    zIndex: 40,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#f7f1e6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0c1612',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.55,
    shadowRadius: 4,
    elevation: 6,
  },
  zoomBtnPressed: {
    backgroundColor: colors.accentPressed,
  },
  zoomLabel: {
    color: colors.accentText,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
  },
  phoneHint: {
    fontFamily: fonts.body,
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
  },
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
    backgroundColor: '#f7f1e6',
    borderWidth: 1,
    borderColor: '#c4b49a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1,
    overflow: 'hidden',
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
  cellPrice: {
    fontFamily: fonts.body,
    fontWeight: '700',
    color: '#6b4e32',
    textAlign: 'center',
    width: '100%',
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
    borderWidth: 1,
    borderColor: 'rgba(26, 20, 8, 0.28)',
  },
  center: {
    position: 'absolute',
    left: `${100 / 11}%`,
    top: `${100 / 11}%`,
    width: `${(100 * 9) / 11}%`,
    height: `${(100 * 9) / 11}%`,
    backgroundColor: '#14352c',
    borderWidth: 2,
    borderColor: 'rgba(212, 168, 75, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
  },
  centerRule: {
    width: '22%',
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.85,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tokenText: {
    fontWeight: '800',
    textAlign: 'center',
  },
  tokenEmojiText: {
    textAlign: 'center',
  },
});

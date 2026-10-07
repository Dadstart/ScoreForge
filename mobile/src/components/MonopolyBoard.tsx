import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { Player } from '../domain/models';
import { boardSpaces, spaceToCell, tokenSpace, tokenSpacesBetween, TRACK_DEPTH, cellBox } from '../domain/monopolyBoard';
import { getProperty, playerToken } from '../domain/monopoly';
import { fitBoardLabel, fitSize } from '../domain/monopolyLabel';
import { clampPan, clampZoom, panForZoom, stepZoom } from '../domain/monopolyZoom';
import { diceMotionMs, MonopolyDice } from './MonopolyDice';
import { CARD_REVEAL_MS, MonopolyCardTable } from './MonopolyCards';
import { MoneyBills, type MoneyFlight } from './MoneyBills';
import { colors, fonts, radii } from '../theme';
import type { DrawnCard } from '../domain/monopolyPlay';

const TOKEN_COLORS = ['#e86a5c', '#6fbf8a', '#7eb6ff', '#d4a84b', '#d93a96', '#f7941d', '#c5d0c9', '#f2e3a0'];
/** Cells at least this wide show names and prices. Smaller cells are a color map. */
const CLOSE_CELL = 96;

type DiceRollView = { id: number; faces: [number, number] };

export type TokenRouteView = { id: number; playerId: string; spaces: number[] };

type Props = {
  players: Player[];
  tokenSpaces?: Record<string, number>;
  tokenRoute?: TokenRouteView | null;
  drawnCards?: DrawnCard[];
  chanceCount?: number;
  chestCount?: number;
  moneyFlight?: MoneyFlight | null;
  onDragging: (dragging: boolean) => void;
  diceRoll?: DiceRollView | null;
  /** Turn status and actions, drawn on the green center. */
  felt?: ReactNode;
};

const VIEW_FRAME = 0;

function touchDistance(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export function MonopolyBoard(props: Props) {
  return <PhoneBoard {...props} startZoom={1} />;
}

const ZOOM_BTN = 44;
const ZOOM_GAP = 8;
const ZOOM_INSET = 12;

/** Keep + and − on the green center, and inside the view when that corner is off screen. */
function zoomDockSpot(pan: { x: number; y: number }, zoom: number, viewport: number) {
  const board = viewport * zoom;
  const edge = TRACK_DEPTH;
  const viewLeft = board <= 0 ? 0 : -pan.x / board;
  const viewTop = board <= 0 ? 0 : -pan.y / board;
  const viewRight = board <= 0 ? 1 : (-pan.x + viewport) / board;
  const viewBottom = board <= 0 ? 1 : (-pan.y + viewport) / board;
  const feltTop = Math.max(edge, viewTop);
  const feltRight = Math.min(1 - edge, viewRight);
  const feltLeft = Math.max(edge, viewLeft);
  const feltBottom = Math.min(1 - edge, viewBottom);
  const stack = ZOOM_BTN * 2 + ZOOM_GAP;
  const onFelt = feltRight > feltLeft && feltBottom > feltTop;
  let top = onFelt ? pan.y + feltTop * board + ZOOM_INSET : ZOOM_INSET;
  let right = onFelt ? viewport - (pan.x + feltRight * board) + ZOOM_INSET : ZOOM_INSET;
  top = Math.min(Math.max(ZOOM_INSET, top), Math.max(ZOOM_INSET, viewport - stack - ZOOM_INSET));
  right = Math.min(Math.max(ZOOM_INSET, right), Math.max(ZOOM_INSET, viewport - ZOOM_BTN - ZOOM_INSET));
  return { top, right };
}

function feltBox(pan: { x: number; y: number }, zoom: number, viewport: number) {
  const board = viewport * zoom;
  const inset = TRACK_DEPTH * board;
  const size = Math.max(0, board - inset * 2);
  return {
    left: pan.x + inset,
    top: pan.y + inset,
    width: size,
    height: size,
  };
}

function PhoneBoard({ onDragging, diceRoll, felt, startZoom = 1, ...props }: Props & { startZoom?: number }) {
  const viewportRef = useRef<View>(null);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState(startZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const viewportRefSize = useRef(0);
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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, g) => {
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
        onDraggingRef.current(false);
      },
      onPanResponderTerminate: () => {
        gesture.current.pinch = null;
        onDraggingRef.current(false);
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

  const changeZoom = (direction: -1 | 1) => {
    const prev = zoomRef.current;
    const next = stepZoom(prev, direction);
    const nextPan = panForZoom(panRef.current, prev, next, viewportRefSize.current);
    zoomRef.current = next;
    panRef.current = nextPan;
    setZoom(next);
    setPan(nextPan);
  };

  const boardSize = viewport * zoom;

  return (
    <View style={{ gap: 8 }}>
      <View
        ref={viewportRef}
        style={[styles.viewport, zoom < 1 && viewport > 0 ? { height: boardSize } : styles.viewportSquare]}
        onLayout={(event) => {
          const width = Math.max(0, event.nativeEvent.layout.width - VIEW_FRAME * 2);
          if (width <= 0 || width === viewportRefSize.current) return;
          const first = viewportRefSize.current === 0;
          viewportRefSize.current = width;
          setViewport(width);
          if (first) {
            const origin = width - width * startZoom;
            const next = { x: origin, y: origin };
            panRef.current = next;
            setPan(next);
          }
        }}
        onTouchStart={() => onDraggingRef.current(true)}
        onTouchEnd={() => onDraggingRef.current(false)}
        onTouchCancel={() => onDraggingRef.current(false)}
      >
        {viewport > 0 ? (
          <BoardCanvas
            {...props}
            panHandlers={responder.panHandlers}
            style={{ position: 'absolute', width: boardSize, height: boardSize, left: pan.x, top: pan.y }}
          />
        ) : null}
        {diceRoll ? (
          <View pointerEvents="none" style={styles.diceLayer}>
            <MonopolyDice roll={diceRoll} />
          </View>
        ) : null}
        {viewport > 0 && felt ? (
          <View pointerEvents="box-none" style={[styles.feltDock, feltBox(pan, zoom, viewport)]}>
            {felt}
          </View>
        ) : null}
        <View
          pointerEvents="box-none"
          style={[styles.zoomDock, zoomDockSpot(pan, zoom, viewport)]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom in"
            onPress={() => changeZoom(1)}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomBtnPressed]}
          >
            <Text style={styles.zoomLabel}>+</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Zoom out"
            onPress={() => changeZoom(-1)}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.zoomBtnPressed]}
          >
            <Text style={styles.zoomLabel}>−</Text>
          </Pressable>
        </View>
      </View>
      {startZoom > 1 ? (
        <Text style={styles.phoneHint}>Drag the board to look around. Pinch, or use + and −, to zoom.</Text>
      ) : null}
    </View>
  );
}

function BoardCanvas({
  players,
  tokenSpaces,
  tokenRoute = null,
  drawnCards = [],
  chanceCount = 16,
  chestCount = 16,
  moneyFlight = null,
  style,
  panHandlers,
  diceRoll = null,
  pinDice = false,
}: Omit<Props, 'onDragging'> & {
  style?: StyleProp<ViewStyle>;
  panHandlers?: ReturnType<typeof PanResponder.create>['panHandlers'];
  pinDice?: boolean;
}) {
  const flightRef = useRef(moneyFlight);
  flightRef.current = moneyFlight;
  const [burst, setBurst] = useState<{ id: number; space: number } | null>(null);
  const [size, setSize] = useState(0);
  const [face, setFace] = useState<{ deck: DrawnCard['deck']; id: string; nonce: number } | null>(null);
  const drawnRef = useRef(drawnCards);
  drawnRef.current = drawnCards;
  const drawCursor = useRef(0);
  const drawnKey = drawnCards.map((card) => `${card.deck}:${card.space}:${card.id}`).join('|');
  const [trackedDraw, setTrackedDraw] = useState(drawnKey);
  if (trackedDraw !== drawnKey) {
    setTrackedDraw(drawnKey);
    drawCursor.current = 0;
    setFace(null);
  }

  const showDrawnCard = (space: number) => {
    const list = drawnRef.current;
    let index = list.findIndex((card, item) => item >= drawCursor.current && card.space === space);
    if (index < 0 && drawCursor.current < list.length) index = drawCursor.current;
    if (index < 0) return;
    const card = list[index];
    if (!card) return;
    drawCursor.current = index + 1;
    setFace({ deck: card.deck, id: card.id, nonce: Date.now() });
  };

  useEffect(() => {
    if (!moneyFlight) {
      setBurst(null);
      return;
    }
    if (moneyFlight.routeId != null) return;
    setBurst({ id: moneyFlight.id, space: moneyFlight.space });
  }, [moneyFlight]);

  const onTokenSettled = (playerId: string) => {
    const flight = flightRef.current;
    if (!flight || flight.routeId == null || flight.playerId !== playerId) return;
    setBurst({ id: flight.id, space: flight.space });
  };

  const cell = size > 0 ? size * TRACK_DEPTH : 48;
  const detail = cell >= CLOSE_CELL;

  return (
    <View
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setSize((current) => (current === width ? current : width));
      }}
      style={[styles.board, style]}
      accessibilityLabel="Monopoly board"
      {...panHandlers}
    >
      {boardSpaces.map((space) => {
        const { row, col } = spaceToCell(space.index);
        const frame = cellBox(row, col);
        const boardPx = size > 0 ? size : 480;
        const pxW = frame.w * boardPx;
        const pxH = frame.h * boardPx;
        const inward = row === 0 || row === 10 ? pxH : pxW;
        const along = row === 0 || row === 10 ? pxW : pxH;
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
        const nameReserve = priceLine + 40;
        const utility = isUtility ? Math.min(utilityExtent(cell, detail), Math.max(18, pxH - nameReserve)) : 0;
        const sidewaysRail = isRailroad && (col === 0 || col === 10);
        const train = isRailroad
          ? railroadMark(cell, col, detail, pxW, pxH, lane, sidewaysRail ? 0 : nameReserve)
          : null;
        const trainHeight = train?.height ?? 0;
        const trainWidth = sidewaysRail ? (train?.width ?? 0) : 0;
        const trainInset = trainWidth > 0 ? trainWidth + 4 : 0;
        const farRail = !detail && isRailroad && (row === 0 || row === 10);
        const railCaption = farRail ? Math.max(12, Math.round(cell * 0.26)) : 0;
        const padLane = farRail ? Math.min(lane, Math.max(8, cell - railCaption - 18)) : lane;
        const bounds = labelBounds(row, col, pxW, pxH, bar, lane, trainHeight, priceLine, utility, trainInset);
        const fullName = property?.name ?? space.name;
        const nameText = mark || farRail ? null : !detail && space.tax ? `$${space.tax}` : fullName;
        const fitted =
          nameText && bounds.width >= 22 && bounds.height >= 12
            ? fitBoardLabel(nameText, !detail && space.tax ? nameText : space.short, bounds, label)
            : null;
        const barFit = !detail && swatch && !fitted
          ? fitBoardLabel(fullName, space.short, { width: Math.max(8, along - 8), height: Math.max(8, bar - 2) }, Math.max(8, bar - 4), 1)
          : null;
        const barLabel = barFit?.lines[0] ?? null;
        const barTurn = col === 0 ? '-90deg' : col === 10 ? '90deg' : null;
        const amount = detail && fitted ? (property?.price ?? space.tax) : undefined;
        return (
          <View
            key={space.index}
            accessibilityLabel={space.name}
            style={[
              styles.cell,
              { backgroundColor: spaceTint(space.name, property?.kind) },
              isCorner ? null : spacePadding(row, col, padLane, swatch ? bar : 0, inward, railCaption, trainInset),
              {
                left: `${frame.x * 100}%`,
                top: `${frame.y * 100}%`,
                width: `${frame.w * 100}%`,
                height: `${frame.h * 100}%`,
              },
            ]}
          >
            {isCorner ? (
              <View pointerEvents="none" style={styles.cornerFill}>
                <CornerArt index={space.index} cell={Math.max(48, cell)} detail={detail} />
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
                          width: along - 4,
                          height: bar,
                          left: (bar - (along - 4)) / 2,
                          top: (along - bar) / 2,
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
                            fontSize: fitSize(barLabel, along - 8, Math.max(8, bar - 4)),
                            lineHeight: Math.max(10, bar - 2),
                            width: along - 8,
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
                          fontSize: fitSize(barLabel, along - 6, Math.max(8, bar - 4)),
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
                {train ? (
                  <TrainMark
                    row={row}
                    col={col}
                    cell={cell}
                    detail={detail}
                    maxHeight={sidewaysRail ? 0 : trainHeight}
                    beside={sidewaysRail ? { width: train.width, height: train.height, span: pxH } : undefined}
                  />
                ) : null}
                {railCaption > 0 ? (
                  <Text
                    pointerEvents="none"
                    style={[styles.cellText, railName(row, cell, railCaption, space.short)]}
                    numberOfLines={1}
                  >
                    {space.short}
                  </Text>
                ) : null}
                {isUtility ? (
                  <UtilityMark kind={property?.id === 'water' ? 'water' : 'electric'} size={utility} />
                ) : null}
                {mark === 'chance' ? <ChanceMark row={row} col={col} cell={cell} detail={detail} /> : null}
                {mark === 'chest' ? <ChestMark row={row} col={col} cell={cell} detail={detail} /> : null}
                {fitted ? (
                  <View style={styles.nameBlock}>
                    {fitted.lines.map((line, index) => (
                      <Text
                        key={`${line}-${index}`}
                        style={[
                          styles.cellText,
                          {
                            fontSize: fitted.fontSize,
                            lineHeight: fitted.lineHeight,
                            width: '100%',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {line}
                      </Text>
                    ))}
                  </View>
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
      <View
        pointerEvents="none"
        style={[
          styles.center,
          {
            left: `${TRACK_DEPTH * 100}%`,
            top: `${TRACK_DEPTH * 100}%`,
            width: `${(1 - 2 * TRACK_DEPTH) * 100}%`,
            height: `${(1 - 2 * TRACK_DEPTH) * 100}%`,
          },
        ]}
      >
        <Text
          style={[
            styles.centerTitle,
            { fontSize: Math.min(96, Math.max(18, Math.round(cell * 0.62))), letterSpacing: 1 },
          ]}
        >
          MONOPOLY
        </Text>
        <View style={styles.centerRule} />
      </View>
      {size > 0
        ? players.map((player, index) => {
            const spaceIndex = tokenSpace(tokenSpaces, player.id);
            const sharing = players.filter(
              (other) => tokenSpace(tokenSpaces, other.id) === spaceIndex,
            );
            const slot = sharing.findIndex((other) => other.id === player.id);
            const route =
              tokenRoute &&
              tokenRoute.playerId === player.id &&
              tokenRoute.spaces[tokenRoute.spaces.length - 1] === spaceIndex
                ? tokenRoute
                : null;
            return (
              <Piece
                key={player.id}
                playerId={player.id}
                name={player.name}
                token={player.token}
                color={TOKEN_COLORS[index % TOKEN_COLORS.length]}
                spaceIndex={spaceIndex}
                slot={slot}
                size={size}
                routeId={route?.id ?? 0}
                routeSpaces={route?.spaces ?? null}
                holdSpaces={route ? drawnCards.map((card) => card.space) : []}
                onCardStop={showDrawnCard}
                onSettled={onTokenSettled}
            />
          );
        })
      : null}
      {size > 0 ? (
        <MonopolyCardTable boardSize={size} chanceCount={chanceCount} chestCount={chestCount} face={face} />
      ) : null}
      <MoneyBills flight={burst} boardSize={size} />
      {pinDice && diceRoll ? (
        <View pointerEvents="none" style={styles.diceLayer}>
          <MonopolyDice roll={diceRoll} />
        </View>
      ) : null}
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

function displaySize(text: string, width: number, start: number) {
  return fitSize(text, Math.max(8, Math.round(width * 0.78)), start);
}

function CornerArt({ index, cell, detail }: { index: number; cell: number; detail: boolean }) {
  if (index === 0) return <GoCorner cell={cell} detail={detail} />;
  if (index === 10) return <JailCorner cell={cell} detail={detail} />;
  if (index === 20) return <FreeParkingCorner cell={cell} detail={detail} />;
  return <GoToJailCorner cell={cell} detail={detail} />;
}

function GoCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const pad = Math.round(cell * 0.04);
  const width = cell - pad * 2;
  const go = fitSize('GO', width, Math.round(cell * (detail ? 0.42 : 0.56)));
  const fine = fitSize('COLLECT $200', width, Math.round(cell * 0.12));
  const arrowH = Math.round(cell * (detail ? 0.14 : 0.2));
  return (
    <View style={[styles.corner, { padding: pad }]}>
      <Text style={[styles.cornerGo, { fontSize: go, lineHeight: go }]}>GO</Text>
      <Svg width={width} height={arrowH} viewBox="0 0 72 16">
        <Path d="M72 5H24V1L4 8l20 7V11h48V5z" fill="#ed1b24" />
      </Svg>
      {detail ? (
        <>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]}>COLLECT $200</Text>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]}>AS YOU PASS</Text>
        </>
      ) : null}
    </View>
  );
}

function JailCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const inset = Math.max(4, Math.round(cell * 0.04));
  const box = Math.round(cell * 0.54);
  const boxH = Math.round(cell * 0.52);
  const title = displaySize('JAIL', box - 10, Math.round(boxH * 0.22));
  const visitW = Math.max(24, cell - box - inset * 3);
  const sub = fitSize('VISITING', visitW, Math.round(cell * (detail ? 0.13 : 0.16)));
  return (
    <View style={styles.cornerFill}>
      <View style={[styles.jail, { position: 'absolute', top: inset, right: inset, width: box, height: boxH }]}>
        <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title + 1 }]} numberOfLines={1}>
          IN
        </Text>
        <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title + 1 }]} numberOfLines={1}>
          JAIL
        </Text>
        <View style={styles.jailBars}>
          <View style={styles.jailBar} />
          <View style={styles.jailBar} />
          <View style={styles.jailBar} />
          <View style={styles.jailBar} />
        </View>
      </View>
      <View
        style={{
          position: 'absolute',
          left: inset,
          top: inset,
          width: visitW,
          height: boxH,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={[styles.cornerFine, { fontSize: sub, lineHeight: sub + 1 }]} numberOfLines={1}>
          JUST
        </Text>
        <Text style={[styles.cornerFine, { fontSize: sub, lineHeight: sub + 1 }]} numberOfLines={1}>
          VISITING
        </Text>
      </View>
    </View>
  );
}

function ParkingCar({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="4 6 58 24">
      <Path d="M6 18c0-4 3-6 8-7l6-7h18l8 7h8c4 0 8 2 8 6v3H6v-2z" fill="#ed1b24" />
      <Path d="M22 8h16l6 6H18z" fill="#b9d7ea" />
      <Circle cx="18" cy="23" r="5" fill="#1a1408" />
      <Circle cx="46" cy="23" r="5" fill="#1a1408" />
      <Circle cx="18" cy="23" r="2" fill="#f4efe4" />
      <Circle cx="46" cy="23" r="2" fill="#f4efe4" />
    </Svg>
  );
}

function FreeParkingCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const pad = Math.round(cell * 0.04);
  const width = cell - pad * 2;
  const title = displaySize('PARKING', width, Math.round(cell * (detail ? 0.22 : 0.28)));
  const carH = Math.round(cell * (detail ? 0.42 : 0.48));
  return (
    <View style={[styles.corner, { padding: pad }]}>
      <ParkingCar width={width} height={carH} />
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title }]} numberOfLines={1}>
        FREE
      </Text>
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title }]} numberOfLines={1}>
        PARKING
      </Text>
    </View>
  );
}

function GoToJailCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const pad = Math.round(cell * 0.04);
  const width = cell - pad * 2;
  const kicker = fitSize('GO TO', width, Math.round(cell * 0.13));
  const title = displaySize('JAIL', width, Math.round(cell * (detail ? 0.28 : 0.4)));
  const fine = fitSize('Do not collect $200', width, Math.round(cell * 0.09));
  const icon = Math.round(cell * (detail ? 0.32 : 0.4));
  return (
    <View style={[styles.corner, { padding: pad }]}>
      {detail ? (
        <Text style={[styles.cornerFine, { fontSize: kicker, lineHeight: kicker }]} numberOfLines={1}>
          GO TO
        </Text>
      ) : null}
      <Text style={[styles.cornerGo, { fontSize: title, lineHeight: title }]} numberOfLines={1}>
        JAIL
      </Text>
      <Svg width={icon} height={Math.round(icon * 0.9)} viewBox="0 0 40 36">
        <Path d="M10 12h20l-2 4H12z" fill="#1d4e89" />
        <Rect x="6" y="15" width="28" height="3" rx="1" fill="#1d4e89" />
        <Circle cx="20" cy="22" r="4.5" fill="#f0c9a0" />
        <Path d="M11 30c1-5 4-7 9-7s8 2 9 7v4H11z" fill="#1d4e89" />
        <Path d="M13 31 L2 27h11z" fill="#1d4e89" />
        <Circle cx="24" cy="31" r="1.5" fill="#f2d36b" />
      </Svg>
      {detail ? (
        <>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]} numberOfLines={1}>
            Do not pass GO
          </Text>
          <Text style={[styles.cornerFine, { fontSize: fine, lineHeight: fine + 1 }]} numberOfLines={1}>
            Do not collect $200
          </Text>
        </>
      ) : null}
    </View>
  );
}

function inkOn(swatch: string) {
  const hex = swatch.replace('#', '');
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1a1408' : '#f7f1e6';
}

function trainExtent(cell: number, col: number, detail: boolean) {
  const long = detail ? Math.max(26, Math.round(cell * 0.46)) : Math.max(16, Math.round(cell * 0.36));
  const short = Math.round(long * 0.56);
  const sideways = col === 0 || col === 10;
  return { long, short, sideways, height: short };
}

/** Side railroads are short along the edge, so the train lies across the space beside the name. */
function railroadMark(
  cell: number,
  col: number,
  detail: boolean,
  pxW: number,
  pxH: number,
  lane: number,
  nameReserve: number,
) {
  const extent = trainExtent(cell, col, detail);
  if (extent.sideways) {
    const nameCol = Math.max(44, Math.round(pxW * 0.28));
    const maxW = Math.max(28, pxW - lane - nameCol - 8);
    const maxH = Math.max(22, pxH - 8);
    const scale = Math.min(1, maxW / extent.long, maxH / extent.short);
    return {
      width: Math.max(18, Math.round(extent.long * scale)),
      height: Math.max(12, Math.round(extent.short * scale)),
    };
  }
  const cap = Math.max(18, pxH - nameReserve);
  const scale = Math.min(1, cap / extent.short);
  return { width: Math.round(extent.long * scale), height: Math.round(extent.short * scale) };
}

function utilityExtent(cell: number, detail: boolean) {
  return detail ? Math.max(22, Math.round(cell * 0.28)) : Math.max(16, Math.round(cell * 0.38));
}

function labelBounds(
  row: number,
  col: number,
  boxW: number,
  boxH: number,
  bar: number,
  lane: number,
  trainHeight: number,
  priceLine: number,
  utility = 0,
  trainWidth = 0,
) {
  let width = boxW - 8;
  let height = boxH - 4;
  const horizontal = row === 0 || row === 10;
  if (horizontal) height -= lane;
  else width -= lane;
  if (trainWidth) width -= trainWidth;
  else if (trainHeight) height -= trainHeight;
  else if (utility) height -= utility;
  else if (horizontal) height -= bar;
  else width -= bar;
  height -= priceLine;
  return { width: Math.max(8, width), height: Math.max(8, height) };
}

function TrainMark({
  row,
  col,
  cell,
  detail,
  maxHeight,
  beside,
}: {
  row: number;
  col: number;
  cell: number;
  detail: boolean;
  maxHeight: number;
  beside?: { width: number; height: number; span: number };
}) {
  if (beside) {
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: Math.max(1, (beside.span - beside.height) / 2),
          ...(col === 0 ? { left: 2 } : { right: 2 }),
          width: beside.width,
          height: beside.height,
          transform: col === 0 ? [{ scaleX: -1 as const }] : undefined,
        }}
      >
        <TrainSvg width={beside.width} height={beside.height} />
      </View>
    );
  }
  let { long, short } = trainExtent(cell, col, detail);
  if (maxHeight > 0 && short > maxHeight) {
    const scale = maxHeight / short;
    long = Math.round(long * scale);
    short = Math.round(short * scale);
  }
  const transform = row === 10 ? [{ scaleX: -1 as const }] : undefined;
  return (
    <View
      pointerEvents="none"
      style={{
        width: long,
        height: short,
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

function railName(row: number, cell: number, caption: number, text: string) {
  return {
    position: 'absolute' as const,
    left: 1,
    right: 1,
    ...(row === 0 ? { top: 1 } : { bottom: 1 }),
    fontSize: fitSize(text, cell - 6, Math.max(8, caption - 2)),
    lineHeight: caption - 1,
  };
}

function spacePadding(row: number, col: number, lane: number, bar: number, cell: number, caption = 0, art = 0) {
  const inner = Math.max(0, cell - 4);
  const edge = Math.min(bar + caption + art, inner);
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

function pieceSize(cell: number) {
  return Math.max(28, Math.round(cell * 0.34));
}

function fittedPiece(width: number, height: number) {
  const room = Math.max(16, Math.min(width, height) - 4);
  return Math.min(pieceSize(Math.max(width, height)), room);
}

function pieceOffset(row: number, col: number, width: number, height: number, piece: number, slot: number) {
  const gap = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const shift = slot === 0 ? 0 : (slot % 2 === 0 ? -1 : 1) * Math.round(piece * 0.55 * Math.ceil(slot / 2));
  const corner = (row === 0 || row === 10) && (col === 0 || col === 10);
  let x = (width - piece) / 2;
  let y = (height - piece) / 2;
  if (corner) {
    if (row === 10 && col === 0) {
      x = (width - piece) / 2 + shift;
      y = height - piece - gap;
    } else {
      x = col === 0 ? width - piece - gap : gap;
      y = row === 0 ? height - piece - gap : gap;
    }
  } else if (row === 10) {
    y = gap;
    x += shift;
  } else if (row === 0) {
    y = height - piece - gap;
    x += shift;
  } else if (col === 0) {
    x = width - piece - gap;
    y += shift;
  } else {
    x = gap;
    y += shift;
  }
  return {
    x: clampInside(x, width, piece),
    y: clampInside(y, height, piece),
  };
}

function clampInside(value: number, span: number, piece: number) {
  return Math.min(Math.max(0, span - piece), Math.max(0, value));
}

function piecePlace(index: number, size: number, slot: number) {
  const { row, col } = spaceToCell(index);
  const frame = cellBox(row, col);
  const width = frame.w * size;
  const height = frame.h * size;
  const piece = fittedPiece(width, height);
  const offset = pieceOffset(row, col, width, height, piece, slot);
  return { left: frame.x * size + offset.x, top: frame.y * size + offset.y, piece };
}

function adjacentSpaces(a: number, b: number) {
  const delta = (a - b + 40) % 40;
  return delta === 1 || delta === 39;
}

function inwardHop(index: number) {
  const { row, col } = spaceToCell(index);
  if (row === 10) return { x: 0, y: -1 };
  if (row === 0) return { x: 0, y: 1 };
  if (col === 0) return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}

function stepMs(spaces: number[]) {
  const hops = Math.max(1, spaces.length - 1);
  if (hops > 16) return 90;
  if (hops > 8) return 130;
  return 180;
}

function travelSpaces(from: number, to: number, route: number[] | null, last: number[] | null) {
  if (route && route.length > 1 && route[0] === from && route[route.length - 1] === to) return route;
  if (last && last.length > 1 && last[last.length - 1] === from && last[0] === to) return [...last].reverse();
  return tokenSpacesBetween(from, to);
}

function Piece({
  playerId,
  name,
  token,
  color,
  spaceIndex,
  slot,
  size,
  routeId,
  routeSpaces,
  holdSpaces,
  onCardStop,
  onSettled,
}: {
  playerId: string;
  name: string;
  token?: string | null;
  color: string;
  spaceIndex: number;
  slot: number;
  size: number;
  routeId: number;
  routeSpaces: number[] | null;
  holdSpaces: number[];
  onCardStop: (space: number) => void;
  onSettled: (playerId: string) => void;
}) {
  const [flying, setFlying] = useState(false);
  const resting = piecePlace(spaceIndex, size, slot);
  const left = useRef(new Animated.Value(resting.left)).current;
  const top = useRef(new Animated.Value(resting.top)).current;
  const liftX = useRef(new Animated.Value(0)).current;
  const liftY = useRef(new Animated.Value(0)).current;
  const bulge = useRef(new Animated.Value(1)).current;
  const settled = useRef(spaceIndex);
  const lastPath = useRef<number[] | null>(null);
  const flyingRef = useRef(false);
  const sizeRef = useRef(size);
  const slotRef = useRef(slot);
  sizeRef.current = size;
  slotRef.current = slot;
  const routeRef = useRef(routeSpaces);
  routeRef.current = routeSpaces;
  const settledNotice = useRef(onSettled);
  settledNotice.current = onSettled;
  const holdRef = useRef(holdSpaces);
  holdRef.current = holdSpaces;
  const cardNotice = useRef(onCardStop);
  cardNotice.current = onCardStop;

  useEffect(() => {
    if (flyingRef.current || settled.current !== spaceIndex) return;
    const place = piecePlace(spaceIndex, size, slot);
    left.setValue(place.left);
    top.setValue(place.top);
  }, [left, size, slot, spaceIndex, top]);

  useEffect(() => {
    if (spaceIndex === settled.current) return;
    const from = settled.current;
    const placeAt = (index: number, atSlot: number) => piecePlace(index, sizeRef.current, atSlot);
    if (diceMotionMs() === 0) {
      settled.current = spaceIndex;
      lastPath.current = null;
      flyingRef.current = false;
      setFlying(false);
      const place = placeAt(spaceIndex, slotRef.current);
      left.setValue(place.left);
      top.setValue(place.top);
      const holds = holdRef.current;
      if (holds.length > 0) cardNotice.current(holds[holds.length - 1]);
      settledNotice.current(playerId);
      return;
    }
    const spaces = travelSpaces(from, spaceIndex, routeRef.current, lastPath.current);
    if (spaces.length < 2) {
      settled.current = spaceIndex;
      const place = placeAt(spaceIndex, slotRef.current);
      left.setValue(place.left);
      top.setValue(place.top);
      return;
    }
    settled.current = spaceIndex;
    lastPath.current = spaces;
    flyingRef.current = true;
    setFlying(true);
    const hop = Math.max(8, Math.round(placeAt(spaces[0], 0).piece * 0.22));
    const pace = stepMs(spaces);
    let current: Animated.CompositeAnimation | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let finishWait: (() => void) | null = null;
    let finished = false;
    let cancelled = false;
    const play = (animation: Animated.CompositeAnimation) =>
      new Promise<boolean>((resolve) => {
        current = animation;
        animation.start(({ finished: done }) => resolve(done));
      });
    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        finishWait = () => {
          finishWait = null;
          resolve();
        };
        timer = setTimeout(() => finishWait?.(), ms);
      });
    const run = async () => {
      const holds = [...holdRef.current];
      for (let step = 1; step < spaces.length; step += 1) {
        const index = spaces[step];
        const place = placeAt(index, step === spaces.length - 1 ? slotRef.current : 0);
        const along = adjacentSpaces(spaces[step - 1], index);
        const dir = along ? inwardHop(spaces[step - 1]) : { x: 0, y: 0 };
        const duration = along ? pace : Math.round(pace * 2.4);
        const half = duration / 2;
        const done = await play(
          Animated.parallel([
            Animated.timing(left, { toValue: place.left, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            Animated.timing(top, { toValue: place.top, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            Animated.sequence([
              Animated.timing(liftX, { toValue: dir.x * hop, duration: half, useNativeDriver: false }),
              Animated.timing(liftX, { toValue: 0, duration: half, useNativeDriver: false }),
            ]),
            Animated.sequence([
              Animated.timing(liftY, { toValue: dir.y * hop, duration: half, useNativeDriver: false }),
              Animated.timing(liftY, { toValue: 0, duration: half, useNativeDriver: false }),
            ]),
            Animated.sequence([
              Animated.timing(bulge, { toValue: along ? 1.1 : 1.06, duration: half, useNativeDriver: false }),
              Animated.timing(bulge, { toValue: 1, duration: half, useNativeDriver: false }),
            ]),
          ]),
        );
        if (cancelled || !done) return;
        const holdAt = holds.indexOf(index);
        if (holdAt >= 0) {
          holds.splice(holdAt, 1);
          cardNotice.current(index);
          if (step < spaces.length - 1) {
            await pause(CARD_REVEAL_MS);
            if (cancelled) return;
          }
        }
      }
      finished = true;
      flyingRef.current = false;
      setFlying(false);
      const place = placeAt(settled.current, slotRef.current);
      left.setValue(place.left);
      top.setValue(place.top);
      liftX.setValue(0);
      liftY.setValue(0);
      bulge.setValue(1);
      settledNotice.current(playerId);
    };
    void run();
    return () => {
      cancelled = true;
      finishWait?.();
      if (timer) clearTimeout(timer);
      current?.stop();
      if (!finished) {
        flyingRef.current = false;
        settled.current = from;
        setFlying(false);
        const place = placeAt(from, slotRef.current);
        left.setValue(place.left);
        top.setValue(place.top);
        liftX.setValue(0);
        liftY.setValue(0);
        bulge.setValue(1);
      }
    };
  }, [bulge, left, liftX, liftY, playerId, routeId, spaceIndex, top]);

  const emoji = playerToken(token);
  const piece = resting.piece;

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={emoji ? `${name} ${emoji.emoji} piece` : `${name} piece`}
      style={[
        styles.token,
        {
          left,
          top,
          width: piece,
          height: piece,
          zIndex: flying ? 30 : 10 + slot,
          transform: [{ translateX: liftX }, { translateY: liftY }, { scale: bulge }],
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  viewportSquare: {
    aspectRatio: 1,
  },
  zoomDock: {
    position: 'absolute',
    gap: 8,
    zIndex: 40,
  },
  diceLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 25,
  },
  feltDock: {
    position: 'absolute',
    zIndex: 32,
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
    backgroundColor: 'transparent',
    position: 'relative',
    overflow: 'hidden',
  },
  cell: {
    position: 'absolute',
    backgroundColor: '#f7f1e6',
    borderWidth: 1,
    borderColor: '#c4b49a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1,
    overflow: 'hidden',
  },
  nameBlock: {
    width: '100%',
    alignItems: 'center',
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
  cornerFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  corner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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

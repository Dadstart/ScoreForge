import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import type { Player } from '../domain/models';
import { boardCamera, projectTiltedPoint } from '../domain/dieProjection';
import {
  boardSpaces,
  boardViewForTurn,
  cellBox,
  colorBarThickness,
  centerTitleFont,
  jailCell,
  layoutJailedTokens,
  layoutSharedTokens,
  layoutVisitingTokens,
  nameFacing,
  cornerFacing,
  CORNER_FIT,
  placeCornerToken,
  boardTurnForSpace,
  nearestBoardTurn,
  nearestTokenFacing,
  ownerMarkPlacement,
  buildingMarkPlacement,
  buildingMarkBand,
  BUILDING_VISUAL_SCALE,
  spaceToCell,
  tokenFacingDegrees,
  followRoute,
  tokenSpace,
  tokenSpacesBetween,
  TRACK_DEPTH,
  visibleBoardRect,
  type BoardView,
} from '../domain/opolyBoard';
import { contrastInk, getProperty, playerLabel, playerToken } from '../domain/opoly';
import { facingPropertyLabel, fitBoardLabel, fitSize } from '../domain/opolyLabel';
import { cameraAlong, centeredZoomShift, clampPan, clampZoom, frameToken, panForWheel, panForZoom, stepZoom, twistStep } from '../domain/opolyZoom';
import { diceMotionMs, diceUseFlatCamera, FlatDice, OpolyDice } from './OpolyDice';
import { CARD_REVEAL_MS, OpolyCardTable } from './OpolyCards';
import { MoneyBills, type MoneyFlight } from './MoneyBills';
import { colors, fonts, radii } from '../theme';
import { useSetPageScroll } from './ui';
import type { DrawnCard } from '../domain/opolyPlay';

const TOKEN_COLORS = ['#e86a5c', '#6fbf8a', '#7eb6ff', '#d4a84b', '#d93a96', '#f7941d', '#c5d0c9', '#f2e3a0'];
const NO_FLIGHTS: MoneyFlight[] = [];
/** Cells at least this wide show names. Smaller cells are a color map. */
const CLOSE_CELL = 96;

type DiceRollView = { id: number; faces: [number, number] };

export type TokenRouteView = { id: number; playerId: string; spaces: number[] };

type Props = {
  players: Player[];
  /** Property id to the player who owns it. */
  owned?: Record<string, string>;
  /** Property id to building level (1–4 houses, 5 hotel). */
  houses?: Record<string, number>;
  tokenSpaces?: Record<string, number>;
  /** Players currently in jail, keyed by player id. Just Visiting is everyone else on that square. */
  inJail?: Record<string, number>;
  tokenRoute?: TokenRouteView | null;
  drawnCards?: DrawnCard[];
  cardOffer?: { deck: 'chance' | 'chest'; id: string; space: number } | null;
  onAcceptCard?: () => void;
  chanceCount?: number;
  chestCount?: number;
  moneyFlights?: MoneyFlight[];
  onDragging: (dragging: boolean) => void;
  /** True while the board is enlarged and a drag should pan it instead of the page. */
  onZoomed?: (zoomed: boolean) => void;
  diceRoll?: DiceRollView | null;
  /**
   * Roll, pay, and buy controls. They sit in a row just under the board.
   */
  roll?: ReactNode | ((docked: boolean) => ReactNode);
  /** Controls that sit just under the near edge of the tilted board. */
  footer?: ReactNode;
  /** Space to face when nothing is moving. The side this space is on becomes the near edge. */
  focusSpace?: number;
  /** Called when a selectable property cell is tapped. */
  onSelectProperty?: (propertyId: string) => void;
  /** Property ids that accept taps (e.g. streets you can develop on your turn). */
  selectablePropertyIds?: ReadonlySet<string>;
};

/** Table angle. The near edge, where the piece is walking, is the large one. */
const BOARD_TILT = '50deg';
/** Spin back to the player whose turn it is, slow enough to keep the dice in view. */
const RETURN_MS = 1200;
/** Slide or turn so a moving piece stays readable on the near edge. */
const FOLLOW_MS = 720;
const RETURN_EASE = Easing.bezier(0.42, 0.02, 0.18, 1);
/** After a move finishes, let the landing sit before the board turns. */
const POST_MOVE_PAUSE_MS = 2000;
/** Lets dice cubes share the board's camera instead of being flattened first. */
const preserve3d = { transformStyle: 'preserve-3d' } as ViewStyle;

/**
 * Shrink the tilted board so the near corners, which perspective enlarges,
 * stay inside the square frame.
 */
function boardPerspective(board: number) {
  return boardCamera(board).perspective;
}

function boardFitScale(board: number) {
  return boardCamera(board).scale;
}

/**
 * Offset from the board center, in viewport pixels, of a point on the tilted
 * board. x and y are origin-centered board pixels after the quarter turn.
 */
function projectTablePoint(x: number, y: number, board: number) {
  const point = projectTiltedPoint(x, y, 0, board);
  return { x: point.x, y: point.y };
}

/** How far the buttons can rise before they meet the near edge of the tilted board. */
function dockLift(board: number, panY: number, frameHeight: number) {
  if (board <= 0 || frameHeight <= 0) return 0;
  const bottom = panY + board / 2 + projectTablePoint(0, board / 2, board).y;
  return Math.max(0, Math.round(frameHeight - bottom) - 4);
}

/**
 * Empty pixels above the tilted board. The square frame is tall enough for the
 * near corners; the far edge sits well below the top of that square.
 */
function boardTopGap(board: number, turnDeg: number, panY: number) {
  if (board <= 0) return 0;
  const rad = (turnDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const half = board / 2;
  let top = Infinity;
  for (const cx of [-half, half]) {
    for (const cy of [-half, half]) {
      const x = cx * cos - cy * sin;
      const y = cx * sin + cy * cos;
      const projected = projectTablePoint(x, y, board).y;
      if (projected < top) top = projected;
    }
  }
  return Math.max(0, Math.round(panY + half + top) - 2);
}

const VIEW_FRAME = 0;

function touchDistance(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Screen angle of the line between two fingers. Clockwise is positive, matching rotateZ. */
function touchAngle(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }) {
  return (Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX) * 180) / Math.PI;
}

type Finger = { pageX: number; pageY: number; identifier?: string | number };

/** Keep the same two fingers when the touch list swaps their order. */
function pairFingers(touches: readonly Finger[], ids: [string | number, string | number] | null): [Finger, Finger] | null {
  if (touches.length < 2) return null;
  if (ids) {
    const a = touches.find((touch) => touch.identifier === ids[0]);
    const b = touches.find((touch) => touch.identifier === ids[1]);
    if (a && b) return [a, b];
  }
  return [touches[0], touches[1]];
}

/** A zoomed-in drag pans the board. Two fingers pinch and turn it, so the page does not take them. */
function claimsBoardGesture(
  zoom: number,
  evt: GestureResponderEvent,
  dx: number,
  dy: number,
) {
  if ((evt.nativeEvent.touches?.length ?? 0) >= 2) return true;
  return zoom > 1 && (Math.abs(dx) > 6 || Math.abs(dy) > 6);
}

export function OpolyBoard(props: Props) {
  return <PhoneBoard {...props} />;
}

function renderRoll(roll: Props['roll'], docked: boolean) {
  if (!roll) return null;
  return typeof roll === 'function' ? roll(docked) : roll;
}

function PhoneBoard({ onDragging, onZoomed, diceRoll, roll, focusSpace = 0, tokenRoute, footer, ...props }: Props) {
  const viewportRef = useRef<View>(null);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const zoomStateRef = useRef(zoom);
  const panRef = useRef(pan);
  const touching = useRef(false);
  const pinchSnap = useRef<{ x: number; y: number } | null>(null);
  const panX = useRef(new Animated.Value(0)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const gestureScale = useRef(new Animated.Value(1)).current;
  const liftAnim = useRef(new Animated.Value(0)).current;
  const cameraProgress = useRef(new Animated.Value(0)).current;
  const cameraListener = useRef<string | null>(null);
  const cameraRun = useRef(0);
  const cameraActive = useRef(false);
  const viewportRefSize = useRef(0);
  const onDraggingRef = useRef(onDragging);
  const onZoomedRef = useRef(onZoomed);
  const setPageScroll = useSetPageScroll();
  const setPageScrollRef = useRef(setPageScroll);
  const boardTurn = useRef(new Animated.Value(0)).current;
  const boardTurnRef = useRef(0);
  const topCrop = useRef(new Animated.Value(0)).current;
  const boardTurnAnim = useRef<Animated.CompositeAnimation | null>(null);
  const boardSpin = useMemo(
    () => boardTurn.interpolate({
      inputRange: [-1440, 1440],
      outputRange: ['-1440deg', '1440deg'],
    }),
    [boardTurn],
  );
  zoomStateRef.current = zoom;
  if (!touching.current) zoomRef.current = zoom;
  viewportRefSize.current = viewport;
  onDraggingRef.current = onDragging;
  onZoomedRef.current = onZoomed;
  setPageScrollRef.current = setPageScroll;

  const gesture = useRef({
    pan: { x: 0, y: 0 },
    dx: 0,
    dy: 0,
    pinch: null as null | {
      dist: number;
      zoom: number;
      pan: { x: number; y: number };
      x: number;
      y: number;
      angle: number;
      turn: number;
      ids: [string | number, string | number] | null;
    },
    origin: { x: 0, y: 0 },
  });

  const syncLift = (panYValue: number) => {
    const view = viewportRefSize.current;
    const zoomNow = zoomRef.current;
    const board = view * zoomNow;
    liftAnim.setValue(dockLift(board, panYValue, zoomNow < 1 ? board : view));
  };

  const writePan = (next: { x: number; y: number }) => {
    panRef.current = next;
    panX.setValue(next.x);
    panY.setValue(next.y);
    syncLift(next.y);
  };

  // Pinch keeps the laid-out board still and scales it. Rebuilding every cell
  // on each finger move flashes the tilted board on iPhone.
  const showBoard = (logicalPan: { x: number; y: number }, zoomNow: number) => {
    const layoutZoom = zoomStateRef.current;
    const scale = layoutZoom > 0 ? zoomNow / layoutZoom : 1;
    const shift = centeredZoomShift(layoutZoom, zoomNow, viewportRefSize.current);
    panRef.current = logicalPan;
    zoomRef.current = zoomNow;
    panX.setValue(logicalPan.x + shift);
    panY.setValue(logicalPan.y + shift);
    gestureScale.setValue(scale);
    const board = viewportRefSize.current * zoomNow;
    topCrop.setValue(zoomNow > 1 ? 0 : boardTopGap(board, boardTurnRef.current, logicalPan.y));
    syncLift(logicalPan.y + shift);
  };

  const endGesture = () => {
    gesture.current.pinch = null;
    onDraggingRef.current(false);
    if (!touching.current) return;
    touching.current = false;
    const nextZoom = zoomRef.current;
    const nextPan = { x: panRef.current.x, y: panRef.current.y };
    if (Math.abs(nextZoom - zoomStateRef.current) > 1e-6) {
      pinchSnap.current = nextPan;
    } else {
      gestureScale.setValue(1);
      panX.setValue(nextPan.x);
      panY.setValue(nextPan.y);
      syncLift(nextPan.y);
    }
    setZoom(nextZoom);
    setPan(nextPan);
  };

  const stopCamera = () => {
    cameraRun.current += 1;
    const was = cameraActive.current;
    cameraActive.current = false;
    boardTurnAnim.current?.stop();
    boardTurnAnim.current = null;
    if (cameraListener.current) {
      cameraProgress.removeListener(cameraListener.current);
      cameraListener.current = null;
    }
    if (was) {
      const settled = { ...panRef.current };
      writePan(settled);
      setPan(settled);
    }
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, g) => claimsBoardGesture(zoomRef.current, evt, g.dx, g.dy),
      onMoveShouldSetPanResponderCapture: (evt, g) => claimsBoardGesture(zoomRef.current, evt, g.dx, g.dy),
      onPanResponderTerminationRequest: (evt) => {
        if ((evt.nativeEvent.touches?.length ?? 0) >= 2) return false;
        return zoomRef.current <= 1;
      },
      onPanResponderGrant: (evt) => {
        touching.current = true;
        stopCamera();
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
        showBoard(next, zoomRef.current);
      },
      onPanResponderRelease: () => endGesture(),
      onPanResponderTerminate: () => endGesture(),
    }),
  ).current;

  useLayoutEffect(() => {
    const snap = pinchSnap.current;
    if (!snap) return;
    gestureScale.setValue(1);
    panX.setValue(snap.x);
    panY.setValue(snap.y);
    pinchSnap.current = null;
    syncLift(snap.y);
    setPan((current) => ({ x: current.x, y: current.y }));
  }, [zoom, pan.x, pan.y, gestureScale, panX, panY]);

  useLayoutEffect(() => {
    const apply = (turn: number) => {
      const zoomNow = zoomRef.current;
      const board = viewportRefSize.current * zoomNow;
      topCrop.setValue(zoomNow > 1 ? 0 : boardTopGap(board, turn, panRef.current.y));
    };
    apply(boardTurnRef.current);
    syncLift(panRef.current.y);
    const id = boardTurn.addListener(({ value }) => apply(value));
    return () => boardTurn.removeListener(id);
  }, [boardTurn, topCrop, viewport, zoom, pan.y]);

  useEffect(() => {
    onZoomedRef.current?.(zoom > 1);
  }, [zoom]);

  useEffect(() => {
    return () => onZoomedRef.current?.(false);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = viewportRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    const blockMove = (event: TouchEvent) => {
      const zoomed = zoomRef.current > 1;
      const pinch = event.touches.length >= 2;
      if ((zoomed || pinch) && event.cancelable) event.preventDefault();
    };
    const blockEdge = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (zoomRef.current <= 1 || !touch || event.touches.length !== 1) return;
      if (touch.clientX <= 28 && event.cancelable) event.preventDefault();
    };
    let commit: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      if (zoomRef.current <= 1 || event.ctrlKey || event.metaKey) return;
      if (event.deltaX === 0 && event.deltaY === 0) return;
      event.preventDefault();
      stopCamera();
      const next = panForWheel(panRef.current, event, zoomRef.current, viewportRefSize.current);
      if (!next || (next.x === panRef.current.x && next.y === panRef.current.y)) return;
      writePan(next);
      if (commit) clearTimeout(commit);
      commit = setTimeout(() => {
        setPan({ x: panRef.current.x, y: panRef.current.y });
      }, 80);
    };
    node.addEventListener('touchmove', blockMove, { passive: false });
    node.addEventListener('touchstart', blockEdge, { passive: false });
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      if (commit) clearTimeout(commit);
      node.removeEventListener('touchmove', blockMove);
      node.removeEventListener('touchstart', blockEdge);
      node.removeEventListener('wheel', onWheel);
    };
  }, []);

  const beginPinch = (evt: GestureResponderEvent) => {
    const touches = evt.nativeEvent.touches ?? [];
    const pair = pairFingers(touches, null);
    if (!pair) return;
    const [a, b] = pair;
    const midX = (a.pageX + b.pageX) / 2 - gesture.current.origin.x;
    const midY = (a.pageY + b.pageY) / 2 - gesture.current.origin.y;
    const ids: [string | number, string | number] | null =
      a.identifier == null || b.identifier == null ? null : [a.identifier, b.identifier];
    gesture.current.pinch = {
      dist: Math.max(1, touchDistance(a, b)),
      zoom: zoomRef.current,
      pan: panRef.current,
      x: midX,
      y: midY,
      angle: touchAngle(a, b),
      turn: boardTurnRef.current,
      ids,
    };
  };

  const applyPinch = (touches: ReadonlyArray<Finger>) => {
    const pinch = gesture.current.pinch;
    const pair = pairFingers(touches, pinch?.ids ?? null);
    if (!pinch || !pair) return;
    const [a, b] = pair;
    const angle = touchAngle(a, b);
    const nextTurn = pinch.turn + twistStep(pinch.angle, angle);
    pinch.angle = angle;
    pinch.turn = nextTurn;
    boardTurnRef.current = nextTurn;
    boardTurn.setValue(nextTurn);
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
    showBoard(nextPan, nextZoom);
  };

  const changeZoom = (direction: -1 | 1) => {
    stopCamera();
    const prev = zoomRef.current;
    const next = stepZoom(prev, direction, viewportRefSize.current);
    const nextPan = panForZoom(panRef.current, prev, next, viewportRefSize.current);
    zoomRef.current = next;
    gestureScale.setValue(1);
    writePan(nextPan);
    setPan(nextPan);
    setZoom(next);
  };

  const presentSpace = (
    space: number,
    duration: number,
    fromSpace = space,
    easing: (value: number) => number = Easing.inOut(Easing.quad),
  ) => {
    const viewportNow = viewportRefSize.current;
    if (viewportNow <= 0) return false;
    const zoomNow = zoomRef.current;
    const startTurn = boardTurnRef.current;
    const startPan = { ...panRef.current };
    const framed = frameToken({
      space,
      turn: startTurn,
      pan: startPan,
      zoom: zoomNow,
      viewport: viewportNow,
    });
    const turnSame = Math.abs(framed.turn - startTurn) < 1;
    const panSame = Math.hypot(framed.pan.x - startPan.x, framed.pan.y - startPan.y) < 1;
    if (turnSame && panSame) return false;

    stopCamera();
    const run = cameraRun.current;
    const shot = {
      fromSpace,
      toSpace: space,
      startTurn,
      endTurn: framed.turn,
      startPan,
      endPan: framed.pan,
      zoom: zoomNow,
      viewport: viewportNow,
    };
    const apply = (t: number) => {
      const camera = cameraAlong(shot, t);
      boardTurnRef.current = camera.turn;
      boardTurn.setValue(camera.turn);
      panRef.current = camera.pan;
      panX.setValue(camera.pan.x);
      panY.setValue(camera.pan.y);
      syncLift(camera.pan.y);
    };
    if (duration <= 0 || diceMotionMs() === 0) {
      apply(1);
      setPan(framed.pan);
      return true;
    }
    cameraActive.current = true;
    cameraProgress.setValue(0);
    apply(0);
    cameraListener.current = cameraProgress.addListener(({ value }) => {
      if (run !== cameraRun.current) return;
      apply(value);
    });
    const anim = Animated.timing(cameraProgress, {
      toValue: 1,
      duration,
      easing,
      useNativeDriver: false,
    });
    boardTurnAnim.current = anim;
    anim.start(({ finished }) => {
      if (!finished || run !== cameraRun.current) return;
      cameraActive.current = false;
      apply(1);
      if (cameraListener.current) {
        cameraProgress.removeListener(cameraListener.current);
        cameraListener.current = null;
      }
      setPan(framed.pan);
    });
    return true;
  };
  const faceSpaceRef = useRef(presentSpace);
  faceSpaceRef.current = presentSpace;
  const focusRef = useRef(focusSpace);
  focusRef.current = focusSpace;
  const routeIdRef = useRef(tokenRoute?.id ?? 0);
  routeIdRef.current = tokenRoute?.id ?? 0;
  // A route left over from an earlier move is already finished. Only a new id means a piece is mid-hop.
  const finishedHop = useRef<number | null>(null);
  if (finishedHop.current === null) finishedHop.current = tokenRoute?.id ?? 0;
  const hopping = useRef(0);
  if ((tokenRoute?.id ?? 0) !== finishedHop.current) hopping.current = tokenRoute?.id ?? 0;
  const hasFaced = useRef(false);

  const faceCurrent = (space: number) => {
    const motion = diceMotionMs() > 0;
    faceSpaceRef.current(space, motion ? RETURN_MS : 0, space, motion ? RETURN_EASE : Easing.linear);
  };
  const turnHold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTurnHold = () => {
    if (!turnHold.current) return;
    clearTimeout(turnHold.current);
    turnHold.current = null;
  };
  const boardNeedsTurn = (space: number) => {
    const next = nearestBoardTurn(boardTurnRef.current, space);
    return Math.abs(next - boardTurnRef.current) >= 1;
  };

  useEffect(() => () => {
    clearTurnHold();
    cameraRun.current += 1;
    cameraActive.current = false;
    boardTurnAnim.current?.stop();
    if (cameraListener.current) {
      cameraProgress.removeListener(cameraListener.current);
      cameraListener.current = null;
    }
  }, [boardTurnAnim, cameraProgress]);

  useEffect(() => {
    if ((tokenRoute?.id ?? 0) !== finishedHop.current) clearTurnHold();
  }, [tokenRoute?.id]);

  useEffect(() => {
    if (hopping.current !== 0) return;
    if (viewportRefSize.current <= 0) return;
    const first = !hasFaced.current;
    hasFaced.current = true;
    if (first) {
      clearTurnHold();
      faceSpaceRef.current(focusSpace, 0);
      return;
    }
    if (turnHold.current) return;
    faceCurrent(focusSpace);
  }, [focusSpace, viewport]);

  const onWalkEnd = () => {
    finishedHop.current = routeIdRef.current;
    hopping.current = 0;
    clearTurnHold();
    const space = focusRef.current;
    if (diceMotionMs() === 0 || !boardNeedsTurn(space)) {
      faceCurrent(space);
      return;
    }
    turnHold.current = setTimeout(() => {
      turnHold.current = null;
      faceCurrent(focusRef.current);
    }, POST_MOVE_PAUSE_MS);
  };

  const boardSize = viewport * zoom;
  const [diceWindow, setDiceWindow] = useState<{ id: number; view: BoardView } | null>(null);
  const diceView = diceRoll && diceWindow?.id === diceRoll.id ? diceWindow.view : null;

  useLayoutEffect(() => {
    const id = diceRoll?.id;
    if (!id) return;
    const viewportNow = viewportRefSize.current;
    if (viewportNow <= 0) return;
    const zoomNow = zoomRef.current;
    const framed = frameToken({
      space: focusRef.current,
      turn: boardTurnRef.current,
      pan: panRef.current,
      zoom: zoomNow,
      viewport: viewportNow,
    });
    const motion = diceMotionMs();
    faceSpaceRef.current(focusRef.current, motion === 0 ? 0 : FOLLOW_MS);
    const boardNow = viewportNow * zoomNow;
    const viewportBox = {
      width: viewportNow,
      height: zoomNow < 1 ? boardNow : viewportNow,
    };
    const seen = (view: BoardView) => boardViewForTurn(view, framed.turn, boardNow);
    const fallback = seen(visibleBoardRect({ pan: framed.pan, viewport: viewportBox }));
    const node = viewportRef.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      setDiceWindow({ id, view: fallback });
      return;
    }
    let cancelled = false;
    node.measureInWindow((x, y, width, height) => {
      if (cancelled) return;
      const frame = Dimensions.get('window');
      const measured = visibleBoardRect({
        pan: framed.pan,
        viewport: {
          width: width > 0 ? width : viewportBox.width,
          height: height > 0 ? height : viewportBox.height,
        },
        windowOrigin: { x, y },
        windowSize: { width: frame.width, height: frame.height },
      });
      const oriented = seen(measured);
      setDiceWindow({
        id,
        view: oriented.width > 1 && oriented.height > 1 ? oriented : fallback,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [diceRoll?.id, viewport > 0]);

  const square = zoom < 1 ? boardSize : viewport;
  const zoomPair = (
    <>
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
    </>
  );

  return (
    <View style={styles.frame}>
      <Animated.View
        style={[
          styles.clip,
          viewport > 0 ? { height: Animated.subtract(square, topCrop) } : styles.viewportSquare,
          zoom > 1 && styles.viewportHold,
        ]}
      >
      <Animated.View
        ref={viewportRef}
        style={[
          styles.viewport,
          viewport > 0 && {
            height: square,
            marginTop: Animated.multiply(topCrop, -1),
          },
          zoom > 1 && styles.viewportHold,
          preserve3d,
        ]}
        onLayout={(event) => {
          const width = Math.max(0, event.nativeEvent.layout.width - VIEW_FRAME * 2);
          if (width <= 0 || width === viewportRefSize.current) return;
          viewportRefSize.current = width;
          setViewport(width);
        }}
        onTouchStart={(event) => {
          const fingers = event.nativeEvent.touches?.length ?? 0;
          if (zoomRef.current > 1 || fingers >= 2) setPageScrollRef.current(false);
        }}
        onTouchEnd={() => setPageScrollRef.current(true)}
        onTouchCancel={() => setPageScrollRef.current(true)}
        {...responder.panHandlers}
      >
        {viewport > 0 ? (
          <Animated.View
            collapsable={false}
            style={[
              {
                position: 'absolute',
                width: boardSize,
                height: boardSize,
                left: pinchSnap.current ? pinchSnap.current.x : panX,
                top: pinchSnap.current ? pinchSnap.current.y : panY,
                transform: [
                  { translateY: -boardSize * 0.04 },
                  { perspective: boardPerspective(boardSize) },
                  { rotateX: BOARD_TILT },
                  { rotateZ: boardSpin },
                  {
                    scale: pinchSnap.current
                      ? boardFitScale(boardSize)
                      : Animated.multiply(gestureScale, boardFitScale(boardSize)),
                  },
                ],
                pointerEvents: 'box-none',
              },
              preserve3d,
            ]}
          >
            <BoardCanvas
              {...props}
              tokenRoute={tokenRoute}
              onArrive={(from, to, duration) => faceSpaceRef.current(to, duration, from)}
              onWalkEnd={onWalkEnd}
              diceRoll={props.cardOffer ? null : diceRoll}
              pinDice={!diceUseFlatCamera()}
              diceBoard={boardSize}
              diceView={diceView}
              diceTurn={boardTurn}
              zoom={zoom}
              style={{ width: boardSize, height: boardSize }}
            />
          </Animated.View>
        ) : null}
      </Animated.View>
      </Animated.View>
      {diceUseFlatCamera() && diceRoll && boardSize > 0 && square > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.flatDice,
            {
              height: square,
              top: Animated.multiply(topCrop, -1),
            },
          ]}
        >
          <FlatDice
            roll={diceRoll}
            view={diceView}
            boardSize={boardSize}
            panX={panX}
            panY={panY}
            turn={boardTurn}
            width={viewport}
            height={square}
          />
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.actionBar, { marginTop: Animated.multiply(liftAnim, -1) }, { pointerEvents: 'box-none' }]}>
        {renderRoll(roll, true)}
        <View style={styles.zoomRow}>{zoomPair}</View>
        {footer}
      </Animated.View>
      <Text style={styles.phoneHint}>
        {zoom > 1
          ? Platform.OS === 'web'
            ? 'Drag or roll the mouse wheel to look around. Pinch to zoom, or twist with two fingers to turn it.'
            : 'Drag the board to look around. Pinch to zoom, or twist with two fingers to turn it.'
          : 'Twist with two fingers to turn the board.'}
      </Text>
    </View>
  );
}

function BoardCanvas({
  players,
  owned,
  houses,
  tokenSpaces,
  inJail,
  tokenRoute = null,
  drawnCards = [],
  cardOffer = null,
  onAcceptCard,
  chanceCount = 16,
  chestCount = 16,
  moneyFlights = NO_FLIGHTS,
  onSelectProperty,
  selectablePropertyIds,
  style,
  diceRoll = null,
  pinDice = false,
  diceView = null,
  diceBoard = 0,
  diceTurn = null,
  zoom = 1,
  onArrive,
  onWalkEnd,
}: Omit<Props, 'onDragging' | 'onZoomed' | 'focusSpace'> & {
  style?: StyleProp<ViewStyle>;
  pinDice?: boolean;
  diceView?: BoardView | null;
  diceBoard?: number;
  diceTurn?: Animated.Value | null;
  zoom?: number;
  onArrive?: (from: number, to: number, duration: number) => boolean;
  onWalkEnd?: () => void;
}) {
  const flightRef = useRef(moneyFlights);
  flightRef.current = moneyFlights;
  const flightKey = moneyFlights.map((flight) => flight.id).join('|');
  const [flightKeySeen, setFlightKeySeen] = useState(flightKey);
  const [landed, setLanded] = useState<MoneyFlight[]>([]);
  if (flightKeySeen !== flightKey) {
    setFlightKeySeen(flightKey);
    setLanded([]);
  }
  const bursts =
    flightKeySeen === flightKey
      ? [...moneyFlights.filter((flight) => flight.routeId == null), ...landed]
      : moneyFlights.filter((flight) => flight.routeId == null);
  const [size, setSize] = useState(0);
  const drawnRef = useRef(drawnCards);
  drawnRef.current = drawnCards;
  const drawCursor = useRef(0);
  const drawnKey = drawnCards.map((card) => `${card.deck}:${card.space}:${card.id}`).join('|');
  const [trackedDraw, setTrackedDraw] = useState(drawnKey);
  if (trackedDraw !== drawnKey) {
    setTrackedDraw(drawnKey);
    drawCursor.current = 0;
  }

  const showDrawnCard = (space: number) => {
    const list = drawnRef.current;
    let index = list.findIndex((card, item) => item >= drawCursor.current && card.space === space);
    if (index < 0 && drawCursor.current < list.length) index = drawCursor.current;
    if (index < 0) return;
    const card = list[index];
    if (!card) return;
    drawCursor.current = index + 1;
  };

  const onTokenSettled = (playerId: string) => {
    onWalkEnd?.();
    const waiting = flightRef.current.filter((flight) => flight.routeId != null && flight.playerId === playerId);
    if (waiting.length === 0) return;
    setLanded((current) => {
      const seen = new Set(current.map((flight) => flight.id));
      const added = waiting.filter((flight) => !seen.has(flight.id));
      return added.length > 0 ? [...current, ...added] : current;
    });
  };

  const cell = size > 0 ? size * TRACK_DEPTH : 48;
  const detail = cell >= CLOSE_CELL;

  return (
    <View
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setSize((current) => (current === width ? current : width));
      }}
      style={[styles.board, preserve3d, style]}
      accessibilityLabel="Opoly board"
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
        const barColor = swatch ?? (isRailroad ? property?.swatch : undefined);
        const letterBand = barColor ? colorBarThickness(inward) : 0;
        const trainBlock = isRailroad ? Math.max(12, Math.round(letterBand * 0.72)) : 0;
        const bar = Math.min(Math.round(inward * 0.78), letterBand + trainBlock);
        const label = Math.max(8, Math.round(cell * (detail ? 0.08 : 0.14)));
        const lane = !isCorner && (col === 0 || col === 10) ? sideLane(cell) : tokenLane(cell);
        const mark = space.name === 'Chance' ? 'chance' : space.name === 'Chest' ? 'chest' : null;
        const priceLine = detail && space.tax ? Math.max(9, Math.round(cell * 0.07)) : 0;
        const priceBand = priceLine > 0 && (row === 0 || row === 10)
          ? priceLine + 2
          : priceLine > 0
            ? 56
            : 0;
        const nameBox = !isCorner && !mark && !barColor
          ? compactNameBox(row, col, pxW, pxH, 0, priceBand)
          : null;
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
        const facing = nameFacing(row, col);
        const quarter = col === 0 || col === 10;
        const readingWidth = nameBox ? (quarter ? nameBox.height : nameBox.width) : 0;
        const readingHeight = nameBox ? (quarter ? nameBox.width : nameBox.height) : 0;
        const compact = nameBox
          ? facingPropertyLabel(
              fullName,
              space.short,
              Math.max(8, readingWidth - 2),
              Math.max(8, readingHeight - 2),
            )
          : null;
        const nameText = barColor || compact || mark || farRail ? null : !detail && space.tax ? `$${space.tax}` : fullName;
        const fitted =
          nameText && bounds.width >= 22 && bounds.height >= 12
            ? fitBoardLabel(nameText, !detail && space.tax ? nameText : space.short, bounds, label)
            : null;
        const shownName = isRailroad ? fullName.replace('🚂', '').trim() : fullName;
        const propertyId = space.propertyId;
        const buildLevel =
          property?.kind === 'street' && propertyId ? (houses?.[propertyId] ?? 0) : 0;
        const buildBand = buildingMarkBand(buildLevel, along, inward);
        const nameBand = letterBand > 0 ? Math.max(6, letterBand - buildBand) : 0;
        const barNameSize = nameBand
          ? Math.max(6, Math.min(nameBand - 2, fitSize(shownName, Math.max(8, along - 4), Math.max(6, nameBand - 2))))
          : 0;
        let trainH = 0;
        let trainW = 0;
        if (isRailroad && bar > letterBand) {
          trainH = Math.max(8, bar - letterBand - 2);
          trainW = Math.round(trainH * (64 / 36));
          if (trainW > along - 4) {
            trainW = Math.max(8, along - 4);
            trainH = Math.max(8, Math.round(trainW * (36 / 64)));
          }
        }
        const amount = priceLine > 0 ? space.tax : undefined;
        const selectable =
          Boolean(propertyId && onSelectProperty && selectablePropertyIds?.has(propertyId));
        const cellStyle: StyleProp<ViewStyle> = [
          styles.cell,
          { backgroundColor: spaceTint(space.name, property?.kind) },
          isCorner ? null : spacePadding(row, col, padLane, barColor ? bar : 0, inward, isRailroad ? 0 : railCaption, isRailroad ? 0 : trainInset),
          quarter && compact ? { overflow: 'visible' as const } : null,
          selectable ? styles.selectableCell : null,
          {
            left: `${frame.x * 100}%`,
            top: `${frame.y * 100}%`,
            width: `${frame.w * 100}%`,
            height: `${frame.h * 100}%`,
          },
        ];
        const cellBody = (
          <>
            {isCorner ? (
              <View style={[styles.cornerFill, { alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }]}>
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ rotate: cornerFacing(space.index) }, { scale: CORNER_FIT }],
                  }}
                >
                  <CornerArt index={space.index} cell={Math.max(48, cell)} detail={detail} />
                </View>
              </View>
            ) : (
              <>
                {barColor ? (
                  <View
                    style={[
                      styles.swatch,
                      barEdge(row, col, bar),
                      {
                        backgroundColor: barColor,
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                      },
                    ]}
                  >
                    <View
                      style={
                        quarter
                          ? {
                              position: 'absolute',
                              width: along,
                              height: bar,
                              left: (bar - along) / 2,
                              top: (along - bar) / 2,
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              transform: [{ rotate: facing }],
                            }
                          : {
                              width: '100%',
                              height: '100%',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              transform: [{ rotate: facing }],
                            }
                      }
                    >
                      <View
                        style={{
                          width: '100%',
                          height: letterBand,
                          alignItems: 'center',
                          justifyContent: 'flex-start',
                        }}
                      >
                        {buildBand > 0 ? <View style={{ width: '100%', height: buildBand }} /> : null}
                        <View
                          style={{
                            width: '100%',
                            height: nameBand,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: contrastInk(barColor),
                              fontFamily: fonts.body,
                              fontWeight: '800',
                              fontSize: barNameSize,
                              lineHeight: barNameSize,
                              width: along - 2,
                              textAlign: 'center',
                            }}
                            numberOfLines={1}
                          >
                            {shownName}
                          </Text>
                        </View>
                      </View>
                      {isRailroad && trainW > 0 ? (
                        <View style={{ width: trainW, height: trainH, transform: [{ scaleX: -1 }] }}>
                          <TrainSvg width={trainW} height={trainH} />
                        </View>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                {train && !compact && !isRailroad ? (
                  <TrainMark
                    row={row}
                    col={col}
                    cell={cell}
                    detail={detail}
                    maxHeight={sidewaysRail ? 0 : trainHeight}
                    beside={sidewaysRail ? { width: train.width, height: train.height, span: pxH } : undefined}
                  />
                ) : null}
                {railCaption > 0 && !compact && !isRailroad ? (
                  <Text
                    style={[
                      styles.cellText,
                      railName(row, cell, railCaption, space.short),
                      { pointerEvents: 'none', transform: [{ rotate: facing }] },
                    ]}
                    numberOfLines={1}
                  >
                    {space.short}
                  </Text>
                ) : null}
                {isUtility && !compact ? (
                  <UtilityMark kind={property?.id === 'water' ? 'water' : 'electric'} size={utility} />
                ) : null}
                {mark === 'chance' && !compact ? <ChanceMark row={row} col={col} cell={cell} detail={detail} /> : null}
                {mark === 'chest' && !compact ? <ChestMark row={row} col={col} cell={cell} detail={detail} /> : null}
                {compact && nameBox ? (
                  <View
                    style={[
                      quarter
                        ? {
                            position: 'absolute',
                            width: nameBox.height,
                            height: nameBox.width,
                            left: nameBox.left + (nameBox.width - nameBox.height) / 2,
                            top: nameBox.top + (nameBox.height - nameBox.width) / 2,
                          }
                        : {
                            position: 'absolute',
                            left: nameBox.left,
                            top: nameBox.top,
                            width: nameBox.width,
                            height: nameBox.height,
                          },
                      {
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2,
                        transform: [{ rotate: facing }],
                        pointerEvents: 'none',
                      },
                    ]}
                  >
                    {isUtility ? (
                      <UtilityMark
                        kind={property?.id === 'water' ? 'water' : 'electric'}
                        size={Math.max(
                          14,
                          Math.min(quarter ? nameBox.height : nameBox.width, quarter ? nameBox.width : nameBox.height) - 2,
                        )}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.cellText,
                          {
                            fontSize: compact.fontSize,
                            lineHeight: compact.fontSize + 1,
                            width: quarter ? nameBox.height : nameBox.width,
                            textAlign: 'center',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {compact.text}
                      </Text>
                    )}
                  </View>
                ) : null}
                {fitted ? (
                  <View style={[styles.nameBlock, { transform: [{ rotate: facing }] }]}>
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
                {amount != null ? (
                  <Text
                    style={[
                      styles.cellPrice,
                      priceEdge(row, col, priceLine, priceBand, bar),
                      {
                        fontSize: fitSize(`$${amount}`, Math.max(24, priceBand - 6), Math.max(8, priceLine - 1)),
                        lineHeight: priceLine,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    ${amount}
                  </Text>
                ) : null}
              </>
            )}
          </>
        );
        return selectable && propertyId ? (
          <Pressable
            key={space.index}
            accessibilityRole="button"
            accessibilityLabel={`Develop ${space.name}`}
            onPress={() => onSelectProperty?.(propertyId)}
            style={cellStyle}
          >
            {cellBody}
          </Pressable>
        ) : (
          <View key={space.index} accessibilityLabel={space.name} style={cellStyle}>
            {cellBody}
          </View>
        );
      })}
      <View
        style={[
          styles.center,
          {
            left: `${TRACK_DEPTH * 100}%`,
            top: `${TRACK_DEPTH * 100}%`,
            width: `${(1 - 2 * TRACK_DEPTH) * 100}%`,
            height: `${(1 - 2 * TRACK_DEPTH) * 100}%`,
          },
          { pointerEvents: 'none' },
        ]}
      >
        {cardOffer ? null : (
          <>
            <Text
              style={[
                styles.centerTitle,
                { fontSize: centerTitleFont(cell), letterSpacing: 1 },
              ]}
            >
              OPOLY
            </Text>
            <View style={styles.centerRule} />
          </>
        )}
      </View>
      {size > 0
        ? boardSpaces.map((space) => {
            const propertyId = space.propertyId;
            const ownerId = propertyId ? owned?.[propertyId] : undefined;
            const owner = ownerId ? players.find((player) => player.id === ownerId) : undefined;
            if (!propertyId || !owner) return null;
            const { row, col } = spaceToCell(space.index);
            const frame = cellBox(row, col);
            const spot = ownerMarkPlacement(row, col, frame.w * size, frame.h * size);
            const piece = playerToken(owner.token);
            const glyph = piece?.emoji ?? (owner.name.trim().charAt(0).toUpperCase() || '?');
            return (
              <View
                key={`owner-${space.index}`}
                accessibilityLabel={`${playerLabel(owner.name, owner.token)} owns ${space.name}`}
                style={[
                  styles.ownerMark,
                  {
                    left: frame.x * size + spot.x,
                    top: frame.y * size + spot.y,
                    width: spot.size,
                    height: spot.size,
                  },
                  { pointerEvents: 'none' },
                ]}
              >
                <View
                  style={{
                    width: spot.size,
                    height: spot.size,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ rotate: nameFacing(row, col) }],
                  }}
                >
                  <Text allowFontScaling={false} style={[styles.ownerEmoji, emojiGlyph(spot.size)]}>
                    {glyph}
                  </Text>
                </View>
              </View>
            );
          })
        : null}
      {size > 0
        ? boardSpaces.map((space) => {
            const propertyId = space.propertyId;
            if (!propertyId) return null;
            const property = getProperty(propertyId);
            if (!property || property.kind !== 'street') return null;
            const level = houses?.[propertyId] ?? 0;
            if (level <= 0) return null;
            const { row, col } = spaceToCell(space.index);
            const frame = cellBox(row, col);
            const cellW = frame.w * size;
            const cellH = frame.h * size;
            const marks = buildingMarkPlacement(row, col, cellW, cellH, level);
            if (marks.length === 0) return null;
            const label =
              level >= 5 ? `Hotel on ${space.name}` : `${level} house${level === 1 ? '' : 's'} on ${space.name}`;
            return (
              <View
                key={`build-${space.index}`}
                accessibilityLabel={label}
                style={[
                  styles.buildingLayer,
                  {
                    left: frame.x * size,
                    top: frame.y * size,
                    width: cellW,
                    height: cellH,
                  },
                  { pointerEvents: 'none' },
                ]}
              >
                {marks.map((mark, index) => {
                  const draw = mark.w * BUILDING_VISUAL_SCALE;
                  const inset = (draw - mark.w) / 2;
                  return (
                    <View
                      key={`${mark.kind}-${index}`}
                      style={[
                        styles.buildingMark,
                        {
                          left: mark.x - inset,
                          top: mark.y - inset,
                          width: draw,
                          height: draw,
                        },
                      ]}
                    >
                      {mark.kind === 'hotel' ? (
                        <HotelSvg size={draw} facing={nameFacing(row, col)} />
                      ) : (
                        <HouseSvg size={draw} facing={nameFacing(row, col)} />
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })
        : null}
      {size > 0
        ? players.map((player, index) => {
            const spaceIndex = tokenSpace(tokenSpaces, player.id);
            const imprisoned = spaceIndex === 10 && inJail?.[player.id] != null;
            const sharing = players.filter((other) => {
              if (tokenSpace(tokenSpaces, other.id) !== spaceIndex) return false;
              const otherJailed = spaceIndex === 10 && inJail?.[other.id] != null;
              return otherJailed === imprisoned;
            });
            const slot = sharing.findIndex((other) => other.id === player.id);
            const crowd = sharing.length;
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
                inJail={imprisoned}
                slot={slot}
                crowd={crowd}
                size={size}
                routeId={route?.id ?? 0}
                routeSpaces={route?.spaces ?? null}
                holdSpaces={route ? drawnCards.map((card) => card.space) : []}
                onCardStop={showDrawnCard}
                onSettled={onTokenSettled}
                onArrive={onArrive}
            />
          );
        })
      : null}
      {size > 0 ? (
        <OpolyCardTable
          boardSize={size}
          chanceCount={chanceCount}
          chestCount={chestCount}
          face={
            cardOffer
              ? { deck: cardOffer.deck, id: cardOffer.id, nonce: `${cardOffer.deck}:${cardOffer.id}:${cardOffer.space}` }
              : null
          }
          onAccept={cardOffer ? onAcceptCard : undefined}
          turn={diceTurn}
          zoom={zoom}
        />
      ) : null}
      <MoneyBills flights={bursts} boardSize={size} />
      {pinDice && diceRoll ? (
        <View style={[styles.diceLayer, preserve3d, { pointerEvents: 'none' }]}>
          <OpolyDice
            roll={diceRoll}
            view={diceView}
            boardSize={diceBoard > 0 ? diceBoard : size}
          />
        </View>
      ) : null}
    </View>
  );
}

function spaceTint(name: string, kind?: string) {
  if (name === 'Chance') return '#f6e2cf';
  if (name === 'Chest') return '#f3ead0';
  if (name === 'Income Tax' || name === 'Luxury Tax') return '#f6e0dc';
  if (kind === 'railroad') return '#e3ebf1';
  if (kind === 'utility') return '#f6f0d2';
  if (name === 'Go' || name === 'Jail' || name === 'Free Park' || name === 'Go to Jail') return '#f3ead8';
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
  const box = jailCell(cell);
  const title = displaySize('JAIL', box.width - 10, Math.round(box.height * 0.22));
  const visitW = Math.max(24, cell - box.width - inset * 3);
  const sub = fitSize('VISITING', visitW, Math.round(cell * (detail ? 0.13 : 0.16)));
  return (
    <View style={styles.cornerFill}>
      <View style={[styles.jail, { position: 'absolute', top: box.y, left: box.x, width: box.width, height: box.height }]}>
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
          top: box.y,
          width: visitW,
          height: box.height,
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
  const title = displaySize('PARK', width, Math.round(cell * (detail ? 0.22 : 0.28)));
  const carH = Math.round(cell * (detail ? 0.42 : 0.48));
  return (
    <View style={[styles.corner, { padding: pad }]}>
      <ParkingCar width={width} height={carH} />
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title }]} numberOfLines={1}>
        FREE
      </Text>
      <Text style={[styles.cornerTitle, { fontSize: title, lineHeight: title }]} numberOfLines={1}>
        PARK
      </Text>
    </View>
  );
}

/** Officer drawing, cropped to the hat, badge, and pointing arm. */
const OFFICER_BOX = { x: 2, y: 12, width: 32, height: 22 };

function OfficerSvg({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={`${OFFICER_BOX.x} ${OFFICER_BOX.y} ${OFFICER_BOX.width} ${OFFICER_BOX.height}`}>
      <Path d="M10 12h20l-2 4H12z" fill="#1d4e89" />
      <Rect x="6" y="15" width="28" height="3" rx="1" fill="#1d4e89" />
      <Circle cx="20" cy="22" r="4.5" fill="#f0c9a0" />
      <Path d="M11 30c1-5 4-7 9-7s8 2 9 7v4H11z" fill="#1d4e89" />
      <Path d="M13 31 L2 27h11z" fill="#1d4e89" />
      <Circle cx="24" cy="31" r="1.5" fill="#f2d36b" />
    </Svg>
  );
}

function GoToJailCorner({ cell, detail }: { cell: number; detail: boolean }) {
  const pad = Math.max(1, Math.round(cell * 0.03));
  const inner = Math.max(8, cell - pad * 2);
  const fine = detail ? fitSize('Do not collect $200', inner, Math.max(7, Math.round(inner * 0.075))) : 0;
  const fineH = detail ? (fine + 1) * 2 : 0;
  // "Go to" takes half a share. "Jail" and the officer split the rest, one share each.
  const share = Math.max(8, Math.floor(Math.max(16, inner - fineH) / 2.5));
  const kicker = fitSize('Go to', inner, Math.max(8, Math.round(share * 0.5)));
  const widthCap = Math.floor((inner * OFFICER_BOX.height) / OFFICER_BOX.width);
  const title = fitSize('Jail', inner, Math.min(share, widthCap));
  const iconH = title;
  const iconW = Math.max(8, Math.round((OFFICER_BOX.width / OFFICER_BOX.height) * iconH));
  return (
    <View style={[styles.corner, { padding: pad }]}>
      <Text style={[styles.cornerTitle, { fontSize: kicker, lineHeight: kicker, maxWidth: inner }]} numberOfLines={1}>
        Go to
      </Text>
      <Text style={[styles.cornerGo, { fontSize: title, lineHeight: title, maxWidth: inner }]} numberOfLines={1}>
        Jail
      </Text>
      <OfficerSvg width={iconW} height={iconH} />
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

function priceEdge(row: number, col: number, priceLine: number, band: number, bar: number) {
  if (row === 10) return { position: 'absolute' as const, left: 0, right: 0, top: bar, height: priceLine };
  if (row === 0) return { position: 'absolute' as const, left: 0, right: 0, bottom: bar, height: priceLine };
  if (col === 0) return { position: 'absolute' as const, right: bar + 2, width: band - 4, top: '38%' as const };
  return { position: 'absolute' as const, left: bar + 2, width: band - 4, top: '38%' as const };
}

function compactNameBox(row: number, col: number, pxW: number, pxH: number, bar: number, price: number) {
  const pad = 2;
  if (row === 0 || row === 10) {
    return {
      width: Math.max(8, pxW - pad * 2),
      height: Math.max(8, pxH - bar - price - pad),
      left: pad,
      top: row === 0 ? bar : price,
    };
  }
  return {
    width: Math.max(8, pxW - bar - price - pad),
    height: Math.max(8, pxH - pad * 2),
    left: col === 0 ? bar : price,
    top: pad,
  };
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
        style={{
          position: 'absolute',
          top: Math.max(1, (beside.span - beside.height) / 2),
          ...(col === 0 ? { left: 2 } : { right: 2 }),
          width: beside.width,
          height: beside.height,
          transform: col === 0 ? [{ scaleX: -1 as const }] : undefined,
          pointerEvents: 'none',
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
      style={{
        width: long,
        height: short,
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
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
    <View style={{ width: size, height: size, pointerEvents: 'none' }}>
      {kind === 'water' ? <SpigotSvg size={size} /> : <BoltSvg size={size} />}
    </View>
  );
}

function BoltSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        d="M18.2 1.2 6.2 17.4h7.4L11.2 30.8 26.4 13h-7.8L20.6 1.2z"
        fill="#f5c400"
        stroke="#8a5a00"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SpigotSvg({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Circle cx="8.5" cy="7.2" r="4.6" fill="#e8eef3" stroke="#2f3d4a" strokeWidth="1.7" />
      <Path d="M8.5 3.8v6.8M5.4 7.2h6.2" stroke="#2f3d4a" strokeWidth="1.4" strokeLinecap="round" />
      <Rect x="7.2" y="11.2" width="2.6" height="3.2" fill="#4b5966" />
      <Rect x="2.4" y="14" width="17.4" height="6.2" rx="1.6" fill="#7f8d9c" />
      <Rect x="3.4" y="15" width="15" height="1.6" rx="0.7" fill="#f4f7fa" />
      <Path d="M18.2 14.4h6.4c1.2 0 2.2 1 2.2 2.2V23h-3.8v-5.2h-4.8z" fill="#4b5966" />
      <Rect x="22.2" y="22.6" width="4.4" height="2.2" rx="0.5" fill="#2f3d4a" />
      <Path d="M24.4 25.6c0 0 2.1 1.9 2.1 3.3a2.1 2.1 0 1 1-4.2 0c0-1.4 2.1-3.3 2.1-3.3z" fill="#2b86c4" />
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
    <View style={[squareTop(row, col), { pointerEvents: 'none' }]}>
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: size,
          lineHeight: size,
          fontWeight: '700',
          color: '#c2410c',
          textAlign: 'center',
          width: size,
          transform: [{ rotate: nameFacing(row, col) }],
        }}
      >
        ?
      </Text>
    </View>
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
    <View style={[squareTop(row, col), { pointerEvents: 'none' }]}>
      <View style={{ width: size, height: size, transform: [{ rotate: nameFacing(row, col) }] }}>
        <ChestSvg size={size} />
      </View>
    </View>
  );
}

/** The top of a square is the inner edge, opposite the outside its mark faces. */
function squareTop(row: number, col: number) {
  const gap = 2;
  if (row === 10) return { position: 'absolute' as const, top: gap, left: 0, right: 0, alignItems: 'center' as const };
  if (row === 0) return { position: 'absolute' as const, bottom: gap, left: 0, right: 0, alignItems: 'center' as const };
  if (col === 0) return { position: 'absolute' as const, right: gap, top: 0, bottom: 0, justifyContent: 'center' as const };
  return { position: 'absolute' as const, left: gap, top: 0, bottom: 0, justifyContent: 'center' as const };
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

/** Monopoly-style green house: peaked roof, front, and right face. */
function HouseSvg({ size, facing }: { size: number; facing: ReturnType<typeof nameFacing> }) {
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: facing }] }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Polygon points="6,38 30,38 38,32 14,32" fill="rgba(8,20,12,0.28)" />
        <Polygon points="28,16 38,10 38,32 28,38" fill="#0F5A2C" />
        <Polygon points="4,16 28,16 28,38 4,38" fill="#1F9A45" />
        <Polygon points="28,16 38,10 24,1 18,6" fill="#0A3D1E" />
        <Polygon points="2,16 18,6 28,16" fill="#2FBF5A" />
        <Polygon points="18,6 24,1 28,16" fill="#178A3C" />
        <Rect x="12" y="24" width="8" height="14" fill="#0A3D1E" />
        <Rect x="22" y="22" width="7" height="7" fill="#C8E8D4" />
      </Svg>
    </View>
  );
}

/** Monopoly-style red hotel: taller block with roof slab and windows. */
function HotelSvg({ size, facing }: { size: number; facing: ReturnType<typeof nameFacing> }) {
  return (
    <View style={{ width: size, height: size, transform: [{ rotate: facing }] }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Polygon points="6,39 29,39 38,33 15,33" fill="rgba(20,6,6,0.3)" />
        <Polygon points="26,8 38,2 38,33 26,39" fill="#7A1612" />
        <Polygon points="4,8 26,8 26,39 4,39" fill="#D03228" />
        <Polygon points="2,8 26,8 38,2 14,2" fill="#9A1E18" />
        <Polygon points="14,2 38,2 36,0 12,0" fill="#B8261E" />
        <Rect x="8" y="12" width="7" height="6" fill="#F0D9A0" />
        <Rect x="17" y="12" width="7" height="6" fill="#F0D9A0" />
        <Rect x="8" y="21" width="7" height="6" fill="#F0D9A0" />
        <Rect x="17" y="21" width="7" height="6" fill="#F0D9A0" />
        <Rect x="11" y="30" width="8" height="9" fill="#5C100E" />
      </Svg>
    </View>
  );
}

function barEdge(row: number, col: number, bar: number) {
  if (row === 10) return { top: 0, left: 0, right: 0, height: bar };
  if (row === 0) return { bottom: 0, left: 0, right: 0, height: bar };
  if (col === 0) return { right: 0, top: 0, bottom: 0, width: bar };
  return { left: 0, top: 0, bottom: 0, width: bar };
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
    return { paddingTop: edge, paddingBottom: room, paddingLeft: 2, paddingRight: 2, justifyContent: 'flex-end' as const };
  }
  if (row === 0) {
    return { paddingBottom: edge, paddingTop: room, paddingLeft: 2, paddingRight: 2, justifyContent: 'flex-start' as const };
  }
  if (col === 0) {
    return {
      paddingRight: edge,
      paddingLeft: room,
      paddingTop: 2,
      paddingBottom: 2,
      alignItems: 'flex-start' as const,
      justifyContent: 'center' as const,
    };
  }
  return {
    paddingLeft: edge,
    paddingRight: room,
    paddingTop: 2,
    paddingBottom: 2,
    alignItems: 'flex-end' as const,
    justifyContent: 'center' as const,
  };
}

/** A token smaller than this stops reading as an emoji on a phone. */
const MIN_PIECE = 28;

/**
 * Emoji ink is taller and wider than the font's em box, and iOS clips the
 * Text to that box. Keep the glyph inside the piece so a rotated token is
 * not cut off.
 */
function emojiGlyph(piece: number) {
  const box = Math.max(1, Math.round(piece));
  return {
    width: box,
    height: box,
    fontSize: Math.max(1, Math.round(box * 0.68)),
    lineHeight: box,
    textAlignVertical: 'center' as const,
  };
}

function pieceSize(cell: number) {
  if (cell < CLOSE_CELL) return Math.max(MIN_PIECE, Math.round(cell * 0.5));
  return Math.max(28, Math.round(cell * 0.34));
}

function fittedPiece(width: number, height: number) {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  // A phone property is narrower than a readable emoji, so the token may spill into the green.
  const room = Math.max(MIN_PIECE, short - 2);
  return Math.min(pieceSize(long), room);
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
    y = height - piece - gap;
    x += shift;
  } else if (row === 0) {
    y = gap;
    x += shift;
  } else if (col === 0) {
    x = gap;
    y += shift;
  } else {
    x = width - piece - gap;
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

function piecePlace(index: number, size: number, slot: number, count = 1, inJail = false) {
  const { row, col } = spaceToCell(index);
  const frame = cellBox(row, col);
  const width = frame.w * size;
  const height = frame.h * size;
  if (index === 10) {
    const cell = Math.min(width, height);
    const spots = inJail ? layoutJailedTokens(cell, count) : layoutVisitingTokens(cell, count);
    const raw = spots[Math.max(0, Math.min(slot, spots.length - 1))];
    const spot = placeCornerToken(cell, raw, cornerFacing(10));
    return { left: frame.x * size + spot.x, top: frame.y * size + spot.y, piece: spot.piece };
  }
  if (count > 1) {
    const spots = layoutSharedTokens(width, height, row, col, count);
    const spot = spots[Math.max(0, Math.min(slot, spots.length - 1))];
    return { left: frame.x * size + spot.x, top: frame.y * size + spot.y, piece: spot.piece };
  }
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

/** Long enough to watch a corner turn, and a straight jump across the board. */
function hopDuration(from: number, to: number, pace: number) {
  const along = adjacentSpaces(from, to);
  const glide = along ? pace : Math.max(FOLLOW_MS, Math.round(pace * 2.4));
  if (boardTurnForSpace(from) === boardTurnForSpace(to)) return glide;
  return Math.max(glide, FOLLOW_MS);
}

function travelSpaces(
  from: number,
  to: number,
  route: number[] | null,
  last: number[] | null,
  toJail = false,
) {
  // Sent to jail — slide straight in. A track walk from e.g. 38 would pass GO.
  if (toJail && to === 10 && from !== 10) return [from, 10];
  const along = followRoute(from, to, route);
  if (along && along.length > 1) return along;
  if (last && last.length > 1 && last[last.length - 1] === from && last[0] === to) return [...last].reverse();
  return tokenSpacesBetween(from, to);
}

function Piece({
  playerId,
  name,
  token,
  color,
  spaceIndex,
  inJail = false,
  slot,
  crowd,
  size,
  routeId,
  routeSpaces,
  holdSpaces,
  onCardStop,
  onSettled,
  onArrive,
}: {
  playerId: string;
  name: string;
  token?: string | null;
  color: string;
  spaceIndex: number;
  inJail?: boolean;
  slot: number;
  crowd: number;
  size: number;
  routeId: number;
  routeSpaces: number[] | null;
  holdSpaces: number[];
  onCardStop: (space: number) => void;
  onSettled: (playerId: string) => void;
  onArrive?: (from: number, to: number, duration: number) => boolean;
}) {
  const [flying, setFlying] = useState(false);
  const resting = piecePlace(spaceIndex, size, slot, crowd, inJail);
  const left = useRef(new Animated.Value(resting.left)).current;
  const top = useRef(new Animated.Value(resting.top)).current;
  const liftX = useRef(new Animated.Value(0)).current;
  const liftY = useRef(new Animated.Value(0)).current;
  const bulge = useRef(new Animated.Value(1)).current;
  const facingDeg = useRef(new Animated.Value(tokenFacingDegrees(spaceIndex))).current;
  const facingNow = useRef(tokenFacingDegrees(spaceIndex));
  const facingSpin = useMemo(
    () => facingDeg.interpolate({
      inputRange: [-2520, 2520],
      outputRange: ['-2520deg', '2520deg'],
    }),
    [facingDeg],
  );
  const settled = useRef(spaceIndex);
  const lastPath = useRef<number[] | null>(null);
  const flyingRef = useRef(false);
  const sizeRef = useRef(size);
  const slotRef = useRef(slot);
  const countRef = useRef(crowd);
  const jailedRef = useRef(inJail);
  sizeRef.current = size;
  slotRef.current = slot;
  countRef.current = crowd;
  jailedRef.current = inJail;
  const routeRef = useRef(routeSpaces);
  routeRef.current = routeSpaces;
  const settledNotice = useRef(onSettled);
  settledNotice.current = onSettled;
  const holdRef = useRef(holdSpaces);
  holdRef.current = holdSpaces;
  const cardNotice = useRef(onCardStop);
  cardNotice.current = onCardStop;
  const arriveNotice = useRef(onArrive);
  arriveNotice.current = onArrive;

  useEffect(() => {
    if (flyingRef.current || settled.current !== spaceIndex) return;
    const place = piecePlace(spaceIndex, size, slot, crowd, inJail);
    left.setValue(place.left);
    top.setValue(place.top);
  }, [crowd, inJail, left, size, slot, spaceIndex, top]);

  useEffect(() => {
    if (spaceIndex === settled.current) return;
    const from = settled.current;
    const placeAt = (index: number, atSlot: number, atCount = 1) =>
      piecePlace(index, sizeRef.current, atSlot, atCount, index === 10 && jailedRef.current);
    const parkFacing = (index: number) => {
      const next = tokenFacingDegrees(index);
      facingNow.current = next;
      facingDeg.setValue(next);
    };
    if (diceMotionMs() === 0) {
      settled.current = spaceIndex;
      lastPath.current = null;
      flyingRef.current = false;
      setFlying(false);
      const place = placeAt(spaceIndex, slotRef.current, countRef.current);
      left.setValue(place.left);
      top.setValue(place.top);
      parkFacing(spaceIndex);
      const holds = holdRef.current;
      if (holds.length > 0) cardNotice.current(holds[holds.length - 1]);
      arriveNotice.current?.(from, spaceIndex, 0);
      settledNotice.current(playerId);
      return;
    }
    const spaces = travelSpaces(
      from,
      spaceIndex,
      routeRef.current,
      lastPath.current,
      spaceIndex === 10 && jailedRef.current,
    );
    if (spaces.length < 2) {
      settled.current = spaceIndex;
      const place = placeAt(spaceIndex, slotRef.current, countRef.current);
      left.setValue(place.left);
      top.setValue(place.top);
      parkFacing(spaceIndex);
      arriveNotice.current?.(from, spaceIndex, 0);
      settledNotice.current(playerId);
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
    let reached = from;
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
        const place = placeAt(
          index,
          step === spaces.length - 1 ? slotRef.current : 0,
          step === spaces.length - 1 ? countRef.current : 1,
        );
        const along = adjacentSpaces(spaces[step - 1], index);
        const dir = along ? inwardHop(spaces[step - 1]) : { x: 0, y: 0 };
        const duration = hopDuration(spaces[step - 1], index, pace);
        arriveNotice.current?.(spaces[step - 1], index, duration);
        const half = duration / 2;
        const turn = nearestTokenFacing(facingNow.current, index);
        facingNow.current = turn;
        const done = await play(
          Animated.parallel([
            Animated.timing(left, { toValue: place.left, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            Animated.timing(top, { toValue: place.top, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            Animated.timing(facingDeg, { toValue: turn, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
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
        reached = index;
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
      const place = placeAt(settled.current, slotRef.current, countRef.current);
      left.setValue(place.left);
      top.setValue(place.top);
      liftX.setValue(0);
      liftY.setValue(0);
      bulge.setValue(1);
      parkFacing(settled.current);
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
        settled.current = reached;
        setFlying(false);
        const place = placeAt(reached, slotRef.current, countRef.current);
        left.setValue(place.left);
        top.setValue(place.top);
        liftX.setValue(0);
        liftY.setValue(0);
        bulge.setValue(1);
        parkFacing(reached);
      }
    };
  }, [bulge, facingDeg, left, liftX, liftY, playerId, routeId, spaceIndex, top]);

  const emoji = playerToken(token);
  const piece = resting.piece;

  return (
    <Animated.View
      accessibilityLabel={emoji ? `${emoji.emoji} ${name} piece` : `${name} piece`}
      style={[
        styles.token,
        {
          left,
          top,
          width: piece,
          height: piece,
          zIndex: flying ? 30 : 10 + slot,
          transform: [{ translateX: liftX }, { translateY: liftY }, { scale: bulge }, { rotate: facingSpin }],
        },
        { pointerEvents: 'none' },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={
          emoji
            ? [styles.tokenEmojiText, emojiGlyph(piece)]
            : [styles.tokenText, { fontSize: Math.round(piece * 0.72), color }]
        }
      >
        {emoji?.emoji ?? (name.trim().charAt(0).toUpperCase() || '?')}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', alignSelf: 'stretch', gap: 8, position: 'relative' },
  flatDice: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 30,
    overflow: 'visible',
  },
  clip: { width: '100%', overflow: 'hidden' },
  viewport: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  viewportHold: Platform.OS === 'web'
    ? ({ touchAction: 'none', userSelect: 'none' } as ViewStyle)
    : {},
  viewportSquare: {
    aspectRatio: 1,
  },
  actionBar: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 8,
    zIndex: 40,
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  diceLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 25,
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
    elevation: 6,
    ...Platform.select({
      web: { boxShadow: '0px 2px 4px rgba(12, 22, 18, 0.55)' },
      default: {
        shadowColor: '#0c1612',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.55,
        shadowRadius: 4,
      },
    }),
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
    overflow: 'visible',
  },
  cell: {
    position: 'absolute',
    backgroundColor: '#f7f1e6',
    borderWidth: 1,
    borderColor: '#c4b49a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1,
    overflow: 'visible',
  },
  selectableCell: {
    borderColor: colors.accent,
    borderWidth: 2,
    zIndex: 2,
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
  ownerMark: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  ownerEmoji: {
    textAlign: 'center',
  },
  buildingLayer: {
    position: 'absolute',
    zIndex: 3,
    overflow: 'visible',
  },
  buildingMark: {
    position: 'absolute',
    overflow: 'visible',
  },
  token: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  tokenText: {
    fontWeight: '800',
    textAlign: 'center',
  },
  tokenEmojiText: {
    textAlign: 'center',
  },
});

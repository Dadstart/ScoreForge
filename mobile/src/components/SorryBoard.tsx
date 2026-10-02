import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { SorryCard } from './SorryCard';
import type { Player } from '../domain/models';
import {
  PAWNS_PER_PLAYER,
  SAFETY_SPACES,
  SORRY_COLORS,
  TRACK_SPACES,
  colorIndexFor,
  slideSpans,
  type PawnSpot,
  type PawnTravel,
  type SorryState,
  type TravelStop,
} from '../domain/sorry';
import {
  gateChevron,
  homePoint,
  safetyHouse,
  safetyLabelAngle,
  safetyLabelPoint,
  safetyPoint,
  sideLabelAngle,
  slideTaper,
  slideTriangle,
  startCircleCenter,
  startPoint,
  trackPoint,
  type Point,
} from '../domain/sorryBoard';

type Props = {
  players: Player[];
  state: SorryState;
  selectedPawn: number | null;
  movablePawns: number[];
  action?: ReactNode;
  onDraw?: () => void;
};

type Piece = {
  key: string;
  playerId: string;
  pawnIndex: number;
  point: Point;
  fill: string;
  ink: string;
  mine: boolean;
};

export function SorryBoard({ players, state, selectedPawn, movablePawns, action, onDraw }: Props) {
  const currentColor = colorIndexFor(state, state.currentPlayerId);
  const slides = slideSpans();
  const pieces = players.flatMap((player) => piecesFor(player, state));
  const motion = usePawnMotion(state);
  const moving = new Set((motion?.travels ?? []).map((travel) => `${travel.playerId}-${travel.pawn}`));
  const resting = pieces.filter((piece) => !moving.has(piece.key));

  return (
    <View style={styles.frame}>
      <Svg width="100%" height="100%" viewBox="-1.2 -1.2 17.4 17.4">
        <G transform="translate(15, 0) scale(-1, 1)">
        <Rect x={-0.85} y={-0.85} width={16.7} height={16.7} rx={0.55} fill="#f4e7cf" />
        <Rect x={0.5} y={0.5} width={14} height={14} rx={0.15} fill="#ead9b4" />

        {Array.from({ length: TRACK_SPACES }, (_, index) => {
          const point = trackPoint(index);
          return (
            <Rect
              key={`space-${index}`}
              x={point.x - 0.5}
              y={point.y - 0.5}
              width={1}
              height={1}
              fill="#fffaf0"
              stroke="#c4b08a"
              strokeWidth={0.06}
            />
          );
        })}

        {slides.map((span) => {
          const end = trackPoint(span.end);
          const color = SORRY_COLORS[span.colorIndex];
          return (
            <G key={`slide-shape-${span.colorIndex}-${span.start}`}>
              <Polygon points={slideTaper(span)} fill={color.fill} />
              <Polygon points={slideTriangle(span.start)} fill="#111111" />
              <Circle
                cx={end.x}
                cy={end.y}
                r={0.16}
                fill="#fffaf0"
                stroke={color.fill}
                strokeWidth={0.07}
              />
            </G>
          );
        })}

        {SORRY_COLORS.map((color, colorIndex) => (
          <Polygon key={`chevron-${color.id}`} points={gateChevron(colorIndex)} fill={color.fill} />
        ))}

        {SORRY_COLORS.map((color, colorIndex) =>
          Array.from({ length: 4 }, (_, safetyIndex) => {
            const point = safetyPoint(colorIndex, safetyIndex);
            return (
              <Rect
                key={`safe-${color.id}-${safetyIndex}`}
                x={point.x - 0.5}
                y={point.y - 0.5}
                width={1}
                height={1}
                fill={color.soft}
                stroke={color.fill}
                strokeWidth={0.06}
              />
            );
          }),
        )}

        {SORRY_COLORS.map((color, colorIndex) => {
          const point = homePoint(colorIndex);
          return (
            <Circle
              key={`home-${color.id}`}
              cx={point.x}
              cy={point.y}
              r={1.1}
              fill={color.soft}
              stroke={color.fill}
              strokeWidth={0.08}
            />
          );
        })}

        {SORRY_COLORS.map((color, colorIndex) => (
          <Polygon
            key={`house-${color.id}`}
            points={safetyHouse(colorIndex)}
            fill={color.soft}
            stroke={color.fill}
            strokeWidth={0.06}
            strokeLinejoin="miter"
          />
        ))}

        {SORRY_COLORS.map((color, colorIndex) => {
          const center = startCircleCenter(colorIndex);
          const active = colorIndex === currentColor;
          return (
            <G key={`start-${color.id}`}>
              <Circle
                cx={center.x}
                cy={center.y}
                r={1.08}
                fill={color.soft}
                stroke={color.fill}
                strokeWidth={0.1}
              />
              {active ? (
                <Circle
                  cx={center.x}
                  cy={center.y}
                  r={1.24}
                  fill="none"
                  stroke="#d4a84b"
                  strokeWidth={0.06}
                />
              ) : null}
            </G>
          );
        })}

        </G>

        {SORRY_COLORS.map((color, colorIndex) => {
          const point = startCircleCenter(colorIndex);
          const x = 15 - point.x;
          return (
            <OutlinedText
              key={`start-label-${color.id}`}
              x={x}
              y={point.y + 0.12}
              fontSize={0.36}
              fill={color.fill}
              transform={`rotate(${sideLabelAngle(colorIndex)} ${x} ${point.y})`}
            >
              START
            </OutlinedText>
          );
        })}

        {SORRY_COLORS.map((color, colorIndex) => {
          const point = safetyLabelPoint(colorIndex);
          const x = 15 - point.x;
          return (
            <OutlinedText
              key={`safety-label-${color.id}`}
              x={x}
              y={point.y + 0.12}
              fontSize={0.38}
              fill={color.fill}
              transform={`rotate(${safetyLabelAngle(colorIndex)} ${x} ${point.y})`}
            >
              SAFETY ZONE
            </OutlinedText>
          );
        })}

        <G transform="translate(15, 0) scale(-1, 1)">
        {resting.map((piece) => {
          const selected = piece.mine && selectedPawn === piece.pawnIndex;
          const movable = piece.mine && movablePawns.includes(piece.pawnIndex);
          return (
            <Circle
              key={piece.key}
              cx={piece.point.x}
              cy={piece.point.y}
              r={0.34}
              fill={piece.fill}
              stroke={selected ? '#d4a84b' : movable ? '#fffaf0' : '#2a2118'}
              strokeWidth={selected || movable ? 0.1 : 0.04}
            />
          );
        })}
        {motion?.travels.map((travel) => {
          const point = travelPosition(travel, motion.spaces, colorIndexFor(state, travel.playerId));
          const color = SORRY_COLORS[colorIndexFor(state, travel.playerId)];
          return (
            <Circle
              key={`move-${travel.playerId}-${travel.pawn}`}
              cx={point.x}
              cy={point.y}
              r={0.34}
              fill={color?.fill ?? '#2a2118'}
              stroke="#fffaf0"
              strokeWidth={0.08}
            />
          );
        })}
        </G>

        {SORRY_COLORS.map((color, colorIndex) => {
          const point = homePoint(colorIndex);
          const x = 15 - point.x;
          return (
            <OutlinedText
              key={`home-label-${color.id}`}
              x={x}
              y={point.y + 0.12}
              fontSize={0.36}
              fill={color.fill}
              transform={`rotate(${sideLabelAngle(colorIndex)} ${x} ${point.y})`}
            >
              HOME
            </OutlinedText>
          );
        })}

        {resting.map((piece) => (
          <SvgText
            key={`n-${piece.key}`}
            x={15 - piece.point.x}
            y={piece.point.y + 0.12}
            fontSize={0.32}
            fontFamily="sans-serif"
            fontWeight="700"
            textAnchor="middle"
            fill={piece.ink}
          >
            {piece.pawnIndex + 1}
          </SvgText>
        ))}
        {motion?.travels.map((travel) => {
          const point = travelPosition(travel, motion.spaces, colorIndexFor(state, travel.playerId));
          const color = SORRY_COLORS[colorIndexFor(state, travel.playerId)];
          return (
            <SvgText
              key={`move-n-${travel.playerId}-${travel.pawn}`}
              x={15 - point.x}
              y={point.y + 0.12}
              fontSize={0.32}
              fontFamily="sans-serif"
              fontWeight="700"
              textAnchor="middle"
              fill={color?.ink ?? '#fffaf0'}
            >
              {travel.pawn + 1}
            </SvgText>
          );
        })}
      </Svg>
      <View style={styles.stacks} pointerEvents="box-none">
        <View style={styles.stackColumn} pointerEvents="box-none">
          <View style={styles.cardPair} pointerEvents="none">
            {onDraw ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Draw a card"
                onPress={onDraw}
                style={({ pressed }) => [styles.deckHit, pressed && styles.deckPressed]}
              >
                <DeckStack count={state.deck.length} />
              </Pressable>
            ) : (
              <DeckStack count={state.deck.length} />
            )}
            <View>
              {state.drawn ? <SorryCard card={state.drawn} mini /> : <View style={styles.cardHole} />}
            </View>
          </View>
          <View style={styles.actionHit}>{action}</View>
        </View>
      </View>
    </View>
  );
}

const MS_PER_SPACE = 150;

function usePawnMotion(state: SorryState): { travels: PawnTravel[]; spaces: number } | null {
  const nonce = state.slideNonce ?? 0;
  const bootNonce = useRef<number | null>(null);
  const animRef = useRef<{ nonce: number; travels: PawnTravel[]; spaces: number; total: number } | null>(
    null,
  );
  const [, setFrame] = useState(0);

  if (bootNonce.current === null) {
    bootNonce.current = nonce;
  } else if (bootNonce.current !== nonce) {
    bootNonce.current = nonce;
    const travels = playableTravels(state.pawnTravels);
    if (travels.length) {
      const total = Math.max(
        ...travels.map((travel) => travel.delay + Math.max(1, travel.stops.length - 1)),
      );
      animRef.current = { nonce, travels, spaces: 0, total };
    } else {
      animRef.current = null;
    }
  }

  useEffect(() => {
    const anim = animRef.current;
    if (!anim || anim.nonce !== nonce) return;
    const { total } = anim;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const raw = Math.min(1, (now - started) / (total * MS_PER_SPACE));
      if (raw >= 1) {
        if (animRef.current?.nonce === nonce) animRef.current = null;
        setFrame((value) => value + 1);
        return;
      }
      if (animRef.current?.nonce === nonce) {
        animRef.current = { ...animRef.current, spaces: raw * total };
        setFrame((value) => value + 1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [nonce]);

  const anim = animRef.current;
  return anim && anim.nonce === nonce ? { travels: anim.travels, spaces: anim.spaces } : null;
}

function playableTravels(travels: PawnTravel[] | undefined): PawnTravel[] {
  if (!Array.isArray(travels)) return [];
  return travels.filter(
    (travel) =>
      travel &&
      typeof travel.playerId === 'string' &&
      Number.isInteger(travel.pawn) &&
      travel.pawn >= 0 &&
      travel.pawn < PAWNS_PER_PLAYER &&
      typeof travel.delay === 'number' &&
      travel.delay >= 0 &&
      Array.isArray(travel.stops) &&
      travel.stops.length >= 2 &&
      travel.stops.every(isStop),
  );
}

function isStop(stop: TravelStop): boolean {
  if (!stop) return false;
  if (stop.zone === 'start' || stop.zone === 'home') return true;
  if (stop.zone === 'track') return Number.isInteger(stop.index) && stop.index >= 0 && stop.index < TRACK_SPACES;
  if (stop.zone === 'safety') {
    return Number.isInteger(stop.index) && stop.index >= 0 && stop.index < SAFETY_SPACES;
  }
  return false;
}

function travelPosition(travel: PawnTravel, spaces: number, colorIndex: number): Point {
  const segments = Math.max(1, travel.stops.length - 1);
  const clamped = Math.min(segments, Math.max(0, spaces - travel.delay));
  const index = Math.min(segments - 1, Math.floor(clamped));
  const frac = clamped >= segments ? 1 : clamped - index;
  const from = stopPoint(colorIndex, travel.pawn, travel.stops[index]);
  const next = travel.stops[index + 1] ?? travel.stops[index];
  const to = stopPoint(colorIndex, travel.pawn, next);
  return {
    x: from.x + (to.x - from.x) * frac,
    y: from.y + (to.y - from.y) * frac,
  };
}

function stopPoint(colorIndex: number, pawnIndex: number, stop: TravelStop): Point {
  if (stop.zone === 'track') return trackPoint(stop.index);
  if (stop.zone === 'safety') return safetyPoint(colorIndex, stop.index);
  if (stop.zone === 'home') return piecePoint(colorIndex, { zone: 'home' }, pawnIndex);
  return startPoint(colorIndex, pawnIndex);
}

function DeckStack({ count }: { count: number }) {
  return (
    <View>
      {count > 1 ? (
        <View style={styles.stackUnder}>
          <SorryCard card="back" mini />
        </View>
      ) : null}
      <SorryCard card="back" mini />
    </View>
  );
}

function piecesFor(player: Player, state: SorryState): Piece[] {
  const colorIndex = colorIndexFor(state, player.id);
  const color = SORRY_COLORS[colorIndex];
  const spots = state.pawns[player.id] ?? [];
  return spots.map((spot, pawnIndex) => ({
    key: `${player.id}-${pawnIndex}`,
    playerId: player.id,
    pawnIndex,
    point: piecePoint(colorIndex, spot, pawnIndex),
    fill: color.fill,
    ink: color.ink,
    mine: player.id === state.currentPlayerId,
  }));
}

function piecePoint(colorIndex: number, spot: PawnSpot, pawnIndex: number): Point {
  if (spot.zone === 'track') return trackPoint(spot.index);
  if (spot.zone === 'safety') return safetyPoint(colorIndex, spot.index);
  if (spot.zone === 'home') {
    const home = homePoint(colorIndex);
    const angle = -Math.PI / 2 + (pawnIndex * Math.PI) / 2;
    const orbit = 0.68;
    return { x: home.x + Math.cos(angle) * orbit, y: home.y + Math.sin(angle) * orbit };
  }
  return startPoint(colorIndex, pawnIndex);
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 1 },
  stacks: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackColumn: { alignItems: 'center', gap: 12 },
  actionHit: { pointerEvents: 'auto' },
  cardPair: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  deckHit: { pointerEvents: 'auto' },
  deckPressed: { opacity: 0.82 },
  stackUnder: { position: 'absolute', top: 7, left: 7 },
  cardHole: {
    width: 118,
    height: 162,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#c4b08a',
  },
});

function OutlinedText({
  fill,
  children,
  x,
  y,
  fontSize,
  transform,
}: {
  fill: string;
  children: string;
  x: number;
  y: number;
  fontSize: number;
  transform?: string;
}) {
  const shared = {
    x,
    y,
    fontSize,
    transform,
    fontFamily: 'sans-serif' as const,
    fontWeight: '700' as const,
    textAnchor: 'middle' as const,
  };
  return (
    <G>
      <SvgText {...shared} fill="#ffffff" stroke="#ffffff" strokeWidth={0.1} strokeLinejoin="round">
        {children}
      </SvgText>
      <SvgText {...shared} fill={fill}>
        {children}
      </SvgText>
    </G>
  );
}

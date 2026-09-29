import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import Svg, { Circle, G, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { SorryCard } from './SorryCard';
import type { Player } from '../domain/models';
import {
  SORRY_COLORS,
  TRACK_SPACES,
  colorIndexFor,
  slideSpans,
  type PawnSpot,
  type SorryState,
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

export function SorryBoard({ players, state, selectedPawn, movablePawns, action }: Props) {
  const currentColor = colorIndexFor(state, state.currentPlayerId);
  const slides = slideSpans();
  const pieces = players.flatMap((player) => piecesFor(player, state));

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
        {pieces.map((piece) => {
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

        {pieces.map((piece) => (
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
      </Svg>
      <View style={styles.stacks} pointerEvents="box-none">
        <View style={styles.stackColumn} pointerEvents="box-none">
          <View style={styles.cardPair} pointerEvents="none">
            <View>
              {state.deck.length > 1 ? (
                <View style={styles.stackUnder}>
                  <SorryCard card="back" mini />
                </View>
              ) : null}
              <SorryCard card="back" mini />
            </View>
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

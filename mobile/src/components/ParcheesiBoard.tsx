import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  LANE_SPACES,
  PARCHEESI_COLORS,
  TRACK_SPACES,
  colorIndexFor,
  isSafeIndex,
  moveDestination,
  startIndex,
  type ParcheesiMove,
  type ParcheesiSpot,
  type ParcheesiState,
} from '../domain/parcheesi';
import { colors } from '../theme';

const BOARD = 360;
const INSET = 22;
const SPAN = BOARD - INSET * 2;
const STEP = SPAN / 17;

const NESTS = [
  { x: 70, y: 290 },
  { x: 290, y: 290 },
  { x: 290, y: 70 },
  { x: 70, y: 70 },
];

const CLUSTER = [
  { x: -12, y: -12 },
  { x: 12, y: -12 },
  { x: -12, y: 12 },
  { x: 12, y: 12 },
];

type Props = {
  state: ParcheesiState;
  moves: ParcheesiMove[];
  selected: number | null;
  canAct: boolean;
  canRoll: boolean;
  onRoll: () => void;
  onSelect: (pawn: number | null) => void;
  onMove: (move: ParcheesiMove) => void;
};

export function ParcheesiBoard({ state, moves, selected, canAct, canRoll, onRoll, onSelect, onMove }: Props) {
  const { width } = useWindowDimensions();
  const frame = Math.min(Math.max(width - 28, 280), 440);
  const scale = frame / BOARD;
  const cell = Math.max(16, 22 * scale);
  const pawn = Math.max(12, 16 * scale);
  const color = colorIndexFor(state, state.currentPlayerId);
  const owned = new Set(Object.values(state.colors));
  const destinations = (selected == null ? [] : moves.filter((move) => move.pawn === selected))
    .map((move) => ({ move, dest: moveDestination(state, move) }))
    .filter((row): row is { move: ParcheesiMove; dest: ParcheesiSpot } => row.dest != null);

  const at = (x: number, y: number, size: number) => ({
    left: x * scale - size / 2,
    top: y * scale - size / 2,
    width: size,
    height: size,
  });

  return (
    <View style={[styles.frame, { width: frame, height: frame }]}>
      <View style={[styles.center, at(BOARD / 2, BOARD / 2, 72 * scale), { borderRadius: 36 * scale }]} />
      {Array.from({ length: TRACK_SPACES }, (_, index) => {
        const point = trackPoint(index);
        const start = startColor(index);
        const safe = isSafeIndex(index);
        return (
          <View
            key={`track-${index}`}
            style={[
              styles.cell,
              at(point.x, point.y, cell),
              { borderRadius: cell / 2 },
              start != null && { borderColor: PARCHEESI_COLORS[start].fill, backgroundColor: PARCHEESI_COLORS[start].soft },
              safe && start == null && styles.safe,
              start != null && !owned.has(start) && styles.dim,
            ]}
          />
        );
      })}
      {PARCHEESI_COLORS.map((swatch, index) =>
        Array.from({ length: LANE_SPACES }, (_, lane) => {
          const point = lanePoint(index, lane);
          return (
            <View
              key={`lane-${swatch.id}-${lane}`}
              style={[
                styles.cell,
                at(point.x, point.y, cell * 0.86),
                { borderRadius: cell / 2, borderColor: swatch.fill, backgroundColor: swatch.soft },
                !owned.has(index) && styles.dim,
              ]}
            />
          );
        }),
      )}
      {NESTS.map((nest, index) =>
        owned.has(index) ? (
          <View
            key={`nest-${index}`}
            style={[
              styles.nest,
              at(nest.x, nest.y, 46 * scale),
              { borderRadius: 23 * scale, borderColor: PARCHEESI_COLORS[index].fill },
            ]}
          />
        ) : null,
      )}
      <Pieces state={state} scale={scale} pawn={pawn} canAct={canAct} selected={selected} onSelect={onSelect} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={canRoll ? 'Home. Roll' : 'Home'}
        disabled={!canRoll}
        onPress={onRoll}
        style={[styles.centerButton, at(BOARD / 2, BOARD / 2, 72 * scale), { borderRadius: 36 * scale }]}
      >
        <Text style={[styles.homeLabel, { fontSize: Math.max(11, 13 * scale) }]}>Home</Text>
        {canRoll ? <Text style={[styles.rollLabel, { fontSize: Math.max(12, 15 * scale) }]}>Roll</Text> : null}
      </Pressable>
      {canAct
        ? destinations.map((row) => {
            const point = spotPoint(row.dest, color);
            if (!point) return null;
            return (
              <Pressable
                key={`${row.move.type}-${row.move.pawn}-${row.move.type === 'bonus' ? 'b' : row.move.die}`}
                accessibilityRole="button"
                accessibilityLabel="Land here"
                onPress={() => onMove(row.move)}
                style={[styles.dest, at(point.x, point.y, cell + 6), { borderRadius: (cell + 6) / 2 }]}
              />
            );
          })
        : null}
    </View>
  );
}

function Pieces({
  state,
  scale,
  pawn,
  canAct,
  selected,
  onSelect,
}: {
  state: ParcheesiState;
  scale: number;
  pawn: number;
  canAct: boolean;
  selected: number | null;
  onSelect: (pawn: number | null) => void;
}) {
  const pieces = placedPieces(state);
  return (
    <>
      {pieces.map((piece) => {
        const mine = piece.playerId === state.currentPlayerId;
        const swatch = PARCHEESI_COLORS[colorIndexFor(state, piece.playerId)];
        const active = canAct && mine;
        return (
          <Pressable
            key={piece.key}
            disabled={!active}
            accessibilityRole="button"
            accessibilityLabel={`${swatch.name} pawn`}
            onPress={() => onSelect(selected === piece.pawn && mine ? null : piece.pawn)}
            style={[
              styles.pawn,
              {
                left: piece.x * scale - pawn / 2,
                top: piece.y * scale - pawn / 2,
                width: pawn,
                height: pawn,
                borderRadius: pawn / 2,
                backgroundColor: swatch.fill,
              },
              selected === piece.pawn && mine && styles.selected,
            ]}
          />
        );
      })}
    </>
  );
}

function placedPieces(state: ParcheesiState): { key: string; playerId: string; pawn: number; x: number; y: number }[] {
  const drafts: { key: string; playerId: string; pawn: number; x: number; y: number; stack: string | null }[] = [];
  for (const [playerId, row] of Object.entries(state.pawns)) {
    const color = colorIndexFor(state, playerId);
    row.forEach((spot, index) => {
      const point = anchor(spot, color, index);
      if (!point) return;
      const stack = spot.zone === 'track' ? `t${spot.index}` : spot.zone === 'lane' ? `l${color}-${spot.index}` : null;
      drafts.push({ key: `${playerId}-${index}`, playerId, pawn: index, x: point.x, y: point.y, stack });
    });
  }
  const counts = new Map<string, number>();
  for (const piece of drafts) {
    if (piece.stack) counts.set(piece.stack, (counts.get(piece.stack) ?? 0) + 1);
  }
  const used = new Map<string, number>();
  return drafts.map((piece) => {
    if (!piece.stack || (counts.get(piece.stack) ?? 0) < 2) return piece;
    const slot = used.get(piece.stack) ?? 0;
    used.set(piece.stack, slot + 1);
    return { ...piece, x: piece.x + (slot === 0 ? -6 : 6) };
  });
}

function anchor(spot: ParcheesiSpot, color: number, pawn: number): { x: number; y: number } | null {
  if (spot.zone === 'nest') {
    const nest = NESTS[color];
    const cluster = CLUSTER[pawn] ?? { x: 0, y: 0 };
    return nest ? { x: nest.x + cluster.x, y: nest.y + cluster.y } : null;
  }
  if (spot.zone === 'home') {
    const angle = (color / PARCHEESI_COLORS.length) * Math.PI * 2 + pawn * 0.35;
    return { x: BOARD / 2 + Math.cos(angle) * 14, y: BOARD / 2 + Math.sin(angle) * 14 };
  }
  return spot.zone === 'track' ? trackPoint(spot.index) : lanePoint(color, spot.index);
}

function spotPoint(spot: ParcheesiSpot, color: number): { x: number; y: number } | null {
  if (spot.zone === 'track') return trackPoint(spot.index);
  if (spot.zone === 'lane') return lanePoint(color, spot.index);
  if (spot.zone === 'home') return { x: BOARD / 2, y: BOARD / 2 };
  return null;
}

function trackPoint(index: number): { x: number; y: number } {
  const side = Math.floor(index / 17) % 4;
  const t = index % 17;
  if (side === 0) return { x: INSET + STEP * (t + 0.5), y: INSET + SPAN - STEP * 0.42 };
  if (side === 1) return { x: INSET + SPAN - STEP * 0.42, y: INSET + SPAN - STEP * (t + 0.5) };
  if (side === 2) return { x: INSET + SPAN - STEP * (t + 0.5), y: INSET + STEP * 0.42 };
  return { x: INSET + STEP * 0.42, y: INSET + STEP * (t + 0.5) };
}

function lanePoint(color: number, laneIndex: number): { x: number; y: number } {
  const entrance = trackPoint((startIndex(color) + TRACK_SPACES - 1) % TRACK_SPACES);
  const t = 0.46 + (laneIndex / Math.max(1, LANE_SPACES - 1)) * 0.28;
  return {
    x: entrance.x + (BOARD / 2 - entrance.x) * t,
    y: entrance.y + (BOARD / 2 - entrance.y) * t,
  };
}

function startColor(index: number): number | null {
  for (let color = 0; color < PARCHEESI_COLORS.length; color += 1) {
    if (startIndex(color) === index) return color;
  }
  return null;
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    backgroundColor: colors.woodDark,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.wood,
    overflow: 'hidden',
  },
  center: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  centerButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  homeLabel: {
    color: colors.accent,
    fontWeight: '700',
    textAlign: 'center',
  },
  rollLabel: {
    color: colors.text,
    fontWeight: '800',
    textAlign: 'center',
  },
  cell: {
    position: 'absolute',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  safe: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dim: { opacity: 0.35 },
  nest: {
    position: 'absolute',
    backgroundColor: 'rgba(10, 16, 14, 0.35)',
    borderWidth: 2,
  },
  pawn: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fffaf0',
  },
  selected: { borderColor: colors.accent, borderWidth: 3 },
  dest: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
});

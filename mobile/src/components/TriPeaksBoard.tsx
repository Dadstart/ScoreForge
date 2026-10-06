import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardFace, isFree, playableSpots, wasteCard, type Spot, type TriPeaksState } from '../domain/tripeaks';
import { colors, fonts, radii } from '../theme';
import { CardFlip, flipDelay, isFaceUpCode, useFreshFaces } from './CardFlip';

type Props = {
  state: TriPeaksState;
  disabled?: boolean;
  onCard: (spot: Spot) => void;
  onStock: () => void;
};

const GAP = 4;

export function TriPeaksBoard(props: Props) {
  const [width, setWidth] = useState(0);
  return (
    <View
      style={styles.table}
      accessibilityLabel="TriPeaks board"
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width) - 20;
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {width > 0 ? <Layout width={width} {...props} /> : <View style={styles.pending} />}
    </View>
  );
}

function Layout({ width, state, disabled, onCard, onStock }: Props & { width: number }) {
  const cardWidth = Math.max(24, Math.min(58, Math.floor((width - GAP * 9) / 10)));
  const cardHeight = Math.round(cardWidth * 1.42);
  const stride = cardWidth + GAP;
  const overlap = Math.round(cardHeight * 0.52);
  const tableauWidth = 9 * stride + cardWidth;
  const tableauHeight = overlap * 3 + cardHeight;
  const playable = playableSpots(state);
  const current = wasteCard(state);
  const faceIds: string[] = [];
  for (const row of state.rows) {
    for (const code of row) if (code && isFaceUpCode(code)) faceIds.push(code.toUpperCase());
  }
  for (const code of state.waste) if (isFaceUpCode(code)) faceIds.push(code.toUpperCase());
  const fresh = useFreshFaces(faceIds);

  return (
    <View style={{ width: tableauWidth, height: tableauHeight + 28 + cardHeight + 22, alignSelf: 'center' }}>
      {state.rows.map((row, rowIndex) =>
        row.map((code, index) => {
          if (!code) return null;
          const spot: Spot = { row: rowIndex, index };
          const free = isFree(state, spot);
          const canPlay = playable.some((item) => item.row === rowIndex && item.index === index);
          const id = code.toUpperCase();
          return (
            <View
              key={`${rowIndex}-${index}`}
              style={[
                styles.slot,
                {
                  left: cardLeft(rowIndex, index, stride),
                  top: rowIndex * overlap,
                  zIndex: rowIndex + 1,
                },
              ]}
            >
              <PlayingCard
                code={code}
                width={cardWidth}
                height={cardHeight}
                playable={canPlay}
                play={fresh.has(id)}
                delay={flipDelay(id, faceIds, fresh)}
                disabled={disabled || !free}
                onPress={() => onCard(spot)}
              />
            </View>
          );
        }),
      )}

      <View style={[styles.piles, { top: tableauHeight + 16, width: tableauWidth }]}>
        <Stock
          count={state.stock.length}
          width={cardWidth}
          height={cardHeight}
          disabled={disabled || state.stock.length === 0}
          onPress={onStock}
        />
        <View style={{ width: cardWidth, gap: 4 }}>
          <Waste
            code={current?.code ?? null}
            play={current ? fresh.has(current.code.toUpperCase()) : false}
            width={cardWidth}
            height={cardHeight}
          />
          <Text style={styles.streak}>Streak {state.streak}</Text>
        </View>
      </View>
    </View>
  );
}

/** Matches the covering pairs in the rules. Row 3 is the row of ten. */
function cardLeft(row: number, index: number, stride: number): number {
  if (row === 3) return index * stride;
  if (row === 2) return (index + 0.5) * stride;
  if (row === 1) {
    const peak = Math.floor(index / 2);
    const offset = index % 2;
    return (peak * 3 + offset + 1) * stride;
  }
  const left = cardLeft(1, index * 2, stride);
  const right = cardLeft(1, index * 2 + 1, stride);
  return (left + right) / 2;
}

function PlayingCard({
  code,
  width,
  height,
  playable,
  play = false,
  delay = 0,
  disabled,
  onPress,
}: {
  code: string;
  width: number;
  height: number;
  playable?: boolean;
  play?: boolean;
  delay?: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const face = cardFace(code);
  if (!face) return null;
  const ink = face.red ? '#c23b3b' : '#1c1612';
  const flip = (
    <CardFlip
      up={face.up}
      play={play}
      delay={delay}
      width={width}
      height={height}
      front={
        <View style={[styles.face, { width, height }, playable && styles.playable, disabled && styles.idle]}>
          <Text style={[styles.corner, { color: ink, fontSize: Math.max(9, width * 0.28) }]}>
            {face.rankLabel}
            {face.symbol}
          </Text>
          <Text style={[styles.pip, { color: ink, fontSize: Math.max(14, width * 0.42) }]}>{face.symbol}</Text>
        </View>
      }
      back={
        <View style={[styles.back, { width, height }]}>
          <View style={[styles.diamond, { width: width * 0.22, height: width * 0.22 }]} />
        </View>
      }
    />
  );
  if (!face.up) {
    return (
      <View accessibilityLabel="Face-down card" style={{ width, height }}>
        {flip}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playable ? `${face.name}, can play` : face.name}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={{ width, height }}
    >
      {flip}
    </Pressable>
  );
}

function Stock({
  count,
  width,
  height,
  disabled,
  onPress,
}: {
  count: number;
  width: number;
  height: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Stock, ${count} cards` : 'Empty stock'}
      disabled={disabled}
      onPress={onPress}
      style={[count > 0 ? styles.back : styles.empty, { width, height }]}
    >
      {count > 0 ? (
        <>
          <View style={[styles.diamond, { width: width * 0.28, height: width * 0.28 }]} />
          <Text style={styles.count}>{count}</Text>
        </>
      ) : (
        <Text style={[styles.emptyLabel, { fontSize: Math.max(10, width * 0.2) }]}>Stock</Text>
      )}
    </Pressable>
  );
}

function Waste({ code, play, width, height }: { code: string | null; play: boolean; width: number; height: number }) {
  if (!code) {
    return (
      <View style={[styles.empty, { width, height }]} accessibilityLabel="Empty waste">
        <Text style={[styles.emptyLabel, { fontSize: Math.max(10, width * 0.2) }]}>Waste</Text>
      </View>
    );
  }
  const face = cardFace(code);
  if (!face) return null;
  const ink = face.red ? '#c23b3b' : '#1c1612';
  return (
    <CardFlip
      key={code}
      up
      play={play}
      width={width}
      height={height}
      front={
        <View accessibilityLabel={`Waste, ${face.name}`} style={[styles.face, styles.current, { width, height }]}>
          <Text style={[styles.corner, { color: ink, fontSize: Math.max(9, width * 0.28) }]}>
            {face.rankLabel}
            {face.symbol}
          </Text>
          <Text style={[styles.pip, { color: ink, fontSize: Math.max(14, width * 0.42) }]}>{face.symbol}</Text>
        </View>
      }
      back={
        <View style={[styles.back, { width, height }]}>
          <View style={[styles.diamond, { width: width * 0.28, height: width * 0.28 }]} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: '#10241c',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#3d5248',
    padding: 10,
    alignItems: 'center',
    overflow: 'visible',
  },
  pending: { height: 360 },
  slot: { position: 'absolute' },
  piles: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    gap: GAP,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  face: {
    backgroundColor: '#fffaf3',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: '#e4d3b0',
    paddingHorizontal: 3,
    paddingVertical: 2,
    justifyContent: 'space-between',
  },
  idle: { opacity: 0.92 },
  playable: { borderColor: colors.success },
  current: { borderColor: colors.accent },
  corner: { fontFamily: fonts.display, fontWeight: '700' },
  pip: { fontFamily: fonts.display, textAlign: 'center', fontWeight: '700' },
  back: {
    backgroundColor: '#1b4d3e',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  diamond: {
    backgroundColor: colors.accent,
    transform: [{ rotate: '45deg' }],
  },
  count: { color: '#f6ead2', fontWeight: '700', fontSize: 12 },
  streak: { color: '#f6ead2', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  empty: {
    borderRadius: radii.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 168, 75, 0.45)',
    backgroundColor: 'rgba(255, 250, 243, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLabel: {
    color: 'rgba(212, 168, 75, 0.7)',
    fontFamily: fonts.display,
    fontWeight: '700',
  },
});

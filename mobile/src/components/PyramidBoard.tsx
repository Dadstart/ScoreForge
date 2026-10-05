import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cardFace,
  isFree,
  matches,
  sameSpot,
  type PyramidState,
  type Spot,
} from '../domain/pyramid';
import { colors, fonts, radii } from '../theme';
import { CardFlip, isFaceUpCode, useFreshFaces } from './CardFlip';

type Props = {
  state: PyramidState;
  selection: Spot | null;
  disabled?: boolean;
  onSpot: (spot: Spot) => void;
  onStock: () => void;
};

const GAP = 6;
const ROW_SHARE = 0.36;

export function PyramidBoard(props: Props) {
  const [width, setWidth] = useState(0);
  return (
    <View
      style={styles.table}
      accessibilityLabel="Pyramid board"
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width) - 20;
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {width > 0 ? <Layout width={width} {...props} /> : <View style={styles.pending} />}
    </View>
  );
}

function Layout({ width, state, selection, disabled, onSpot, onStock }: Props & { width: number }) {
  const cardWidth = Math.max(36, Math.min(72, Math.floor((width - GAP * 6) / 7)));
  const cardHeight = Math.round(cardWidth * 1.42);
  const overlap = Math.round(cardHeight * ROW_SHARE);
  const stride = cardWidth + GAP;
  const pyramidHeight = overlap * 6 + cardHeight;
  const partners = selection ? matches(state, selection) : [];
  const faceIds: string[] = [];
  for (const row of state.rows) {
    for (const code of row) if (code && isFaceUpCode(code)) faceIds.push(code.toUpperCase());
  }
  for (const code of state.waste) if (isFaceUpCode(code)) faceIds.push(code.toUpperCase());
  const fresh = useFreshFaces(faceIds);
  const wasteCode = state.waste[state.waste.length - 1] ?? null;

  return (
    <View style={{ width, height: pyramidHeight + 16 + cardHeight }}>
      {state.rows.map((row, rowIndex) =>
        row.map((code, index) => {
          if (!code) return null;
          const spot: Spot = { pile: 'pyramid', row: rowIndex, index };
          const free = isFree(state, spot);
          const selected = selection != null && sameSpot(selection, spot);
          const partner = partners.some((item) => sameSpot(item, spot));
          const offset = ((7 - row.length) * stride) / 2;
          return (
            <View
              key={`${rowIndex}-${index}`}
              style={[
                styles.slot,
                {
                  left: offset + index * stride,
                  top: rowIndex * overlap,
                  zIndex: rowIndex + 1,
                },
              ]}
            >
              <PlayingCard
                code={code}
                width={cardWidth}
                height={cardHeight}
                selected={selected}
                partner={partner && !selected}
                disabled={disabled || !free}
                onPress={() => onSpot(spot)}
              />
            </View>
          );
        }),
      )}

      <View style={[styles.piles, { top: pyramidHeight + 16 }]}>
        <Stock
          count={state.stock.length}
          canTurn={!disabled && state.stock.length === 0 && state.waste.length > 1}
          width={cardWidth}
          height={cardHeight}
          disabled={disabled || (state.stock.length === 0 && state.waste.length < 2)}
          onPress={onStock}
        />
        <Waste
          code={wasteCode}
          play={wasteCode != null && fresh.has(wasteCode.toUpperCase())}
          buried={Math.max(0, state.waste.length - 1)}
          width={cardWidth}
          height={cardHeight}
          selected={selection?.pile === 'waste'}
          partner={partners.some((item) => item.pile === 'waste') && selection?.pile !== 'waste'}
          disabled={disabled || state.waste.length === 0}
          onPress={() => onSpot({ pile: 'waste' })}
        />
      </View>
    </View>
  );
}

function PlayingCard({
  code,
  width,
  height,
  selected,
  partner,
  disabled,
  onPress,
}: {
  code: string;
  width: number;
  height: number;
  selected?: boolean;
  partner?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const face = cardFace(code);
  if (!face) return null;
  const ink = face.red ? '#c23b3b' : '#1c1612';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={face.name}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(selected) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.face,
        { width, height },
        selected && styles.selected,
        partner && styles.partner,
        disabled && styles.covered,
      ]}
    >
      <Text style={[styles.corner, { color: ink, fontSize: Math.max(11, width * 0.26) }]}>
        {face.rankLabel}
        {face.symbol}
      </Text>
      <Text style={[styles.pip, { color: ink, fontSize: Math.max(16, width * 0.42) }]}>{face.symbol}</Text>
    </Pressable>
  );
}

function Stock({
  count,
  canTurn,
  width,
  height,
  disabled,
  onPress,
}: {
  count: number;
  canTurn: boolean;
  width: number;
  height: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const label = count > 0 ? `Stock, ${count} cards` : canTurn ? 'Turn the stock' : 'Empty stock';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
        <Text style={[styles.emptyLabel, { fontSize: Math.max(12, width * 0.22) }]}>{canTurn ? 'Turn' : ''}</Text>
      )}
    </Pressable>
  );
}

function Waste({
  code,
  play,
  buried,
  width,
  height,
  selected,
  partner,
  disabled,
  onPress,
}: {
  code: string | null;
  play: boolean;
  buried: number;
  width: number;
  height: number;
  selected?: boolean;
  partner?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  if (!code) {
    return (
      <View style={[styles.empty, { width, height }]} accessibilityLabel="Empty waste">
        <Text style={[styles.emptyLabel, { fontSize: Math.max(12, width * 0.22) }]}>Waste</Text>
      </View>
    );
  }
  const face = cardFace(code);
  if (!face) return null;
  const ink = face.red ? '#c23b3b' : '#1c1612';
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={face.name}
        accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(selected) }}
        disabled={disabled}
        onPress={onPress}
        style={{ width, height }}
      >
        <CardFlip
          key={code}
          up
          play={play}
          width={width}
          height={height}
          front={
            <View
              style={[
                styles.face,
                { width, height },
                selected && styles.selected,
                partner && styles.partner,
                disabled && styles.covered,
              ]}
            >
              <Text style={[styles.corner, { color: ink, fontSize: Math.max(11, width * 0.26) }]}>
                {face.rankLabel}
                {face.symbol}
              </Text>
              <Text style={[styles.pip, { color: ink, fontSize: Math.max(16, width * 0.42) }]}>{face.symbol}</Text>
            </View>
          }
          back={
            <View style={[styles.back, { width, height }]}>
              <View style={[styles.diamond, { width: width * 0.28, height: width * 0.28 }]} />
            </View>
          }
        />
      </Pressable>
      {buried > 0 ? <Text style={styles.buried}>{buried} under</Text> : null}
    </View>
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
  piles: { position: 'absolute', left: 0, flexDirection: 'row', gap: GAP, alignItems: 'flex-start' },
  face: {
    backgroundColor: '#fffaf3',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: '#e4d3b0',
    paddingHorizontal: 4,
    paddingVertical: 3,
    justifyContent: 'space-between',
  },
  covered: { opacity: 0.92 },
  selected: { borderColor: colors.accent },
  partner: { borderColor: colors.success },
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
  count: { color: '#f6ead2', fontWeight: '700' },
  buried: { marginTop: 4, color: '#f6ead2', fontSize: 11, fontWeight: '700' },
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

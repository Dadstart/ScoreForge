import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  cardFace,
  destinations,
  type Dest,
  type KlondikeState,
  type Source,
} from '../domain/klondike';
import { colors, fonts, radii } from '../theme';

type Props = {
  state: KlondikeState;
  selection: Source | null;
  disabled?: boolean;
  onStock: () => void;
  onWaste: () => void;
  onFoundation: (index: number) => void;
  onTableau: (index: number, at: number) => void;
};

const GAP = 6;

export function KlondikeBoard(props: Props) {
  const [width, setWidth] = useState(0);
  return (
    <View
      style={styles.table}
      accessibilityLabel="Klondike board"
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width) - 20;
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {width > 0 ? <Layout width={width} {...props} /> : <View style={styles.pending} />}
    </View>
  );
}

function Layout({
  width,
  state,
  selection,
  disabled,
  onStock,
  onWaste,
  onFoundation,
  onTableau,
}: Props & { width: number }) {
  const cardWidth = Math.max(40, Math.min(78, Math.floor((width - GAP * 6) / 7)));
  const cardHeight = Math.round(cardWidth * 1.42);
  const overlapDown = Math.max(8, Math.round(cardHeight * 0.16));
  const overlapUp = Math.max(16, Math.round(cardHeight * 0.3));
  const targets = selection && !disabled ? destinations(state, selection) : [];
  const aimed = (pile: Dest['pile'], index: number) =>
    targets.some((dest) => dest.pile === pile && dest.index === index);

  return (
    <View style={[styles.layout, { width: cardWidth * 7 + GAP * 6 }]}>
      <View style={[styles.row, { gap: GAP, height: cardHeight }]}>
        <Stock
          count={state.stock.length}
          canTurn={state.stock.length === 0 && state.waste.length > 0}
          width={cardWidth}
          height={cardHeight}
          disabled={disabled}
          onPress={onStock}
        />
        <Waste
          cards={state.waste}
          fan={state.drawCount}
          selected={selection?.pile === 'waste'}
          width={cardWidth}
          height={cardHeight}
          disabled={disabled}
          onPress={onWaste}
        />
        <View style={{ width: cardWidth }} />
        {state.foundations.map((pile, index) => {
          const top = pile[pile.length - 1];
          const selected = selection?.pile === 'foundation' && selection.index === index;
          return top ? (
            <PlayingCard
              key={index}
              code={top}
              width={cardWidth}
              height={cardHeight}
              selected={selected}
              target={aimed('foundation', index)}
              disabled={disabled}
              onPress={() => onFoundation(index)}
            />
          ) : (
            <EmptyPad
              key={index}
              label="A"
              width={cardWidth}
              height={cardHeight}
              target={aimed('foundation', index)}
              disabled={disabled}
              onPress={() => onFoundation(index)}
            />
          );
        })}
      </View>

      <View style={[styles.row, styles.tableau, { gap: GAP }]}>
        {state.tableau.map((pile, index) => (
          <Column
            key={index}
            pile={pile}
            width={cardWidth}
            height={cardHeight}
            overlapDown={overlapDown}
            overlapUp={overlapUp}
            selectedAt={selection?.pile === 'tableau' && selection.index === index ? selection.at : -1}
            target={aimed('tableau', index)}
            disabled={disabled}
            onPress={(at) => onTableau(index, at)}
          />
        ))}
      </View>
    </View>
  );
}

function Column({
  pile,
  width,
  height,
  overlapDown,
  overlapUp,
  selectedAt,
  target,
  disabled,
  onPress,
}: {
  pile: string[];
  width: number;
  height: number;
  overlapDown: number;
  overlapUp: number;
  selectedAt: number;
  target: boolean;
  disabled?: boolean;
  onPress: (at: number) => void;
}) {
  if (pile.length === 0) {
    return (
      <EmptyPad
        label="K"
        width={width}
        height={height}
        target={target}
        disabled={disabled}
        onPress={() => onPress(-1)}
      />
    );
  }

  const offsets: number[] = [];
  let cursor = 0;
  for (let index = 0; index < pile.length; index++) {
    offsets.push(cursor);
    if (index < pile.length - 1) {
      cursor += cardFace(pile[index])?.up ? overlapUp : overlapDown;
    }
  }
  const total = offsets[offsets.length - 1] + height;

  return (
    <View style={{ width, height: total }}>
      {pile.map((code, index) => (
        <View key={`${code}-${index}`} style={[styles.stacked, { top: offsets[index], zIndex: index + 1 }]}>
          <PlayingCard
            code={code}
            width={width}
            height={height}
            selected={selectedAt >= 0 && index >= selectedAt}
            target={target && index === pile.length - 1}
            disabled={disabled}
            onPress={() => onPress(index)}
          />
        </View>
      ))}
    </View>
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
  if (count === 0) {
    return (
      <EmptyPad
        label={canTurn ? '↺' : ''}
        width={width}
        height={height}
        disabled={disabled || !canTurn}
        onPress={onPress}
      />
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Stock, ${count} cards`}
      disabled={disabled}
      onPress={onPress}
      style={[styles.back, { width, height }]}
    >
      <View style={[styles.diamond, { width: width * 0.28, height: width * 0.28 }]} />
      <Text style={[styles.count, { fontSize: Math.max(11, width * 0.22) }]}>{count}</Text>
    </Pressable>
  );
}

function Waste({
  cards,
  fan,
  selected,
  width,
  height,
  disabled,
  onPress,
}: {
  cards: string[];
  fan: number;
  selected: boolean;
  width: number;
  height: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  if (cards.length === 0) {
    return <EmptyPad label="" width={width} height={height} disabled onPress={onPress} />;
  }
  const shown = cards.slice(-Math.min(fan, cards.length, 3));
  const peek = Math.round(width * 0.34);
  return (
    <View style={{ width, height }}>
      {shown.map((code, index) => {
        const top = index === shown.length - 1;
        return (
          <View
            key={`${code}-${index}`}
            style={[styles.stacked, { left: index * peek, zIndex: index + 1 }]}
          >
            {top ? (
              <PlayingCard
                code={code}
                width={width}
                height={height}
                selected={selected}
                disabled={disabled}
                onPress={onPress}
              />
            ) : (
              <CardFace code={code} width={width} height={height} />
            )}
          </View>
        );
      })}
    </View>
  );
}

function PlayingCard({
  code,
  width,
  height,
  selected,
  target,
  disabled,
  onPress,
}: {
  code: string;
  width: number;
  height: number;
  selected?: boolean;
  target?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const face = cardFace(code);
  const label = face ? (face.up ? face.name : 'Face-down card') : 'Card';
  const marks = [selected && styles.selected, target && styles.target];
  if (!face?.up) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={onPress}
        style={[styles.back, { width, height }, ...marks]}
      >
        <View style={[styles.diamond, { width: width * 0.28, height: width * 0.28 }]} />
      </Pressable>
    );
  }
  const ink = face.red ? '#c23b3b' : '#1c1612';
  const corner = Math.max(12, width * 0.28);
  const pip = Math.max(16, width * 0.46);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.face, { width, height }, ...marks]}
    >
      <Text style={[styles.corner, { color: ink, fontSize: corner }]}>
        {face.rankLabel}
        {face.symbol}
      </Text>
      <Text style={[styles.pip, { color: ink, fontSize: pip }]}>{face.symbol}</Text>
    </Pressable>
  );
}

function CardFace({ code, width, height }: { code: string; width: number; height: number }) {
  const face = cardFace(code);
  if (!face?.up) {
    return (
      <View style={[styles.back, { width, height }]}>
        <View style={[styles.diamond, { width: width * 0.28, height: width * 0.28 }]} />
      </View>
    );
  }
  const ink = face.red ? '#c23b3b' : '#1c1612';
  return (
    <View style={[styles.face, { width, height }]}>
      <Text style={[styles.corner, { color: ink, fontSize: Math.max(12, width * 0.28) }]}>
        {face.rankLabel}
        {face.symbol}
      </Text>
      <Text style={[styles.pip, { color: ink, fontSize: Math.max(16, width * 0.46) }]}>{face.symbol}</Text>
    </View>
  );
}

function EmptyPad({
  label,
  width,
  height,
  target,
  disabled,
  onPress,
}: {
  label: string;
  width: number;
  height: number;
  target?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === 'A' ? 'Empty foundation' : label === 'K' ? 'Empty column' : 'Empty pile'}
      disabled={disabled}
      onPress={onPress}
      style={[styles.empty, { width, height }, target && styles.target]}
    >
      <Text style={[styles.emptyLabel, { fontSize: Math.max(14, width * 0.32) }]}>{label}</Text>
    </Pressable>
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
  },
  pending: { height: 280 },
  layout: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  tableau: { alignItems: 'flex-start' },
  stacked: { position: 'absolute', left: 0 },
  selected: { borderColor: colors.accent },
  target: { borderColor: colors.success },
  face: {
    backgroundColor: '#fffaf3',
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: '#e4d3b0',
    paddingHorizontal: 4,
    paddingVertical: 3,
    justifyContent: 'space-between',
  },
  corner: {
    fontFamily: fonts.display,
    fontWeight: '700',
  },
  pip: {
    fontFamily: fonts.display,
    textAlign: 'center',
    fontWeight: '700',
  },
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
  count: {
    marginTop: 6,
    color: '#f6ead2',
    fontWeight: '700',
  },
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

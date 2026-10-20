import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CardDrag, boxContains, emptyBox, type WindowBox } from './CardDrag';
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
  onDrop: (from: Spot, onto: Spot | null) => void;
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

function Layout({ width, state, selection, disabled, onSpot, onStock, onDrop }: Props & { width: number }) {
  const layoutRef = useRef<View>(null);
  const origin = useRef<WindowBox>(emptyBox);
  const zoneNodes = useRef<Map<string, View>>(new Map());
  const zoneBoxes = useRef<Map<string, WindowBox>>(new Map());
  const [drag, setDrag] = useState<{ spot: Spot; left: number; top: number; hover: Spot | null } | null>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;
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

  const remember = (key: string, node: View | null) => {
    if (node) zoneNodes.current.set(key, node);
    else zoneNodes.current.delete(key);
  };

  const measure = () => {
    layoutRef.current?.measureInWindow((x, y, width, height) => {
      origin.current = { x, y, width, height };
    });
    zoneNodes.current.forEach((node, key) => {
      node.measureInWindow((x, y, boxWidth, boxHeight) => {
        zoneBoxes.current.set(key, { x, y, width: boxWidth, height: boxHeight });
      });
    });
  };

  const spotKey = (spot: Spot) => (spot.pile === 'waste' ? 'waste' : `${spot.row}:${spot.index}`);

  const spotAt = (pageX: number, pageY: number, from: Spot): Spot | null => {
    let found: Spot | null = null;
    zoneBoxes.current.forEach((box, key) => {
      if (!boxContains(pageX, pageY, box, 8)) return;
      const spot = key === 'waste' ? ({ pile: 'waste' } as Spot) : spotFromKey(key);
      if (!spot || sameSpot(spot, from) || !isFree(state, spot)) return;
      found = spot;
    });
    return found;
  };

  const place = (spot: Spot, pageX: number, pageY: number) => {
    const box = origin.current;
    setDrag({
      spot,
      left: pageX - box.x - cardWidth / 2,
      top: pageY - box.y - cardHeight / 2,
      hover: spotAt(pageX, pageY, spot),
    });
  };

  return (
    <View ref={layoutRef} onLayout={measure} style={{ width, height: pyramidHeight + 16 + cardHeight }}>
      {state.rows.map((row, rowIndex) =>
        row.map((code, index) => {
          if (!code) return null;
          const spot: Spot = { pile: 'pyramid', row: rowIndex, index };
          const free = isFree(state, spot);
          const selected = selection != null && sameSpot(selection, spot);
          const partner = partners.some((item) => sameSpot(item, spot));
          const hover = drag?.hover != null && sameSpot(drag.hover, spot);
          const offset = ((7 - row.length) * stride) / 2;
          const key = spotKey(spot);
          const card = (
            <PlayingCard
              code={code}
              width={cardWidth}
              height={cardHeight}
              selected={selected || hover}
              partner={partner && !selected && !hover}
              disabled={disabled || !free}
              passive={free && !disabled}
              onPress={() => onSpot(spot)}
            />
          );
          return (
            <View
              key={`${rowIndex}-${index}`}
              ref={(node) => remember(key, node)}
              onLayout={measure}
              style={[
                styles.slot,
                {
                  left: offset + index * stride,
                  top: rowIndex * overlap,
                  zIndex: drag && sameSpot(drag.spot, spot) ? 40 : rowIndex + 1,
                },
              ]}
            >
              {free && !disabled ? (
                <CardDrag
                  value={spot}
                  label={cardFace(code)?.name ?? 'Card'}
                  hint="Drag onto a card that adds to 13, or tap to select"
                  style={drag && sameSpot(drag.spot, spot) ? styles.hidden : undefined}
                  onTap={() => onSpot(spot)}
                  onLift={() => measure()}
                  onMove={(_spot, pageX, pageY) => place(spot, pageX, pageY)}
                  onRelease={(_spot, pageX, pageY, moved) => {
                    const onto = moved ? spotAt(pageX, pageY, spot) : null;
                    setDrag(null);
                    if (moved) drop.current(spot, onto);
                  }}
                >
                  {card}
                </CardDrag>
              ) : (
                card
              )}
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
        <View ref={(node) => remember('waste', node)} onLayout={measure}>
          {wasteCode && !disabled ? (
            <CardDrag
              value={{ pile: 'waste' }}
              label={cardFace(wasteCode)?.name ?? 'Waste'}
              hint="Drag onto a card that adds to 13, or tap to select"
              style={drag?.spot.pile === 'waste' ? styles.hidden : undefined}
              onTap={() => onSpot({ pile: 'waste' })}
              onLift={() => measure()}
              onMove={(_spot, pageX, pageY) => place({ pile: 'waste' }, pageX, pageY)}
              onRelease={(_spot, pageX, pageY, moved) => {
                const onto = moved ? spotAt(pageX, pageY, { pile: 'waste' }) : null;
                setDrag(null);
                if (moved) drop.current({ pile: 'waste' }, onto);
              }}
            >
              <Waste
                code={wasteCode}
                play={fresh.has(wasteCode.toUpperCase())}
                buried={Math.max(0, state.waste.length - 1)}
                width={cardWidth}
                height={cardHeight}
                selected={selection?.pile === 'waste' || drag?.hover?.pile === 'waste'}
                partner={partners.some((item) => item.pile === 'waste') && selection?.pile !== 'waste'}
                disabled={false}
                passive
                onPress={() => onSpot({ pile: 'waste' })}
              />
            </CardDrag>
          ) : (
            <Waste
              code={wasteCode}
              play={wasteCode != null && fresh.has(wasteCode.toUpperCase())}
              buried={Math.max(0, state.waste.length - 1)}
              width={cardWidth}
              height={cardHeight}
              selected={selection?.pile === 'waste' || drag?.hover?.pile === 'waste'}
              partner={partners.some((item) => item.pile === 'waste') && selection?.pile !== 'waste'}
              disabled={disabled || state.waste.length === 0}
              onPress={() => onSpot({ pile: 'waste' })}
            />
          )}
        </View>
      </View>
      {drag ? (
        <View pointerEvents="none" style={[styles.ghost, { left: drag.left, top: drag.top, width: cardWidth, height: cardHeight }]}>
          <PlayingCard
            code={faceOf(state, drag.spot) ?? ''}
            width={cardWidth}
            height={cardHeight}
            passive
            onPress={() => {}}
          />
        </View>
      ) : null}
    </View>
  );
}

function spotFromKey(key: string): Spot | null {
  const [row, index] = key.split(':').map((part) => Number(part));
  if (!Number.isInteger(row) || !Number.isInteger(index)) return null;
  return { pile: 'pyramid', row, index };
}

function faceOf(state: PyramidState, spot: Spot): string | null {
  if (spot.pile === 'waste') return state.waste[state.waste.length - 1] ?? null;
  return state.rows[spot.row]?.[spot.index] ?? null;
}

function PlayingCard({
  code,
  width,
  height,
  selected,
  partner,
  disabled,
  passive,
  onPress,
}: {
  code: string;
  width: number;
  height: number;
  selected?: boolean;
  partner?: boolean;
  disabled?: boolean;
  passive?: boolean;
  onPress: () => void;
}) {
  const face = cardFace(code);
  if (!face) return null;
  const ink = face.red ? '#c23b3b' : '#1c1612';
  const body = (
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
  );
  if (passive) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={face.name}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(selected) }}
      disabled={disabled}
      onPress={onPress}
      style={{ width, height }}
    >
      {body}
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
  passive,
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
  passive?: boolean;
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
        disabled={disabled || passive}
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
  ghost: { position: 'absolute', zIndex: 40 },
  hidden: { opacity: 0 },
  emptyLabel: {
    color: 'rgba(212, 168, 75, 0.7)',
    fontFamily: fonts.display,
    fontWeight: '700',
  },
});

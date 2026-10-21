import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Dip, Land, useArrivals } from './cardMotion';
import { CardDrag, emptyBox, hitIndex, readBox, type WindowBox } from './CardDrag';
import { CardFlip, flipDelay } from './CardFlip';
import {
  PILE_SLOTS,
  canBuild,
  cardLabel,
  isBeaux,
  neededRank,
  rankOf,
  topOf,
  type CardSource,
  type SkipBeauxState,
} from '../domain/skipBeaux';
import { colors, radii } from '../theme';

type Named = { id: string; name: string };
type Selection = CardSource | null;
type Held = CardSource;
type Hover = { kind: 'building' | 'discard'; index: number } | null;

type Props = {
  state: SkipBeauxState;
  players: readonly Named[];
  handOwnerId: string | null;
  canAct: boolean;
  onPlay: (source: CardSource, building: number) => void;
  onDiscard: (card: string, pile: number) => void;
};

const INK = '#1a120c';
const CARD_W = 52;
const CARD_H = 74;

export function SkipBeauxBoard({ state, players, handOwnerId, canAct, onPlay, onDiscard }: Props) {
  const [selected, setSelected] = useState<Selection>(null);
  useEffect(() => {
    setSelected(null);
  }, [state.turn, state.lastAction]);

  const owner = handOwnerId;
  const chosen = owner ? selectedCard(state, owner, selected) : null;
  const hand = owner ? [...(state.hands[owner] ?? [])].sort(compareCodes) : [];
  const arrivals = useArrivals(hand);
  const tableRef = useRef<View>(null);
  const origin = useRef<WindowBox>(emptyBox);
  const buildingNodes = useRef<(View | null)[]>([]);
  const discardNodes = useRef<(View | null)[]>([]);
  const buildingBoxes = useRef<WindowBox[]>([]);
  const discardBoxes = useRef<WindowBox[]>([]);
  const [drag, setDrag] = useState<{ held: Held; left: number; top: number; hover: Hover } | null>(null);
  const actions = useRef({ onPlay, onDiscard });
  actions.current = { onPlay, onDiscard };

  const measure = () => {
    tableRef.current?.measureInWindow((x, y, width, height) => {
      origin.current = { x, y, width, height };
    });
    buildingNodes.current.forEach((node, index) => readBox(node, buildingBoxes.current, index));
    discardNodes.current.forEach((node, index) => readBox(node, discardBoxes.current, index));
  };

  const heldCode = (held: Held): string | null => {
    if (!owner) return null;
    if (held.zone === 'hand') return held.card;
    if (held.zone === 'stock') return topOf(state.stocks[owner] ?? []);
    return topOf(state.discards[owner]?.[held.index]?.cards ?? []);
  };

  const hoverAt = (held: Held, pageX: number, pageY: number): Hover => {
    const code = heldCode(held);
    const building = hitIndex(pageX, pageY, buildingBoxes.current, 14);
    if (building != null && code && canBuild(code, state.buildings[building])) return { kind: 'building', index: building };
    if (held.zone === 'hand') {
      const pile = hitIndex(pageX, pageY, discardBoxes.current, 14);
      if (pile != null) return { kind: 'discard', index: pile };
    }
    return null;
  };

  const place = (held: Held, pageX: number, pageY: number) => {
    const box = origin.current;
    setDrag({
      held,
      left: pageX - box.x - 26,
      top: pageY - box.y - 36,
      hover: hoverAt(held, pageX, pageY),
    });
  };

  const release = (held: Held, pageX: number, pageY: number, moved: boolean) => {
    const hover = moved ? hoverAt(held, pageX, pageY) : null;
    setDrag(null);
    if (!hover) return;
    if (hover.kind === 'building') actions.current.onPlay(held, hover.index);
    else if (held.zone === 'hand') actions.current.onDiscard(held.card, hover.index);
  };

  const choose = (next: Selection) => {
    if (!canAct || !owner) return;
    setSelected((current) => (sameSelection(current, next) ? null : next));
  };

  const dragging = (held: Held) => {
    if (!drag) return false;
    if (held.zone !== drag.held.zone) return false;
    if (held.zone === 'hand' && drag.held.zone === 'hand') return held.card === drag.held.card;
    if (held.zone === 'discard' && drag.held.zone === 'discard') return held.index === drag.held.index;
    return held.zone === 'stock';
  };

  return (
    <View ref={tableRef} style={styles.table} onLayout={measure}>
      <View style={styles.buildings}>
        {state.buildings.map((pile, index) => {
          const needed = neededRank(pile);
          const legal = chosen != null && canBuild(chosen, pile);
          const top = topOf(pile.cards);
          return (
            <Pressable
              key={index}
              ref={(node) => {
                buildingNodes.current[index] = node;
              }}
              accessibilityRole="button"
              accessibilityLabel={needed === 1 ? 'Empty building pile, needs 1' : `Building pile, needs ${needed}`}
              disabled={!canAct || !legal}
              onPress={() => {
                if (selected) onPlay(selected, index);
              }}
              onLayout={measure}
              style={[styles.slot, legal && styles.slotLegal, drag?.hover?.kind === 'building' && drag.hover.index === index && styles.slotHover]}
            >
              <Land id={top}>
                {top ? (
                  <Face code={top} />
                ) : (
                  <View style={[styles.card, styles.empty]}>
                    <Text style={styles.emptyLabel}>1</Text>
                  </View>
                )}
              </Land>
              <Text style={styles.slotLabel}>{needed == null ? 'Full' : `Needs ${needed}`}</Text>
            </Pressable>
          );
        })}
        <View style={styles.slot}>
          <DrawPile count={state.draw.length} />
          <Text style={styles.slotLabel}>Draw {state.draw.length}</Text>
        </View>
      </View>

      {state.order.map((id) => {
        const mine = id === owner;
        const stock = topOf(state.stocks[id] ?? []);
        const stockCount = state.stocks[id]?.length ?? 0;
        return (
          <View key={id} style={[styles.player, state.turn === id && styles.playerActive]}>
            <Text style={styles.playerName}>
              {players.find((player) => player.id === id)?.name ?? 'Player'}
              {' · '}
              {state.hands[id]?.length ?? 0} in hand
            </Text>
            <View style={styles.row}>
              <View style={[styles.slot, mine && selected?.zone === 'stock' && styles.slotSelected]}>
                <Dip count={stockCount}>
                  <Land id={stock}>
                    {stock && mine ? (
                      <CardDrag
                        value={{ zone: 'stock' } satisfies Held}
                        enabled={canAct}
                        label={`Stock ${stock}, ${stockCount} cards`}
                        hint="Drag onto a building pile, or tap to select"
                        style={dragging({ zone: 'stock' }) ? styles.hidden : undefined}
                        onTap={() => choose({ zone: 'stock' })}
                        onLift={() => measure()}
                        onMove={(_held, pageX, pageY) => place({ zone: 'stock' }, pageX, pageY)}
                        onRelease={release}
                      >
                        <Face code={stock} marked={stockCount === 1} />
                      </CardDrag>
                    ) : stock ? (
                      <Face code={stock} marked={stockCount === 1} />
                    ) : (
                      <View style={[styles.card, styles.empty]} />
                    )}
                  </Land>
                </Dip>
                <Text style={styles.slotLabel}>Stock {stockCount}</Text>
              </View>
              {(state.discards[id] ?? []).slice(0, PILE_SLOTS).map((pile, index) => {
                const top = topOf(pile.cards);
                const picked = mine && selected?.zone === 'discard' && selected.index === index;
                return (
                  <View
                    key={index}
                    ref={(node) => {
                      if (mine) discardNodes.current[index] = node;
                    }}
                    onLayout={mine ? measure : undefined}
                    style={[
                      styles.slot,
                      (picked || (selected?.zone === 'hand' && mine) || (drag?.hover?.kind === 'discard' && drag.hover.index === index && mine)) &&
                        styles.slotLegal,
                      drag?.hover?.kind === 'discard' && drag.hover.index === index && mine && styles.slotHover,
                    ]}
                  >
                    <Land id={top}>
                      {top && mine ? (
                        <CardDrag
                          value={{ zone: 'discard', index }}
                          enabled={canAct}
                          label={`Discard ${cardLabel(top)}`}
                          hint="Drag onto a building pile, or tap to select"
                          style={dragging({ zone: 'discard', index }) ? styles.hidden : undefined}
                          onTap={() => {
                            if (selected?.zone === 'hand') onDiscard(selected.card, index);
                            else choose({ zone: 'discard', index });
                          }}
                          onLift={() => measure()}
                          onMove={(_held, pageX, pageY) => place({ zone: 'discard', index }, pageX, pageY)}
                          onRelease={release}
                        >
                          <Face code={top} small />
                        </CardDrag>
                      ) : top ? (
                        <Face code={top} small />
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Empty discard pile"
                          disabled={!canAct || !mine}
                          onPress={() => {
                            if (selected?.zone === 'hand') onDiscard(selected.card, index);
                          }}
                        >
                          <View style={[styles.card, styles.cardSmall, styles.empty]} />
                        </Pressable>
                      )}
                    </Land>
                    <Text style={styles.slotLabel}>{pile.cards.length}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <View style={styles.handBox}>
        <Text style={styles.handTitle}>
          {owner
            ? `${players.find((player) => player.id === owner)?.name ?? 'Hand'} · ${hand.length}`
            : 'Hand hidden'}
        </Text>
        <Text style={styles.hint}>
          {selected?.zone === 'hand'
            ? 'Drag it onto a building, or onto a discard pile to end the turn.'
            : chosen
              ? 'Drag it onto a building pile that can take it.'
              : 'Drag a card onto a pile, or select it and tap.'}
        </Text>
        <View style={styles.hand}>
          {hand.map((card) => {
            const picked = selected?.zone === 'hand' && selected.card === card;
            const face = <Face code={card} />;
            const body = arrivals.has(card) ? (
              <CardFlip
                up
                play
                delay={flipDelay(card, hand, arrivals)}
                width={CARD_W}
                height={CARD_H}
                front={face}
                back={<View style={[styles.card, styles.back]} />}
              />
            ) : (
              face
            );
            return (
              <CardDrag
                key={card}
                value={{ zone: 'hand', card }}
                enabled={canAct}
                label={cardLabel(card)}
                hint="Drag onto a building or a discard pile, or tap to select"
                style={[picked ? styles.lift : undefined, dragging({ zone: 'hand', card }) ? styles.hidden : undefined]}
                onTap={() => choose({ zone: 'hand', card })}
                onLift={() => measure()}
                onMove={(_held, pageX, pageY) => place({ zone: 'hand', card }, pageX, pageY)}
                onRelease={release}
              >
                {body}
              </CardDrag>
            );
          })}
        </View>
      </View>
      {drag ? (
        <View pointerEvents="none" style={[styles.ghost, { left: drag.left, top: drag.top }]}>
          {heldCode(drag.held) ? <Face code={heldCode(drag.held) as string} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function selectedCard(state: SkipBeauxState, owner: string, selected: Selection): string | null {
  if (!selected) return null;
  if (selected.zone === 'hand') return selected.card;
  if (selected.zone === 'stock') return topOf(state.stocks[owner] ?? []);
  return topOf(state.discards[owner]?.[selected.index]?.cards ?? []);
}

function sameSelection(current: Selection, next: Selection): boolean {
  if (!current || !next) return false;
  if (current.zone !== next.zone) return false;
  if (current.zone === 'hand' && next.zone === 'hand') return current.card === next.card;
  if (current.zone === 'discard' && next.zone === 'discard') return current.index === next.index;
  return current.zone === 'stock';
}

function compareCodes(a: string, b: string): number {
  return (rankOf(a) ?? 13) - (rankOf(b) ?? 13) || a.localeCompare(b);
}


function DrawPile({ count }: { count: number }) {
  return (
    <Dip count={count}>
      {count > 0 ? <View style={[styles.card, styles.back]} /> : <View style={[styles.card, styles.empty]} />}
    </Dip>
  );
}

function Face({ code, small, marked }: { code: string; small?: boolean; marked?: boolean }) {
  const wild = isBeaux(code);
  const rank = rankOf(code);
  const palette = facePalette(rank);
  return (
    <View style={[styles.card, small && styles.cardSmall, { backgroundColor: palette.bg }, wild && styles.wild, marked && styles.marked]}>
      <Text style={[styles.corner, { color: palette.fg }]}>{wild ? 'W' : rank}</Text>
      <Text style={[styles.pip, small && styles.pipSmall, { color: palette.fg }]}>{wild ? 'Wild' : rank}</Text>
    </View>
  );
}

function facePalette(rank: number | null): { bg: string; fg: string } {
  if (rank == null) return { bg: '#24180f', fg: '#f6ead2' };
  if (rank <= 3) return { bg: '#3b6fd8', fg: '#fffaf0' };
  if (rank <= 6) return { bg: '#2f9e6b', fg: '#fffaf0' };
  if (rank <= 9) return { bg: '#d64545', fg: '#fffaf0' };
  return { bg: '#e6b325', fg: INK };
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: '#14352c',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#2c5a48',
    padding: 12,
    gap: 12,
  },
  buildings: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  player: { gap: 6, borderRadius: radii.md, padding: 6 },
  playerActive: { borderWidth: 1, borderColor: colors.accent },
  playerName: { fontSize: 14, fontWeight: '700', color: '#f6ead2' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  slot: { alignItems: 'center', gap: 4 },
  slotLegal: { transform: [{ translateY: -4 }] },
  slotHover: { backgroundColor: 'rgba(212, 168, 75, 0.28)', borderRadius: 8 },
  ghost: { position: 'absolute', zIndex: 30 },
  hidden: { opacity: 0 },
  slotSelected: { transform: [{ translateY: -4 }] },
  slotLabel: { fontSize: 11, fontWeight: '600', color: '#d7e6df' },
  handBox: { gap: 6 },
  handTitle: { fontSize: 14, fontWeight: '700', color: '#f6ead2' },
  hint: { fontSize: 12, color: '#d7e6df' },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  lift: { transform: [{ translateY: -8 }] },
  card: {
    width: 52,
    height: 74,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 250, 240, 0.35)',
    padding: 4,
    justifyContent: 'space-between',
  },
  cardSmall: { width: 44, height: 62 },
  wild: { borderColor: colors.accent, borderWidth: 2 },
  marked: { borderColor: '#fff4c4', borderWidth: 3 },
  corner: { fontSize: 12, fontWeight: '800' },
  pip: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  pipSmall: { fontSize: 12 },
  back: { backgroundColor: '#1b4d3e', borderColor: colors.accent },
  empty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#6d8f80', alignItems: 'center', justifyContent: 'center' },
  emptyLabel: { color: '#6d8f80', fontWeight: '800' },
});

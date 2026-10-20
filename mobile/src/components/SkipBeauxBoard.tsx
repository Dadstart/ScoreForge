import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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

let nativeReduced = false;
if (Platform.OS !== 'web') {
  void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
    nativeReduced = value;
  });
  AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
    nativeReduced = value;
  });
}

function reducedMotion(): boolean {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return nativeReduced;
}

function motionDriver(): boolean {
  return Platform.OS !== 'web';
}

/** Cards that arrived in a hand that was already on screen. Revealing a hidden hand does not count. */
function useArrivals(ids: readonly string[]): ReadonlySet<string> {
  const seen = useRef<Set<string> | null>(null);
  const key = ids.join('\0');
  const cached = useRef<{ key: string; faces: ReadonlySet<string> } | null>(null);
  if (!cached.current || cached.current.key !== key) {
    const faces = new Set<string>();
    const prior = seen.current;
    if (prior && prior.size > 0) {
      for (const id of ids) if (!prior.has(id)) faces.add(id);
    }
    cached.current = { key, faces };
  }
  useEffect(() => {
    seen.current = new Set(key.length === 0 ? [] : key.split('\0'));
  }, [key]);
  return cached.current.faces;
}

export function SkipBeauxBoard({ state, players, handOwnerId, canAct, onPlay, onDiscard }: Props) {
  const [selected, setSelected] = useState<Selection>(null);
  useEffect(() => {
    setSelected(null);
  }, [state.turn, state.lastAction]);

  const owner = handOwnerId;
  const chosen = owner ? selectedCard(state, owner, selected) : null;
  const hand = owner ? [...(state.hands[owner] ?? [])].sort(compareCodes) : [];
  const arrivals = useArrivals(hand);

  const choose = (next: Selection) => {
    if (!canAct || !owner) return;
    setSelected((current) => (sameSelection(current, next) ? null : next));
  };

  return (
    <View style={styles.table}>
      <View style={styles.buildings}>
        {state.buildings.map((pile, index) => {
          const needed = neededRank(pile);
          const legal = chosen != null && canBuild(chosen, pile);
          const top = topOf(pile.cards);
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={needed === 1 ? 'Empty building pile, needs 1' : `Building pile, needs ${needed}`}
              disabled={!canAct || !legal}
              onPress={() => {
                if (selected) onPlay(selected, index);
              }}
              style={[styles.slot, legal && styles.slotLegal]}
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
              {state.totals[id] ?? 0}
              {' · '}
              {state.hands[id]?.length ?? 0} in hand
            </Text>
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Stock, ${stockCount} cards`}
                disabled={!canAct || !mine || !stock}
                onPress={() => choose({ zone: 'stock' })}
                style={[styles.slot, mine && selected?.zone === 'stock' && styles.slotSelected]}
              >
                <Dip count={stockCount}>
                  <Land id={stock}>
                    {stock ? <Face code={stock} marked={stockCount === 1} /> : <View style={[styles.card, styles.empty]} />}
                  </Land>
                </Dip>
                <Text style={styles.slotLabel}>Stock {stockCount}</Text>
              </Pressable>
              {(state.discards[id] ?? []).slice(0, PILE_SLOTS).map((pile, index) => {
                const top = topOf(pile.cards);
                const picked = mine && selected?.zone === 'discard' && selected.index === index;
                return (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={top ? `Discard ${cardLabel(top)}` : 'Empty discard pile'}
                    disabled={!canAct || !mine}
                    onPress={() => {
                      if (selected?.zone === 'hand') onDiscard(selected.card, index);
                      else if (top) choose({ zone: 'discard', index });
                    }}
                    style={[styles.slot, (picked || (selected?.zone === 'hand' && mine)) && styles.slotLegal]}
                  >
                    <Land id={top}>
                      {top ? <Face code={top} small /> : <View style={[styles.card, styles.cardSmall, styles.empty]} />}
                    </Land>
                    <Text style={styles.slotLabel}>{pile.cards.length}</Text>
                  </Pressable>
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
            ? 'Tap a building pile, or a discard pile to end the turn.'
            : chosen
              ? 'Tap a building pile that can take this card.'
              : 'Select a card, then a building pile.'}
        </Text>
        <View style={styles.hand}>
          {hand.map((card) => {
            const picked = selected?.zone === 'hand' && selected.card === card;
            const face = <Face code={card} />;
            return (
              <Pressable
                key={card}
                accessibilityRole="button"
                accessibilityLabel={cardLabel(card)}
                disabled={!canAct}
                onPress={() => choose({ zone: 'hand', card })}
                style={picked ? styles.lift : undefined}
              >
                {arrivals.has(card) ? (
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
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
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

/** A new card settles onto the pile. Clearing the pile pops the empty slot. */
function Land({ id, children }: { id: string | null; children: ReactNode }) {
  const land = useRef(new Animated.Value(1)).current;
  const clear = useRef(new Animated.Value(1)).current;
  const previous = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const known = previous.current !== undefined;
    const arrive = known && id != null && previous.current !== id;
    const cleared = known && previous.current != null && id == null;
    previous.current = id;
    if (reducedMotion() || (!arrive && !cleared)) {
      land.setValue(1);
      clear.setValue(1);
      return;
    }
    const motion = arrive ? land : clear;
    const other = arrive ? clear : land;
    other.setValue(1);
    motion.setValue(0);
    const animation = Animated.timing(motion, {
      toValue: 1,
      duration: arrive ? 340 : 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [id, land, clear]);

  const translateY = land.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const landScale = land.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] });
  const rotate = land.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });
  const clearScale = clear.interpolate({ inputRange: [0, 1], outputRange: [1.18, 1] });
  return (
    <Animated.View style={{ transform: [{ translateY }, { scale: landScale }, { rotate }, { scale: clearScale }] }}>
      {children}
    </Animated.View>
  );
}

/** The pile dips when a card leaves and lifts when cards are added back. */
function Dip({ count, children }: { count: number; children?: ReactNode }) {
  const dip = useRef(new Animated.Value(0)).current;
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const known = previous.current !== null;
    const dealt = known && count < (previous.current ?? 0);
    const refilled = known && count > (previous.current ?? 0);
    previous.current = count;
    if (reducedMotion() || (!dealt && !refilled)) {
      dip.setValue(0);
      return;
    }
    dip.setValue(dealt ? 1 : -1);
    const animation = Animated.timing(dip, {
      toValue: 0,
      duration: dealt ? 280 : 360,
      easing: Easing.out(Easing.quad),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [count, dip]);

  const scale = dip.interpolate({ inputRange: [-1, 0, 1], outputRange: [1.08, 1, 0.9] });
  const translateY = dip.interpolate({ inputRange: [-1, 0, 1], outputRange: [-4, 0, 6] });
  return <Animated.View style={{ transform: [{ translateY }, { scale }] }}>{children}</Animated.View>;
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
      <Text style={[styles.corner, { color: palette.fg }]}>{wild ? 'B' : rank}</Text>
      <Text style={[styles.pip, small && styles.pipSmall, { color: palette.fg }]}>{wild ? 'Beaux' : rank}</Text>
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

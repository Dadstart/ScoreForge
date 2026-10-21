import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { motionDriver, reducedMotion, useArrivals } from './cardMotion';
import { CardDrag, boxContains, emptyBox, type WindowBox } from './CardDrag';
import { CardFlip, flipDelay } from './CardFlip';
import {
  UNEAUX_COLORS,
  canPlayCard,
  cardLabel,
  colorOf,
  compareCards,
  isWild,
  isWildFour,
  kindOf,
  type UneauxColor,
  type UneauxState,
} from '../domain/uneaux';
import { colors, radii } from '../theme';

type Named = { id: string; name: string };

type Props = {
  state: UneauxState;
  players: readonly Named[];
  handOwnerId: string | null;
  canAct: boolean;
  onPlay: (card: string) => void;
  onDraw: () => void;
  onColor: (color: UneauxColor) => void;
};

const INK = '#1a120c';
const CARD_W = 58;
const CARD_H = 84;
const FACE: Record<UneauxColor, string> = {
  red: '#d64545',
  yellow: '#e6b325',
  green: '#2f9e6b',
  blue: '#3b6fd8',
};

export function UneauxBoard({ state, players, handOwnerId, canAct, onPlay, onDraw, onColor }: Props) {
  const tableRef = useRef<View>(null);
  const discardRef = useRef<View>(null);
  const origin = useRef<WindowBox>(emptyBox);
  const discardBox = useRef<WindowBox>(emptyBox);
  const [drag, setDrag] = useState<{ card: string; left: number; top: number; over: boolean } | null>(null);
  const play = useRef(onPlay);
  play.current = onPlay;

  const measure = () => {
    tableRef.current?.measureInWindow((x, y, width, height) => {
      origin.current = { x, y, width, height };
    });
    discardRef.current?.measureInWindow((x, y, width, height) => {
      discardBox.current = { x, y, width, height };
    });
  };

  const top = state.discard.at(-1) ?? null;
  const hand = handOwnerId ? [...(state.hands[handOwnerId] ?? [])].sort(compareCards) : [];
  const arrivals = useArrivals(hand);
  const choosing = canAct && state.phase === 'color';

  const place = (card: string, pageX: number, pageY: number) => {
    const box = origin.current;
    setDrag({
      card,
      left: pageX - box.x - CARD_W / 2,
      top: pageY - box.y - CARD_H / 2,
      over: boxContains(pageX, pageY, discardBox.current, 18),
    });
  };

  return (
    <View ref={tableRef} style={styles.table} onLayout={measure}>
      <View style={styles.seats}>
        {state.order.map((id) => {
          const count = state.hands[id]?.length ?? 0;
          const active = state.turn === id;
          return (
            <View key={id} style={[styles.seat, active && styles.seatActive]}>
              <Text style={styles.seatName}>{players.find((player) => player.id === id)?.name ?? 'Player'}</Text>
              <Text style={styles.seatMeta}>
                {state.totals[id] ?? 0}
                {' · '}
                {count} {count === 1 ? 'card' : 'cards'}
                {state.pendingCall === id ? ' · Uneaux?' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.piles}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stock, ${state.stock.length} cards`}
          disabled={!canAct || state.phase !== 'play' || state.drawn != null}
          onPress={onDraw}
          style={styles.pile}
        >
          <StockCard count={state.stock.length} />
          <Text style={styles.pileLabel}>Stock {state.stock.length}</Text>
        </Pressable>
        <View ref={discardRef} onLayout={measure} style={[styles.pile, drag?.over && styles.pileOver]}>
          {top ? <DiscardCard code={top} wash={state.color} /> : <View style={[styles.card, styles.empty]} />}
          <View style={styles.directionRow}>
            <DirectionMark direction={state.direction} />
            <Text style={styles.pileLabel}>
              {state.direction === 1 ? 'Clockwise' : 'Counterclockwise'}
              {state.color ? ` · ${state.color}` : ''}
            </Text>
          </View>
        </View>
      </View>

      {choosing ? <ColorChoices onColor={onColor} /> : null}

      <View style={styles.handBox}>
        <Text style={styles.handTitle}>
          {handOwnerId ? `${players.find((player) => player.id === handOwnerId)?.name ?? 'Hand'} · ${hand.length}` : 'Hand hidden'}
        </Text>
        <View style={styles.hand}>
          {hand.map((card) => {
            const playable = handOwnerId ? canPlayCard(state, handOwnerId, card) && canAct : false;
            const arriving = arrivals.has(card);
            const face = <PlayingCard code={card} marked={state.drawn === card} />;
            const body = arriving ? (
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
            if (!playable) {
              return (
                <Pressable
                  key={card}
                  accessibilityRole="button"
                  accessibilityLabel={cardLabel(card)}
                  disabled
                  style={canAct && state.phase === 'play' ? styles.dim : undefined}
                >
                  {body}
                </Pressable>
              );
            }
            return (
              <CardDrag
                key={card}
                value={card}
                label={cardLabel(card)}
                hint="Drag onto the discard, or tap to play"
                style={[styles.playable, drag?.card === card && styles.hidden]}
                onTap={() => play.current(card)}
                onLift={() => {
                  measure();
                  place(card, origin.current.x, origin.current.y);
                }}
                onMove={(_card, pageX, pageY) => place(card, pageX, pageY)}
                onRelease={(_card, pageX, pageY, moved) => {
                  const over = moved && boxContains(pageX, pageY, discardBox.current, 18);
                  setDrag(null);
                  if (over) play.current(card);
                }}
              >
                {body}
              </CardDrag>
            );
          })}
        </View>
      </View>
      {drag ? (
        <View pointerEvents="none" style={[styles.ghost, { left: drag.left, top: drag.top }]}>
          <PlayingCard code={drag.card} marked={state.drawn === drag.card} />
        </View>
      ) : null}
    </View>
  );
}

function DiscardCard({ code, wash }: { code: string; wash: UneauxColor | null }) {
  const progress = useRef(new Animated.Value(1)).current;
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const arrive = previous.current !== null && previous.current !== code;
    previous.current = code;
    if (!arrive || reducedMotion()) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [code, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '0deg'] });
  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }, { rotate }] }}>
      <PlayingCard code={code} wash={wash} />
    </Animated.View>
  );
}

function StockCard({ count }: { count: number }) {
  const dip = useRef(new Animated.Value(0)).current;
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const dealt = previous.current !== null && count < previous.current;
    previous.current = count;
    if (!dealt || reducedMotion()) {
      dip.setValue(0);
      return;
    }
    dip.setValue(1);
    const animation = Animated.timing(dip, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [count, dip]);

  const scale = dip.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] });
  const translateY = dip.interpolate({ inputRange: [0, 1], outputRange: [0, 6] });
  if (count <= 0) return <View style={[styles.card, styles.empty]} />;
  return (
    <Animated.View style={[styles.card, styles.back, { transform: [{ translateY }, { scale }] }]} />
  );
}

function DirectionMark({ direction }: { direction: 1 | -1 }) {
  const spin = useRef(new Animated.Value(direction === 1 ? 0 : 1)).current;
  const previous = useRef<1 | -1 | null>(null);

  useEffect(() => {
    const target = direction === 1 ? 0 : 1;
    const turned = previous.current !== null && previous.current !== direction;
    previous.current = direction;
    if (!turned || reducedMotion()) {
      spin.setValue(target);
      return;
    }
    const animation = Animated.timing(spin, {
      toValue: target,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [direction, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.arrow, { transform: [{ rotate }] }]}>
      ↻
    </Animated.Text>
  );
}

function ColorChoices({ onColor }: { onColor: (color: UneauxColor) => void }) {
  const rise = useRef(new Animated.Value(reducedMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion()) {
      rise.setValue(1);
      return;
    }
    rise.setValue(0);
    const animation = Animated.timing(rise, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [rise]);
  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  return (
    <Animated.View style={[styles.colors, { opacity: rise, transform: [{ translateY }] }]}>
      {UNEAUX_COLORS.map((color) => (
        <Pressable
          key={color}
          accessibilityRole="button"
          accessibilityLabel={`Name ${color}`}
          onPress={() => onColor(color)}
          style={[styles.colorButton, { backgroundColor: FACE[color] }]}
        >
          <Text style={[styles.colorLabel, color === 'yellow' && styles.darkInk]}>{color}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

function PlayingCard({ code, wash, marked }: { code: string; wash?: UneauxColor | null; marked?: boolean }) {
  const color = colorOf(code);
  const wild = isWild(code) || isWildFour(code);
  const background = color ? FACE[color] : '#24180f';
  const ink = color === 'yellow' ? INK : '#fffaf0';
  const mark = markOf(code);
  return (
    <View style={[styles.card, { backgroundColor: background }, wild && styles.wild, marked && styles.fresh]}>
      <Text style={[styles.corner, { color: ink }]}>{mark}</Text>
      <Text style={[styles.pip, { color: ink }]}>{mark}</Text>
      {wild && wash ? <WashDot color={wash} /> : null}
    </View>
  );
}

function WashDot({ color }: { color: UneauxColor }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const previous = useRef<UneauxColor | null>(null);

  useEffect(() => {
    const changed = previous.current !== null && previous.current !== color;
    previous.current = color;
    if (!changed || reducedMotion()) {
      pulse.setValue(1);
      return;
    }
    pulse.setValue(0);
    const animation = Animated.timing(pulse, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: motionDriver(),
    });
    animation.start();
    return () => animation.stop();
  }, [color, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  return <Animated.View style={[styles.pipDot, { backgroundColor: FACE[color], transform: [{ scale }] }]} />;
}

function markOf(code: string): string {
  const kind = kindOf(code);
  if (kind === 'S') return 'Skip';
  if (kind === 'V') return 'Rev';
  if (kind === 'D') return '+2';
  if (kind === 'W') return 'Wild';
  if (kind === 'F') return '+4';
  return kind;
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
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seat: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  seatActive: { borderWidth: 1, borderColor: colors.accent },
  seatName: { fontSize: 14, fontWeight: '700', color: '#f6ead2' },
  seatMeta: { fontSize: 12, color: '#d7e6df' },
  piles: { flexDirection: 'row', gap: 16, justifyContent: 'center', alignItems: 'flex-end' },
  pile: { alignItems: 'center', gap: 6 },
  pileOver: { backgroundColor: 'rgba(212, 168, 75, 0.28)', borderRadius: 10 },
  ghost: { position: 'absolute', zIndex: 30 },
  hidden: { opacity: 0 },
  pileLabel: { fontSize: 12, fontWeight: '600', color: '#d7e6df', textTransform: 'capitalize' },
  directionRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { fontSize: 16, fontWeight: '800', color: '#f6ead2' },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  colorButton: { borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 10, minWidth: 76, alignItems: 'center' },
  colorLabel: { color: '#fffaf0', fontWeight: '700', textTransform: 'capitalize' },
  darkInk: { color: INK },
  handBox: { gap: 8 },
  handTitle: { fontSize: 14, fontWeight: '700', color: '#f6ead2' },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dim: { opacity: 0.45 },
  card: {
    width: 58,
    height: 84,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 250, 240, 0.35)',
    padding: 4,
    justifyContent: 'space-between',
  },
  wild: { borderColor: colors.accent, borderWidth: 2 },
  fresh: { borderColor: '#fff4c4', borderWidth: 3 },
  playable: { transform: [{ translateY: -6 }] },
  corner: { fontSize: 12, fontWeight: '800' },
  pip: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  pipDot: { alignSelf: 'center', width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#fffaf0' },
  back: { backgroundColor: '#1b4d3e', borderColor: colors.accent },
  empty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#6d8f80' },
});

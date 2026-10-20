import { useEffect, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type PointerEvent, type ViewStyle } from 'react-native';
import { hitIndex, readBox, type WindowBox } from './CardDrag';
import {
  cardFace,
  isWild,
  meldLabel,
  teamIndex,
  type CanastaState,
} from '../domain/canasta';
import { colors, radii } from '../theme';

type Named = { id: string; name: string };
type Box = { x: number; y: number; width: number; height: number };
type Drag = { card: string; left: number; top: number; snapped: boolean };

type Props = {
  state: CanastaState;
  players: readonly Named[];
  handOwnerId: string | null;
  selected: ReadonlySet<string>;
  canAct: boolean;
  onToggle: (card: string) => void;
  onMeldPress: (meldIndex: number) => void;
  onDraw: () => void;
  onTake: () => void;
  onDiscard: (card: string) => void;
  onMeldDrop: (card: string, meldIndex: number) => void;
  onArrange: (order: readonly string[]) => void;
  onDragChange?: (dragging: boolean) => void;
};

const CARD_W = 54;
const CARD_H = 76;
const TAP_SLOP = 12;
const HAND_GAP = 6;
/** Distance between card centers that pulls the dragged card onto the pack. */
const SNAP_IN = 120;
const SNAP_OUT = 168;

export function CanastaBoard({
  state,
  players,
  handOwnerId,
  selected,
  canAct,
  onToggle,
  onMeldPress,
  onDraw,
  onTake,
  onDiscard,
  onMeldDrop,
  onArrange,
  onDragChange,
}: Props) {
  const frozen = state.discard.some(isWild);
  const top = state.discard.at(-1) ?? null;
  const ownerTeam = handOwnerId ? teamIndex(state, handOwnerId) : -1;
  const hand = handOwnerId ? (state.hands[handOwnerId] ?? []) : [];
  const fresh = new Set(state.drawn ?? []);
  const canDiscard = canAct && state.phase === 'play';
  const canMeld = canDiscard && ownerTeam >= 0;
  const canArrange = handOwnerId != null;
  const originRef = useRef<View>(null);
  const pileRef = useRef<View>(null);
  const handRef = useRef<View>(null);
  const originBox = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const pileBox = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const handBox = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const meldNodes = useRef<(View | null)[]>([]);
  const meldBoxes = useRef<WindowBox[]>([]);
  const hoverRef = useRef<number | null>(null);
  const cards = useRef(hand);
  cards.current = hand;
  const grab = useRef<{ card: string; ox: number; oy: number; x: number; y: number } | null>(null);
  const snapped = useRef(false);
  const slotRef = useRef<number | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [meldHover, setMeldHover] = useState<number | null>(null);
  const api = useRef({ onDiscard, onMeldDrop, onArrange, onDragChange, onToggle, canDiscard, canMeld });
  api.current = { onDiscard, onMeldDrop, onArrange, onDragChange, onToggle, canDiscard, canMeld };
  useEffect(() => () => setDragCursor(false), []);

  const measure = () => {
    originRef.current?.measureInWindow((x, y, width, height) => {
      originBox.current = { x, y, width, height };
    });
    pileRef.current?.measureInWindow((x, y, width, height) => {
      pileBox.current = { x, y, width, height };
    });
    handRef.current?.measureInWindow((x, y, width, height) => {
      handBox.current = { x, y, width, height };
    });
    meldNodes.current.forEach((node, index) => {
      if (node) readBox(node, meldBoxes.current, index);
      else meldBoxes.current[index] = { x: 0, y: 0, width: 0, height: 0 };
    });
  };

  const slotFor = (pageX: number, pageY: number, ox: number, oy: number) => {
    const box = handBox.current;
    const count = cards.current.length;
    if (box.width <= 0 || count === 0) return null;
    const strideX = CARD_W + HAND_GAP;
    const strideY = CARD_H + HAND_GAP;
    const cols = Math.max(1, Math.floor((box.width + HAND_GAP) / strideX));
    const centerX = pageX - ox + CARD_W / 2 - box.x;
    const centerY = pageY - oy + CARD_H / 2 - box.y;
    const col = Math.min(cols - 1, Math.max(0, Math.floor(centerX / strideX)));
    const row = Math.max(0, Math.floor(centerY / strideY));
    return Math.min(count - 1, row * cols + col);
  };

  const place = (pageX: number, pageY: number) => {
    const held = grab.current;
    if (!held) return;
    const origin = originBox.current;
    const pile = pileBox.current;
    const centerX = pageX - held.ox + CARD_W / 2;
    const centerY = pageY - held.oy + CARD_H / 2;
    const pileX = pile.x + pile.width / 2;
    const pileY = pile.y + pile.height / 2;
    const distance = Math.hypot(centerX - pileX, centerY - pileY);
    const near = api.current.canDiscard && pile.width > 0 && distance <= (snapped.current ? SNAP_OUT : SNAP_IN);
    snapped.current = near;
    const meldAt = !near && api.current.canMeld ? hitIndex(pageX, pageY, meldBoxes.current, 16) : null;
    if (meldAt !== hoverRef.current) {
      hoverRef.current = meldAt;
      setMeldHover(meldAt);
    }
    if (!near && meldAt == null) {
      const next = slotFor(pageX, pageY, held.ox, held.oy);
      if (next != null && next !== slotRef.current) {
        slotRef.current = next;
        setSlot(next);
      }
    }
    setDrag({
      card: held.card,
      left: near ? pile.x - origin.x : pageX - held.ox - origin.x,
      top: near ? pile.y - origin.y : pageY - held.oy - origin.y,
      snapped: near,
    });
  };

  const begin = (card: string, pageX: number, pageY: number, ox: number, oy: number) => {
    measure();
    grab.current = { card, ox, oy, x: pageX, y: pageY };
    snapped.current = false;
    const index = cards.current.indexOf(card);
    slotRef.current = index >= 0 ? index : null;
    setSlot(slotRef.current);
    setDragCursor(true);
    api.current.onDragChange?.(true);
    place(pageX, pageY);
  };

  const end = (pageX: number, pageY: number, cancel = false) => {
    const held = grab.current;
    const locked = snapped.current;
    const index = slotRef.current;
    grab.current = null;
    snapped.current = false;
    const meldAt = hoverRef.current;
    slotRef.current = null;
    hoverRef.current = null;
    setSlot(null);
    setMeldHover(null);
    setDrag(null);
    setDragCursor(false);
    api.current.onDragChange?.(false);
    if (!held || cancel) return;
    const moved = Math.hypot(pageX - held.x, pageY - held.y) >= TAP_SLOP;
    if (!moved) {
      api.current.onToggle(held.card);
      return;
    }
    if (locked) {
      api.current.onDiscard(held.card);
      return;
    }
    if (meldAt != null) {
      api.current.onMeldDrop(held.card, meldAt);
      return;
    }
    if (index == null) return;
    const order = moveCard(cards.current, held.card, index);
    if (order.some((card, at) => card !== cards.current[at])) api.current.onArrange(order);
  };

  return (
    <View style={styles.table} onLayout={measure}>
      <View ref={originRef} pointerEvents="none" style={styles.origin} />
      <View style={styles.piles}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stock, ${state.stock.length} cards`}
          disabled={!canAct || state.phase !== 'draw'}
          onPress={onDraw}
          style={styles.pile}
        >
          {state.stock.length > 0 ? <CardBack /> : <View style={[styles.card, styles.empty]} />}
          <Text style={styles.pileLabel}>Stock {state.stock.length}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={top ? `Discard, ${cardFace(top)?.name ?? 'card'}` : 'Empty discard pile'}
          disabled={!canAct || state.phase !== 'draw'}
          onPress={onTake}
          style={[styles.pile, drag?.snapped && styles.pileSnap]}
        >
          <View ref={pileRef} onLayout={measure}>
            {top ? <PlayingCard code={top} /> : <View style={[styles.card, styles.empty]} />}
          </View>
          <Text style={styles.pileLabel}>
            Pack {state.discard.length}
            {frozen ? ' · frozen' : ''}
          </Text>
        </Pressable>
      </View>

      {state.teams.map((team, index) => {
        const names = team.playerIds.map((id) => players.find((player) => player.id === id)?.name ?? 'Player').join(' and ');
        const reds = team.playerIds.flatMap((id) => state.redThrees[id] ?? []);
        const mine = index === ownerTeam;
        return (
          <View key={team.playerIds.join('-')} style={styles.side}>
            <Text style={styles.sideTitle}>
              {names} · {team.total.toLocaleString()}
              {team.opened ? '' : ' · not open'}
            </Text>
            <View style={styles.meldRow}>
              {reds.map((card) => (
                <PlayingCard key={card} code={card} small drawn={fresh.has(card)} />
              ))}
              {team.melds.map((meld, meldIndex) => {
                const canAdd = canAct && mine && state.phase === 'play' && selected.size > 0;
                return (
                  <Pressable
                    key={`${meld.rank}-${meldIndex}`}
                    ref={(node) => {
                      if (mine) meldNodes.current[meldIndex] = node;
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={meldLabel(meld)}
                    disabled={!canAdd}
                    onPress={() => onMeldPress(meldIndex)}
                    onLayout={mine ? measure : undefined}
                    style={[
                      styles.meld,
                      meld.cards.length >= 7 && meld.rank !== 3 && styles.canasta,
                      mine && meldHover === meldIndex && styles.meldHover,
                    ]}
                  >
                    <Text style={styles.meldLabel}>{meldLabel(meld)}</Text>
                    <View style={styles.meldCards}>
                      {meld.cards.map((card, cardIndex) => (
                        <View key={card} style={cardIndex > 0 ? styles.overlap : undefined}>
                          <PlayingCard code={card} small />
                        </View>
                      ))}
                    </View>
                  </Pressable>
                );
              })}
              {team.melds.length === 0 && reds.length === 0 ? <Text style={styles.emptySide}>No melds yet</Text> : null}
            </View>
          </View>
        );
      })}

      <View style={styles.handBox}>
        <Text style={styles.sideTitle}>
          {handOwnerId
            ? `${players.find((player) => player.id === handOwnerId)?.name ?? 'Hand'} · ${hand.length}`
            : 'Hand hidden'}
        </Text>
        <View ref={handRef} onLayout={measure} style={styles.hand}>
          {(drag && slot != null ? moveCard(hand, drag.card, slot) : hand).map((card) => (
            <HandCard
              key={card}
              code={card}
              selected={selected.has(card)}
              drawn={fresh.has(card)}
              enabled={canArrange || canDiscard}
              hidden={drag?.card === card}
              onTap={() => onToggle(card)}
              onBegin={begin}
              onMove={place}
              onEnd={end}
            />
          ))}
        </View>
      </View>

      {drag ? (
        <View pointerEvents="none" style={[styles.ghost, { left: drag.left, top: drag.top }]}>
          <PlayingCard code={drag.card} drawn={fresh.has(drag.card)} lift={!drag.snapped} snapped={drag.snapped} />
        </View>
      ) : null}
    </View>
  );
}

function moveCard(cards: readonly string[], card: string, index: number): string[] {
  const next = cards.filter((item) => item !== card);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, card);
  return next;
}

function HandCard({
  code,
  selected,
  drawn,
  enabled,
  hidden,
  onTap,
  onBegin,
  onMove,
  onEnd,
}: {
  code: string;
  selected: boolean;
  drawn: boolean;
  enabled: boolean;
  hidden: boolean;
  onTap: () => void;
  onBegin: (card: string, pageX: number, pageY: number, ox: number, oy: number) => void;
  onMove: (pageX: number, pageY: number) => void;
  onEnd: (pageX: number, pageY: number, cancel?: boolean) => void;
}) {
  const ref = useRef<View>(null);
  const api = useRef({ code, enabled, onTap, onBegin, onMove, onEnd });
  api.current = { code, enabled, onTap, onBegin, onMove, onEnd };
  const session = useRef<{ x: number; y: number; began: boolean } | null>(null);
  const face = cardFace(code);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web' && api.current.enabled,
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web' && api.current.enabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, gesture) => {
        const pageX = gesture.x0;
        const pageY = gesture.y0;
        session.current = { x: pageX, y: pageY, began: false };
        ref.current?.measureInWindow((x, y) => {
          if (!session.current) return;
          session.current.began = true;
          api.current.onBegin(api.current.code, pageX, pageY, pageX - x, pageY - y);
        });
      },
      onPanResponderMove: (_, gesture) => {
        if (session.current?.began) api.current.onMove(gesture.moveX, gesture.moveY);
      },
      onPanResponderRelease: (_, gesture) => {
        const active = session.current;
        session.current = null;
        if (!active?.began) {
          if (Math.hypot(gesture.moveX - gesture.x0, gesture.moveY - gesture.y0) < TAP_SLOP) api.current.onTap();
          return;
        }
        api.current.onEnd(gesture.moveX, gesture.moveY, false);
      },
      onPanResponderTerminate: () => {
        session.current = null;
        api.current.onEnd(0, 0, true);
      },
    }),
  ).current;

  const onPointerDown = (event: PointerEvent) => {
    if (event.nativeEvent.button !== 0 || !api.current.enabled) return;
    const pointerId = event.nativeEvent.pointerId;
    const pageX = event.nativeEvent.clientX;
    const pageY = event.nativeEvent.clientY;
    session.current = { x: pageX, y: pageY, began: false };
    const target = event.currentTarget as { setPointerCapture?: (id: number) => void };
    target.setPointerCapture?.(pointerId);
    event.preventDefault?.();
    ref.current?.measureInWindow((x, y) => {
      if (!session.current) return;
      session.current.began = true;
      api.current.onBegin(api.current.code, pageX, pageY, pageX - x, pageY - y);
    });
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const move = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId || !session.current?.began) return;
      api.current.onMove(native.clientX, native.clientY);
    };
    const up = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      const active = session.current;
      session.current = null;
      const cancel = native.type === 'pointercancel';
      if (!active?.began) {
        if (!cancel && Math.hypot(native.clientX - pageX, native.clientY - pageY) < TAP_SLOP) api.current.onTap();
        return;
      }
      api.current.onEnd(native.clientX, native.clientY, cancel);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <View
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={drawn ? `${face?.name ?? 'Card'}, just drawn` : (face?.name ?? 'Card')}
      {...(Platform.OS === 'web' ? { onPointerDown } : responder.panHandlers)}
      style={[hidden && styles.hidden, enabled ? grabCursor() : null]}
    >
      <PlayingCard code={code} selected={selected} drawn={drawn} />
    </View>
  );
}

function PlayingCard({
  code,
  selected,
  drawn,
  small,
  lift = true,
  snapped,
}: {
  code: string;
  selected?: boolean;
  drawn?: boolean;
  small?: boolean;
  lift?: boolean;
  snapped?: boolean;
}) {
  const face = cardFace(code);
  if (!face) return null;
  const ink = face.red ? '#c4302b' : '#1a120c';
  return (
    <View style={[styles.card, small && styles.cardSmall, drawn && styles.cardDrawn, drawn && lift && styles.cardLift, selected && styles.cardSelected, snapped && styles.cardSnap]}>
      <Text style={[styles.corner, small && styles.cornerSmall, { color: ink }]}>
        {face.label}
        {face.symbol}
      </Text>
      <Text style={[styles.pip, small && styles.pipSmall, { color: ink }]}>{face.symbol}</Text>
    </View>
  );
}

function CardBack() {
  return (
    <View style={[styles.card, styles.back]}>
      <View style={styles.diamond} />
    </View>
  );
}

function grabCursor(): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  return { cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle;
}

function setDragCursor(active: boolean) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const existing = document.getElementById('canasta-drag-cursor');
  if (!active) {
    existing?.remove();
    return;
  }
  const style = existing ?? document.createElement('style');
  style.id = 'canasta-drag-cursor';
  style.textContent = 'html, html * { cursor: grabbing !important; }';
  if (!existing) document.head.appendChild(style);
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
  origin: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  piles: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  pile: { alignItems: 'center', gap: 6, borderRadius: 10, padding: 4 },
  pileSnap: { backgroundColor: 'rgba(212, 168, 75, 0.28)' },
  meldHover: { backgroundColor: 'rgba(212, 168, 75, 0.28)' },
  pileLabel: { fontSize: 12, fontWeight: '600', color: '#d7e6df' },
  side: { gap: 6 },
  sideTitle: { fontSize: 14, fontWeight: '700', color: '#f6ead2' },
  meldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  meld: {
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    borderRadius: radii.md,
    padding: 6,
    gap: 4,
  },
  canasta: { borderWidth: 1, borderColor: colors.accent },
  meldLabel: { fontSize: 12, fontWeight: '600', color: '#f6ead2' },
  meldCards: { flexDirection: 'row', alignItems: 'flex-end' },
  overlap: { marginLeft: -18 },
  emptySide: { fontSize: 12, color: '#d7e6df' },
  handBox: { gap: 8 },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: HAND_GAP },
  hidden: { opacity: 0 },
  ghost: { position: 'absolute', zIndex: 30, elevation: 8 },
  card: {
    width: 54,
    height: 76,
    borderRadius: 8,
    backgroundColor: '#fffaf0',
    borderWidth: 1,
    borderColor: '#e4d3b0',
    padding: 4,
    justifyContent: 'space-between',
  },
  cardSmall: { width: 40, height: 56, borderRadius: 6 },
  cardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
    transform: [{ translateY: -8 }],
  },
  cardDrawn: {
    backgroundColor: '#ffe7a3',
    borderColor: colors.accent,
    borderWidth: 2,
  },
  cardLift: { transform: [{ translateY: -6 }] },
  cardSnap: {
    borderColor: colors.accent,
    borderWidth: 3,
  },
  empty: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#6d8f80' },
  back: {
    backgroundColor: '#1b4d3e',
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: {
    width: 18,
    height: 18,
    backgroundColor: colors.accent,
    transform: [{ rotate: '45deg' }],
  },
  corner: { fontSize: 13, fontWeight: '700' },
  cornerSmall: { fontSize: 11 },
  pip: { fontSize: 22, textAlign: 'center' },
  pipSmall: { fontSize: 16 },
});

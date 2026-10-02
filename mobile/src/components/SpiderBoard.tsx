import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PointerEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  canDeal,
  cardFace,
  destinations,
  dropTarget,
  runFrom,
  type SpiderSource,
  type SpiderState,
} from '../domain/spider';
import { colors, fonts, radii } from '../theme';

type Props = {
  state: SpiderState;
  selection: SpiderSource | null;
  disabled?: boolean;
  onColumn: (column: number, at: number) => void;
  onStock: () => void;
  onDrop: (source: SpiderSource, column: number) => boolean;
  onDragChange?: (dragging: boolean) => void;
};

type Box = { x: number; y: number; width: number; height: number };

const GAP = 4;
const TAP_SLOP = 12;

export function SpiderBoard(props: Props) {
  const [width, setWidth] = useState(0);
  return (
    <View
      style={styles.table}
      accessibilityLabel="Spider board"
      onLayout={(event) => {
        const next = Math.floor(event.nativeEvent.layout.width) - 20;
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {width > 0 ? <Layout width={width} {...props} /> : <View style={styles.pending} />}
    </View>
  );
}

function Layout({ width, state, selection, disabled, onColumn, onStock, onDrop, onDragChange }: Props & { width: number }) {
  const columnsRef = useRef<View>(null);
  const boxRef = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const dragSource = useRef<SpiderSource | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [lift, setLift] = useState<{ source: SpiderSource; dx: number; dy: number } | null>(null);
  const cardWidth = Math.max(28, Math.min(64, Math.floor((width - GAP * 9) / 10)));
  const cardHeight = Math.round(cardWidth * 1.38);
  const overlapDown = Math.max(6, Math.round(cardHeight * 0.16));
  const overlapUp = Math.max(14, Math.round(cardHeight * 0.34));
  const remember = () => {
    columnsRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      boxRef.current = { x, y, width: measuredWidth, height: measuredHeight };
    });
  };
  const gesture = useRef({ state, cardWidth, onDrop, onDragChange, remember });
  gesture.current = { state, cardWidth, onDrop, onDragChange, remember };
  useEffect(() => () => setDragCursor(null), []);

  const begin = (source: SpiderSource) => {
    dragSource.current = source;
    remember();
    onDragChange?.(true);
    setLift({ source, dx: 0, dy: 0 });
    setHover(null);
    setDragCursor('grabbing');
  };
  const move = (dx: number, dy: number, pageX: number, pageY: number) => {
    const source = dragSource.current;
    if (!source) return;
    const current = gesture.current;
    const column = dropTarget(pageX - boxRef.current.x, pageY - boxRef.current.y, current.cardWidth, GAP);
    const legal = column != null && destinations(current.state, source).includes(column);
    const moved = Math.hypot(dx, dy) >= TAP_SLOP;
    setLift({ source, dx, dy });
    setHover(legal ? column : null);
    setDragCursor(!moved || legal ? 'grabbing' : 'not-allowed');
  };
  const end = (source: SpiderSource, pageX: number, pageY: number, moved: boolean) => {
    dragSource.current = null;
    setDragCursor(null);
    if (!moved) {
      setLift(null);
      setHover(null);
      gesture.current.onDragChange?.(false);
      return false;
    }
    const current = gesture.current;
    const column = dropTarget(pageX - boxRef.current.x, pageY - boxRef.current.y, current.cardWidth, GAP);
    if (column != null && current.onDrop(source, column)) {
      setLift(null);
      setHover(null);
      current.onDragChange?.(false);
      return true;
    }
    setLift(null);
    setHover(null);
    current.onDragChange?.(false);
    return true;
  };

  const canDrag = useMemo(
    () =>
      state.tableau.map((cards, column) =>
        cards.map((_, at) => {
          const source = { column, at };
          return runFrom(state, column, at) != null && destinations(state, source).length > 0;
        }),
      ),
    [state],
  );
  const deals = Math.floor(state.stock.length / 10);

  return (
    <View style={{ width }}>
      <View style={styles.stockRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deals > 0 ? `Stock, ${deals} deals` : 'Empty stock'}
          disabled={disabled || !canDeal(state)}
          onPress={onStock}
          style={[state.stock.length > 0 ? styles.back : styles.empty, { width: cardWidth, height: cardHeight }]}
        >
          {state.stock.length > 0 ? (
            <>
              <View style={[styles.diamond, { width: cardWidth * 0.28, height: cardWidth * 0.28 }]} />
              <Text style={styles.count}>{deals}</Text>
            </>
          ) : (
            <Text style={[styles.emptyLabel, { fontSize: Math.max(10, cardWidth * 0.22) }]}>Deal</Text>
          )}
        </Pressable>
        <View style={styles.suits}>
          {Array.from({ length: 8 }, (_, index) => {
            const pile = state.completed[index];
            const face = pile ? cardFace(pile[0] ?? '') : null;
            return (
              <View key={index} style={[styles.suitSlot, face && styles.suitDone]}>
                <Text style={[styles.suitMark, face?.red && styles.red]}>{face?.symbol ?? ''}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <View ref={columnsRef} style={styles.columns} onLayout={remember}>
        {state.tableau.map((column, index) => (
          <Column
            key={index}
            cards={column}
            column={index}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            overlapDown={overlapDown}
            overlapUp={overlapUp}
            selection={selection}
            hover={hover === index}
            target={selection != null && destinations(state, selection).includes(index)}
            lifted={lift?.source.column === index ? lift.source.at : null}
            canDrag={canDrag[index] ?? []}
            disabled={disabled}
            onColumn={onColumn}
            onBegin={begin}
            onMove={move}
            onEnd={end}
          />
        ))}
        {lift ? (
          <Ghost
            cards={runFrom(state, lift.source.column, lift.source.at) ?? []}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            overlapUp={overlapUp}
            left={lift.source.column * (cardWidth + GAP) + lift.dx}
            top={(columnOffsets(state.tableau[lift.source.column] ?? [], overlapDown, overlapUp)[lift.source.at] ?? 0) + lift.dy}
          />
        ) : null}
      </View>
    </View>
  );
}

function Column({
  cards,
  column,
  cardWidth,
  cardHeight,
  overlapDown,
  overlapUp,
  selection,
  hover,
  target,
  lifted,
  canDrag,
  disabled,
  onColumn,
  onBegin,
  onMove,
  onEnd,
}: {
  cards: string[];
  column: number;
  cardWidth: number;
  cardHeight: number;
  overlapDown: number;
  overlapUp: number;
  selection: SpiderSource | null;
  hover: boolean;
  target: boolean;
  lifted: number | null;
  canDrag: boolean[];
  disabled?: boolean;
  onColumn: (column: number, at: number) => void;
  onBegin: (source: SpiderSource) => void;
  onMove: (dx: number, dy: number, pageX: number, pageY: number) => void;
  onEnd: (source: SpiderSource, pageX: number, pageY: number, moved: boolean) => boolean;
}) {
  const offsets = columnOffsets(cards, overlapDown, overlapUp);
  const height = cards.length === 0 ? cardHeight : (offsets[offsets.length - 1] ?? 0) + cardHeight;
  return (
    <View style={{ width: cardWidth, height }}>
      {cards.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Empty column ${column + 1}`}
          disabled={disabled}
          onPress={() => onColumn(column, -1)}
          style={[styles.empty, { width: cardWidth, height: cardHeight }, (target || hover) && styles.target]}
        />
      ) : (
        cards.map((code, at) => {
          const face = cardFace(code);
          const source: SpiderSource = { column, at };
          const allowed = canDrag[at] ?? false;
          const selected = selection?.column === column && at >= selection.at;
          const hidden = lifted != null && at >= lifted;
          return (
            <View key={`${code}-${at}`} style={[styles.stacked, { top: offsets[at], zIndex: at + 1, opacity: hidden ? 0 : 1 }]}>
              {face?.up ? (
                <CardFace
                  code={code}
                  width={cardWidth}
                  height={cardHeight}
                  selected={selected}
                  target={(target || hover) && at === cards.length - 1}
                  disabled={disabled}
                  allowed={allowed}
                  source={source}
                  onPress={() => onColumn(column, at)}
                  onBegin={onBegin}
                  onMove={onMove}
                  onEnd={onEnd}
                />
              ) : (
                <View style={[styles.back, { width: cardWidth, height: cardHeight }]}>
                  <View style={[styles.diamond, { width: cardWidth * 0.22, height: cardWidth * 0.22 }]} />
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

function columnOffsets(cards: readonly string[], overlapDown: number, overlapUp: number): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (let index = 0; index < cards.length; index++) {
    offsets.push(cursor);
    if (index < cards.length - 1) cursor += cardFace(cards[index] ?? '')?.up ? overlapUp : overlapDown;
  }
  return offsets;
}

function CardFace({
  code,
  width,
  height,
  selected,
  target,
  disabled,
  allowed,
  source,
  onPress,
  onBegin,
  onMove,
  onEnd,
}: {
  code: string;
  width: number;
  height: number;
  selected?: boolean;
  target?: boolean;
  disabled?: boolean;
  allowed: boolean;
  source: SpiderSource;
  onPress: () => void;
  onBegin: (source: SpiderSource) => void;
  onMove: (dx: number, dy: number, pageX: number, pageY: number) => void;
  onEnd: (source: SpiderSource, pageX: number, pageY: number, moved: boolean) => boolean;
}) {
  const face = cardFace(code);
  if (!face) return null;
  const ink = face.red ? '#c23b3b' : '#1c1612';
  const frame = [
    styles.face,
    { width, height },
    selected && styles.selected,
    target && styles.target,
  ];
  if (disabled) {
    return (
      <View style={frame}>
        <Text style={[styles.corner, { color: ink, fontSize: Math.max(10, width * 0.28) }]}>
          {face.rankLabel}
          {face.symbol}
        </Text>
      </View>
    );
  }
  return (
    <Draggable source={source} label={face.name} allowed={allowed} style={frame} onTap={onPress} onBegin={onBegin} onMove={onMove} onEnd={onEnd}>
      <Text style={[styles.corner, { color: ink, fontSize: Math.max(10, width * 0.28) }]}>
        {face.rankLabel}
        {face.symbol}
      </Text>
      <Text style={[styles.pip, { color: ink, fontSize: Math.max(12, width * 0.4) }]}>{face.symbol}</Text>
    </Draggable>
  );
}

function Draggable({
  source,
  label,
  allowed,
  style,
  onTap,
  onBegin,
  onMove,
  onEnd,
  children,
}: {
  source: SpiderSource;
  label: string;
  allowed: boolean;
  style: StyleProp<ViewStyle>;
  onTap: () => void;
  onBegin: (source: SpiderSource) => void;
  onMove: (dx: number, dy: number, pageX: number, pageY: number) => void;
  onEnd: (source: SpiderSource, pageX: number, pageY: number, moved: boolean) => boolean;
  children: ReactNode;
}) {
  const api = useRef({ source, allowed, onTap, onBegin, onMove, onEnd });
  api.current = { source, allowed, onTap, onBegin, onMove, onEnd };
  const drag = useRef<{ x: number; y: number } | null>(null);

  const finish = (pageX: number, pageY: number) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    const moved = Math.hypot(pageX - active.x, pageY - active.y) >= TAP_SLOP;
    const current = api.current;
    if (!current.onEnd(current.source, pageX, pageY, moved)) current.onTap();
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web',
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, gesture) => {
        if (!api.current.allowed) return;
        drag.current = { x: gesture.x0, y: gesture.y0 };
        api.current.onBegin(api.current.source);
      },
      onPanResponderMove: (_, gesture) => {
        const active = drag.current;
        if (!active) return;
        api.current.onMove(gesture.moveX - active.x, gesture.moveY - active.y, gesture.moveX, gesture.moveY);
      },
      onPanResponderRelease: (_, gesture) => finish(gesture.moveX, gesture.moveY),
      onPanResponderTerminate: () => {
        drag.current = null;
        api.current.onEnd(api.current.source, 0, 0, false);
      },
    }),
  ).current;

  const onPointerDown = (event: PointerEvent) => {
    if (event.nativeEvent.button !== 0 || !api.current.allowed) return;
    const pointerId = event.nativeEvent.pointerId;
    const startX = event.nativeEvent.clientX;
    const startY = event.nativeEvent.clientY;
    drag.current = { x: startX, y: startY };
    api.current.onBegin(api.current.source);
    const target = event.currentTarget as { setPointerCapture?: (id: number) => void };
    target.setPointerCapture?.(pointerId);
    event.preventDefault?.();
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const moved = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId || !drag.current) return;
      api.current.onMove(native.clientX - startX, native.clientY - startY, native.clientX, native.clientY);
    };
    const up = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', moved);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      finish(native.clientX, native.clientY);
    };
    document.addEventListener('pointermove', moved);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(Platform.OS === 'web' ? { onPointerDown } : responder.panHandlers)}
      style={[style, allowed ? webCursor('grab') : null]}
    >
      {children}
    </View>
  );
}

function Ghost({
  cards,
  cardWidth,
  cardHeight,
  overlapUp,
  left,
  top,
}: {
  cards: string[];
  cardWidth: number;
  cardHeight: number;
  overlapUp: number;
  left: number;
  top: number;
}) {
  if (cards.length === 0) return null;
  return (
    <View pointerEvents="none" style={[styles.ghost, { left, top }]}>
      {cards.map((code, index) => {
        const face = cardFace(code);
        if (!face) return null;
        const ink = face.red ? '#c23b3b' : '#1c1612';
        return (
          <View key={`${code}-${index}`} style={[styles.face, styles.stacked, { width: cardWidth, height: cardHeight, top: index * overlapUp, zIndex: index + 1 }]}>
            <Text style={[styles.corner, { color: ink, fontSize: Math.max(10, cardWidth * 0.28) }]}>
              {face.rankLabel}
              {face.symbol}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function webCursor(cursor: 'grab'): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  return { cursor, touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle;
}

/** Covers the card underneath the pointer, which would otherwise keep its own cursor. */
function setDragCursor(cursor: 'grabbing' | 'not-allowed' | null) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const existing = document.getElementById('spider-drag-cursor');
  if (!cursor) {
    existing?.remove();
    return;
  }
  const style = existing ?? document.createElement('style');
  style.id = 'spider-drag-cursor';
  style.textContent = `html, html * { cursor: ${cursor} !important; }`;
  if (!existing) document.head.appendChild(style);
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: '#10241c',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#3d5248',
    padding: 10,
    overflow: 'visible',
  },
  pending: { height: 280 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  suits: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 },
  suitSlot: {
    width: 22,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suitDone: { backgroundColor: '#fffaf3', borderColor: '#e4d3b0' },
  suitMark: { color: '#1c1612', fontFamily: fonts.display, fontWeight: '700', fontSize: 14 },
  red: { color: '#c23b3b' },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP, overflow: 'visible' },
  stacked: { position: 'absolute', left: 0 },
  ghost: { position: 'absolute', zIndex: 80 },
  face: {
    backgroundColor: '#fffaf3',
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: '#e4d3b0',
    paddingHorizontal: 2,
    paddingVertical: 2,
    justifyContent: 'space-between',
  },
  selected: { borderColor: colors.accent },
  target: { borderColor: colors.success },
  corner: { fontFamily: fonts.display, fontWeight: '700' },
  pip: { fontFamily: fonts.display, textAlign: 'center', fontWeight: '700' },
  back: {
    backgroundColor: '#1b4d3e',
    borderRadius: radii.sm,
    borderWidth: 2,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: { backgroundColor: colors.accent, transform: [{ rotate: '45deg' }] },
  count: { color: '#f6ead2', fontWeight: '700', fontSize: 12 },
  empty: {
    borderRadius: radii.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 168, 75, 0.45)',
    backgroundColor: 'rgba(255, 250, 243, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLabel: { color: 'rgba(212, 168, 75, 0.7)', fontFamily: fonts.display, fontWeight: '700' },
});

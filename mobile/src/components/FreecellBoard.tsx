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
  destinations,
  dropTarget,
  type Dest,
  type FreecellState,
  type Source,
} from '../domain/freecell';
import { cardFace } from '../domain/klondike';
import { colors, fonts, radii } from '../theme';

type Props = {
  state: FreecellState;
  selection: Source | null;
  disabled?: boolean;
  onCell: (index: number) => void;
  onFoundation: (index: number) => void;
  onCascade: (index: number, at: number) => void;
  onDrop: (source: Source, dest: Dest) => boolean;
  onDragChange?: (dragging: boolean) => void;
};

type Box = { x: number; y: number; width: number; height: number };

const GAP = 4;
const ROW_GAP = 14;
const TAP_SLOP = 12;

export function FreecellBoard(props: Props) {
  const [width, setWidth] = useState(0);
  return (
    <View
      style={styles.table}
      accessibilityLabel="FreeCell board"
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
  onCell,
  onFoundation,
  onCascade,
  onDrop,
  onDragChange,
}: Props & { width: number }) {
  const boardRef = useRef<View>(null);
  const boxRef = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const dragSource = useRef<Source | null>(null);
  const [hover, setHover] = useState<Dest | null>(null);
  const [lift, setLift] = useState<{ source: Source; dx: number; dy: number } | null>(null);
  const cardWidth = Math.max(28, Math.min(72, Math.floor((width - GAP * 7) / 8)));
  const cardHeight = Math.round(cardWidth * 1.4);
  const overlap = Math.max(14, Math.round(cardHeight * 0.32));
  const remember = () => {
    boardRef.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      boxRef.current = { x, y, width: measuredWidth, height: measuredHeight };
    });
  };
  const gesture = useRef({ state, cardWidth, cardHeight, onDrop, onDragChange });
  gesture.current = { state, cardWidth, cardHeight, onDrop, onDragChange };
  useEffect(() => () => setDragCursor(null), []);

  const begin = (source: Source) => {
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
    const dest = dropTarget(
      pageX - boxRef.current.x,
      pageY - boxRef.current.y,
      current.cardWidth,
      current.cardHeight,
      GAP,
      ROW_GAP,
    );
    const legal = dest != null && destinations(current.state, source).some((item) => sameDest(item, dest));
    setLift({ source, dx, dy });
    setHover(legal && dest ? dest : null);
    setDragCursor(Math.hypot(dx, dy) < TAP_SLOP || legal ? 'grabbing' : 'not-allowed');
  };
  const end = (source: Source, pageX: number, pageY: number, moved: boolean) => {
    dragSource.current = null;
    setDragCursor(null);
    setLift(null);
    setHover(null);
    gesture.current.onDragChange?.(false);
    if (!moved) return false;
    const current = gesture.current;
    const dest = dropTarget(
      pageX - boxRef.current.x,
      pageY - boxRef.current.y,
      current.cardWidth,
      current.cardHeight,
      GAP,
      ROW_GAP,
    );
    if (dest && current.onDrop(source, dest)) return true;
    return true;
  };

  const targets = selection ? destinations(state, selection) : [];
  const canDrag = useMemo(() => sources(state).filter((source) => destinations(state, source).length > 0), [state]);
  const ghost = lift ? carried(state, lift.source) : [];
  const origin = lift ? cardOrigin(lift.source, cardWidth, cardHeight, overlap) : null;

  return (
    <View ref={boardRef} style={{ width }} onLayout={remember}>
      <View style={styles.top}>
        {state.cells.map((card, index) => (
          <Slot
            key={`cell-${index}`}
            card={card}
            width={cardWidth}
            height={cardHeight}
            label={card ? cardFace(card)?.name ?? 'Free cell' : 'Empty free cell'}
            selected={selection?.pile === 'cell' && selection.index === index}
            target={targets.some((dest) => dest.pile === 'cell' && dest.index === index)}
            hidden={lift?.source.pile === 'cell' && lift.source.index === index}
            allowed={!disabled && canDrag.some((source) => source.pile === 'cell' && source.index === index)}
            source={{ pile: 'cell', index }}
            onPress={() => onCell(index)}
            onBegin={begin}
            onMove={move}
            onEnd={end}
          />
        ))}
        {state.foundations.map((pile, index) => {
          const card = pile[pile.length - 1] ?? null;
          return (
            <Slot
              key={`home-${index}`}
              card={card}
              width={cardWidth}
              height={cardHeight}
              label={card ? cardFace(card)?.name ?? 'Foundation' : 'Empty foundation'}
              selected={selection?.pile === 'foundation' && selection.index === index}
              target={targets.some((dest) => dest.pile === 'foundation' && dest.index === index)}
              hidden={lift?.source.pile === 'foundation' && lift.source.index === index}
              allowed={!disabled && canDrag.some((source) => source.pile === 'foundation' && source.index === index)}
              source={{ pile: 'foundation', index }}
              onPress={() => onFoundation(index)}
              onBegin={begin}
              onMove={move}
              onEnd={end}
            />
          );
        })}
      </View>
      <View style={[styles.columns, { marginTop: ROW_GAP }]}>
        {state.cascades.map((pile, index) => (
          <View key={index} style={{ width: cardWidth, minHeight: cardHeight }}>
            {pile.length === 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Empty column"
                disabled={disabled}
                onPress={() => onCascade(index, -1)}
                style={[
                  styles.empty,
                  { width: cardWidth, height: cardHeight },
                  targets.some((dest) => dest.pile === 'cascade' && dest.index === index) && styles.target,
                  hover?.pile === 'cascade' && hover.index === index && styles.target,
                ]}
              />
            ) : (
              pile.map((card, at) => (
                <View key={`${card}-${at}`} style={{ marginTop: at === 0 ? 0 : overlap - cardHeight }}>
                  <Slot
                    card={card}
                    width={cardWidth}
                    height={cardHeight}
                    label={cardFace(card)?.name ?? 'Card'}
                    selected={selection?.pile === 'cascade' && selection.index === index && at >= selection.at}
                    target={at === pile.length - 1 && targets.some((dest) => dest.pile === 'cascade' && dest.index === index)}
                    hidden={lift?.source.pile === 'cascade' && lift.source.index === index && at >= lift.source.at}
                    allowed={
                      !disabled &&
                      canDrag.some((source) => source.pile === 'cascade' && source.index === index && source.at === at)
                    }
                    source={{ pile: 'cascade', index, at }}
                    onPress={() => onCascade(index, at)}
                    onBegin={begin}
                    onMove={move}
                    onEnd={end}
                  />
                </View>
              ))
            )}
          </View>
        ))}
      </View>
      {origin && ghost.length > 0 ? (
        <View style={[styles.ghost, { left: origin.left + lift!.dx, top: origin.top + lift!.dy }]}>
          {ghost.map((card, index) => (
            <View key={`${card}-${index}`} style={{ marginTop: index === 0 ? 0 : overlap - cardHeight }}>
              <CardView card={card} width={cardWidth} height={cardHeight} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Slot({
  card,
  width,
  height,
  label,
  selected,
  target,
  hidden,
  allowed,
  source,
  onPress,
  onBegin,
  onMove,
  onEnd,
}: {
  card: string | null;
  width: number;
  height: number;
  label: string;
  selected?: boolean;
  target?: boolean;
  hidden?: boolean;
  allowed: boolean;
  source: Source;
  onPress: () => void;
  onBegin: (source: Source) => void;
  onMove: (dx: number, dy: number, pageX: number, pageY: number) => void;
  onEnd: (source: Source, pageX: number, pageY: number, moved: boolean) => boolean;
}) {
  const body = card ? (
    <CardView card={card} width={width} height={height} selected={selected} target={target} />
  ) : (
    <View style={[styles.empty, { width, height }, target && styles.target]} />
  );
  if (!card) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width, height, opacity: hidden ? 0 : 1 }}>
        {body}
      </Pressable>
    );
  }
  return (
    <Draggable
      source={source}
      label={label}
      allowed={allowed}
      style={{ width, height, opacity: hidden ? 0 : 1 }}
      onTap={onPress}
      onBegin={onBegin}
      onMove={onMove}
      onEnd={onEnd}
    >
      {body}
    </Draggable>
  );
}

function CardView({
  card,
  width,
  height,
  selected,
  target,
}: {
  card: string;
  width: number;
  height: number;
  selected?: boolean;
  target?: boolean;
}) {
  const face = cardFace(card);
  if (!face) return null;
  const ink = face.red ? '#c23b3b' : '#1c1612';
  return (
    <View style={[styles.face, { width, height }, selected && styles.selected, target && styles.target]}>
      <Text style={[styles.corner, { color: ink, fontSize: Math.max(9, width * 0.26) }]}>
        {face.rankLabel}
        {face.symbol}
      </Text>
      <Text style={[styles.pip, { color: ink, fontSize: Math.max(12, width * 0.38) }]}>{face.symbol}</Text>
    </View>
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
  source: Source;
  label: string;
  allowed: boolean;
  style: StyleProp<ViewStyle>;
  onTap: () => void;
  onBegin: (source: Source) => void;
  onMove: (dx: number, dy: number, pageX: number, pageY: number) => void;
  onEnd: (source: Source, pageX: number, pageY: number, moved: boolean) => boolean;
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
      style={[style, allowed ? webCursor() : null]}
    >
      {children}
    </View>
  );
}

function sources(state: FreecellState): Source[] {
  const found: Source[] = [];
  state.cells.forEach((card, index) => {
    if (card) found.push({ pile: 'cell', index });
  });
  state.foundations.forEach((pile, index) => {
    if (pile.length > 0) found.push({ pile: 'foundation', index });
  });
  state.cascades.forEach((pile, index) => {
    pile.forEach((_, at) => found.push({ pile: 'cascade', index, at }));
  });
  return found;
}

function carried(state: FreecellState, source: Source): string[] {
  if (source.pile === 'cell') {
    const card = state.cells[source.index];
    return card ? [card] : [];
  }
  if (source.pile === 'foundation') {
    const card = state.foundations[source.index]?.at(-1);
    return card ? [card] : [];
  }
  return state.cascades[source.index]?.slice(source.at) ?? [];
}

function cardOrigin(source: Source, cardWidth: number, cardHeight: number, overlap: number): { left: number; top: number } {
  const stride = cardWidth + GAP;
  if (source.pile === 'cell') return { left: source.index * stride, top: 0 };
  if (source.pile === 'foundation') return { left: (source.index + 4) * stride, top: 0 };
  return { left: source.index * stride, top: cardHeight + ROW_GAP + source.at * overlap };
}

function sameDest(left: Dest, right: Dest): boolean {
  return left.pile === right.pile && left.index === right.index;
}

function webCursor(): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  return { cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle;
}

function setDragCursor(cursor: 'grabbing' | 'not-allowed' | null) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const existing = document.getElementById('freecell-drag-cursor');
  if (!cursor) {
    existing?.remove();
    return;
  }
  const style = existing ?? document.createElement('style');
  style.id = 'freecell-drag-cursor';
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
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: GAP },
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
  empty: {
    borderRadius: radii.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 168, 75, 0.45)',
    backgroundColor: 'rgba(255, 250, 243, 0.04)',
  },
});

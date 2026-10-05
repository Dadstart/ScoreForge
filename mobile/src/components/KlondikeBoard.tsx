import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  cardFace,
  destinations,
  dropTarget,
  type Dest,
  type KlondikeState,
  type Source,
} from '../domain/klondike';
import { colors, fonts, radii } from '../theme';
import { CardFlip, flipDelay, isFaceUpCode, useFreshFaces } from './CardFlip';

type Props = {
  state: KlondikeState;
  selection: Source | null;
  disabled?: boolean;
  onStock: () => void;
  onWaste: () => void;
  onFoundation: (index: number) => void;
  onTableau: (index: number, at: number) => void;
  onDrop: (source: Source, dest: Dest) => void;
  onDragChange?: (dragging: boolean) => void;
};

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Cover = { pile: Dest['pile']; index: number; count: number };
type Lift = {
  source: Source;
  dx: number;
  dy: number;
  hover: Dest | null;
  settling?: boolean;
  origin?: Point;
  cards?: string[];
  cover?: Cover;
  duration?: number;
};

const TAP_SLOP = 12;
const ROW_GAP = 14;

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
  onDrop,
  onDragChange,
}: Props & { width: number }) {
  const layoutRef = useRef<View>(null);
  const boxRef = useRef<Box>({ x: 0, y: 0, width: 0, height: 0 });
  const settleToken = useRef(0);
  const lastTap = useRef<{ source: Source; at: number } | null>(null);
  const [lift, setLift] = useState<Lift | null>(null);
  useEffect(() => () => {
    settleToken.current += 1;
  }, []);
  const cardWidth = Math.max(40, Math.min(78, Math.floor((width - GAP * 6) / 7)));
  const cardHeight = Math.round(cardWidth * 1.42);
  const overlapDown = Math.max(8, Math.round(cardHeight * 0.16));
  const overlapUp = Math.max(16, Math.round(cardHeight * 0.3));
  const gesture = useRef({ state, cardWidth, cardHeight, onDrop, onDragChange, onMeasure: () => {} });
  const remember = () => {
    layoutRef.current?.measureInWindow((x, y, width, height) => {
      boxRef.current = { x, y, width, height };
    });
  };
  gesture.current = { state, cardWidth, cardHeight, onDrop, onDragChange, onMeasure: remember };

  const beginLift = (source: Source) => {
    settleToken.current += 1;
    remember();
    onDragChange?.(true);
    setLift({ source, dx: 0, dy: 0, hover: null });
  };
  const moveLift = (source: Source, dx: number, dy: number, pageX: number, pageY: number) => {
    const current = gesture.current;
    const dest = dropTarget(
      pageX - boxRef.current.x,
      pageY - boxRef.current.y,
      current.cardWidth,
      current.cardHeight,
      GAP,
      ROW_GAP,
    );
    const hover = dest && canLand(current.state, source, dest) ? dest : null;
    setLift({ source, dx, dy, hover });
  };
  const endLift = (source: Source, pageX: number, pageY: number, moved: boolean) => {
    if (!moved) {
      setLift(null);
      gesture.current.onDragChange?.(false);
      return false;
    }
    const current = gesture.current;
    const box = boxRef.current;
    const dest =
      box.width > 0
        ? dropTarget(pageX - box.x, pageY - box.y, current.cardWidth, current.cardHeight, GAP, ROW_GAP)
        : null;
    if (dest && canLand(current.state, source, dest)) {
      startFlight(source, dest, 180);
      return true;
    }
    const token = settleToken.current + 1;
    settleToken.current = token;
    const glide = (dx: number, dy: number) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (settleToken.current !== token) return;
          setLift((held) => (held ? { ...held, dx, dy } : held));
        });
      });
    };
    setLift((held) => (held ? { ...held, hover: null, settling: true } : null));
    glide(0, 0);
    setTimeout(() => {
      if (settleToken.current !== token) return;
      setLift(null);
      gesture.current.onDragChange?.(false);
    }, 220);
    return true;
  };

  const startFlight = (source: Source, dest: Dest, duration: number) => {
    const current = gesture.current;
    const origin = ghostOrigin(current.state, source, current.cardWidth, current.cardHeight, overlapDown, overlapUp);
    const landing = landingPoint(current.state, dest, current.cardWidth, current.cardHeight, overlapDown, overlapUp);
    const cards = carriedCards(current.state, source);
    const token = settleToken.current + 1;
    settleToken.current = token;
    current.onDrop(source, dest);
    current.onDragChange?.(true);
    setLift((held) => ({
      source,
      dx: held?.dx ?? 0,
      dy: held?.dy ?? 0,
      hover: dest,
      settling: true,
      origin,
      cards,
      duration,
      cover: { pile: dest.pile, index: dest.index, count: cards.length },
    }));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (settleToken.current !== token) return;
        setLift((held) => (held ? { ...held, dx: landing.x - origin.x, dy: landing.y - origin.y } : held));
      });
    });
    setTimeout(() => {
      if (settleToken.current !== token) return;
      setLift(null);
      gesture.current.onDragChange?.(false);
    }, duration + 40);
  };

  const sendHome = (source: Source) => {
    const now = Date.now();
    const previous = lastTap.current;
    const repeat = previous != null && now - previous.at < 500 && sameSource(previous.source, source);
    lastTap.current = { source, at: now };
    const picked =
      repeat ||
      (source.pile === 'waste' && selection?.pile === 'waste') ||
      (source.pile === 'tableau' &&
        selection?.pile === 'tableau' &&
        selection.index === source.index &&
        selection.at === source.at);
    if (!picked) return false;
    const dest = foundationHome(state, source);
    if (!dest) return false;
    lastTap.current = null;
    startFlight(source, dest, 320);
    return true;
  };

  const faceIds: string[] = [];
  for (const pile of state.tableau) {
    for (const code of pile) if (isFaceUpCode(code)) faceIds.push(code.toUpperCase());
  }
  for (const code of state.waste) if (isFaceUpCode(code)) faceIds.push(code.toUpperCase());
  for (const pile of state.foundations) {
    for (const code of pile) if (isFaceUpCode(code)) faceIds.push(code.toUpperCase());
  }
  const fresh = useFreshFaces(faceIds);
  const active = lift?.source ?? selection;
  const targets = active && !disabled ? destinations(state, active) : [];
  const aimed = (pile: Dest['pile'], index: number) =>
    targets.some((dest) => dest.pile === pile && dest.index === index);
  const hovering = (pile: Dest['pile'], index: number) =>
    lift?.hover?.pile === pile && lift.hover.index === index;
  const fromTop = lift != null && lift.source.pile !== 'tableau';

  return (
    <View
      ref={layoutRef}
      collapsable={false}
      onLayout={remember}
      style={[styles.layout, { width: cardWidth * 7 + GAP * 6 }]}
    >
      <View style={[styles.row, { gap: GAP, height: cardHeight }, fromTop && styles.lifting]}>
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
          draggable={!disabled && canLandSomewhere(state, { pile: 'waste' })}
          lifted={lift?.source.pile === 'waste' ? lift : null}
          fresh={fresh}
          order={faceIds}
          onPress={() => {
            if (sendHome({ pile: 'waste' })) return;
            onWaste();
          }}
          onLift={beginLift}
          onMove={moveLift}
          onRelease={endLift}
        />
        <View style={{ width: cardWidth }} />
        {state.foundations.map((pile, index) => {
          const top = pile[pile.length - 1];
          const selected = selection?.pile === 'foundation' && selection.index === index;
          const source: Source = { pile: 'foundation', index };
          const lifted = lift?.source.pile === 'foundation' && lift.source.index === index;
          const covered = lift?.cover?.pile === 'foundation' && lift.cover.index === index;
          const hidden = (lifted && !lift?.cover) || covered;
          return top ? (
            <View key={index} style={{ zIndex: lifted ? 30 : 0, opacity: hidden ? 0 : 1 }}>
              <PlayingCard
                code={top}
                width={cardWidth}
                height={cardHeight}
                selected={selected}
                target={aimed('foundation', index)}
                hover={hovering('foundation', index)}
                disabled={disabled}
                draggable={!disabled && canLandSomewhere(state, source)}
                source={source}
                onPress={() => onFoundation(index)}
                onLift={beginLift}
                onMove={moveLift}
                onRelease={endLift}
              />
            </View>
          ) : (
            <EmptyPad
              key={index}
              label="A"
              width={cardWidth}
              height={cardHeight}
              target={aimed('foundation', index)}
              hover={hovering('foundation', index)}
              disabled={disabled}
              onPress={() => onFoundation(index)}
            />
          );
        })}
      </View>

      <View style={[styles.row, styles.tableau, { gap: GAP }, lift?.source.pile === 'tableau' && styles.lifting]}>
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
            hover={hovering('tableau', index)}
            disabled={disabled}
            column={index}
            lift={lift}
            state={state}
            fresh={fresh}
            order={faceIds}
            onPress={(at) => {
              if (sendHome({ pile: 'tableau', index, at })) return;
              onTableau(index, at);
            }}
            onLift={beginLift}
            onMove={moveLift}
            onRelease={endLift}
          />
        ))}
      </View>
      {lift ? (
        <DragGhost
          lift={lift}
          state={state}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          overlapDown={overlapDown}
          overlapUp={overlapUp}
        />
      ) : null}
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
  hover,
  disabled,
  column,
  lift,
  state,
  fresh,
  order,
  onPress,
  onLift,
  onMove,
  onRelease,
}: {
  pile: string[];
  width: number;
  height: number;
  overlapDown: number;
  overlapUp: number;
  selectedAt: number;
  target: boolean;
  hover: boolean;
  disabled?: boolean;
  column: number;
  lift: Lift | null;
  state: KlondikeState;
  fresh: ReadonlySet<string>;
  order: readonly string[];
  onPress: (at: number) => void;
  onLift: (source: Source) => void;
  onMove: (source: Source, dx: number, dy: number, pageX: number, pageY: number) => void;
  onRelease: (source: Source, pageX: number, pageY: number, moved: boolean) => boolean;
}) {
  if (pile.length === 0) {
    return (
      <EmptyPad
        label="K"
        width={width}
        height={height}
        target={target}
        hover={hover}
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
    <View style={{ width, height: total, zIndex: lift?.source.pile === 'tableau' && lift.source.index === column ? 30 : 0 }}>
      {pile.map((code, index) => {
        const source: Source = { pile: 'tableau', index: column, at: index };
        const carried =
          lift?.source.pile === 'tableau' && lift.source.index === column && index >= lift.source.at;
        const landed =
          lift?.cover?.pile === 'tableau' &&
          lift.cover.index === column &&
          index >= pile.length - lift.cover.count;
        const hidden = (carried && !lift?.cover) || landed;
        const id = code.toUpperCase();
        return (
          <View
            key={id}
            style={[
              styles.stacked,
              { top: offsets[index], zIndex: index + 1, opacity: hidden ? 0 : 1 },
            ]}
          >
            <PlayingCard
              code={code}
              width={width}
              height={height}
              selected={selectedAt >= 0 && index >= selectedAt}
              target={target && index === pile.length - 1}
              hover={hover && index === pile.length - 1}
              disabled={disabled}
              draggable={!disabled && canLandSomewhere(state, source)}
              play={fresh.has(id)}
              delay={flipDelay(id, order, fresh)}
              source={source}
              onPress={() => onPress(index)}
              onLift={onLift}
              onMove={onMove}
              onRelease={onRelease}
            />
          </View>
        );
      })}
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
  draggable,
  lifted,
  fresh,
  order,
  onPress,
  onLift,
  onMove,
  onRelease,
}: {
  cards: string[];
  fan: number;
  selected: boolean;
  width: number;
  height: number;
  disabled?: boolean;
  draggable: boolean;
  lifted: Lift | null;
  fresh: ReadonlySet<string>;
  order: readonly string[];
  onPress: () => void;
  onLift: (source: Source) => void;
  onMove: (source: Source, dx: number, dy: number, pageX: number, pageY: number) => void;
  onRelease: (source: Source, pageX: number, pageY: number, moved: boolean) => boolean;
}) {
  if (cards.length === 0) {
    return <EmptyPad label="" width={width} height={height} disabled onPress={onPress} />;
  }
  const shown = cards.slice(-Math.min(fan, cards.length, 3));
  const peek = Math.round(width * 0.34);
  const source: Source = { pile: 'waste' };
  return (
    <View style={{ width, height, zIndex: lifted ? 30 : 0 }}>
      {shown.map((code, index) => {
        const top = index === shown.length - 1;
        const hidden = top && lifted != null && !lifted.cover;
        const id = code.toUpperCase();
        const play = fresh.has(id);
        const delay = flipDelay(id, order, fresh);
        return (
          <View
            key={id}
            style={[styles.stacked, { left: index * peek, zIndex: play ? 24 : top ? 20 : index + 1, opacity: hidden ? 0 : 1 }]}
          >
            {top ? (
              <PlayingCard
                code={code}
                width={width}
                height={height}
                selected={selected}
                disabled={disabled}
                draggable={draggable}
                play={play}
                delay={delay}
                source={source}
                onPress={onPress}
                onLift={onLift}
                onMove={onMove}
                onRelease={onRelease}
              />
            ) : (
              <CardFace code={code} width={width} height={height} play={play} delay={delay} />
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
  hover,
  disabled,
  draggable,
  play = false,
  delay = 0,
  source,
  onPress,
  onLift,
  onMove,
  onRelease,
}: {
  code: string;
  width: number;
  height: number;
  selected?: boolean;
  target?: boolean;
  hover?: boolean;
  disabled?: boolean;
  draggable?: boolean;
  play?: boolean;
  delay?: number;
  source?: Source;
  onPress: () => void;
  onLift?: (source: Source) => void;
  onMove?: (source: Source, dx: number, dy: number, pageX: number, pageY: number) => void;
  onRelease?: (source: Source, pageX: number, pageY: number, moved: boolean) => boolean;
}) {
  const face = cardFace(code);
  const label = face ? (face.up ? face.name : 'Face-down card') : 'Card';
  const marks = [selected && styles.selected, (target || hover) && styles.target, hover && styles.hover];
  const body = (
    <CardFlip
      up={Boolean(face?.up)}
      play={play}
      delay={delay}
      width={width}
      height={height}
      front={
        <View style={[styles.face, { width, height }, ...marks]}>
          {face ? <CardInk face={face} width={width} /> : null}
        </View>
      }
      back={
        <View style={[styles.back, { width, height }, ...marks]}>
          <View style={[styles.diamond, { width: width * 0.28, height: width * 0.28 }]} />
        </View>
      }
    />
  );
  const hit = { width, height };
  if (draggable && source && onLift && onMove && onRelease) {
    return (
      <Draggable source={source} label={label} style={hit} onTap={onPress} onLift={onLift} onMove={onMove} onRelease={onRelease}>
        {body}
      </Draggable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={hit}>
      {body}
    </Pressable>
  );
}

function CardInk({ face, width }: { face: NonNullable<ReturnType<typeof cardFace>>; width: number }) {
  const ink = face.red ? '#c23b3b' : '#1c1612';
  return (
    <>
      <Text style={[styles.corner, { color: ink, fontSize: Math.max(12, width * 0.28) }]}>
        {face.rankLabel}
        {face.symbol}
      </Text>
      <Text style={[styles.pip, { color: ink, fontSize: Math.max(16, width * 0.46) }]}>{face.symbol}</Text>
    </>
  );
}

function CardFace({
  code,
  width,
  height,
  play = false,
  delay = 0,
}: {
  code: string;
  width: number;
  height: number;
  play?: boolean;
  delay?: number;
}) {
  const face = cardFace(code);
  if (!face) return null;
  return (
    <CardFlip
      up={face.up}
      play={play}
      delay={delay}
      width={width}
      height={height}
      front={
        <View style={[styles.face, { width, height }]}>
          <CardInk face={face} width={width} />
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

function EmptyPad({
  label,
  width,
  height,
  target,
  hover,
  disabled,
  onPress,
}: {
  label: string;
  width: number;
  height: number;
  target?: boolean;
  hover?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === 'A' ? 'Empty foundation' : label === 'K' ? 'Empty column' : 'Empty pile'}
      disabled={disabled}
      onPress={onPress}
      style={[styles.empty, { width, height }, (target || hover) && styles.target, hover && styles.hover]}
    >
      <Text style={[styles.emptyLabel, { fontSize: Math.max(14, width * 0.32) }]}>{label}</Text>
    </Pressable>
  );
}

function Draggable({
  source,
  label,
  style,
  onTap,
  onLift,
  onMove,
  onRelease,
  children,
}: {
  source: Source;
  label: string;
  style: StyleProp<ViewStyle>;
  onTap: () => void;
  onLift: (source: Source) => void;
  onMove: (source: Source, dx: number, dy: number, pageX: number, pageY: number) => void;
  onRelease: (source: Source, pageX: number, pageY: number, moved: boolean) => boolean;
  children: ReactNode;
}) {
  const api = useRef({ source, onTap, onLift, onMove, onRelease });
  api.current = { source, onTap, onLift, onMove, onRelease };
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const finish = (pageX: number, pageY: number) => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    const moved = Math.hypot(pageX - active.x, pageY - active.y) >= TAP_SLOP;
    const current = api.current;
    if (!current.onRelease(current.source, pageX, pageY, moved)) current.onTap();
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web',
      onStartShouldSetPanResponderCapture: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web',
      onMoveShouldSetPanResponderCapture: () => Platform.OS !== 'web',
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (_, gesture) => {
        drag.current = { pointerId: -1, x: gesture.x0, y: gesture.y0 };
        api.current.onLift(api.current.source);
      },
      onPanResponderMove: (_, gesture) => {
        const active = drag.current;
        if (!active) return;
        api.current.onMove(api.current.source, gesture.moveX - active.x, gesture.moveY - active.y, gesture.moveX, gesture.moveY);
      },
      onPanResponderRelease: (_, gesture) => {
        finish(gesture.moveX, gesture.moveY);
      },
      onPanResponderTerminate: () => {
        if (!drag.current) return;
        drag.current = null;
        api.current.onRelease(api.current.source, 0, 0, false);
      },
    }),
  ).current;

  const onPointerDown = (event: PointerEvent) => {
    if (event.nativeEvent.button !== 0) return;
    const pointerId = event.nativeEvent.pointerId;
    const startX = event.nativeEvent.clientX;
    const startY = event.nativeEvent.clientY;
    drag.current = { pointerId, x: startX, y: startY };
    api.current.onLift(api.current.source);
    const target = event.currentTarget as { setPointerCapture?: (id: number) => void };
    target.setPointerCapture?.(pointerId);
    event.preventDefault?.();
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const move = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId || !drag.current) return;
      api.current.onMove(api.current.source, native.clientX - startX, native.clientY - startY, native.clientX, native.clientY);
    };
    const up = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      finish(native.clientX, native.clientY);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Drag onto a column or foundation, or tap to select"
      {...(Platform.OS === 'web' ? { onPointerDown } : responder.panHandlers)}
      style={[style, webGrab]}
    >
      {children}
    </View>
  );
}

function sameSource(a: Source, b: Source): boolean {
  if (a.pile !== b.pile) return false;
  if (a.pile === 'waste') return true;
  if (a.pile === 'tableau' && b.pile === 'tableau') return a.index === b.index && a.at === b.at;
  return a.pile === 'foundation' && b.pile === 'foundation' && a.index === b.index;
}

function foundationHome(state: KlondikeState, source: Source): Dest | null {
  if (source.pile === 'foundation') return null;
  if (source.pile === 'tableau' && source.at !== (state.tableau[source.index]?.length ?? 0) - 1) return null;
  for (let index = 0; index < 4; index++) {
    const dest: Dest = { pile: 'foundation', index };
    if (canLand(state, source, dest)) return dest;
  }
  return null;
}

function canLand(state: KlondikeState, source: Source, dest: Dest): boolean {
  return destinations(state, source).some((item) => item.pile === dest.pile && item.index === dest.index);
}

function canLandSomewhere(state: KlondikeState, source: Source): boolean {
  return destinations(state, source).length > 0;
}

function DragGhost({
  lift,
  state,
  cardWidth,
  cardHeight,
  overlapDown,
  overlapUp,
}: {
  lift: Lift;
  state: KlondikeState;
  cardWidth: number;
  cardHeight: number;
  overlapDown: number;
  overlapUp: number;
}) {
  const cards = lift.cards ?? carriedCards(state, lift.source);
  const origin =
    lift.origin ?? ghostOrigin(state, lift.source, cardWidth, cardHeight, overlapDown, overlapUp);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.ghost,
        {
          left: origin.x + lift.dx,
          top: origin.y + lift.dy,
          width: cardWidth,
          height: cardHeight + overlapUp * Math.max(0, cards.length - 1),
        },
        lift.settling ? flightMotion(lift.duration ?? 180) : null,
      ]}
    >
      {cards.map((code, index) => (
        <View key={`${code}-${index}`} style={[styles.stacked, { top: index * overlapUp, zIndex: index + 1 }]}>
          <CardFace code={code} width={cardWidth} height={cardHeight} />
        </View>
      ))}
    </View>
  );
}

function carriedCards(state: KlondikeState, source: Source): string[] {
  if (source.pile === 'waste') {
    const top = state.waste[state.waste.length - 1];
    return top ? [top] : [];
  }
  if (source.pile === 'foundation') {
    const top = state.foundations[source.index]?.at(-1);
    return top ? [top] : [];
  }
  return state.tableau[source.index]?.slice(source.at) ?? [];
}

function columnOffsets(pile: string[], overlapDown: number, overlapUp: number): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (let index = 0; index < pile.length; index++) {
    offsets.push(cursor);
    if (index < pile.length - 1) cursor += cardFace(pile[index])?.up ? overlapUp : overlapDown;
  }
  return offsets;
}

function ghostOrigin(
  state: KlondikeState,
  source: Source,
  cardWidth: number,
  cardHeight: number,
  overlapDown: number,
  overlapUp: number,
): Point {
  const step = cardWidth + GAP;
  if (source.pile === 'waste') {
    const shown = Math.min(state.drawCount, state.waste.length, 3);
    const peek = Math.round(cardWidth * 0.34);
    return { x: step + Math.max(0, shown - 1) * peek, y: 0 };
  }
  if (source.pile === 'foundation') return { x: (3 + source.index) * step, y: 0 };
  const offsets = columnOffsets(state.tableau[source.index] ?? [], overlapDown, overlapUp);
  return { x: source.index * step, y: cardHeight + ROW_GAP + (offsets[source.at] ?? 0) };
}

function landingPoint(
  state: KlondikeState,
  dest: Dest,
  cardWidth: number,
  cardHeight: number,
  overlapDown: number,
  overlapUp: number,
): Point {
  const step = cardWidth + GAP;
  if (dest.pile === 'foundation') return { x: (3 + dest.index) * step, y: 0 };
  const pile = state.tableau[dest.index] ?? [];
  const offsets = columnOffsets(pile, overlapDown, overlapUp);
  const next =
    pile.length === 0
      ? 0
      : offsets[offsets.length - 1] + (cardFace(pile[pile.length - 1])?.up ? overlapUp : overlapDown);
  return { x: dest.index * step, y: cardHeight + ROW_GAP + next };
}

const webGrab =
  Platform.OS === 'web'
    ? ({ cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle)
    : null;

function flightMotion(duration: number): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  return {
    transitionProperty: 'left, top',
    transitionDuration: `${duration}ms`,
    transitionTimingFunction: 'ease-out',
  } as unknown as ViewStyle;
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
  ghost: {
    position: 'absolute',
    zIndex: 80,
  },
  pending: { height: 280 },
  layout: { gap: ROW_GAP, overflow: 'visible' },
  row: { flexDirection: 'row', alignItems: 'flex-start', overflow: 'visible' },
  lifting: { zIndex: 20 },
  tableau: { alignItems: 'flex-start' },
  stacked: { position: 'absolute', left: 0 },
  selected: { borderColor: colors.accent },
  target: { borderColor: colors.success },
  hover: { borderColor: colors.accent },
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

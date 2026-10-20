import { useEffect, useRef, type ReactNode } from 'react';
import { PanResponder, Platform, View, type PointerEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useSetPageScroll } from './ui';

export const CARD_TAP_SLOP = 12;

export type WindowBox = { x: number; y: number; width: number; height: number };

export const emptyBox: WindowBox = { x: 0, y: 0, width: 0, height: 0 };

export function boxContains(pageX: number, pageY: number, box: WindowBox, pad = 12): boolean {
  if (box.width <= 0 || box.height <= 0) return false;
  return pageX >= box.x - pad && pageX <= box.x + box.width + pad && pageY >= box.y - pad && pageY <= box.y + box.height + pad;
}

/** The last matching box wins, so a card drawn on top of another is the one that is hit. */
export function hitIndex(pageX: number, pageY: number, boxes: readonly WindowBox[], pad = 12): number | null {
  for (let index = boxes.length - 1; index >= 0; index -= 1) {
    if (boxContains(pageX, pageY, boxes[index] ?? emptyBox, pad)) return index;
  }
  return null;
}

export function readBox(node: View | null, into: WindowBox[], index: number) {
  node?.measureInWindow((x, y, width, height) => {
    into[index] = { x, y, width, height };
  });
}

type Props<T> = {
  value: T;
  enabled?: boolean;
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  onTap: () => void;
  onLift: (value: T) => void;
  onMove: (value: T, pageX: number, pageY: number) => void;
  onRelease: (value: T, pageX: number, pageY: number, moved: boolean) => void;
  children: ReactNode;
};

/**
 * A card that follows the pointer after it moves, and acts as a tap when it does not.
 * Web uses pointer events. Native uses the responder system.
 */
export function CardDrag<T>({ value, enabled = true, label, hint, style, onTap, onLift, onMove, onRelease, children }: Props<T>) {
  const setScroll = useSetPageScroll();
  const api = useRef({ value, enabled, onTap, onLift, onMove, onRelease });
  api.current = { value, enabled, onTap, onLift, onMove, onRelease };
  const session = useRef<{ x: number; y: number; lifted: boolean } | null>(null);
  const held = useRef(false);

  const lock = (active: boolean) => {
    if (held.current === active) return;
    held.current = active;
    setScroll(!active);
  };

  useEffect(() => () => {
    if (held.current) setScroll(true);
  }, [setScroll]);

  const lift = (pageX: number, pageY: number) => {
    const active = session.current;
    if (!active || active.lifted) return;
    if (Math.hypot(pageX - active.x, pageY - active.y) < CARD_TAP_SLOP) return;
    active.lifted = true;
    lock(true);
    api.current.onLift(api.current.value);
    api.current.onMove(api.current.value, pageX, pageY);
  };

  const finish = (pageX: number, pageY: number, cancel: boolean) => {
    const active = session.current;
    session.current = null;
    if (!active) return;
    lock(false);
    if (cancel || active.lifted) {
      api.current.onRelease(api.current.value, pageX, pageY, active.lifted && !cancel);
      return;
    }
    api.current.onTap();
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => Platform.OS !== 'web' && api.current.enabled,
      onStartShouldSetPanResponderCapture: () => Platform.OS !== 'web' && api.current.enabled,
      onMoveShouldSetPanResponder: () => Platform.OS !== 'web' && api.current.enabled,
      onMoveShouldSetPanResponderCapture: () => Platform.OS !== 'web' && api.current.enabled,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (_, gesture) => {
        session.current = { x: gesture.x0, y: gesture.y0, lifted: false };
      },
      onPanResponderMove: (_, gesture) => {
        lift(gesture.moveX, gesture.moveY);
        if (session.current?.lifted) api.current.onMove(api.current.value, gesture.moveX, gesture.moveY);
      },
      onPanResponderRelease: (_, gesture) => finish(gesture.moveX, gesture.moveY, false),
      onPanResponderTerminate: () => finish(0, 0, true),
    }),
  ).current;

  const onPointerDown = (event: PointerEvent) => {
    if (!api.current.enabled || event.nativeEvent.button !== 0) return;
    const pointerId = event.nativeEvent.pointerId;
    const startX = event.nativeEvent.clientX;
    const startY = event.nativeEvent.clientY;
    session.current = { x: startX, y: startY, lifted: false };
    const target = event.currentTarget as { setPointerCapture?: (id: number) => void };
    target.setPointerCapture?.(pointerId);
    event.preventDefault?.();
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const move = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId || !session.current) return;
      lift(native.clientX, native.clientY);
      if (session.current?.lifted) api.current.onMove(api.current.value, native.clientX, native.clientY);
    };
    const up = (native: globalThis.PointerEvent) => {
      if (native.pointerId !== pointerId) return;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      finish(native.clientX, native.clientY, native.type === 'pointercancel');
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  return (
    <View
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      {...(enabled && Platform.OS === 'web' ? { onPointerDown } : {})}
      {...(enabled && Platform.OS !== 'web' ? responder.panHandlers : {})}
      style={[style, enabled ? grabCursor() : null]}
    >
      {children}
    </View>
  );
}

function grabCursor(): ViewStyle | null {
  if (Platform.OS !== 'web') return null;
  return { cursor: 'grab', touchAction: 'none', userSelect: 'none' } as unknown as ViewStyle;
}

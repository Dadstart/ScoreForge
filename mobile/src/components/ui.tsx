import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type DimensionValue,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radii, space, typography } from '../theme';

const logo = require('../../assets/logo.jpg');

const PageScrollContext = createContext<(enabled: boolean) => void>(() => {});

/** Keep the page still while a card or piece is dragged. */
export function usePageScroll(enabled: boolean) {
  const setEnabled = useContext(PageScrollContext);
  useEffect(() => {
    setEnabled(enabled);
    return () => setEnabled(true);
  }, [enabled, setEnabled]);
}

/** Mouse-wheel and trackpad ticks move this many times farther than the browser default. */
const PAGE_SCROLL_SPEED = 3;

function nestedScroller(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      const vertical = (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
      const horizontal = (style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1;
      if (vertical || horizontal) return true;
    }
    node = node.parentElement;
  }
  return false;
}

/** The window scrolls the page. The fixed app frame would swallow the wheel. */
function releaseDocumentScroll(host: HTMLElement | null) {
  if (typeof document === 'undefined') return;
  const styleId = 'scoreforge-page-scroll';
  let style = document.getElementById(styleId);
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = `
    html, body, #root { background-color: ${colors.bg}; }
    body { overflow-y: auto !important; min-height: 100vh; min-height: 100dvh; }
  `;
  let node = host?.parentElement ?? null;
  while (node && node !== document.body) {
    const computed = getComputedStyle(node);
    const fills =
      computed.position === 'absolute' &&
      computed.top === '0px' &&
      computed.bottom === '0px' &&
      computed.left === '0px' &&
      computed.right === '0px';
    const traps = computed.overflowY === 'hidden' || computed.overflowY === 'auto' || computed.overflowY === 'scroll';
    if (fills || traps) {
      node.style.position = 'relative';
      node.style.height = 'auto';
      node.style.minHeight = '100%';
      node.style.overflow = 'visible';
      node.style.top = 'auto';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      node.style.left = 'auto';
    }
    node = node.parentElement;
  }
}

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const window = useWindowDimensions();
  const shellRef = useRef<View>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const topInset = headerHeight > 0 ? 0 : insets.top;
  const compact = window.height < 520;
  const web = Platform.OS === 'web';
  const setEnabled = useCallback((enabled: boolean) => {
    setScrollEnabled(enabled);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.setProperty('overflow-y', enabled ? 'auto' : 'hidden', 'important');
    }
  }, []);

  useEffect(() => {
    if (!web) return;
    releaseDocumentScroll(shellRef.current as unknown as HTMLElement | null);
  }, [web]);

  useEffect(() => {
    const view = globalThis.window;
    if (!web || !view) return;
    const onWheel = (event: WheelEvent) => {
      if (!scrollEnabled || event.ctrlKey || event.metaKey || event.defaultPrevented) return;
      if (nestedScroller(event.target)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? view.innerHeight : 1;
      view.scrollBy(event.deltaX * unit * PAGE_SCROLL_SPEED, event.deltaY * unit * PAGE_SCROLL_SPEED);
    };
    view.addEventListener('wheel', onWheel, { passive: false });
    return () => view.removeEventListener('wheel', onWheel);
  }, [scrollEnabled, web]);

  const page = (
    <>
      <View style={[styles.logoBar, compact && styles.logoBarCompact]}>
        <View style={[styles.logoFrame, compact && styles.logoFrameCompact]}>
          <Image
            source={logo}
            accessibilityLabel="ScoreForge"
            resizeMode="contain"
            style={styles.logo}
          />
        </View>
      </View>
      {children}
    </>
  );

  return (
    <PageScrollContext.Provider value={setEnabled}>
      <View ref={shellRef} style={[styles.screen, web && styles.screenWeb, style]}>
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowCorner} />
        {web ? (
          <View style={[styles.page, { paddingTop: topInset }]}>{page}</View>
        ) : (
          <ScrollView
            style={styles.screenScroll}
            contentContainerStyle={[styles.page, { paddingTop: topInset }]}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={scrollEnabled}
          >
            {page}
          </ScrollView>
        )}
      </View>
    </PageScrollContext.Provider>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  busy,
  style,
  textColor,
  uppercase,
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  textColor?: string;
  uppercase?: boolean;
}) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'secondary' && styles.btnSecondary,
        variant === 'ghost' && styles.btnGhost,
        variant === 'danger' && styles.btnDanger,
        (disabled || busy) && styles.btnDisabled,
        pressed && !disabled && !busy && styles.btnPressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor ?? (isPrimary ? colors.accentText : colors.text)} />
      ) : (
        <Text
          style={[
            typography.button,
            isPrimary && { color: colors.accentText },
            variant === 'danger' && { color: colors.danger },
            textColor ? { color: textColor } : null,
            uppercase && styles.btnUppercase,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
}) {
  return (
    <View style={[styles.card, accent && styles.cardAccent, style]}>{children}</View>
  );
}

export function Badge({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'success' | 'danger';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'accent' && styles.badgeAccent,
        tone === 'success' && styles.badgeSuccess,
        tone === 'danger' && styles.badgeDanger,
        style,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'accent' && { color: colors.accent },
          tone === 'success' && { color: colors.success },
          tone === 'danger' && { color: colors.danger },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function Field(props: TextInputProps & { mono?: boolean }) {
  const { style, mono, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      style={[styles.input, mono && styles.inputMono, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  screenWeb: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    minHeight: '100vh' as DimensionValue,
  },
  screenScroll: {
    flex: 1,
    minHeight: 0,
  },
  page: {
    flexGrow: 1,
  },
  logoBar: {
    backgroundColor: '#014629',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  logoBarCompact: {
    paddingVertical: 2,
  },
  logoFrame: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 1024 / 341,
  },
  logoFrameCompact: {
    maxWidth: 240,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  glowTop: {
    position: 'absolute',
    top: -120,
    left: '15%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(212, 168, 75, 0.09)',
  },
  glowCorner: {
    position: 'absolute',
    bottom: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(111, 191, 138, 0.06)',
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radii.md,
    minHeight: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: colors.accent,
  },
  btnUppercase: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  btnSecondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnDanger: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: 'rgba(232, 106, 92, 0.35)',
  },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: space.lg,
    gap: space.md,
  },
  cardAccent: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeAccent: {
    backgroundColor: colors.accentSoft,
    borderColor: 'rgba(212, 168, 75, 0.45)',
  },
  badgeSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: 'rgba(111, 191, 138, 0.4)',
  },
  badgeDanger: {
    backgroundColor: colors.dangerSoft,
    borderColor: 'rgba(232, 106, 92, 0.4)',
  },
  badgeText: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  input: {
    fontFamily: fonts.body,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    fontSize: 16,
    fontWeight: '500',
  },
  inputMono: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
  },
});

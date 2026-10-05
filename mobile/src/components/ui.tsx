import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useHeaderHeight } from '@react-navigation/elements';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
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
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const topInset = headerHeight > 0 ? 0 : insets.top;
  const compact = window.height < 520;

  return (
    <PageScrollContext.Provider value={setScrollEnabled}>
      <View style={[styles.screen, style]}>
        <View pointerEvents="none" style={styles.glowTop} />
        <View pointerEvents="none" style={styles.glowCorner} />
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[styles.page, { paddingTop: topInset }]}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
        >
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
        </ScrollView>
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

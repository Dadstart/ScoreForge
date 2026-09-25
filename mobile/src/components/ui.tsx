import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts, radii, space, typography } from '../theme';

export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.screen, style]}>
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowCorner} />
      <View style={styles.screenInner}>{children}</View>
    </View>
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
}: {
  label: string;
  onPress: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
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
        <ActivityIndicator color={isPrimary ? colors.accentText : colors.text} />
      ) : (
        <Text
          style={[
            typography.button,
            isPrimary && { color: colors.accentText },
            variant === 'danger' && { color: colors.danger },
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
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  screenInner: {
    flex: 1,
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

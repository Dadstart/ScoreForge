import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radii } from '../theme';

export function HeaderIconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(212, 168, 75, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
});

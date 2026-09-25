import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radii, typography } from '../theme';

export type SelectOption = {
  id: string;
  label: string;
  swatch?: string;
  group?: string;
};

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
};

export function OptionSelect({ label, value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <View style={styles.wrap}>
      <Text style={typography.section}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, disabled && styles.disabled, pressed && styles.pressed]}
      >
        {selected?.swatch ? <View style={[styles.swatch, { backgroundColor: selected.swatch }]} /> : null}
        <Text style={styles.value} numberOfLines={1}>
          {selected?.label ?? 'Choose'}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityLabel={`Dismiss ${label}`}
          />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {options.map((option, index) => {
                const showGroup = option.group && option.group !== options[index - 1]?.group;
                const active = option.id === value;
                return (
                  <View key={option.id}>
                    {showGroup ? <Text style={styles.group}>{option.group}</Text> : null}
                    <Pressable
                      onPress={() => {
                        onChange(option.id);
                        setOpen(false);
                      }}
                      style={[styles.option, active && styles.optionActive]}
                    >
                      {option.swatch ? (
                        <View style={[styles.swatch, { backgroundColor: option.swatch }]} />
                      ) : null}
                      <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  trigger: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
  value: {
    flex: 1,
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  chevron: { color: colors.muted, fontSize: 16 },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 16,
    gap: 8,
  },
  sheetTitle: { ...typography.title, fontSize: 20 },
  list: { flexGrow: 0 },
  group: {
    ...typography.section,
    marginTop: 10,
    marginBottom: 4,
  },
  option: {
    minHeight: 44,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionActive: { backgroundColor: colors.accentSoft },
  optionLabel: {
    fontFamily: fonts.body,
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  optionLabelActive: { color: colors.accent, fontWeight: '700' },
});

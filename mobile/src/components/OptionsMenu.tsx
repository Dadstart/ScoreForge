import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { stopDiceRoll } from '../audio/diceRollSound';
import { stopDiceRollHaptic } from '../audio/diceRollHaptic';
import { useSettings } from '../hooks/useSettings';
import { colors, radii, typography } from '../theme';
import { HeaderIconButton } from './HeaderIconButton';
import { Button } from './ui';

export function OptionsMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useSettings();

  const close = () => setOpen(false);

  return (
    <>
      <HeaderIconButton label="Options" onPress={() => setOpen(true)}>
        <Text style={styles.mark}>☰</Text>
      </HeaderIconButton>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss options" />
          <View style={styles.sheet}>
            <Text style={styles.title}>Options</Text>
            <OptionRow
              label="Sound effects"
              value={settings.soundEffects}
              onChange={(value) => {
                setSettings({ soundEffects: value });
                if (!value) stopDiceRoll();
              }}
            />
            <OptionRow
              label="Haptics"
              value={settings.haptics}
              onChange={(value) => {
                setSettings({ haptics: value });
                if (!value) stopDiceRollHaptic();
              }}
            />
            <Button label="Close" onPress={close} style={styles.close} />
          </View>
        </View>
      </Modal>
    </>
  );
}

function OptionRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        accessibilityRole="switch"
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
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
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: 22,
    gap: 14,
  },
  title: {
    ...typography.title,
    fontSize: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 4,
  },
  label: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  close: { alignSelf: 'stretch' },
});

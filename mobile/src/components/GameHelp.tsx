import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { gameInstructions } from '../domain/instructions';
import { colors, radii, typography } from '../theme';
import { HeaderIconButton } from './HeaderIconButton';
import { Button } from './ui';

export function GameHelp({ templateId }: { templateId: string }) {
  const help = gameInstructions(templateId);
  const [open, setOpen] = useState(false);
  if (!help) return null;

  const close = () => setOpen(false);

  return (
    <>
      <HeaderIconButton label={`How to play ${help.title}`} onPress={() => setOpen(true)}>
        <Text style={styles.mark}>?</Text>
      </HeaderIconButton>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss instructions" />
          <View style={styles.sheet}>
            <Text style={styles.title}>How to play {help.title}</Text>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.lines}>
              {help.lines.map((line, index) => (
                <View key={index} style={styles.item}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.line}>{line}</Text>
                </View>
              ))}
            </ScrollView>
            <Button label="Close" onPress={close} style={styles.close} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  mark: {
    ...typography.label,
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
    maxHeight: '80%',
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
  scroll: { flexGrow: 0, flexShrink: 1 },
  lines: { gap: 10 },
  item: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bullet: { ...typography.body, color: colors.accent, fontWeight: '700' },
  line: { ...typography.body, flex: 1, color: colors.text },
  close: { alignSelf: 'stretch' },
});
